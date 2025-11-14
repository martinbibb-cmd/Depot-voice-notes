import {
  WORKER_ENDPOINT_STORAGE_KEYS,
  clearWorkerEndpointOverride
} from "../app/worker-config.js";

const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "depot.checklistConfig";
const CHECKLIST_CONFIG_URL = "../checklist.config.json";
const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";
const AUTOSAVE_STORAGE_KEY = "surveyBrainAutosave";
const LEGACY_SCHEMA_STORAGE_KEY = "depot-output-schema";
const CHECKLIST_STATE_STORAGE_KEY = "depot-checklist-state";

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
    copy.group = copy.group != null ? String(copy.group).trim() : "";
    copy.hint = copy.hint != null ? String(copy.hint).trim() : "";
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

function normaliseSectionOrder(order) {
  if (!Array.isArray(order)) return [];
  const normalised = [];
  const seen = new Set();
  order.forEach((name) => {
    const trimmed = typeof name === "string" ? name.trim() : String(name || "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalised.push(trimmed);
  });
  return normalised;
}

function normaliseChecklistConfigSource(raw) {
  const base = {
    sectionsOrder: [],
    items: []
  };

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    base.sectionsOrder = normaliseSectionOrder(raw.sectionsOrder);
    base.items = sanitiseChecklistArray(raw.items);
    return base;
  }

  base.items = sanitiseChecklistArray(raw);
  return base;
}

async function loadChecklistConfig() {
  let defaultConfig = { sectionsOrder: [], items: [] };
  try {
    const res = await fetch(CHECKLIST_CONFIG_URL, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      defaultConfig = normaliseChecklistConfigSource(data);
    }
  } catch (err) {
    console.warn("Failed to fetch default checklist", err);
  }

  let local = null;
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (raw) {
      local = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to read checklist override", err);
  }

  const candidate = normaliseChecklistConfigSource(local);
  if (candidate.items.length) {
    return candidate;
  }

  return defaultConfig;
}

function saveLocalChecklistConfig(value) {
  const config = normaliseChecklistConfigSource(value);
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    alert("Unable to save checklist: " + (err?.message || err));
  }
  return config;
}

function clearLocalDepotStorage() {
  const knownKeys = [
    SECTION_STORAGE_KEY,
    LEGACY_SECTION_STORAGE_KEY,
    CHECKLIST_STORAGE_KEY,
    AUTOSAVE_STORAGE_KEY,
    LEGACY_SCHEMA_STORAGE_KEY,
    CHECKLIST_STATE_STORAGE_KEY,
    ...WORKER_ENDPOINT_STORAGE_KEYS
  ];
  try {
    knownKeys.forEach((key) => {
      if (!key) return;
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // ignore storage issues per key
      }
    });
  } catch (_) {
    // ignore if localStorage is inaccessible entirely
  }

  const shouldClear = (key) => /^(depot[.-]|surveyBrain)/.test(key || "");

  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && shouldClear(key) && !knownKeys.includes(key)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => {
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
      if (key && shouldClear(key)) {
        sessionKeys.push(key);
      }
    }
    sessionKeys.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (_) {
        // ignore session storage issues
      }
    });
  } catch (_) {
    // ignore if sessionStorage unavailable
  }

  try {
    clearWorkerEndpointOverride();
  } catch (_) {
    // ignore inability to clear worker override
  }
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) =>
        registration.unregister().catch(() => false)
      )
    );
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

let editableSchema = [];
let schemaArea;
let sectionEditor;
let checklistArea;
let checklistEditor;
let editableChecklist = [];
let cachedSectionSchema = [];
let cachedChecklistOrder = [];

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

function getSectionNames() {
  return cachedSectionSchema
    .map((entry) => (entry && typeof entry.name === "string" ? entry.name.trim() : ""))
    .filter(Boolean);
}

function applyChecklistOrder(orderCandidate) {
  const schemaNames = getSectionNames();
  const candidate = normaliseSectionOrder(orderCandidate);
  const seen = new Set();
  const order = [];

  schemaNames.forEach((name) => {
    if (candidate.includes(name) && !seen.has(name)) {
      order.push(name);
      seen.add(name);
    }
  });

  candidate.forEach((name) => {
    if (!seen.has(name) && !schemaNames.includes(name)) {
      order.push(name);
      seen.add(name);
    }
  });

  schemaNames.forEach((name) => {
    if (!seen.has(name)) {
      order.push(name);
      seen.add(name);
    }
  });

  cachedChecklistOrder = order;
}

function setEditableChecklistFromRaw(rawItems) {
  const sectionNames = getSectionNames();
  const fallbackSection = sectionNames[0] || "";
  const cleaned = sanitiseChecklistArray(rawItems);

  editableChecklist = cleaned.map((item) => {
    const extras = { ...item };
    let section = extras.section && typeof extras.section === "string" ? extras.section.trim() : "";
    if (!section && extras.depotSection && typeof extras.depotSection === "string") {
      section = extras.depotSection.trim();
    }
    if (!section) {
      section = fallbackSection;
    }
    extras.section = section;
    if (section) {
      extras.depotSection = section;
    }
    return {
      id: extras.id,
      group: extras.group || "",
      section,
      label: extras.label,
      hint: extras.hint || "",
      _extra: extras
    };
  });
}

function getEditableChecklistSnapshot() {
  return editableChecklist.map((entry) => {
    if (entry && entry._extra) {
      return { ...entry._extra };
    }
    const section = entry && entry.section ? entry.section : "";
    return {
      id: entry?.id || "",
      group: entry?.group || "",
      section,
      depotSection: section || undefined,
      label: entry?.label || "",
      hint: entry?.hint || "",
      plainText: entry?.plainText || "",
      naturalLanguage: entry?.naturalLanguage || "",
      materials: Array.isArray(entry?.materials) ? entry.materials : []
    };
  });
}

function updateChecklistTextarea(items) {
  if (!checklistArea) return;
  const payloadSource = Array.isArray(items) ? items : getEditableChecklistSnapshot();
  const payloadItems = sanitiseChecklistArray(payloadSource);
  applyChecklistOrder(cachedChecklistOrder);
  const order = cachedChecklistOrder.slice();
  const payload = {
    sectionsOrder: order,
    items: payloadItems
  };
  checklistArea.value = JSON.stringify(payload, null, 2);
}

function readChecklistEditorState() {
  if (!checklistEditor) return [];
  const cards = Array.from(checklistEditor.querySelectorAll(".checklist-card"));
  const items = [];

  cards.forEach((card) => {
    const index = Number(card.dataset.index ?? "-1");
    const base = editableChecklist[index] && editableChecklist[index]._extra
      ? { ...editableChecklist[index]._extra }
      : {};

    const idInput = card.querySelector(".checklist-input-id");
    const labelInput = card.querySelector(".checklist-input-label");
    if (!idInput || !labelInput) return;

    const id = idInput.value.trim();
    const label = labelInput.value.trim();
    if (!id || !label) return;

    const groupInput = card.querySelector(".checklist-input-group");
    const sectionSelect = card.querySelector(".checklist-input-section");
    const hintInput = card.querySelector(".checklist-input-hint");

    const group = groupInput ? groupInput.value.trim() : "";
    const section = sectionSelect ? sectionSelect.value.trim() : "";
    const hint = hintInput ? hintInput.value.trim() : "";

    const next = { ...base, id, group, label, hint };
    next.section = section;
    if (section) {
      next.depotSection = section;
    } else {
      delete next.depotSection;
    }
    items.push(next);
  });

  return items;
}

function handleChecklistEditorChanged() {
  const snapshot = readChecklistEditorState();
  setEditableChecklistFromRaw(snapshot);
  updateChecklistTextarea();
}

function drawChecklistEditor() {
  if (!checklistEditor) return;
  checklistEditor.innerHTML = "";

  const sectionNames = getSectionNames();

  editableChecklist.forEach((entry, idx) => {
    const card = document.createElement("div");
    card.className = "checklist-card";
    card.dataset.index = String(idx);

    const rowOne = document.createElement("div");
    rowOne.className = "checklist-card-row";

    const idLabel = document.createElement("label");
    idLabel.textContent = "ID";
    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.className = "checklist-input-id";
    idInput.value = entry.id;
    idInput.spellcheck = false;
    idInput.addEventListener("input", handleChecklistEditorChanged);
    idLabel.appendChild(idInput);
    rowOne.appendChild(idLabel);

    const groupLabel = document.createElement("label");
    groupLabel.textContent = "Group";
    const groupInput = document.createElement("input");
    groupInput.type = "text";
    groupInput.className = "checklist-input-group";
    groupInput.value = entry.group || "";
    groupInput.addEventListener("input", handleChecklistEditorChanged);
    groupLabel.appendChild(groupInput);
    rowOne.appendChild(groupLabel);

    card.appendChild(rowOne);

    const rowTwo = document.createElement("div");
    rowTwo.className = "checklist-card-row";

    const sectionLabel = document.createElement("label");
    sectionLabel.textContent = "Section";
    const sectionSelect = document.createElement("select");
    sectionSelect.className = "checklist-input-section";

    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select section";
    sectionSelect.appendChild(blankOption);

    const seen = new Set();
    sectionNames.forEach((name) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      sectionSelect.appendChild(option);
    });

    if (entry.section && !seen.has(entry.section)) {
      const option = document.createElement("option");
      option.value = entry.section;
      option.textContent = `${entry.section} (custom)`;
      sectionSelect.appendChild(option);
    }

    sectionSelect.value = entry.section || "";
    sectionSelect.addEventListener("change", handleChecklistEditorChanged);
    sectionLabel.appendChild(sectionSelect);
    rowTwo.appendChild(sectionLabel);

    const labelLabel = document.createElement("label");
    labelLabel.textContent = "Label";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "checklist-input-label";
    labelInput.value = entry.label || "";
    labelInput.addEventListener("input", handleChecklistEditorChanged);
    labelLabel.appendChild(labelInput);
    rowTwo.appendChild(labelLabel);

    card.appendChild(rowTwo);

    const hintLabel = document.createElement("label");
    hintLabel.textContent = "Hint";
    const hintInput = document.createElement("textarea");
    hintInput.className = "checklist-input-hint";
    hintInput.value = entry.hint || "";
    hintInput.addEventListener("input", handleChecklistEditorChanged);
    hintLabel.appendChild(hintInput);
    card.appendChild(hintLabel);

    const actions = document.createElement("div");
    actions.className = "checklist-card-actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      const snapshot = readChecklistEditorState();
      if (idx <= 0) return;
      const [item] = snapshot.splice(idx, 1);
      snapshot.splice(idx - 1, 0, item);
      setEditableChecklistFromRaw(snapshot);
      drawChecklistEditor();
      updateChecklistTextarea();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === editableChecklist.length - 1;
    downBtn.addEventListener("click", () => {
      const snapshot = readChecklistEditorState();
      if (idx >= snapshot.length - 1) return;
      const [item] = snapshot.splice(idx, 1);
      snapshot.splice(idx + 1, 0, item);
      setEditableChecklistFromRaw(snapshot);
      drawChecklistEditor();
      updateChecklistTextarea();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => {
      const snapshot = readChecklistEditorState();
      snapshot.splice(idx, 1);
      setEditableChecklistFromRaw(snapshot);
      drawChecklistEditor();
      updateChecklistTextarea();
    });

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    checklistEditor.appendChild(card);
  });

  const addRow = document.createElement("div");
  addRow.className = "checklist-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add item";
  addBtn.addEventListener("click", () => {
    const snapshot = readChecklistEditorState();
    const sectionNames = getSectionNames();
    const fallback = sectionNames[0] || "";
    const newId = `item_${Date.now()}`;
    const base = {
      id: newId,
      group: "",
      label: "New item",
      hint: "",
      section: fallback,
      depotSection: fallback,
      plainText: "",
      naturalLanguage: "",
      materials: []
    };
    snapshot.push(base);
    setEditableChecklistFromRaw(snapshot);
    drawChecklistEditor();
    updateChecklistTextarea();
  });
  addRow.appendChild(addBtn);
  checklistEditor.appendChild(addRow);
}

function renderChecklistEditor(config, sectionSchema) {
  if (Array.isArray(sectionSchema)) {
    cachedSectionSchema = sectionSchema.filter((entry) => entry && entry.name);
  }

  let items = [];
  if (config && typeof config === "object" && !Array.isArray(config)) {
    if (Array.isArray(config.items)) {
      items = config.items;
    }
    applyChecklistOrder(config.sectionsOrder);
  } else if (Array.isArray(config)) {
    items = config;
    applyChecklistOrder(cachedChecklistOrder);
  } else {
    applyChecklistOrder(cachedChecklistOrder);
  }

  setEditableChecklistFromRaw(items);
  drawChecklistEditor();
}

async function initSettingsPage() {
  checklistArea = document.getElementById("settings-checklist-json");
  schemaArea = document.getElementById("settings-schema-json");
  sectionEditor = document.getElementById("settings-section-editor");
  checklistEditor = document.getElementById("checklist-editor");
  const forceReloadBtn = document.getElementById("btn-force-reload");

  if (!checklistArea || !schemaArea || !sectionEditor || !checklistEditor) {
    console.warn("Settings elements missing");
    return;
  }

  const [schema, checklist] = await Promise.all([
    loadSectionSchema(),
    loadChecklistConfig()
  ]);

  cachedSectionSchema = schema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
  editableSchema = cachedSectionSchema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
  renderSectionEditor();
  updateSchemaTextarea();

  renderChecklistEditor(checklist, cachedSectionSchema);
  updateChecklistTextarea();

  document.getElementById("btn-save-schema")?.addEventListener("click", () => {
    try {
      const final = saveLocalSectionSchema(editableSchema);
      editableSchema = final.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      cachedSectionSchema = editableSchema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      renderSectionEditor();
      schemaArea.value = JSON.stringify(final, null, 2);
      const snapshot = readChecklistEditorState();
      renderChecklistEditor(snapshot, cachedSectionSchema);
      updateChecklistTextarea();
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
    cachedSectionSchema = editableSchema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
    renderSectionEditor();
    schemaArea.value = JSON.stringify(fresh, null, 2);
    const snapshot = readChecklistEditorState();
    renderChecklistEditor(snapshot, cachedSectionSchema);
    updateChecklistTextarea();
    alert("Schema reset to defaults.");
  });

  schemaArea.addEventListener("change", () => {
    try {
      const parsed = JSON.parse(schemaArea.value);
      const sanitised = sanitiseSectionSchema(parsed);
      editableSchema = sanitised.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      cachedSectionSchema = editableSchema.map((entry) => ({ name: entry.name, description: entry.description || "" }));
      renderSectionEditor();
      updateSchemaTextarea();
      const snapshot = readChecklistEditorState();
      renderChecklistEditor(snapshot, cachedSectionSchema);
      updateChecklistTextarea();
    } catch (err) {
      alert("Schema JSON invalid: " + (err?.message || err));
    }
  });

  checklistArea.addEventListener("change", () => {
    try {
      const parsed = JSON.parse(checklistArea.value);
      const config = normaliseChecklistConfigSource(parsed);
      applyChecklistOrder(config.sectionsOrder);
      setEditableChecklistFromRaw(config.items);
      drawChecklistEditor();
      updateChecklistTextarea();
    } catch (err) {
      alert("Checklist JSON invalid: " + (err?.message || err));
    }
  });

  document.getElementById("btn-save-checklist")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(checklistArea.value);
      const saved = saveLocalChecklistConfig(parsed);
      applyChecklistOrder(saved.sectionsOrder);
      setEditableChecklistFromRaw(saved.items);
      drawChecklistEditor();
      updateChecklistTextarea();
      alert("Checklist config saved (local to this device).");
    } catch (err) {
      alert("Checklist JSON invalid: " + (err?.message || err));
    }
  });

  document.getElementById("btn-reset-checklist")?.addEventListener("click", async () => {
    localStorage.removeItem(CHECKLIST_STORAGE_KEY);
    const fresh = await loadChecklistConfig();
    renderChecklistEditor(fresh, cachedSectionSchema);
    updateChecklistTextarea();
    alert("Checklist reset to defaults.");
  });

  if (forceReloadBtn) {
    forceReloadBtn.addEventListener("click", () => {
      forceReloadApp(forceReloadBtn);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage();
});
