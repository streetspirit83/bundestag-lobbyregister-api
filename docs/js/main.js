// main.js — Bootstrap & View-Routing für das Lobby-Monitoring-Tool.
import { loadManifest, loadConfigs, loadIndex, loadEntry } from "./data.js";
import { normalizeEntry } from "./normalize.js";
import { compileTopics, analyzeEntry } from "./regexp-engine.js";
import { renderTable } from "./views/table.js";
import { renderDetail } from "./views/detail.js";
import { exportCsv, exportJson } from "./export.js";

const app = document.getElementById("app");
const meta = document.getElementById("meta");

const state = {
  snapshotDate: null,
  manifest: null,
  compiledTopics: [],
  rows: [],            // [{ indexRow, entry, analysis }]
  scoreMode: "hits",
  activeTag: "",
  view: "table",
  selectedId: null,
};

const handlers = {
  onTagChange: (tag) => { state.activeTag = tag; route(); },
  onScoreModeChange: (mode) => { state.scoreMode = mode; route(); },
  onRerender: () => route(),
  onExportCsv: () => exportCsv(visibleRows(), state.compiledTopics, state.scoreMode),
  onExportJson: () => exportJson(visibleRows(), state.snapshotDate),
  onSelect: (id) => { state.selectedId = id; state.view = "detail"; route(); },
  onBack: () => { state.view = "table"; state.selectedId = null; route(); },
};

function visibleRows() {
  return state.activeTag
    ? state.rows.filter((r) => (r.indexRow.tags || []).includes(state.activeTag))
    : state.rows;
}

async function init() {
  try {
    state.manifest = await loadManifest();
    const { topics } = await loadConfigs();
    state.compiledTopics = compileTopics(topics);
    reportInvalidPatterns(state.compiledTopics);
    await loadSnapshot(state.manifest.latest);
    renderMeta();
    route();
  } catch (err) {
    app.innerHTML = `<div class="error">Fehler beim Laden: ${err.message}.<br>
      Wurde <code>scripts/fetch_snapshots.py</code> ausgeführt und über einen
      lokalen Server (nicht <code>file://</code>) geöffnet?</div>`;
  }
}

async function loadSnapshot(date) {
  state.snapshotDate = date;
  const index = await loadIndex(date);
  state.indexMeta = index;
  // Alle Einträge laden (Watchlist-Größenordnung), dann normalisieren + analysieren.
  state.rows = await Promise.all(index.entries.map(async (indexRow) => {
    const entry = await loadEntry(date, indexRow.entryFile);
    const normalized = normalizeEntry(entry);
    const analysis = analyzeEntry(state.compiledTopics, normalized);
    return { indexRow, entry, analysis };
  }));
}

function route() {
  if (state.view === "detail") {
    const row = state.rows.find((r) => r.indexRow.id === state.selectedId);
    if (row) return renderDetail(app, row, state.compiledTopics, handlers);
  }
  renderTable(app, state, handlers);
}

function renderMeta() {
  const m = state.indexMeta || {};
  const dates = state.manifest.snapshots || [];
  meta.innerHTML = `
    <label>Snapshot:
      <select id="snapshot-select">
        ${dates.map((d) => `<option value="${d}" ${d === state.snapshotDate ? "selected" : ""}>${d}</option>`).join("")}
      </select>
    </label>
    <span class="src">Quelle: ${m.source ? m.source : "—"} · Abruf: ${m.searchDate || "—"}</span>`;
  meta.querySelector("#snapshot-select").onchange = async (e) => {
    await loadSnapshot(e.target.value);
    state.view = "table";
    renderMeta();
    route();
  };
}

function reportInvalidPatterns(compiled) {
  const bad = [];
  compiled.forEach((t) => t.patterns.forEach((p) => { if (p.error) bad.push(`${t.id}: /${p.src}/ — ${p.error}`); }));
  if (bad.length) {
    const div = document.createElement("div");
    div.className = "error";
    div.innerHTML = `Ungültige Regexp-Patterns:<br>${bad.join("<br>")}`;
    app.before(div);
  }
}

init();
