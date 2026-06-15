// detail.js — Einzelner Stakeholder: Stammdaten + Match-Snippets gruppiert nach Topic.
import { escapeHtml } from "../regexp-engine.js";

export function renderDetail(container, row, compiledTopics, handlers) {
  const { indexRow, entry, analysis } = row;
  const ident = (entry && entry.lobbyistIdentity) || {};
  const account = (entry && entry.account) || {};

  const topicsHtml = compiledTopics.map((t) => {
    const res = analysis.topics[t.id] || { hits: [], score: 0 };
    if (!res.hits.length) {
      return `<details class="topic-block empty"><summary>${escapeHtml(t.label)} <span class="count">0</span></summary></details>`;
    }
    const hits = res.hits.map((h) => `
      <li class="hit">
        <div class="hit-meta"><span class="field-label">${escapeHtml(h.label)}</span>
          <code class="pattern" title="Pattern">${escapeHtml(h.patternSrc)}</code></div>
        <div class="snippet">${h.snippetHtml}</div>
      </li>`).join("");
    return `<details class="topic-block" open>
      <summary>${escapeHtml(t.label)} <span class="count">${res.hits.length}</span> · Score ${res.score}</summary>
      <ul class="hits">${hits}</ul>
    </details>`;
  }).join("");

  container.innerHTML = `
    <button id="back" class="back">← zurück zur Übersicht</button>
    <h2>${escapeHtml(indexRow.name)}</h2>
    <dl class="meta-grid">
      <dt>Registernummer</dt><dd>${escapeHtml(account.registerNumber || indexRow.registerNumber || "—")}</dd>
      <dt>Erstveröffentlichung</dt><dd>${escapeHtml(account.firstPublicationDate || "—")}</dd>
      <dt>Tags</dt><dd>${(indexRow.tags || []).map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join(" ") || "—"}</dd>
      <dt>Beschäftigte (Lobbying)</dt><dd>${range(indexRow.employeeCount)}</dd>
      <dt>Finanzielle Aufwendungen</dt><dd>${euro(indexRow.financialExpensesEuro)}</dd>
      <dt>Interessensbereiche</dt><dd>${(indexRow.fieldsOfInterestCodes || []).length}</dd>
      <dt>Gesetzesvorhaben</dt><dd>${indexRow.legislativeProjectCount ?? "—"}</dd>
      <dt>Websites</dt><dd>${(ident.websites || []).map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`).join("<br>") || "—"}</dd>
    </dl>
    <h3>Positionsanalyse (Regexp)</h3>
    <div class="topics">${topicsHtml}</div>`;

  container.querySelector("#back").onclick = () => handlers.onBack();
}

function range(r) {
  if (!r) return "—";
  return `${r.from ?? "?"}–${r.to ?? "?"}`;
}

function euro(r) {
  if (!r) return "—";
  const fmt = (n) => (n == null ? "?" : n.toLocaleString("de-DE"));
  const period = r.fiscalYearStart ? ` (${r.fiscalYearStart}–${r.fiscalYearEnd})` : "";
  return `${fmt(r.from)} – ${fmt(r.to)} €${period}`;
}
