import {
  loadChecklistConfig,
  loadDepotSchema,
  DEFAULT_CHECKLIST_CONFIG,
  DEFAULT_DEPOT_SCHEMA,
  CHECKLIST_CONFIG_STORAGE_KEY,
  DEPOT_SCHEMA_STORAGE_KEY,
  loadWorkerUrl,
  saveWorkerUrl,
  DEFAULT_WORKER_URL
} from "../app/state.js";

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert("Unable to save: " + (e?.message || e));
  }
}

export function initSettingsPage() {
  const checklistArea = document.getElementById("settings-checklist-json");
  const schemaArea = document.getElementById("settings-schema-json");
  const workerInput = document.getElementById("settings-worker-url");

  if (!checklistArea || !schemaArea) {
    console.warn("Settings areas missing from DOM");
    return;
  }

  const checklistCurrent = loadChecklistConfig();
  const schemaCurrent = loadDepotSchema();
  const workerCurrent = loadWorkerUrl(DEFAULT_WORKER_URL);

  checklistArea.value = JSON.stringify(checklistCurrent, null, 2);
  schemaArea.value = JSON.stringify(schemaCurrent, null, 2);
  if (workerInput) {
    workerInput.value = workerCurrent || "";
  }

  document.getElementById("btn-save-checklist")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(checklistArea.value);
      saveJson(CHECKLIST_CONFIG_STORAGE_KEY, parsed);
      alert("Checklist config saved (local to this device).");
    } catch (e) {
      alert("Checklist JSON invalid: " + (e?.message || e));
    }
  });

  document.getElementById("btn-reset-checklist")?.addEventListener("click", () => {
    checklistArea.value = JSON.stringify(DEFAULT_CHECKLIST_CONFIG, null, 2);
    saveJson(CHECKLIST_CONFIG_STORAGE_KEY, DEFAULT_CHECKLIST_CONFIG);
  });

  document.getElementById("btn-save-schema")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(schemaArea.value);
      saveJson(DEPOT_SCHEMA_STORAGE_KEY, parsed);
      alert("Output schema saved (local to this device).");
    } catch (e) {
      alert("Schema JSON invalid: " + (e?.message || e));
    }
  });

  document.getElementById("btn-reset-schema")?.addEventListener("click", () => {
    schemaArea.value = JSON.stringify(DEFAULT_DEPOT_SCHEMA, null, 2);
    saveJson(DEPOT_SCHEMA_STORAGE_KEY, DEFAULT_DEPOT_SCHEMA);
  });

  if (workerInput) {
    document.getElementById("btn-save-worker")?.addEventListener("click", () => {
      const value = workerInput.value.trim();
      if (!value) {
        saveWorkerUrl("");
        alert("Worker URL cleared – default will be used.");
        return;
      }
      try {
        const url = new URL(value);
        if (!/^https?:$/i.test(url.protocol)) {
          throw new Error("Worker URL must use http or https.");
        }
      } catch (e) {
        alert("Worker URL invalid: " + (e?.message || e));
        return;
      }
      saveWorkerUrl(value);
      alert("Worker URL saved (local to this device).");
    });

    document.getElementById("btn-reset-worker")?.addEventListener("click", () => {
      workerInput.value = DEFAULT_WORKER_URL;
      saveWorkerUrl("");
      alert("Worker URL reset to default.");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage();
});
