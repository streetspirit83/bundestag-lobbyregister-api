// data.js — lädt Manifest, Configs, Snapshot-Index und (lazy) einzelne Einträge.
// Alle Pfade relativ zu docs/ -> same-origin auf GitHub Pages, kein CORS.

const DATA_BASE = "data";
const entryCache = new Map();

async function getJson(path) {
  const resp = await fetch(path, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`Konnte ${path} nicht laden (HTTP ${resp.status})`);
  return resp.json();
}

export async function loadManifest() {
  return getJson(`${DATA_BASE}/manifest.json`);
}

export async function loadConfigs() {
  const [watchlist, topics] = await Promise.all([
    getJson(`${DATA_BASE}/config/watchlist.json`),
    getJson(`${DATA_BASE}/config/topics.json`),
  ]);
  return { watchlist, topics };
}

export async function loadIndex(snapshotDate) {
  return getJson(`${DATA_BASE}/snapshots/${snapshotDate}/index.json`);
}

// Lädt ein vollständiges Entry-JSON lazy (mit Cache pro Session).
export async function loadEntry(snapshotDate, entryFile) {
  if (!entryFile) return null;
  const path = `${DATA_BASE}/snapshots/${snapshotDate}/${entryFile}`;
  if (entryCache.has(path)) return entryCache.get(path);
  const entry = await getJson(path);
  entryCache.set(path, entry);
  return entry;
}
