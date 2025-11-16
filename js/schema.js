// js/schema.js

const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "depot.checklistConfig";

// Optional unified key for future versions (not required by the app yet)
const LS_SCHEMA_KEY = "depot.notesSchema.v1";

function safeParse(json, fallback) {
  try {
    if (!json) return fallback;
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to parse JSON:", err);
    return fallback;
  }
}

function sanitiseSectionSchema(input) {
  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.sections)) {
      return value.sections;
    }
    return [];
  };

  const rawEntries = asArray(input);
  const prepared = [];
  rawEntries.forEach((entry, idx) => {
    if (!entry) return;
    const rawName = entry.name ?? entry.section ?? entry.title ?? entry.heading;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name.toLowerCase() === "arse_cover_notes") return;

    const rawDescription = entry.description ?? entry.hint ?? "";
    const description = typeof rawDescription === "string"
      ? rawDescription.trim()
      : String(rawDescription || "").trim();

    const order = typeof entry.order === "number" ? entry.order : idx + 1;
    prepared.push({ name, description, order, idx });
  });

  prepared.sort((a, b) => {
    const aHasOrder = typeof a.order === "number";
    const bHasOrder = typeof b.order === "number";
    if (aHasOrder && bHasOrder && a.order !== b.order) {
      return a.order - b.order;
    }
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;
    return a.idx - b.idx;
  });

  const unique = [];
  const seen = new Set();
  prepared.forEach((entry) => {
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    unique.push({
      name: entry.name,
      description: entry.description || "",
      order: entry.order
    });
  });

  const final = unique.map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: idx + 1
  }));

  return final;
}

// Checklist sanitation similar to index.html
function sanitiseChecklistArray(value) {
  const asArray = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (input && typeof input === "object" && Array.isArray(input.items)) {
      return input.items;
    }
    return [];
  };

  const entries = asArray(value);
  const seen = new Set();
  const cleaned = [];

  entries.forEach((item) => {
    if (!item) return;
    const copy = { ...item };
    const id = copy.id != null ? String(copy.id).trim() : "";
    const label = copy.label != null ? String(copy.label).trim() : "";
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    copy.id = id;
    copy.label = label;
    copy.group = copy.group != null ? String(copy.group).trim() : (copy.category ? String(copy.category).trim() : "Checklist");
    copy.hint = copy.hint != null ? String(copy.hint).trim() : (copy.description ? String(copy.description).trim() : "");
    const section = copy.section != null && String(copy.section).trim()
      ? String(copy.section).trim()
      : copy.depotSection != null && String(copy.depotSection).trim()
        ? String(copy.depotSection).trim()
        : "";
    copy.section = section;
    if (section) {
      copy.depotSection = section;
    }
    cleaned.push(copy);
  });

  return cleaned;
}

// Load defaults from the JSON files in the repo
async function loadDefaultSectionSchema() {
  try {
    const res = await fetch("depot.output.schema.json", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return sanitiseSectionSchema(json);
  } catch (err) {
    console.warn("Failed to load default section schema", err);
    return [];
  }
}

async function loadDefaultChecklist() {
  try {
    const res = await fetch("checklist.config.json", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return sanitiseChecklistArray(json);
  } catch (err) {
    console.warn("Failed to load default checklist", err);
    return [];
  }
}

// Read any overrides existing in localStorage (for backward compatibility)
function readStoredSectionOverride() {
  const keys = [SECTION_STORAGE_KEY, LEGACY_SECTION_STORAGE_KEY];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      return safeParse(raw, null);
    } catch (_) {
      continue;
    }
  }
  return null;
}

function readStoredChecklistOverride() {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return null;
    return safeParse(raw, null);
  } catch (_) {
    return null;
  }
}

// Public API: getDefaultSchema, loadSchema, saveSchema

export async function getDefaultSchema() {
  const [sections, checklistItems] = await Promise.all([
    loadDefaultSectionSchema(),
    loadDefaultChecklist()
  ]);

  const cleanedSections = sanitiseSectionSchema(sections);
  const cleanedItems = sanitiseChecklistArray(checklistItems);

  const sectionNames = cleanedSections.map((s) => s.name);
  const sectionsOrder = sectionNames.slice();

  return {
    sections: sectionNames,
    checklist: {
      sectionsOrder,
      items: cleanedItems
    }
  };
}

// Normalise an arbitrary "raw" schema-like structure into our canonical shape
export function normaliseSchema(raw, fallback) {
  const base = fallback || { sections: [], checklist: { sectionsOrder: [], items: [] } };
  if (!raw || typeof raw !== "object") return base;

  // Normalise sections
  let sections = [];
  if (Array.isArray(raw.sections)) {
    sections = raw.sections
      .map((s) => {
        if (typeof s === "string") return s.trim();
        if (s && typeof s === "object") {
          const n = s.name ?? s.section ?? s.title ?? s.heading;
          return typeof n === "string" ? n.trim() : "";
        }
        return "";
      })
      .filter((s) => s && s.toLowerCase() !== "arse_cover_notes");
  }

  // Normalise checklist
  let checklist = raw.checklist;
  if (!checklist || typeof checklist !== "object") {
    checklist = {};
  }
  const items = sanitiseChecklistArray(checklist.items ?? checklist);
  let sectionsOrder = Array.isArray(checklist.sectionsOrder)
    ? checklist.sectionsOrder.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const seen = new Set();
  sectionsOrder = sectionsOrder.filter((name) => {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed) || !sections.includes(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
  sections.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      sectionsOrder.push(name);
    }
  });

  return {
    sections,
    checklist: {
      sectionsOrder,
      items
    }
  };
}

export async function loadSchema() {
  // Try unified schema first
  const rawUnified = safeParse(localStorage.getItem(LS_SCHEMA_KEY), null);

  // Also pull existing overrides to keep backward compatibility
  const sectionOverride = readStoredSectionOverride();
  const checklistOverride = readStoredChecklistOverride();

  const defaults = await getDefaultSchema();

  // If we have a unified schema, start from that
  if (rawUnified) {
    const merged = normaliseSchema(rawUnified, defaults);
    return merged;
  }

  // Otherwise build from overrides + defaults
  const mergedFromOverrides = normaliseSchema({
    sections: sectionOverride,
    checklist: checklistOverride
  }, defaults);

  return mergedFromOverrides;
}

export function saveSchema(schema) {
  if (!schema || typeof schema !== "object") {
    throw new Error("Invalid schema to save");
  }

  // Normalise against itself
  const normalised = normaliseSchema(schema, { sections: [], checklist: { sectionsOrder: [], items: [] } });

  // Persist unified schema
  try {
    localStorage.setItem(LS_SCHEMA_KEY, JSON.stringify(normalised));
  } catch (err) {
    console.warn("Failed to save unified depot schema", err);
  }

  // Also persist legacy keys for compatibility with the main app

  // Sections format: an array of { name, description, order }
  const legacySections = normalised.sections.map((name, idx) => ({
    name,
    description: "",
    order: idx + 1
  }));
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(legacySections));
  } catch (err) {
    console.warn("Failed to save legacy section schema", err);
  }

  // Checklist format: array of items
  const legacyChecklist = normalised.checklist.items;
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(legacyChecklist));
  } catch (err) {
    console.warn("Failed to save legacy checklist config", err);
  }

  return normalised;
}
