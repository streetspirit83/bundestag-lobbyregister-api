// table.js — Dashboard: Zeilen = Stakeholder, Spalten = Topics, Zelle = Score (Heatmap).
import { normalizeScores } from "../regexp-engine.js";

let currentSort = { key: "name", dir: 1 };

export function renderTable(container, state, handlers) {
  const { rows, compiledTopics, scoreMode, activeTag } = state;

  const tags = collectTags(rows);
  const visibleRows = activeTag ? rows.filter((r) => (r.indexRow.tags || []).includes(activeTag)) : rows;

  // Maxima je Topic für die Heatmap-Normierung
  const perTopicScores = {};
  for (const t of compiledTopics) perTopicScores[t.id] = visibleRows.map((r) => scoreOf(r, t.id, scoreMode));
  const maxByTopic = normalizeScores(perTopicScores);

  sortRows(visibleRows, compiledTopics, scoreMode);

  const head = `
    <th class="sortable" data-sort="name">Stakeholder</th>
    <th class="sortable" data-sort="total">Σ</th>
    ${compiledTopics.map((t) => `<th class="sortable topic" data-sort="${t.id}" title="${t.label}">${t.label}</th>`).join("")}
  `;

  const body = visibleRows.map((r) => {
    const cells = compiledTopics.map((t) => {
      const score = scoreOf(r, t.id, scoreMode);
      const intensity = score > 0 ? 0.15 + 0.85 * (score / maxByTopic[t.id]) : 0;
      const bg = score > 0 ? `style="background: rgba(37,99,235,${intensity.toFixed(3)})"` : "";
      return `<td class="num heat" ${bg} title="${score}">${score || ""}</td>`;
    }).join("");
    const total = totalScore(r, scoreMode);
    return `<tr data-id="${r.indexRow.id}" class="row">
      <td class="name">${escape(r.indexRow.name)}${statusBadge(r.indexRow.matchStatus)}</td>
      <td class="num total">${total || ""}</td>
      ${cells}
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="toolbar">
      <label>Tag-Filter:
        <select id="tag-filter">
          <option value="">— alle —</option>
          ${tags.map((t) => `<option value="${escape(t)}" ${t === activeTag ? "selected" : ""}>${escape(t)}</option>`).join("")}
        </select>
      </label>
      <label>Score:
        <select id="score-mode">
          <option value="hits" ${scoreMode === "hits" ? "selected" : ""}>Treffer (gewichtet)</option>
          <option value="distinctFields" ${scoreMode === "distinctFields" ? "selected" : ""}>Felder mit Treffer</option>
        </select>
      </label>
      <button id="export-csv">CSV-Export</button>
      <button id="export-json">JSON-Export</button>
      <span class="hint">${visibleRows.length} Stakeholder · Klick auf Zeile → Detail</span>
    </div>
    <table class="heatmap">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;

  container.querySelector("#tag-filter").onchange = (e) => handlers.onTagChange(e.target.value);
  container.querySelector("#score-mode").onchange = (e) => handlers.onScoreModeChange(e.target.value);
  container.querySelector("#export-csv").onclick = () => handlers.onExportCsv();
  container.querySelector("#export-json").onclick = () => handlers.onExportJson();
  container.querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      currentSort.dir = currentSort.key === key ? -currentSort.dir : 1;
      currentSort.key = key;
      handlers.onRerender();
    };
  });
  container.querySelectorAll("tr.row").forEach((tr) => {
    tr.onclick = () => handlers.onSelect(tr.dataset.id);
  });
}

function scoreOf(row, topicId, mode) {
  const t = row.analysis.topics[topicId];
  if (!t) return 0;
  return mode === "distinctFields" ? t.distinctFields : t.score;
}

function totalScore(row, mode) {
  return Object.keys(row.analysis.topics).reduce((sum, id) => sum + scoreOf(row, id, mode), 0);
}

function sortRows(rows, topics, mode) {
  const { key, dir } = currentSort;
  rows.sort((a, b) => {
    let av, bv;
    if (key === "name") { av = a.indexRow.name || ""; bv = b.indexRow.name || ""; return dir * av.localeCompare(bv); }
    if (key === "total") { av = totalScore(a, mode); bv = totalScore(b, mode); }
    else { av = scoreOf(a, key, mode); bv = scoreOf(b, key, mode); }
    return dir * (av - bv);
  });
}

function collectTags(rows) {
  const set = new Set();
  rows.forEach((r) => (r.indexRow.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

function statusBadge(status) {
  if (!status || status === "ok") return "";
  const labels = { name_fallback: "Name-Match", ambiguous: "mehrdeutig", unmatched: "kein Treffer", error: "Fehler" };
  return ` <span class="badge ${status}">${labels[status] || status}</span>`;
}

function escape(s) {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}
