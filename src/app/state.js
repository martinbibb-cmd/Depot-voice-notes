import defaultChecklistConfig from "../../checklist.config.json" assert { type: "json" };
import defaultDepotSchema from "../../depot.output.schema.json" assert { type: "json" };
import {
  DEFAULT_WORKER_ENDPOINT,
  WORKER_ENDPOINT_STORAGE_KEY,
  WORKER_ENDPOINT_STORAGE_KEYS,
  loadWorkerEndpoint,
  saveWorkerEndpointOverride,
  clearWorkerEndpointOverride
} from "./worker-config.js";

const LS_DEPOT_NOTES_SCHEMA_KEY = "settings.depotNotesSchema";
const LEGACY_SECTION_KEYS = ["depot.sectionSchema", "surveybrain-schema", "depot-output-schema"];
const LEGACY_CHECKLIST_KEYS = ["depot.checklistConfig"];
const LS_CHECKLIST_STATE_KEY = "depot-checklist-state";
const FUTURE_PLANS_NAME = "Future plans";

function deepClone(value) {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // ignore and fall back to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function extractSectionNames(raw) {
  if (!raw) return [];
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray(raw.sections)
      ? raw.sections
      : raw && typeof raw === "object" && Array.isArray(raw.names)
        ? raw.names
        : [];
  const seen = new Set();
  const names = [];
  source.forEach((entry) => {
    let name = "";
    if (typeof entry === "string") {
      name = entry.trim();
    } else if (entry && typeof entry === "object") {
      const candidate = entry.name ?? entry.section ?? entry.title ?? entry.heading;
      name = typeof candidate === "string" ? candidate.trim() : "";
    }
    if (!name || name.toLowerCase() === "arse_cover_notes" || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

function ensureFuturePlansLast(names) {
  const seen = new Set();
  const ordered = [];
  names.forEach((name) => {
    const trimmed = typeof name === "string" ? name.trim() : String(name || "").trim();
    if (!trimmed || trimmed === FUTURE_PLANS_NAME || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  });
  ordered.push(FUTURE_PLANS_NAME);
  return ordered;
}

const DEFAULT_SECTION_NAMES = ensureFuturePlansLast(extractSectionNames(defaultDepotSchema));

function normaliseSectionNames(raw) {
  const base = extractSectionNames(raw);
  const merged = base.length ? base.slice() : DEFAULT_SECTION_NAMES.slice();
  const seen = new Set(merged);
  DEFAULT_SECTION_NAMES.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      merged.push(name);
    }
  });
  return ensureFuturePlansLast(merged);
}

function normaliseChecklistItems(raw) {
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray(raw.items)
      ? raw.items
      : [];
  const seen = new Set();
  const items = [];
  entries.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = item.id != null ? String(item.id).trim() : "";
    const label = item.label != null ? String(item.label).trim() : "";
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    const section = item.section != null
      ? String(item.section).trim()
      : item.depotSection != null
        ? String(item.depotSection).trim()
        : "";
    const materials = Array.isArray(item.materials)
      ? item.materials
          .map((mat) => {
            if (!mat || typeof mat !== "object") return null;
            const itemName = mat.item != null ? String(mat.item).trim() : "";
            if (!itemName) return null;
            const qtyNum = Number(mat.qty);
            const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
            return {
              category: mat.category != null ? String(mat.category).trim() : "Misc",
              item: itemName,
              qty,
              notes: mat.notes != null ? String(mat.notes).trim() : ""
            };
          })
          .filter(Boolean)
      : [];
    items.push({
      id,
      group: item.group != null ? String(item.group).trim() : "",
      section,
      depotSection: section || undefined,
      label,
      hint: item.hint != null ? String(item.hint).trim() : "",
      plainText: item.plainText != null ? String(item.plainText).trim() : "",
      naturalLanguage: item.naturalLanguage != null ? String(item.naturalLanguage).trim() : "",
      materials
    });
  });
  return items;
}

function normaliseChecklistConfig(raw, sectionNames = DEFAULT_SECTION_NAMES) {
  const items = normaliseChecklistItems(raw);
  const orderSource = raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.sectionsOrder)
    ? raw.sectionsOrder
    : [];
  const canonical = Array.isArray(sectionNames) && sectionNames.length
    ? sectionNames
    : DEFAULT_SECTION_NAMES;
  const seen = new Set();
  const sectionsOrder = [];
  orderSource.forEach((name) => {
    const trimmed = typeof name === "string" ? name.trim() : String(name || "").trim();
    if (!trimmed || seen.has(trimmed) || !canonical.includes(trimmed)) return;
    seen.add(trimmed);
    sectionsOrder.push(trimmed);
  });
  canonical.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      sectionsOrder.push(name);
    }
  });
  return {
    sectionsOrder,
    items
  };
}

const DEFAULT_CHECKLIST = normaliseChecklistConfig(defaultChecklistConfig, DEFAULT_SECTION_NAMES);
const BASE_DEPOT_NOTES_SCHEMA = {
  sections: DEFAULT_SECTION_NAMES.slice(),
  checklist: {
    sectionsOrder: DEFAULT_CHECKLIST.sectionsOrder.slice(),
    items: deepClone(DEFAULT_CHECKLIST.items)
  }
};

function loadJsonOrDefault(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return deepClone(fallback);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : deepClone(fallback);
  } catch (_) {
    return deepClone(fallback);
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // ignore storage issues (private browsing etc.)
  }
}

function readLegacySections() {
  for (const key of LEGACY_SECTION_KEYS) {
    const value = loadJsonOrDefault(key, null);
    if (value) return value;
  }
  return null;
}

function readLegacyChecklist() {
  for (const key of LEGACY_CHECKLIST_KEYS) {
    const value = loadJsonOrDefault(key, null);
    if (value) return value;
  }
  return null;
}

function sanitiseDepotNotesSchema(candidate) {
  if (!candidate) return null;
  const sectionsInput = candidate.sections ?? candidate.sectionNames ?? candidate;
  const sections = normaliseSectionNames(sectionsInput);
  const checklistSource = candidate.checklist ?? candidate.checklistConfig ?? candidate;
  const checklist = normaliseChecklistConfig(checklistSource, sections);
  if (!sections.length && !checklist.items.length) {
    return null;
  }
  return {
    sections,
    checklist
  };
}

function pruneLegacyKeys() {
  [...LEGACY_SECTION_KEYS, ...LEGACY_CHECKLIST_KEYS].forEach((key) => {
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // ignore storage failures
    }
  });
}

export function loadDepotNotesSchema() {
  let schema = sanitiseDepotNotesSchema(loadJsonOrDefault(LS_DEPOT_NOTES_SCHEMA_KEY, null));

  if (!schema) {
    const legacySections = readLegacySections();
    const sections = normaliseSectionNames(legacySections);
    const legacyChecklist = readLegacyChecklist();
    const checklist = normaliseChecklistConfig(legacyChecklist ?? defaultChecklistConfig, sections);
    schema = { sections, checklist };
  }

  if (!schema || !schema.sections.length) {
    schema = deepClone(BASE_DEPOT_NOTES_SCHEMA);
  } else {
    schema = {
      sections: normaliseSectionNames(schema.sections),
      checklist: normaliseChecklistConfig(schema.checklist, schema.sections)
    };
  }

  const finalSchema = {
    sections: schema.sections.slice(),
    checklist: {
      sectionsOrder: schema.checklist.sectionsOrder.slice(),
      items: deepClone(schema.checklist.items)
    }
  };

  saveJson(LS_DEPOT_NOTES_SCHEMA_KEY, finalSchema);
  pruneLegacyKeys();

  return deepClone(finalSchema);
}

export function saveDepotNotesSchema(value) {
  const candidate = sanitiseDepotNotesSchema(value);
  const finalSchema = candidate
    ? {
        sections: candidate.sections.slice(),
        checklist: {
          sectionsOrder: candidate.checklist.sectionsOrder.slice(),
          items: deepClone(candidate.checklist.items)
        }
      }
    : deepClone(BASE_DEPOT_NOTES_SCHEMA);
  saveJson(LS_DEPOT_NOTES_SCHEMA_KEY, finalSchema);
  pruneLegacyKeys();
  return deepClone(finalSchema);
}

export function loadChecklistConfig() {
  return loadDepotNotesSchema().checklist;
}

export function loadDepotSchema() {
  return loadDepotNotesSchema().sections.map((name, idx) => ({ name, order: idx + 1 }));
}

export function loadChecklistState() {
  try {
    const raw = localStorage.getItem(LS_CHECKLIST_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_) {
    return {};
  }
}

export function saveChecklistState(state) {
  saveJson(LS_CHECKLIST_STATE_KEY, state || {});
}

export function loadWorkerUrl(fallback = DEFAULT_WORKER_ENDPOINT) {
  return loadWorkerEndpoint({ fallback });
}

export function saveWorkerUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    clearWorkerEndpointOverride();
    return;
  }
  saveWorkerEndpointOverride(trimmed);
}

export const DEFAULT_CHECKLIST_CONFIG = defaultChecklistConfig;
export const DEFAULT_DEPOT_SCHEMA = defaultDepotSchema;
export const DEFAULT_DEPOT_NOTES_SCHEMA = BASE_DEPOT_NOTES_SCHEMA;
export const CHECKLIST_CONFIG_STORAGE_KEY = LS_DEPOT_NOTES_SCHEMA_KEY;
export const DEPOT_SCHEMA_STORAGE_KEY = LS_DEPOT_NOTES_SCHEMA_KEY;
export const DEPOT_NOTES_SCHEMA_STORAGE_KEY = LS_DEPOT_NOTES_SCHEMA_KEY;
export const WORKER_URL_STORAGE_KEY = WORKER_ENDPOINT_STORAGE_KEY;
export const WORKER_URL_STORAGE_KEYS = WORKER_ENDPOINT_STORAGE_KEYS;
export const DEFAULT_WORKER_URL = DEFAULT_WORKER_ENDPOINT;
