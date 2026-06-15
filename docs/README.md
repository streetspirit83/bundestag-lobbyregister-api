# Lobby-Monitoring-Tool

HTML-basiertes Tool zur Auswertung des Bundestag-Lobbyregisters mit
Schlagwort-/Positionsanalyse via Regexp. Snapshot-basiert, alle API-Abrufe manuell.

## Architektur (zweistufig)

1. **Beschaffung (manuell, lokal):** `scripts/fetch_snapshots.py` liest die Watchlist,
   ruft pro Stakeholder die API über den bestehenden Python-Client auf und schreibt
   versionierte JSON-Snapshots nach `docs/data/`.
2. **Auswertung (Browser):** Die statische Seite unter `docs/` lädt diese Snapshots
   same-origin (kein CORS) und führt Suche/Filter/Regexp clientseitig aus.

GitHub Pages ist rein statisch → Live-Calls an `lobbyregister.bundestag.de` würden im
Browser an CORS scheitern. Daher der Snapshot-Schritt. Ein Stakeholder ist im Browser
durchsuchbar, sobald er im Snapshot liegt; für einen neuen Eintrag die Watchlist
ergänzen und die Beschaffung einmal neu starten.

## Bedienung

### 1. Watchlist & Themen pflegen
- `scripts/config/watchlist.json` — zu beobachtende Stakeholder (`name` oder
  `registerNumber` Pflicht, optional `tags`, `queryOverride`).
- `scripts/config/topics.json` — Themen mit Regexp-Mustern (`patterns[]`, `flags`,
  `weight`). Muster sind rohe JS-Regexp-Strings (im JSON doppelt escapen).

### 2. Snapshot erzeugen (manuell)
```bash
python scripts/fetch_snapshots.py --dry-run     # nur prüfen, nichts schreiben
python scripts/fetch_snapshots.py               # Snapshot für heute schreiben
python scripts/fetch_snapshots.py --only <id>   # einzelnen Stakeholder
python scripts/fetch_snapshots.py --date 2026-06-15
```
Schreibt `docs/data/snapshots/<datum>/`, aktualisiert `manifest.json` und kopiert die
Configs nach `docs/data/config/`. Nicht-eindeutige Treffer werden in `report.json` als
`unmatched`/`ambiguous` protokolliert (es wird nicht geraten).

### 3. Lokal ansehen (Pflicht: über Server, nicht `file://`)
```bash
cd docs && python -m http.server 8000
# http://localhost:8000/
```

### 4. Veröffentlichen
Repo-Settings → Pages → Source: Branch, Ordner `/docs`. Alle Dateien unter
`docs/data/` committen (Pages liefert nur committete Dateien).

## Funktionen
- **Heatmap-Dashboard:** Zeilen = Stakeholder, Spalten = Themen, Zelle = Score.
  Sortierbar, Tag-Filter, umschaltbarer Score (gewichtete Treffer / Felder mit Treffer).
- **Detailansicht:** Stammdaten + Match-Snippets mit Hervorhebung, gruppiert nach Thema.
- **Export:** CSV (Score-Matrix) und JSON (vollständige Treffer).

## Erweiterbarkeit
Neue Auswertungen als Modul unter `docs/js/views/` (z.B. Finanzaggregation,
Auftraggeber-Netzwerk, Snapshot-Diff) und Registrierung in `docs/js/main.js`.
Felder dafür liegen bereits im schlanken `index.json` bzw. in den Entry-Dateien.
