import { loadSchema, saveSchema, getDefaultSchema } from "./schema.js";

const FUTURE_PLANS_NAME = "Future plans";
const STORAGE_KEYS_TO_CLEAR = [
  "depot.notesSchema.v1",
  "depot.sectionSchema",
  "surveybrain-schema",
  "depot.checklistConfig"
];

const state = {
  sections: [],
  items: []
};

let defaultSchema = { sections: [], checklist: { sectionsOrder: [], items: [] } };
let isDirty = false;
let sectionCounter = 0;
let itemCounter = 0;

const statusEl = document.querySelector("[data-status]");
const sectionsListEl = document.querySelector("[data-sections-list]");
const addSectionBtn = document.querySelector("[data-add-section]");
const checklistListEl = document.querySelector("[data-checklist-list]");
const addItemBtn = document.querySelector("[data-add-item]");
const saveBtn = document.querySelector("[data-save]");
const reloadBtn = document.querySelector("[data-reload]");
const resetBtn = document.querySelector("[data-reset]");
const clearBtn = document.querySelector("[data-clear]");

function nextSectionId() {
  sectionCounter += 1;
  return `section-${Date.now()}-${sectionCounter}`;
}

function nextItemId() {
  itemCounter += 1;
  return `item-${Date.now()}-${itemCounter}`;
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

function markDirty(message = "You have unsaved changes.") {
  if (!isDirty) {
    isDirty = true;
  }
  setStatus(message, "muted");
}

function clearDirty() {
  isDirty = false;
}

function ensureFutureSection() {
  const existingIndex = state.sections.findIndex((section) => section.name === FUTURE_PLANS_NAME);
  if (existingIndex === -1) {
    state.sections.push({ id: nextSectionId(), name: FUTURE_PLANS_NAME, locked: true });
    return;
  }
  const [future] = state.sections.splice(existingIndex, 1);
  state.sections.push({ ...future, name: FUTURE_PLANS_NAME, locked: true });
}

function applySchema(schema) {
  const source = schema || { sections: [], checklist: { sectionsOrder: [], items: [] } };
  sectionCounter = 0;
  itemCounter = 0;

  state.sections = (source.sections || []).map((name) => ({
    id: nextSectionId(),
    name: typeof name === "string" ? name : "",
    locked: name === FUTURE_PLANS_NAME
  }));
  ensureFutureSection();

  state.items = Array.isArray(source.checklist?.items)
    ? source.checklist.items.map((item) => {
      const copy = { ...item };
      const sectionValue = item.section != null
        ? String(item.section).trim()
        : item.depotSection != null
          ? String(item.depotSection).trim()
          : "";
      copy.uid = nextItemId();
      copy.id = item.id != null ? String(item.id).trim() : "";
      copy.label = item.label != null ? String(item.label).trim() : "";
      copy.group = item.group != null ? String(item.group).trim() : "";
      copy.hint = item.hint != null ? String(item.hint).trim() : "";
      copy.section = sectionValue;
      if (sectionValue) {
        copy.depotSection = sectionValue;
      } else {
        delete copy.depotSection;
      }
      return copy;
    })
    : [];

  clearDirty();
  renderSections();
  renderChecklist();
}

function moveSection(fromIdx, toIdx) {
  if (toIdx < 0 || toIdx >= state.sections.length) return;
  const target = state.sections[fromIdx];
  if (!target || target.locked) return;
  const destination = state.sections[toIdx];
  if (destination && destination.locked && toIdx !== state.sections.length - 1) return;
  state.sections.splice(fromIdx, 1);
  state.sections.splice(toIdx, 0, target);
  ensureFutureSection();
  renderSections();
  renderChecklist();
  markDirty();
}

function removeSection(idx) {
  const section = state.sections[idx];
  if (!section || section.locked) return;
  const removedName = section.name;
  state.sections.splice(idx, 1);
  ensureFutureSection();
  if (removedName) {
    state.items.forEach((item) => {
      if (item.section === removedName || item.depotSection === removedName) {
        delete item.section;
        delete item.depotSection;
      }
    });
  }
  renderSections();
  renderChecklist();
  markDirty();
}

function renderSections() {
  if (!sectionsListEl) return;
  sectionsListEl.innerHTML = "";

  state.sections.forEach((section, index) => {
    const row = document.createElement("div");
    row.className = "section-row";

    const field = document.createElement("input");
    field.type = "text";
    field.className = "section-name";
    field.placeholder = "Section name";
    field.value = section.name;
    field.disabled = section.locked;
    field.addEventListener("focus", () => {
      section._previousName = section.name;
    });
    field.addEventListener("input", (event) => {
      section.name = event.target.value;
      if (!section.locked) {
        markDirty();
      }
    });
    field.addEventListener("blur", () => {
      const previous = typeof section._previousName === "string" ? section._previousName : "";
      const trimmed = section.name.trim();
      section.name = section.locked ? FUTURE_PLANS_NAME : trimmed;
      delete section._previousName;
      if (previous && trimmed && previous !== trimmed) {
        state.items.forEach((item) => {
          if (item.section === previous) {
            item.section = trimmed;
          }
          if (item.depotSection === previous) {
            item.depotSection = trimmed;
          }
        });
      }
      ensureFutureSection();
      renderSections();
      renderChecklist();
    });

    const controls = document.createElement("div");
    controls.className = "section-controls";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = section.locked || index === 0;
    upBtn.addEventListener("click", () => moveSection(index, index - 1));

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    const isLast = index === state.sections.length - 1;
    downBtn.disabled = section.locked || isLast || state.sections[index + 1]?.locked;
    downBtn.addEventListener("click", () => moveSection(index, index + 1));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Remove";
    deleteBtn.disabled = section.locked;
    deleteBtn.addEventListener("click", () => removeSection(index));

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(deleteBtn);

    row.appendChild(field);
    row.appendChild(controls);
    sectionsListEl.appendChild(row);
  });
}

function moveItem(fromIdx, toIdx) {
  if (toIdx < 0 || toIdx >= state.items.length) return;
  const [item] = state.items.splice(fromIdx, 1);
  state.items.splice(toIdx, 0, item);
  renderChecklist();
  markDirty();
}

function removeItem(idx) {
  state.items.splice(idx, 1);
  renderChecklist();
  markDirty();
}

function renderChecklist() {
  if (!checklistListEl) return;
  checklistListEl.innerHTML = "";

  if (!state.items.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No checklist items configured.";
    checklistListEl.appendChild(empty);
    return;
  }

  state.items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "checklist-card";

    const idLabel = document.createElement("label");
    idLabel.textContent = "ID";
    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.value = item.id != null ? item.id : "";
    idInput.addEventListener("input", (event) => {
      item.id = event.target.value;
      markDirty();
    });
    idLabel.appendChild(idInput);

    const labelLabel = document.createElement("label");
    labelLabel.textContent = "Label";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = item.label != null ? item.label : "";
    labelInput.addEventListener("input", (event) => {
      item.label = event.target.value;
      markDirty();
    });
    labelLabel.appendChild(labelInput);

    const sectionLabel = document.createElement("label");
    sectionLabel.textContent = "Depot section";
    const sectionSelect = document.createElement("select");
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "— None —";
    sectionSelect.appendChild(emptyOption);
    state.sections.forEach((section) => {
      const trimmedName = typeof section.name === "string" ? section.name.trim() : "";
      if (!trimmedName) return;
      const option = document.createElement("option");
      option.value = trimmedName;
      option.textContent = trimmedName;
      if (trimmedName === FUTURE_PLANS_NAME && section.locked) {
        option.textContent = `${trimmedName} (default)`;
      }
      sectionSelect.appendChild(option);
    });
    const initialSection = item.section || item.depotSection || "";
    sectionSelect.value = initialSection;
    sectionSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      item.section = value;
      if (value) {
        item.depotSection = value;
      } else {
        delete item.depotSection;
      }
      markDirty();
    });
    sectionLabel.appendChild(sectionSelect);

    const groupLabel = document.createElement("label");
    groupLabel.textContent = "Group";
    const groupInput = document.createElement("input");
    groupInput.type = "text";
    groupInput.value = item.group != null ? item.group : "";
    groupInput.addEventListener("input", (event) => {
      item.group = event.target.value;
      markDirty();
    });
    groupLabel.appendChild(groupInput);

    const hintLabel = document.createElement("label");
    hintLabel.textContent = "Hint";
    const hintInput = document.createElement("textarea");
    hintInput.value = item.hint != null ? item.hint : "";
    hintInput.rows = 2;
    hintInput.addEventListener("input", (event) => {
      item.hint = event.target.value;
      markDirty();
    });
    hintLabel.appendChild(hintInput);

    const fields = document.createElement("div");
    fields.className = "checklist-fields";
    fields.appendChild(idLabel);
    fields.appendChild(labelLabel);
    fields.appendChild(sectionLabel);
    fields.appendChild(groupLabel);
    fields.appendChild(hintLabel);

    const actions = document.createElement("div");
    actions.className = "checklist-actions";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveItem(index, index - 1));

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = index === state.items.length - 1;
    downBtn.addEventListener("click", () => moveItem(index, index + 1));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Remove";
    deleteBtn.addEventListener("click", () => removeItem(index));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(fields);
    card.appendChild(actions);
    checklistListEl.appendChild(card);
  });
}

function addSection() {
  const section = { id: nextSectionId(), name: "", locked: false };
  const futureIndex = state.sections.findIndex((entry) => entry.name === FUTURE_PLANS_NAME);
  if (futureIndex === -1) {
    state.sections.push(section);
  } else {
    state.sections.splice(futureIndex, 0, section);
  }
  renderSections();
  markDirty();
}

function addChecklistItem() {
  state.items.push({
    uid: nextItemId(),
    id: "",
    label: "",
    section: "",
    group: "",
    hint: ""
  });
  renderChecklist();
  markDirty();
}

function buildSchemaFromState() {
  const trimmedSections = [];
  const seenSections = new Set();

  state.sections.forEach((section) => {
    const trimmed = typeof section.name === "string" ? section.name.trim() : "";
    if (!trimmed || trimmed.toLowerCase() === "arse_cover_notes") return;
    if (trimmed === FUTURE_PLANS_NAME) return;
    if (seenSections.has(trimmed)) return;
    seenSections.add(trimmed);
    trimmedSections.push(trimmed);
  });

  trimmedSections.push(FUTURE_PLANS_NAME);

  const items = [];
  const seenIds = new Set();
  state.items.forEach((item) => {
    const copy = { ...item };
    delete copy.uid;
    const id = copy.id != null ? String(copy.id).trim() : "";
    const label = copy.label != null ? String(copy.label).trim() : "";
    if (!id || !label || seenIds.has(id)) return;
    seenIds.add(id);
    copy.id = id;
    copy.label = label;
    copy.group = copy.group != null ? String(copy.group).trim() : "";
    copy.hint = copy.hint != null ? String(copy.hint).trim() : "";
    const section = copy.section != null ? String(copy.section).trim() : "";
    copy.section = section;
    if (section) {
      copy.depotSection = section;
    } else {
      delete copy.depotSection;
    }
    items.push(copy);
  });

  return {
    sections: trimmedSections,
    checklist: {
      sectionsOrder: trimmedSections.slice(),
      items
    }
  };
}

async function handleSave() {
  try {
    const schema = buildSchemaFromState();
    const saved = saveSchema(schema);
    applySchema(saved);
    clearDirty();
    setStatus("Settings saved to this device.", "success");
  } catch (err) {
    console.error(err);
    setStatus("Failed to save settings.", "error");
  }
}

async function handleReload({ silent = false } = {}) {
  try {
    const schema = await loadSchema();
    applySchema(schema);
    if (!silent) {
      setStatus("Reloaded saved settings.", "muted");
    }
    return true;
  } catch (err) {
    console.error(err);
    setStatus("Failed to reload settings.", "error");
    return false;
  }
}

async function handleReset() {
  try {
    if (!defaultSchema || !Array.isArray(defaultSchema.sections)) {
      defaultSchema = await getDefaultSchema();
    }
    applySchema(defaultSchema);
    markDirty("Defaults loaded. Save to apply them.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load defaults.", "error");
  }
}

async function clearOverrides() {
  try {
    STORAGE_KEYS_TO_CLEAR.forEach((key) => {
      localStorage.removeItem(key);
    });
    const reloaded = await handleReload({ silent: true });
    if (reloaded) {
      setStatus("Local overrides cleared.", "success");
    }
  } catch (err) {
    console.error(err);
    setStatus("Failed to clear local overrides.", "error");
  }
}

async function init() {
  setStatus("Loading settings…", "muted");
  try {
    defaultSchema = await getDefaultSchema();
    const schema = await loadSchema();
    applySchema(schema);
    setStatus("Settings loaded.", "muted");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load settings.", "error");
  }
}

if (addSectionBtn) {
  addSectionBtn.addEventListener("click", () => {
    addSection();
  });
}

if (addItemBtn) {
  addItemBtn.addEventListener("click", () => {
    addChecklistItem();
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    handleSave();
  });
}

if (reloadBtn) {
  reloadBtn.addEventListener("click", () => {
    handleReload();
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    handleReset();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    clearOverrides();
  });
}

init();
