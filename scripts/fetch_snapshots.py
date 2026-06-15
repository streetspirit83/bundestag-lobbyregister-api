#!/usr/bin/env python3
"""Manueller Fetch-/Snapshot-Runner für das Lobby-Monitoring-Tool.

Liest eine Watchlist (scripts/config/watchlist.json), ruft für jeden Stakeholder
die Bundestag-Lobbyregister-API über den bestehenden Python-Client auf, wählt den
passenden Eintrag aus den Suchtreffern und schreibt versionierte JSON-Snapshots
nach docs/data/, die das statische Frontend (GitHub Pages) same-origin lädt.

Alle Aufrufe erfolgen manuell – dieses Skript wird nicht automatisch ausgeführt.

Beispiele:
    python scripts/fetch_snapshots.py --dry-run
    python scripts/fetch_snapshots.py
    python scripts/fetch_snapshots.py --only rheinmetall
    python scripts/fetch_snapshots.py --date 2026-06-15
"""

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import time

# Bestehenden generierten Client einbinden (keine zusätzlichen Laufzeit-Deps).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "python-client"))

from deutschland.bundestag_lobbyregister.api.default_api import DefaultApi  # noqa: E402
from deutschland.bundestag_lobbyregister.api_client import ApiClient  # noqa: E402

CONFIG_DIR = os.path.join(REPO_ROOT, "scripts", "config")
DATA_DIR = os.path.join(REPO_ROOT, "docs", "data")
DEFAULT_SORT = "NAME_ASC"
REQUEST_PAUSE_SECONDS = 1.0  # einfaches Rate-Limiting zwischen Calls


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def normalize_name(name):
    """Vergleichsfreundliche Form: lowercase, Rechtsform-Suffixe/Whitespace gestutzt."""
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[.,]", " ", name)
    # gängige Rechtsform-Suffixe für den Fallback-Vergleich entfernen
    name = re.sub(r"\b(e\s*v|ag|gmbh|mbh|kg|se|ev|gbr|ohg|co)\b", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def derive_query(stakeholder):
    if stakeholder.get("queryOverride"):
        return stakeholder["queryOverride"]
    if stakeholder.get("registerNumber"):
        return stakeholder["registerNumber"]
    return '"%s"' % stakeholder["name"]


def pick_match(results, stakeholder):
    """Wählt den passenden Treffer. Gibt (entry, register_number, status) zurück.

    status ∈ {"ok", "name_fallback", "ambiguous", "unmatched"}.
    Es wird nicht geraten: ohne eindeutigen Treffer -> unmatched/ambiguous.
    """
    if not results:
        return None, None, "unmatched"

    wanted_number = stakeholder.get("registerNumber")
    if wanted_number:
        for res in results:
            if res.get("registerNumber") == wanted_number:
                return res.get("registerEntryDetail"), res.get("registerNumber"), "ok"

    wanted_name = normalize_name(stakeholder.get("name"))
    if wanted_name:
        name_hits = []
        for res in results:
            entry = res.get("registerEntryDetail") or {}
            entry_name = (entry.get("lobbyistIdentity") or {}).get("name")
            if normalize_name(entry_name) == wanted_name:
                name_hits.append(res)
        if len(name_hits) == 1:
            res = name_hits[0]
            return res.get("registerEntryDetail"), res.get("registerNumber"), "name_fallback"
        if len(name_hits) > 1:
            return None, None, "ambiguous"

    # Genau ein Treffer insgesamt -> als Fallback akzeptieren, aber kennzeichnen.
    if len(results) == 1:
        res = results[0]
        return res.get("registerEntryDetail"), res.get("registerNumber"), "name_fallback"

    return None, None, "ambiguous"


def slim_index_row(stakeholder, entry, register_number, entry_file, status):
    """Schlanke Zeile für index.json (schnelles Tabellen-Rendering ohne Entry-Load)."""
    entry = entry or {}
    account = entry.get("account") or {}
    identity = entry.get("lobbyistIdentity") or {}
    fields = entry.get("fieldsOfInterest") or []
    return {
        "id": stakeholder["id"],
        "registerNumber": register_number or stakeholder.get("registerNumber"),
        "name": identity.get("name") or stakeholder.get("name"),
        "tags": stakeholder.get("tags", []),
        "employeeCount": entry.get("employeeCount"),
        "financialExpensesEuro": entry.get("financialExpensesEuro"),
        "fieldsOfInterestCodes": [f.get("code") for f in fields if f.get("code")],
        "legislativeProjectCount": len(entry.get("legislativeProjects") or []),
        "firstPublicationDate": account.get("firstPublicationDate"),
        "entryFile": entry_file,
        "matchStatus": status,
    }


def main():
    parser = argparse.ArgumentParser(description="Lobbyregister-Snapshots erstellen.")
    parser.add_argument("--date", help="Snapshot-Datum (YYYY-MM-DD), Standard: heute (UTC).")
    parser.add_argument("--only", help="Nur diesen Stakeholder (id) abrufen.")
    parser.add_argument("--dry-run", action="store_true", help="Nichts schreiben, nur Report ausgeben.")
    parser.add_argument("--sort", default=DEFAULT_SORT, help="Sortier-Kriterium (Standard: NAME_ASC).")
    args = parser.parse_args()

    snapshot_date = args.date or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    watchlist = load_json(os.path.join(CONFIG_DIR, "watchlist.json"))
    stakeholders = watchlist.get("stakeholders", [])
    if args.only:
        stakeholders = [s for s in stakeholders if s["id"] == args.only]
        if not stakeholders:
            sys.exit("Kein Stakeholder mit id=%s in der Watchlist." % args.only)

    snapshot_dir = os.path.join(DATA_DIR, "snapshots", snapshot_date)
    entries_dir = os.path.join(snapshot_dir, "entries")

    api_client = ApiClient()
    api = DefaultApi(api_client)

    index_rows = []
    report = {"snapshotDate": snapshot_date, "dryRun": args.dry_run, "stakeholders": []}
    meta = {"source": None, "searchDate": None}

    for stakeholder in stakeholders:
        sid = stakeholder["id"]
        query = derive_query(stakeholder)
        rec = {"id": sid, "query": query}
        try:
            resp = api.suche_detail_json(q=query, sort=args.sort)
            data = api_client.sanitize_for_serialization(resp)
            results = data.get("results") or []
            meta["source"] = meta["source"] or data.get("source")
            meta["searchDate"] = meta["searchDate"] or data.get("searchDate")

            entry, register_number, status = pick_match(results, stakeholder)
            rec["resultCount"] = data.get("resultCount", len(results))
            rec["matchStatus"] = status
            rec["registerNumber"] = register_number

            file_key = register_number or sid
            entry_file = "entries/%s.json" % file_key

            if entry and not args.dry_run:
                write_json(os.path.join(entries_dir, "%s.json" % file_key), entry)

            index_rows.append(
                slim_index_row(stakeholder, entry, register_number, entry_file, status)
            )
            print("[%s] %-12s -> %s (%s Treffer)" % (status, sid, register_number, rec["resultCount"]))
        except Exception as exc:  # pro Stakeholder isoliert – ein Fehler stoppt den Lauf nicht
            rec["matchStatus"] = "error"
            rec["error"] = str(exc)
            index_rows.append(
                slim_index_row(stakeholder, None, None, None, "error")
            )
            print("[error] %-12s -> %s" % (sid, exc))

        report["stakeholders"].append(rec)
        time.sleep(REQUEST_PAUSE_SECONDS)

    index = {
        "snapshotDate": snapshot_date,
        "source": meta["source"],
        "searchDate": meta["searchDate"],
        "entries": index_rows,
    }

    if args.dry_run:
        print("\n--- DRY RUN: report ---")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    write_json(os.path.join(snapshot_dir, "index.json"), index)
    write_json(os.path.join(snapshot_dir, "report.json"), report)
    update_manifest(snapshot_date)
    copy_configs()
    print("\nSnapshot geschrieben nach %s" % snapshot_dir)


def update_manifest(snapshot_date):
    manifest_path = os.path.join(DATA_DIR, "manifest.json")
    snapshots_root = os.path.join(DATA_DIR, "snapshots")
    dates = []
    if os.path.isdir(snapshots_root):
        dates = sorted(
            d for d in os.listdir(snapshots_root)
            if os.path.isdir(os.path.join(snapshots_root, d))
        )
    if snapshot_date not in dates:
        dates.append(snapshot_date)
        dates.sort()
    manifest = {"latest": dates[-1] if dates else snapshot_date, "snapshots": dates}
    write_json(manifest_path, manifest)


def copy_configs():
    target = os.path.join(DATA_DIR, "config")
    os.makedirs(target, exist_ok=True)
    for name in ("watchlist.json", "topics.json"):
        shutil.copyfile(os.path.join(CONFIG_DIR, name), os.path.join(target, name))


if __name__ == "__main__":
    main()
