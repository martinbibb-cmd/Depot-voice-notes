import {
  loadDepotNotesSchema,
  saveDepotNotesSchema,
  DEFAULT_DEPOT_NOTES_SCHEMA,
  DEPOT_NOTES_SCHEMA_STORAGE_KEY
} from "../app/state.js";
import {
  WORKER_ENDPOINT_STORAGE_KEYS,
  clearWorkerEndpointOverride
} from "../app/worker-config.js";

const schemaTextarea = document.getElementById("settings-schema-json");
const checklistTextarea = document.getElementById("settings-checklist-json");
const sectionSummaryEl = document.getElementById("settings-section-editor");
const checklistSummaryEl = document.getElementById("checklist-editor");
const saveSchemaBtn = document.getElementById("btn-save-schema");
const resetSchemaBtn = document.getElementById("btn-reset-schema");
const saveChecklistBtn = document.getElementById("btn-save-checklist");
const resetChecklistBtn = document.getElementById("btn-reset-checklist");
const forceReloadBtn = document.getElementById("btn-force-reload");

const LEGACY_STORAGE_KEYS = [
  "depot.sectionSchema",
  "surveybrain-schema",
  "depot-output-schema",
  "depot.checklistConfig",
  "surveyBrainAutosave",
  "depot-checklist-state"
];

function deepClone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // fall back to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneDefaultSchema() {
  const defaults = DEFAULT_DEPOT_NOTES_SCHEMA || {};
  const sections = Array.isArray(defaults.sections) ? defaults.sections.slice() : [];
  const checklist = defaults.checklist && typeof defaults.checklist === "object"
    ? {
        sectionsOrder: Array.isArray(defaults.checklist.sectionsOrder)
          ? defaults.checklist.sectionsOrder.slice()
          : [],
        items: Array.isArray(defaults.checklist.items)
          ? deepClone(defaults.checklist.items)
          : []
      }
    : { sectionsOrder: [], items: [] };
  return { sections, checklist };
}

function renderSectionSummary(sections = []) {
  if (!sectionSummaryEl) return;
  if (!sections.length) {
    sectionSummaryEl.innerHTML = '<p class="small">No sections configured.</p>';
    return;
  }
  const items = sections
    .map((name, idx) => `<li><strong>${idx + 1}.</strong> ${name}</li>`)
    .join("");
  sectionSummaryEl.innerHTML = `<ol>${items}</ol>`;
}

function renderChecklistSummary(checklist = {}) {
  if (!checklistSummaryEl) return;
  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const total = items.length;
  const preview = items.slice(0, 5).map((item) => {
    const label = item && (item.label || item.id || "Item");
    const section = item && item.section ? ` <span class="small">(${item.section})</span>` : "";
    return `<li>${label}${section}</li>`;
  }).join("");
  const more = total > 5 ? "<li>…</li>" : "";
  const order = Array.isArray(checklist.sectionsOrder) && checklist.sectionsOrder.length
    ? checklist.sectionsOrder.join(" › ")
    : "(none)";
  checklistSummaryEl.innerHTML = `
    <p><strong>${total}</strong> checklist items configured.</p>
    <p class="small">Sections order: ${order}</p>
    ${total ? `<ul>${preview}${more}</ul>` : '<p class="small">No checklist items configured.</p>'}
  `;
}

function renderSummaries(schema) {
  renderSectionSummary(schema.sections);
  renderChecklistSummary(schema.checklist);
}

function refreshForm() {
  const schema = loadDepotNotesSchema();
  if (schemaTextarea) {
    schemaTextarea.value = JSON.stringify(schema.sections, null, 2);
  }
  if (checklistTextarea) {
    checklistTextarea.value = JSON.stringify(schema.checklist, null, 2);
  }
  renderSummaries(schema);
}

function parseJsonInput(rawValue, fallback) {
  if (!rawValue || !rawValue.trim()) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err?.message || err}`);
  }
}

function handleSaveSections() {
  if (!schemaTextarea) return;
  try {
    const parsed = parseJsonInput(schemaTextarea.value, []);
    const current = loadDepotNotesSchema();
    saveDepotNotesSchema({
      sections: parsed,
      checklist: current.checklist
    });
    refreshForm();
  } catch (err) {
    alert(err.message || "Unable to save sections");
  }
}

function handleSaveChecklist() {
  if (!checklistTextarea) return;
  try {
    const parsed = parseJsonInput(checklistTextarea.value, { sectionsOrder: [], items: [] });
    const current = loadDepotNotesSchema();
    saveDepotNotesSchema({
      sections: current.sections,
      checklist: parsed
    });
    refreshForm();
  } catch (err) {
    alert(err.message || "Unable to save checklist");
  }
}

function handleResetSections() {
  const defaults = cloneDefaultSchema();
  const current = loadDepotNotesSchema();
  saveDepotNotesSchema({
    sections: defaults.sections,
    checklist: current.checklist
  });
  refreshForm();
}

function handleResetChecklist() {
  const defaults = cloneDefaultSchema();
  const current = loadDepotNotesSchema();
  saveDepotNotesSchema({
    sections: current.sections,
    checklist: defaults.checklist
  });
  refreshForm();
}

function shouldClearKey(key) {
  return /^(depot[.-]|surveyBrain)/.test(key || "");
}

function clearLocalDepotStorage() {
  const keysToClear = new Set([
    DEPOT_NOTES_SCHEMA_STORAGE_KEY,
    ...LEGACY_STORAGE_KEYS,
    ...WORKER_ENDPOINT_STORAGE_KEYS,
    "depot-checklist-state"
  ]);
  keysToClear.forEach((key) => {
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // ignore
    }
  });

  try {
    const extraKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && shouldClearKey(key) && !keysToClear.has(key)) {
        extraKeys.push(key);
      }
    }
    extraKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // ignore
      }
    });
  } catch (_) {
    // ignore inability to enumerate localStorage
  }

  try {
    const sessionKeys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && shouldClearKey(key)) {
        sessionKeys.push(key);
      }
    }
    sessionKeys.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (_) {
        // ignore
      }
    });
  } catch (_) {
    // ignore if sessionStorage inaccessible
  }

  try {
    clearWorkerEndpointOverride();
  } catch (_) {
    // ignore
  }
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  } catch (err) {
    console.warn("Failed to unregister service workers", err);
  }
}

async function clearAppCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key).catch(() => false)));
  } catch (err) {
    console.warn("Failed to clear caches", err);
  }
}

async function forceReloadApp(button) {
  const confirmation = window.confirm(
    "This will clear all locally stored Depot data and reload the app from the network. Continue?"
  );
  if (!confirmation) return;

  if (button) {
    button.disabled = true;
    button.textContent = "Clearing…";
  }

  clearLocalDepotStorage();

  await unregisterServiceWorkers();
  await clearAppCaches();

  if (button) {
    button.textContent = "Reloading…";
  }

  window.location.reload();
}

if (saveSchemaBtn) {
  saveSchemaBtn.addEventListener("click", handleSaveSections);
}
if (resetSchemaBtn) {
  resetSchemaBtn.addEventListener("click", handleResetSections);
}
if (saveChecklistBtn) {
  saveChecklistBtn.addEventListener("click", handleSaveChecklist);
}
if (resetChecklistBtn) {
  resetChecklistBtn.addEventListener("click", handleResetChecklist);
}
if (forceReloadBtn) {
  forceReloadBtn.addEventListener("click", () => forceReloadApp(forceReloadBtn));
}

refreshForm();
