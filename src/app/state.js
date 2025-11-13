import defaultChecklistConfig from "../../data/checklist.config.json" assert { type: "json" };
import defaultDepotSchema from "../../data/depot.output.schema.json" assert { type: "json" };

const LS_CHECKLIST_CONFIG_KEY = "depot-checklist-config";
const LS_SCHEMA_KEY = "depot-output-schema";
const LS_CHECKLIST_STATE_KEY = "depot-checklist-state";

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

export function loadChecklistConfig() {
  return loadJsonOrDefault(LS_CHECKLIST_CONFIG_KEY, defaultChecklistConfig);
}

export function loadDepotSchema() {
  return loadJsonOrDefault(LS_SCHEMA_KEY, defaultDepotSchema);
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

export const DEFAULT_CHECKLIST_CONFIG = defaultChecklistConfig;
export const DEFAULT_DEPOT_SCHEMA = defaultDepotSchema;
export const CHECKLIST_CONFIG_STORAGE_KEY = LS_CHECKLIST_CONFIG_KEY;
export const DEPOT_SCHEMA_STORAGE_KEY = LS_SCHEMA_KEY;
