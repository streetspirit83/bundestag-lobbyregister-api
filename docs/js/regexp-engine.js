// regexp-engine.js — Kernstück der Positions-/Schlagwortanalyse.
// Kompiliert die Topic-Patterns einmalig, sucht sie gegen die normalisierten
// Felder eines Eintrags, liefert Treffer-Snippets (XSS-sicher) und Topic-Scores.

const SNIPPET_RADIUS = 60; // Zeichen Kontext um einen Treffer

// Kompiliert topics.json zu { id, label, weight, patterns:[{src, re|null, error}] }.
// Ungültige Patterns werden markiert (error) statt zu crashen.
export function compileTopics(topicsConfig) {
  const defaultFlags = topicsConfig.defaultFlags || "gi";
  return (topicsConfig.topics || []).map((topic) => {
    const flags = ensureGlobal(topic.flags || defaultFlags);
    const patterns = (topic.patterns || []).map((src) => {
      try {
        return { src, re: new RegExp(src, flags), error: null };
      } catch (err) {
        return { src, re: null, error: err.message };
      }
    });
    return {
      id: topic.id,
      label: topic.label || topic.id,
      weight: typeof topic.weight === "number" ? topic.weight : 1,
      patterns,
    };
  });
}

function ensureGlobal(flags) {
  return flags.includes("g") ? flags : flags + "g";
}

// Führt alle kompilierten Topics gegen die normalisierten Felder aus.
// Rückgabe: { topics: { [topicId]: { hits:[...], score, distinctFields } }, totalHits }
export function analyzeEntry(compiledTopics, normalized) {
  const result = { topics: {}, totalHits: 0 };
  const fields = normalized.fields || [];

  for (const topic of compiledTopics) {
    const hits = [];
    const fieldsWithHit = new Set();

    for (const { field, label, text } of fields) {
      for (let pi = 0; pi < topic.patterns.length; pi++) {
        const pat = topic.patterns[pi];
        if (!pat.re) continue;
        pat.re.lastIndex = 0;
        for (const m of text.matchAll(pat.re)) {
          if (m[0] === "") continue; // Leertreffer ignorieren (Endlosschleifenschutz)
          hits.push({
            field,
            label,
            patternIndex: pi,
            patternSrc: pat.src,
            matchText: m[0],
            snippetHtml: makeSnippet(text, m.index, m[0].length),
          });
          fieldsWithHit.add(field);
        }
      }
    }

    const score = topic.weight * hits.length;
    result.topics[topic.id] = {
      hits,
      score,
      distinctFields: fieldsWithHit.size,
    };
    result.totalHits += hits.length;
  }
  return result;
}

// Erzeugt ein HTML-Snippet: erst escapen, dann <mark> setzen (XSS-sicher).
function makeSnippet(text, index, length) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  const before = escapeHtml(text.slice(start, index));
  const hit = escapeHtml(text.slice(index, index + length));
  const after = escapeHtml(text.slice(index + length, end));
  const prefix = start > 0 ? "… " : "";
  const suffix = end < text.length ? " …" : "";
  return `${prefix}${before}<mark>${hit}</mark>${after}${suffix}`;
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Normiert Topic-Scores über alle Stakeholder hinweg auf 0..1 (für die Heatmap).
export function normalizeScores(rowsByTopic) {
  const maxByTopic = {};
  for (const topicId of Object.keys(rowsByTopic)) {
    maxByTopic[topicId] = Math.max(1, ...rowsByTopic[topicId]);
  }
  return maxByTopic;
}
