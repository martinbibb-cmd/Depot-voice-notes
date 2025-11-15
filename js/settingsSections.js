const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";
const DEFAULT_SCHEMA_URL = "./depot.output.schema.json";

let editableNames = [];
let defaultNames = [];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function safeParse(json, fallback) {
  try {
    if (!json || typeof json !== "string") return fallback;
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to parse JSON", err);
    return fallback;
  }
}

function normaliseSectionNames(input) {
  if (!input) return [];

  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.sections)) {
      return value.sections;
    }
    return [];
  };

  const entries = asArray(input);
  const names = [];
  const seen = new Set();

  entries.forEach((entry) => {
    if (!entry) return;
    let name = "";
    if (typeof entry === "string") {
      name = entry;
    } else if (typeof entry === "object") {
      const candidate = entry.name ?? entry.section ?? entry.title ?? entry.heading;
      if (typeof candidate === "string") {
        name = candidate;
      }
    }
    const trimmed = String(name || "").trim();
    if (!trimmed || seen.has(trimmed) || trimmed.toLowerCase() === "arse_cover_notes") {
      return;
    }
    seen.add(trimmed);
    names.push(trimmed);
  });

  return names;
}

function dedupeAndClean(names) {
  const seen = new Set();
  const cleaned = [];
  names.forEach((raw) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed || trimmed === FUTURE_PLANS_NAME) return;
    if (trimmed.toLowerCase() === "arse_cover_notes") return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    cleaned.push(trimmed);
  });
  return cleaned;
}

function getSanitisedNamesFromState(includeFuture = true) {
  const cleaned = dedupeAndClean(editableNames);
  if (includeFuture) {
    cleaned.push(FUTURE_PLANS_NAME);
  }
  return cleaned;
}

function setStatus(message, type = "") {
  const statusEl = $("sectionsStatus");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.remove("status--success", "status--error");
  if (type === "success") {
    statusEl.classList.add("status--success");
  } else if (type === "error") {
    statusEl.classList.add("status--error");
  }
}

function renderSummary() {
  const summaryEl = $("sectionSummary");
  if (!summaryEl) return;
  const names = getSanitisedNamesFromState(true);
  const total = names.length;
  const preview = names.slice(0, 8);
  const remaining = total - preview.length;

  const chips = preview
    .map((name) => `<span class="summary-chip">${escapeHtml(name)}</span>`)
    .join("");

  summaryEl.innerHTML = `
    <div><strong>Total sections:</strong> ${total}</div>
    <div class="summary-chips">${chips || '<span class="summary-chip">(none)</span>'}</div>
    ${remaining > 0 ? `<div class="summary-note">+${remaining} more</div>` : ""}
  `;
}

function moveItem(arr, from, to) {
  if (from === to) return;
  if (from < 0 || from >= arr.length) return;
  if (to < 0 || to >= arr.length) return;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

function renderSectionRows(focusIndex = null) {
  const listEl = $("sectionsList");
  if (!listEl) return;

  listEl.innerHTML = "";
  const namesForUi = [...editableNames, FUTURE_PLANS_NAME];

  namesForUi.forEach((name, idx) => {
    const isFuture = idx === namesForUi.length - 1;

    const row = document.createElement("div");
    row.className = "section-row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.placeholder = "Section name";
    input.disabled = isFuture;
    input.dataset.future = isFuture ? "1" : "0";

    if (!isFuture) {
      input.addEventListener("input", (event) => {
        editableNames[idx] = event.target.value;
        renderSummary();
      });
    }

    const controls = document.createElement("div");
    controls.className = "section-controls";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      moveItem(editableNames, idx, idx - 1);
      renderSectionRows(idx - 1);
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = isFuture || idx === namesForUi.length - 2;
    downBtn.addEventListener("click", () => {
      if (isFuture || idx === namesForUi.length - 2) return;
      moveItem(editableNames, idx, idx + 1);
      renderSectionRows(idx + 1);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = isFuture;
    deleteBtn.addEventListener("click", () => {
      editableNames.splice(idx, 1);
      renderSectionRows(idx >= editableNames.length ? editableNames.length - 1 : idx);
    });

    controls.append(upBtn, downBtn, deleteBtn);
    row.append(input, controls);
    listEl.appendChild(row);

    if (!isFuture && focusIndex != null && idx === focusIndex) {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
  });

  renderSummary();
}

function prepareState(names) {
  editableNames = dedupeAndClean(Array.isArray(names) ? names : []);
}

async function loadDefaultNames() {
  try {
    const res = await fetch(DEFAULT_SCHEMA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load defaults (${res.status})`);
    const json = await res.json();
    const names = normaliseSectionNames(json);
    return dedupeAndClean(names);
  } catch (err) {
    console.warn("Failed to fetch default section schema", err);
    return [];
  }
}

function loadStoredNames() {
  const keys = [SECTION_STORAGE_KEY, LEGACY_SECTION_STORAGE_KEY];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = safeParse(raw, null);
      if (!parsed) continue;
      const names = normaliseSectionNames(parsed);
      if (names.length) {
        return dedupeAndClean(names);
      }
    } catch (err) {
      console.warn("Failed to read stored section schema override", err);
    }
  }
  return [];
}

function saveNamesToLocalStorage(names) {
  const cleaned = names
    .map((n) => String(n || "").trim())
    .filter((n) => n && n.toLowerCase() !== "arse_cover_notes");

  const final = [];
  cleaned.forEach((name, idx) => {
    final.push({
      name,
      description: name === FUTURE_PLANS_NAME ? FUTURE_PLANS_DESCRIPTION : "",
      order: idx + 1
    });
  });

  try {
    localStorage.setItem(
      SECTION_STORAGE_KEY,
      JSON.stringify({ sections: final })
    );
    localStorage.removeItem(LEGACY_SECTION_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to save section schema override", err);
    alert("Could not save sections – storage error.");
    return null;
  }

  return final;
}

function buildSchemaFromNames(names) {
  const final = saveNamesToLocalStorage(names);
  if (!final) return null;
  return { sections: final };
}

async function exportSchemaAsFile(names) {
  const schema = buildSchemaFromNames(names);
  if (!schema) return;

  const pretty = JSON.stringify(schema, null, 2);
  const blob = new Blob([pretty], { type: "application/json" });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `survey-brain-sections-${timestamp}.json`;
  const file = new File([blob], filename, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      console.warn("Share failed, falling back to download", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importSchemaFromFile(file) {
  if (!file) return null;
  try {
    const text = await file.text();
    const json = safeParse(text, null);
    if (!json) {
      alert("Selected file is not valid JSON.");
      return null;
    }
    const names = normaliseSectionNames(json);
    if (!names.length) {
      alert("No valid sections found in this file.");
      return null;
    }
    const cleaned = names.filter((n) => n !== FUTURE_PLANS_NAME);
    cleaned.push(FUTURE_PLANS_NAME);
    saveNamesToLocalStorage(cleaned);
    return cleaned;
  } catch (err) {
    console.error("Failed to import schema file", err);
    alert("Failed to read schema file.");
    return null;
  }
}

async function initSettingsPage() {
  const addSectionBtn = $("addSectionBtn");
  const saveSectionsBtn = $("saveSectionsBtn");
  const resetSectionsBtn = $("resetSectionsBtn");
  const clearOverrideBtn = $("clearOverrideBtn");
  const exportSchemaBtn = $("exportSchemaBtn");
  const importSchemaBtn = $("importSchemaBtn");
  const importSchemaInput = $("importSchemaInput");
  const backBtn = $("backBtn");

  defaultNames = await loadDefaultNames();
  const storedNames = loadStoredNames();
  const initial = storedNames.length ? storedNames : defaultNames;
  prepareState(initial);

  renderSectionRows();
  setStatus("", "");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  if (addSectionBtn) {
    addSectionBtn.addEventListener("click", () => {
      editableNames.push("");
      renderSectionRows(editableNames.length - 1);
      setStatus("Added a new section. Don't forget to save.");
    });
  }

  if (saveSectionsBtn) {
    saveSectionsBtn.addEventListener("click", () => {
      const namesForSave = getSanitisedNamesFromState(true);
      if (!namesForSave.length) {
        alert("Add at least one section before saving.");
        setStatus("No sections to save.", "error");
        return;
      }
      const saved = saveNamesToLocalStorage(namesForSave);
      if (!saved) return;
      editableNames = saved
        .map((entry) => entry.name)
        .filter((name) => name !== FUTURE_PLANS_NAME);
      renderSectionRows();
      setStatus("Sections saved to this device.", "success");
    });
  }

  if (resetSectionsBtn) {
    resetSectionsBtn.addEventListener("click", () => {
      const baseline = defaultNames.length ? defaultNames : [];
      prepareState(baseline);
      const namesForSave = getSanitisedNamesFromState(true);
      saveNamesToLocalStorage(namesForSave);
      renderSectionRows();
      setStatus("Sections reset to defaults.", "success");
    });
  }

  if (clearOverrideBtn) {
    clearOverrideBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem(SECTION_STORAGE_KEY);
        localStorage.removeItem(LEGACY_SECTION_STORAGE_KEY);
      } catch (err) {
        console.warn("Failed to clear section override", err);
      }
      prepareState(defaultNames);
      renderSectionRows();
      setStatus("Override cleared for this device.", "success");
    });
  }

  if (exportSchemaBtn) {
    exportSchemaBtn.addEventListener("click", () => {
      const namesForExport = getSanitisedNamesFromState(false);
      namesForExport.push(FUTURE_PLANS_NAME);
      exportSchemaAsFile(namesForExport)
        .then(() => {
          setStatus("Schema exported.", "success");
        })
        .catch((err) => {
          console.error("Export failed", err);
          alert("Failed to export schema.");
          setStatus("Failed to export schema.", "error");
        });
    });
  }

  if (importSchemaBtn && importSchemaInput) {
    importSchemaBtn.addEventListener("click", () => {
      importSchemaInput.click();
    });

    importSchemaInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const importedNames = await importSchemaFromFile(file);
      importSchemaInput.value = "";
      if (!importedNames || !importedNames.length) return;
      editableNames = importedNames.filter((n) => n !== FUTURE_PLANS_NAME);
      renderSectionRows();
      alert("Schema imported and saved to this device.");
      setStatus("Schema imported and saved to this device.", "success");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage().catch((err) => {
    console.error("Failed to initialise settings page", err);
    alert("Failed to load section editor. See console for details.");
  });
});
