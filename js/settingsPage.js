import { loadSchema, saveSchema, getDefaultSchema } from "./schema.js";

const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";
const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "depot.checklistConfig";
const LS_SCHEMA_KEY = "depot.notesSchema.v1";
const AUTOSAVE_STORAGE_KEY = "surveyBrainAutosave";
const LEGACY_SCHEMA_STORAGE_KEY = "depot-output-schema";
const CHECKLIST_STATE_STORAGE_KEY = "depot-checklist-state";
const WORKER_ENDPOINT_STORAGE_KEYS = ["depot.workerUrl", "depot-worker-url"];

const state = {
  sections: [],
  sectionsOrder: [],
  checklistItems: []
};

let defaultSchema = { sections: [], checklist: { sectionsOrder: [], items: [] } };
let pendingSectionFocusId = null;
let pendingChecklistFocusId = null;
let sectionIdCounter = 0;
let checklistIdCounter = 0;

const sectionEditor = document.getElementById("settings-section-editor");
const checklistEditor = document.getElementById("checklist-editor");
const schemaTextarea = document.getElementById("settings-schema-json");
const checklistTextarea = document.getElementById("settings-checklist-json");
const statusEl = document.getElementById("settings-status");

const btnSaveSchema = document.getElementById("btn-save-schema");
const btnResetSchema = document.getElementById("btn-reset-schema");
const btnSaveChecklist = document.getElementById("btn-save-checklist");
const btnResetChecklist = document.getElementById("btn-reset-checklist");
const btnForceReload = document.getElementById("btn-force-reload");

function nextSectionId() {
  sectionIdCounter += 1;
  return `section-${Date.now()}-${sectionIdCounter}`;
}

function nextChecklistId() {
  checklistIdCounter += 1;
  return `checklist-${Date.now()}-${checklistIdCounter}`;
}

function createSection(name, { locked = false } = {}) {
  return {
    id: nextSectionId(),
    name: typeof name === "string" ? name : "",
    locked
  };
}

function ensureFutureSection() {
  let future = state.sections.find((section) => section.name === FUTURE_PLANS_NAME);
  state.sections = state.sections.filter((section) => section.name !== FUTURE_PLANS_NAME);
  if (!future) {
    future = createSection(FUTURE_PLANS_NAME, { locked: true });
  } else {
    future.locked = true;
    future.name = FUTURE_PLANS_NAME;
  }
  state.sections.push(future);
}

function syncSectionsOrder() {
  const trimmedSections = state.sections
    .map((section) => section.name.trim())
    .filter((name) => name && name.toLowerCase() !== "arse_cover_notes");

  const seen = new Set();
  const order = [];
  state.sectionsOrder.forEach((entry) => {
    const trimmed = typeof entry === "string" ? entry.trim() : String(entry || "").trim();
    if (!trimmed || seen.has(trimmed) || !trimmedSections.includes(trimmed)) return;
    seen.add(trimmed);
    order.push(trimmed);
  });
  trimmedSections.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      order.push(name);
    }
  });
  if (!seen.has(FUTURE_PLANS_NAME)) {
    order.push(FUTURE_PLANS_NAME);
  } else {
    const filtered = order.filter((name) => name !== FUTURE_PLANS_NAME);
    filtered.push(FUTURE_PLANS_NAME);
    order.length = 0;
    filtered.forEach((name) => order.push(name));
  }
  state.sectionsOrder = order;
}

function copyChecklistItem(item) {
  const base = item ? { ...item } : {};
  const copy = {
    ...base,
    internalId: base.internalId || nextChecklistId()
  };
  if (typeof copy._materialsText !== "string") {
    const materials = Array.isArray(copy.materials) ? copy.materials : [];
    copy._materialsText = JSON.stringify(materials, null, 2);
  }
  copy.group = copy.group != null ? String(copy.group) : "";
  copy.hint = copy.hint != null ? String(copy.hint) : "";
  copy.plainText = copy.plainText != null ? String(copy.plainText) : "";
  copy.naturalLanguage = copy.naturalLanguage != null ? String(copy.naturalLanguage) : "";
  copy.section = copy.section != null ? String(copy.section) : (copy.depotSection != null ? String(copy.depotSection) : "");
  if (copy.section) {
    copy.depotSection = copy.section;
  }
  return copy;
}

function applySchema(schema) {
  const source = schema || { sections: [], checklist: { sectionsOrder: [], items: [] } };
  state.sections = (source.sections || []).map((name) => {
    const isFuture = name === FUTURE_PLANS_NAME;
    return {
      id: nextSectionId(),
      name,
      locked: isFuture
    };
  });
  if (!state.sections.length) {
    state.sections.push(createSection(FUTURE_PLANS_NAME, { locked: true }));
  }
  state.sectionsOrder = Array.isArray(source.checklist?.sectionsOrder)
    ? source.checklist.sectionsOrder.slice()
    : [];
  state.checklistItems = Array.isArray(source.checklist?.items)
    ? source.checklist.items.map((item) => copyChecklistItem(item))
    : [];
}

function setStatus(message, tone = "info") {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.className = "status";
  if (tone === "success") {
    statusEl.classList.add("status--success");
  } else if (tone === "error") {
    statusEl.classList.add("status--error");
  } else if (tone === "muted") {
    statusEl.classList.add("status--muted");
  }
}

function buildSchemaFromState({ strict = true } = {}) {
  const workingSections = state.sections.map((section) => ({ ...section }));
  const workingOrder = Array.isArray(state.sectionsOrder)
    ? state.sectionsOrder.slice()
    : [];

  const sectionNames = [];
  const seenSections = new Set();
  let hasFuture = false;
  workingSections.forEach((section) => {
    const trimmed = typeof section.name === "string" ? section.name.trim() : "";
    if (!trimmed || trimmed.toLowerCase() === "arse_cover_notes") return;
    if (trimmed === FUTURE_PLANS_NAME) {
      hasFuture = true;
      return;
    }
    if (seenSections.has(trimmed)) return;
    seenSections.add(trimmed);
    sectionNames.push(trimmed);
  });
  if (hasFuture || !sectionNames.includes(FUTURE_PLANS_NAME)) {
    sectionNames.push(FUTURE_PLANS_NAME);
  }

  const order = [];
  const seenOrder = new Set();
  workingOrder.forEach((entry) => {
    const trimmed = typeof entry === "string" ? entry.trim() : String(entry || "").trim();
    if (!trimmed || seenOrder.has(trimmed) || !sectionNames.includes(trimmed)) return;
    seenOrder.add(trimmed);
    order.push(trimmed);
  });
  sectionNames.forEach((name) => {
    if (!seenOrder.has(name)) {
      seenOrder.add(name);
      order.push(name);
    }
  });

  const items = [];
  state.checklistItems.forEach((item) => {
    const copy = { ...item };
    const id = copy.id != null ? String(copy.id).trim() : "";
    const label = copy.label != null ? String(copy.label).trim() : "";
    if (!id || !label) {
      if (strict) {
        throw new Error("Checklist items must include both an id and label");
      }
      return;
    }
    copy.id = id;
    copy.label = label;
    copy.group = copy.group != null ? String(copy.group).trim() : "";
    copy.hint = copy.hint != null ? String(copy.hint).trim() : "";
    copy.section = copy.section != null ? String(copy.section).trim() : "";
    if (copy.section) {
      copy.depotSection = copy.section;
    } else {
      delete copy.depotSection;
    }
    copy.plainText = copy.plainText != null ? String(copy.plainText).trim() : "";
    copy.naturalLanguage = copy.naturalLanguage != null ? String(copy.naturalLanguage).trim() : "";

    if (typeof copy._materialsText === "string") {
      const text = copy._materialsText.trim();
      if (!text) {
        copy.materials = [];
      } else {
        try {
          const parsed = JSON.parse(text);
          copy.materials = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          if (strict) {
            throw new Error(`Item "${id}" has invalid materials JSON: ${err.message}`);
          }
          copy.materials = Array.isArray(copy.materials) ? copy.materials : [];
        }
      }
    }

    delete copy.internalId;
    delete copy._materialsText;
    items.push(copy);
  });

  return {
    sections,
    checklist: {
      sectionsOrder: order,
      items
    }
  };
}

function updateJSONPreview() {
  if (!schemaTextarea || !checklistTextarea) return;
  try {
    const schema = buildSchemaFromState({ strict: false });
    const legacySections = schema.sections.map((name, idx) => ({
      name,
      description: name === FUTURE_PLANS_NAME ? FUTURE_PLANS_DESCRIPTION : "",
      order: idx + 1
    }));
    schemaTextarea.value = JSON.stringify(legacySections, null, 2);
    checklistTextarea.value = JSON.stringify(schema.checklist.items, null, 2);
  } catch (err) {
    schemaTextarea.value = "";
    checklistTextarea.value = "";
  }
}

function renderSectionEditor() {
  if (!sectionEditor) return;
  sectionEditor.innerHTML = "";

  if (!state.sections.length) {
    ensureFutureSection();
  }

  state.sections.forEach((section, idx) => {
    const row = document.createElement("div");
    row.className = "section-row";

    const fields = document.createElement("div");
    fields.className = "section-fields";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Section name";
    nameInput.value = section.name;
    nameInput.disabled = section.locked;
    nameInput.dataset.sectionId = section.id;
    nameInput.addEventListener("focus", () => {
      nameInput.dataset.initialName = section.name;
    });
    nameInput.addEventListener("input", (event) => {
      section.name = event.target.value;
      updateJSONPreview();
    });
    nameInput.addEventListener("blur", (event) => {
      const previous = (nameInput.dataset.initialName || "").trim();
      const trimmed = event.target.value.trim();
      section.name = trimmed;
      if (previous && trimmed && previous !== trimmed) {
        state.checklistItems.forEach((item) => {
          if (item.section === previous) {
            item.section = trimmed;
            item.depotSection = trimmed;
          }
        });
        state.sectionsOrder = state.sectionsOrder.map((entry) => (entry === previous ? trimmed : entry));
      }
      refreshUI();
    });
    fields.appendChild(nameInput);

    const controls = document.createElement("div");
    controls.className = "section-controls";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0 || section.locked;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      const [item] = state.sections.splice(idx, 1);
      state.sections.splice(idx - 1, 0, item);
      refreshUI();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === state.sections.length - 1 || section.locked;
    downBtn.addEventListener("click", () => {
      if (idx >= state.sections.length - 1) return;
      const [item] = state.sections.splice(idx, 1);
      state.sections.splice(idx + 1, 0, item);
      refreshUI();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = section.locked;
    deleteBtn.addEventListener("click", () => {
      if (section.locked) return;
      const trimmed = section.name.trim();
      state.sections.splice(idx, 1);
      state.sectionsOrder = state.sectionsOrder.filter((entry) => entry !== trimmed);
      state.checklistItems.forEach((item) => {
        if (item.section === trimmed) {
          item.section = "";
          item.depotSection = "";
        }
      });
      refreshUI();
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(deleteBtn);

    row.appendChild(fields);
    row.appendChild(controls);
    sectionEditor.appendChild(row);

    if (pendingSectionFocusId && pendingSectionFocusId === section.id) {
      setTimeout(() => {
        nameInput.focus();
        nameInput.select();
      }, 0);
    }
  });

  const addRow = document.createElement("div");
  addRow.className = "section-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add section";
  addBtn.addEventListener("click", () => {
    ensureFutureSection();
    const insertIndex = Math.max(0, state.sections.length - 1);
    const newSection = createSection("");
    state.sections.splice(insertIndex, 0, newSection);
    pendingSectionFocusId = newSection.id;
    refreshUI();
  });
  addRow.appendChild(addBtn);
  sectionEditor.appendChild(addRow);

  pendingSectionFocusId = null;
}

function renderChecklistEditor() {
  if (!checklistEditor) return;
  checklistEditor.innerHTML = "";

  if (!state.checklistItems.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No checklist items configured.";
    checklistEditor.appendChild(empty);
  }

  const sectionOptions = state.sections
    .map((section) => section.name.trim())
    .filter((name, index, arr) => name && arr.indexOf(name) === index);

  state.checklistItems.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "checklist-card";

    const rowOne = document.createElement("div");
    rowOne.className = "checklist-card-row";

    const idLabel = document.createElement("label");
    idLabel.textContent = "ID";
    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.value = item.id || "";
    idInput.addEventListener("input", (event) => {
      item.id = event.target.value;
      updateJSONPreview();
    });
    idLabel.appendChild(idInput);
    rowOne.appendChild(idLabel);

    const groupLabel = document.createElement("label");
    groupLabel.textContent = "Group";
    const groupInput = document.createElement("input");
    groupInput.type = "text";
    groupInput.value = item.group || "";
    groupInput.addEventListener("input", (event) => {
      item.group = event.target.value;
      updateJSONPreview();
    });
    groupLabel.appendChild(groupInput);
    rowOne.appendChild(groupLabel);

    card.appendChild(rowOne);

    const rowTwo = document.createElement("div");
    rowTwo.className = "checklist-card-row";

    const sectionLabel = document.createElement("label");
    sectionLabel.textContent = "Section";
    const sectionSelect = document.createElement("select");
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select section";
    sectionSelect.appendChild(blankOption);

    sectionOptions.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      sectionSelect.appendChild(option);
    });

    if (item.section && !sectionOptions.includes(item.section)) {
      const option = document.createElement("option");
      option.value = item.section;
      option.textContent = `${item.section} (custom)`;
      sectionSelect.appendChild(option);
    }

    sectionSelect.value = item.section || "";
    sectionSelect.addEventListener("change", (event) => {
      item.section = event.target.value;
      item.depotSection = event.target.value;
      updateJSONPreview();
    });
    sectionLabel.appendChild(sectionSelect);
    rowTwo.appendChild(sectionLabel);

    const labelLabel = document.createElement("label");
    labelLabel.textContent = "Label";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = item.label || "";
    labelInput.addEventListener("input", (event) => {
      item.label = event.target.value;
      updateJSONPreview();
    });
    labelLabel.appendChild(labelInput);
    rowTwo.appendChild(labelLabel);

    card.appendChild(rowTwo);

    const hintLabel = document.createElement("label");
    hintLabel.textContent = "Hint";
    const hintInput = document.createElement("textarea");
    hintInput.value = item.hint || "";
    hintInput.addEventListener("input", (event) => {
      item.hint = event.target.value;
      updateJSONPreview();
    });
    hintLabel.appendChild(hintInput);
    card.appendChild(hintLabel);

    const plainTextLabel = document.createElement("label");
    plainTextLabel.textContent = "Plain text";
    const plainTextInput = document.createElement("textarea");
    plainTextInput.value = item.plainText || "";
    plainTextInput.addEventListener("input", (event) => {
      item.plainText = event.target.value;
      updateJSONPreview();
    });
    plainTextLabel.appendChild(plainTextInput);
    card.appendChild(plainTextLabel);

    const naturalLabel = document.createElement("label");
    naturalLabel.textContent = "Natural language";
    const naturalInput = document.createElement("textarea");
    naturalInput.value = item.naturalLanguage || "";
    naturalInput.addEventListener("input", (event) => {
      item.naturalLanguage = event.target.value;
      updateJSONPreview();
    });
    naturalLabel.appendChild(naturalInput);
    card.appendChild(naturalLabel);

    const materialsLabel = document.createElement("label");
    materialsLabel.textContent = "Materials (JSON)";
    const materialsInput = document.createElement("textarea");
    materialsInput.value = item._materialsText || "[]";
    materialsInput.addEventListener("input", (event) => {
      item._materialsText = event.target.value;
      updateJSONPreview();
    });
    materialsLabel.appendChild(materialsInput);
    card.appendChild(materialsLabel);

    const actions = document.createElement("div");
    actions.className = "checklist-card-actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      const [itemToMove] = state.checklistItems.splice(idx, 1);
      state.checklistItems.splice(idx - 1, 0, itemToMove);
      refreshUI();
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === state.checklistItems.length - 1;
    downBtn.addEventListener("click", () => {
      if (idx >= state.checklistItems.length - 1) return;
      const [itemToMove] = state.checklistItems.splice(idx, 1);
      state.checklistItems.splice(idx + 1, 0, itemToMove);
      refreshUI();
    });
    actions.appendChild(downBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => {
      state.checklistItems.splice(idx, 1);
      refreshUI();
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    checklistEditor.appendChild(card);

    if (pendingChecklistFocusId && pendingChecklistFocusId === item.internalId) {
      setTimeout(() => {
        idInput.focus();
        idInput.select();
      }, 0);
    }
  });

  const addRow = document.createElement("div");
  addRow.className = "checklist-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add item";
  addBtn.addEventListener("click", () => {
    const fallbackSection = state.sections
      .map((section) => section.name.trim())
      .find((name) => name && name !== FUTURE_PLANS_NAME) || "";
    const newItem = copyChecklistItem({
      id: `item_${Date.now()}`,
      label: "",
      group: "",
      hint: "",
      section: fallbackSection,
      depotSection: fallbackSection,
      plainText: "",
      naturalLanguage: "",
      materials: []
    });
    state.checklistItems.push(newItem);
    pendingChecklistFocusId = newItem.internalId;
    refreshUI();
  });
  addRow.appendChild(addBtn);
  checklistEditor.appendChild(addRow);

  pendingChecklistFocusId = null;
}

function refreshUI() {
  ensureFutureSection();
  syncSectionsOrder();
  renderSectionEditor();
  renderChecklistEditor();
  updateJSONPreview();
}

function handleSave() {
  try {
    const prepared = buildSchemaFromState({ strict: true });
    const saved = saveSchema(prepared);
    applySchema(saved);
    refreshUI();
    setStatus("Saved to this browser.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Failed to save settings.", "error");
  }
}

function handleResetSections() {
  if (!defaultSchema || !defaultSchema.sections) return;
  state.sections = defaultSchema.sections.map((name) => createSection(name, { locked: name === FUTURE_PLANS_NAME }));
  state.sectionsOrder = defaultSchema.checklist.sectionsOrder.slice();
  const validNames = new Set(state.sections.map((section) => section.name.trim()).filter(Boolean));
  state.checklistItems.forEach((item) => {
    if (item.section && !validNames.has(item.section)) {
      item.section = "";
      item.depotSection = "";
    }
  });
  refreshUI();
  setStatus("Sections reset to defaults.", "muted");
}

function handleResetChecklist() {
  if (!defaultSchema || !defaultSchema.checklist) return;
  const clone = defaultSchema.checklist.items.map((item) => copyChecklistItem(item));
  state.checklistItems = clone;
  state.sectionsOrder = defaultSchema.checklist.sectionsOrder.slice();
  refreshUI();
  setStatus("Checklist reset to defaults.", "muted");
}

function clearLocalDepotStorage() {
  const knownKeys = [
    SECTION_STORAGE_KEY,
    LEGACY_SECTION_STORAGE_KEY,
    CHECKLIST_STORAGE_KEY,
    LS_SCHEMA_KEY,
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
        // ignore per-key failures
      }
    });
  } catch (_) {
    // ignore inability to access localStorage
  }

  const shouldClear = (key) => /^(depot[.-]|surveyBrain)/.test(key || "");

  try {
    const extraKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && shouldClear(key) && !knownKeys.includes(key)) {
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
      if (key && shouldClear(key)) {
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
    // ignore sessionStorage access issues
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
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
  } catch (err) {
    console.warn("Failed to clear caches", err);
  }
}

async function handleForceReload(event) {
  const confirmation = window.confirm(
    "This will clear Depot overrides on this device and reload. Continue?"
  );
  if (!confirmation) return;

  const button = event?.currentTarget || null;
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

async function init() {
  setStatus("Loading settings…", "muted");
  try {
    const [defaults, loaded] = await Promise.all([
      getDefaultSchema(),
      loadSchema()
    ]);
    defaultSchema = defaults;
    applySchema(loaded);
    refreshUI();
    setStatus("Loaded. Changes are stored locally in this browser.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load schema information.", "error");
  }
}

if (btnSaveSchema) {
  btnSaveSchema.addEventListener("click", handleSave);
}
if (btnSaveChecklist) {
  btnSaveChecklist.addEventListener("click", handleSave);
}
if (btnResetSchema) {
  btnResetSchema.addEventListener("click", handleResetSections);
}
if (btnResetChecklist) {
  btnResetChecklist.addEventListener("click", handleResetChecklist);
}
if (btnForceReload) {
  btnForceReload.addEventListener("click", handleForceReload);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
