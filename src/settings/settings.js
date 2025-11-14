const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "surveybrain-checklist";
const WORKER_URL_STORAGE_KEY = "depot.workerUrl";
const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";
const DEFAULT_WORKER_URL = "https://depot-voice-notes.martinbibb.workers.dev";

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
    if (!name || name === "Arse_cover_notes") return;
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

  let withoutFuture = unique.filter((entry) => entry.name !== FUTURE_PLANS_NAME);
  let future = unique.find((entry) => entry.name === FUTURE_PLANS_NAME);
  if (!future) {
    future = {
      name: FUTURE_PLANS_NAME,
      description: FUTURE_PLANS_DESCRIPTION,
      order: withoutFuture.length + 1
    };
  } else if (!future.description) {
    future = { ...future, description: FUTURE_PLANS_DESCRIPTION };
  }

  const final = [...withoutFuture, future].map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: idx + 1
  }));

  return final;
}

async function loadSectionSchema() {
  let defaultSchema = [];
  try {
    const res = await fetch("../depot.output.schema.json", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      defaultSchema = sanitiseSectionSchema(json);
    }
  } catch (err) {
    console.warn("Failed to fetch default schema", err);
  }

  let local = null;
  try {
    const keys = [SECTION_STORAGE_KEY, LEGACY_SECTION_STORAGE_KEY];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      local = JSON.parse(raw);
      break;
    }
  } catch (err) {
    console.warn("Failed to read local schema override", err);
  }

  const candidate = Array.isArray(local) && local.length
    ? sanitiseSectionSchema(local)
    : defaultSchema;

  if (candidate.length) {
    return candidate;
  }
  return sanitiseSectionSchema([]);
}

function saveLocalSectionSchema(schema) {
  const final = sanitiseSectionSchema(schema);
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(final));
    localStorage.removeItem(LEGACY_SECTION_STORAGE_KEY);
  } catch (err) {
    alert("Unable to save schema: " + (err?.message || err));
  }
  return final;
}

async function loadChecklistConfig() {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to read checklist override", err);
  }

  try {
    const res = await fetch("../checklist.config.json", { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch default checklist", err);
  }
  return [];
}

function saveChecklistConfig(value) {
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    alert("Unable to save checklist: " + (err?.message || err));
  }
}

function loadWorkerUrl() {
  try {
    const raw = localStorage.getItem(WORKER_URL_STORAGE_KEY);
    if (!raw) return DEFAULT_WORKER_URL;
    const trimmed = raw.trim();
    return trimmed || DEFAULT_WORKER_URL;
  } catch (_) {
    return DEFAULT_WORKER_URL;
  }
}

function saveWorkerUrl(url) {
  try {
    const trimmed = (url || "").trim();
    if (!trimmed) {
      localStorage.removeItem(WORKER_URL_STORAGE_KEY);
    } else {
      localStorage.setItem(WORKER_URL_STORAGE_KEY, trimmed);
    }
  } catch (err) {
    alert("Unable to save worker URL: " + (err?.message || err));
  }
}

let editableSchema = [];
let schemaArea;
let sectionEditor;

function ensureFuturePresence() {
  let idx = editableSchema.findIndex((entry) => entry.name === FUTURE_PLANS_NAME);
  if (idx === -1) {
    editableSchema.push({ name: FUTURE_PLANS_NAME, description: FUTURE_PLANS_DESCRIPTION });
    idx = editableSchema.length - 1;
  }
  if (idx !== editableSchema.length - 1) {
    const [future] = editableSchema.splice(idx, 1);
    editableSchema.push(future);
  }
}

function updateSchemaTextarea() {
  if (!schemaArea) return;
  ensureFuturePresence();
  const preview = editableSchema.map((entry, idx) => ({
    name: entry.name || "",
    description: entry.description || "",
    order: idx + 1
  }));
  schemaArea.value = JSON.stringify(preview, null, 2);
}

function renderSectionEditor() {
  if (!sectionEditor) return;
  ensureFuturePresence();
  sectionEditor.innerHTML = "";

  editableSchema.forEach((entry, idx) => {
    const row = document.createElement("div");
    row.className = "section-row";

    const fields = document.createElement("div");
    fields.className = "section-fields";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Section name";
    nameInput.value = entry.name || "";
    nameInput.disabled = entry.name === FUTURE_PLANS_NAME;
    nameInput.addEventListener("input", (e) => {
      editableSchema[idx].name = e.target.value;
      updateSchemaTextarea();
    });

    const descInput = document.createElement("textarea");
    descInput.placeholder = "Description (optional)";
    descInput.value = entry.description || "";
    descInput.rows = 2;
    descInput.addEventListener("input", (e) => {
      editableSchema[idx].description = e.target.value;
      updateSchemaTextarea();
    });

    fields.appendChild(nameInput);
    fields.appendChild(descInput);

    const controls = document.createElement("div");
    controls.className = "section-controls";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0 || entry.name === FUTURE_PLANS_NAME;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      const [item] = editableSchema.splice(idx, 1);
      editableSchema.splice(idx - 1, 0, item);
      renderSectionEditor();
      updateSchemaTextarea();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === editableSchema.length - 1 || entry.name === FUTURE_PLANS_NAME;
    downBtn.addEventListener("click", () => {
      if (idx >= editableSchema.length - 1) return;
      const [item] = editableSchema.splice(idx, 1);
      editableSchema.splice(idx + 1, 0, item);
      renderSectionEditor();
      updateSchemaTextarea();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = entry.name === FUTURE_PLANS_NAME;
    deleteBtn.addEventListener("click", () => {
      editableSchema.splice(idx, 1);
      renderSectionEditor();
      updateSchemaTextarea();
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(deleteBtn);

    row.appendChild(fields);
    row.appendChild(controls);

    sectionEditor.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "section-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add section";
  addBtn.addEventListener("click", () => {
    ensureFuturePresence();
    const futureIndex = editableSchema.findIndex((entry) => entry.name === FUTURE_PLANS_NAME);
    const insertIndex = futureIndex === -1 ? editableSchema.length : futureIndex;
    editableSchema.splice(insertIndex, 0, { name: "", description: "" });
    renderSectionEditor();
    updateSchemaTextarea();
  });
  addRow.appendChild(addBtn);
  sectionEditor.appendChild(addRow);
}

async function initSettingsPage() {
  const checklistArea = document.getElementById("settings-checklist-json");
  schemaArea = document.getElementById("settings-schema-json");
  const workerInput = document.getElementById("settings-worker-url");
  sectionEditor = document.getElementById("settings-section-editor");

  if (!checklistArea || !schemaArea || !sectionEditor) {
    console.warn("Settings elements missing");
    return;
  }

  const [schema, checklist] = await Promise.all([
    loadSectionSchema(),
    loadChecklistConfig()
  ]);

  editableSchema = schema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
  renderSectionEditor();
  updateSchemaTextarea();

  checklistArea.value = JSON.stringify(checklist, null, 2);
  if (workerInput) {
    workerInput.value = loadWorkerUrl();
  }

  document.getElementById("btn-save-schema")?.addEventListener("click", () => {
    try {
      const final = saveLocalSectionSchema(editableSchema);
      editableSchema = final.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      renderSectionEditor();
      schemaArea.value = JSON.stringify(final, null, 2);
      alert("Output schema saved (local to this device).");
    } catch (err) {
      alert("Schema save failed: " + (err?.message || err));
    }
  });

  document.getElementById("btn-reset-schema")?.addEventListener("click", async () => {
    localStorage.removeItem(SECTION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_SECTION_STORAGE_KEY);
    const fresh = await loadSectionSchema();
    editableSchema = fresh.map((entry) => ({ name: entry.name, description: entry.description || "" }));
    renderSectionEditor();
    schemaArea.value = JSON.stringify(fresh, null, 2);
    alert("Schema reset to defaults.");
  });

  schemaArea.addEventListener("change", () => {
    try {
      const parsed = JSON.parse(schemaArea.value);
      const sanitised = sanitiseSectionSchema(parsed);
      editableSchema = sanitised.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      renderSectionEditor();
      updateSchemaTextarea();
    } catch (err) {
      alert("Schema JSON invalid: " + (err?.message || err));
    }
  });

  document.getElementById("btn-save-checklist")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(checklistArea.value);
      saveChecklistConfig(parsed);
      alert("Checklist config saved (local to this device).");
    } catch (err) {
      alert("Checklist JSON invalid: " + (err?.message || err));
    }
  });

  document.getElementById("btn-reset-checklist")?.addEventListener("click", async () => {
    localStorage.removeItem(CHECKLIST_STORAGE_KEY);
    const fresh = await loadChecklistConfig();
    checklistArea.value = JSON.stringify(fresh, null, 2);
    alert("Checklist reset to defaults.");
  });

  if (workerInput) {
    document.getElementById("btn-save-worker")?.addEventListener("click", () => {
      const value = workerInput.value.trim();
      if (!value) {
        saveWorkerUrl("");
        workerInput.value = DEFAULT_WORKER_URL;
        alert("Worker URL cleared – default will be used.");
        return;
      }
      try {
        const url = new URL(value);
        if (!/^https?:$/i.test(url.protocol)) {
          throw new Error("Worker URL must use http or https.");
        }
      } catch (err) {
        alert("Worker URL invalid: " + (err?.message || err));
        return;
      }
      saveWorkerUrl(value);
      alert("Worker URL saved (local to this device).");
    });

    document.getElementById("btn-reset-worker")?.addEventListener("click", () => {
      saveWorkerUrl("");
      workerInput.value = DEFAULT_WORKER_URL;
      alert("Worker URL reset to default.");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage();
});
