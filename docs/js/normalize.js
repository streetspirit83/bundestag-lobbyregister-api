// normalize.js — wandelt ein rohes Entry-JSON in durchsuchbare Textfelder um.
// Rückgabe: Liste von { field, label, text } (NICHT konkateniert, damit Treffer
// feldgenau verortbar bleiben). FOI-Codes werden separat fürs Filtern zurückgegeben.

// Sekundäre Felder (Lobbyist, Auftraggeber) sind per Default zugeschaltet, lassen
// sich aber über das options-Argument abschalten.
export function normalizeEntry(entry, options = {}) {
  const includeSecondary = options.includeSecondary !== false;
  const fields = [];
  if (!entry) return { fields, foiCodes: [] };

  if (entry.activityDescription) {
    fields.push({
      field: "activityDescription",
      label: "Tätigkeitsbeschreibung",
      text: entry.activityDescription,
    });
  }

  const foi = entry.fieldsOfInterest || [];
  const foiCodes = [];
  for (const f of foi) {
    if (f.code) foiCodes.push(f.code);
    const label = "Interessensbereich";
    if (f.de) fields.push({ field: "fieldsOfInterest.de", label, text: f.de });
    if (f.en) fields.push({ field: "fieldsOfInterest.en", label, text: f.en });
  }

  for (const p of entry.legislativeProjects || []) {
    const ctx = p.printingNumber ? `${p.name} (Drs. ${p.printingNumber})` : p.name;
    if (p.name) {
      fields.push({ field: "legislativeProjects", label: "Gesetzesvorhaben", text: ctx });
    }
  }

  if (includeSecondary) {
    const identity = entry.lobbyistIdentity || {};
    if (identity.name) {
      fields.push({ field: "lobbyistIdentity.name", label: "Name", text: identity.name });
    }
    for (const c of entry.clientOrganizations || []) {
      if (c.name) {
        fields.push({ field: "clientOrganizations", label: "Auftraggeber", text: c.name });
      }
    }
  }

  return { fields, foiCodes };
}
