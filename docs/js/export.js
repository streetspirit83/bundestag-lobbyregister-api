// export.js — CSV (Stakeholder × Topic-Score) und JSON (vollständige Match-Ergebnisse).

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(rows, compiledTopics, scoreMode) {
  const header = ["id", "name", "registerNumber", "matchStatus", ...compiledTopics.map((t) => t.label)];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const cells = [
      r.indexRow.id,
      r.indexRow.name,
      r.indexRow.registerNumber || "",
      r.indexRow.matchStatus || "",
      ...compiledTopics.map((t) => {
        const a = r.analysis.topics[t.id];
        if (!a) return 0;
        return scoreMode === "distinctFields" ? a.distinctFields : a.score;
      }),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  download("lobby-scores.csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

export function exportJson(rows, snapshotDate) {
  const payload = {
    snapshotDate,
    exportedAt: new Date().toISOString(),
    stakeholders: rows.map((r) => ({
      id: r.indexRow.id,
      name: r.indexRow.name,
      registerNumber: r.indexRow.registerNumber,
      matchStatus: r.indexRow.matchStatus,
      topics: Object.fromEntries(
        Object.entries(r.analysis.topics).map(([id, a]) => [id, {
          score: a.score,
          distinctFields: a.distinctFields,
          hits: a.hits.map((h) => ({ field: h.field, pattern: h.patternSrc, match: h.matchText })),
        }])
      ),
    })),
  };
  download("lobby-matches.json", JSON.stringify(payload, null, 2), "application/json");
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
