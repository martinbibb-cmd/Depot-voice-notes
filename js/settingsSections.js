const SECTION_STORAGE_KEY = "depot.sectionSchema";
// No longer using FUTURE_PLANS - all sections are now treated equally

function $(id) {
  return document.getElementById(id);
}

function safeParse(json, fallback) {
  try {
    if (!json) return fallback;
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to parse JSON:", err);
    return fallback;
  }
}

function normaliseSectionNames(raw) {
  if (!raw) return [];
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && Array.isArray(raw.sections)) {
    items = raw.sections;
  } else {
    return [];
  }

  const names = items
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return entry.trim();
      const n = entry.name ?? entry.section ?? entry.title ?? entry.heading;
      return typeof n === "string" ? n.trim() : "";
    })
    .filter((n) => n); // Accept all section names

  // Ensure unique, preserve order
  const seen = new Set();
  const unique = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }

  return unique;
}

async function loadDefaultNames() {
  try {
    const res = await fetch("depot.output.schema.json", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return normaliseSectionNames(json);
  } catch (err) {
    console.warn("Failed to load depot.output.schema.json", err);
    return [];
  }
}

async function loadSectionNamesForSettings() {
  // 1) Local override first
  const rawOverride = safeParse(localStorage.getItem(SECTION_STORAGE_KEY), null);
  let names = normaliseSectionNames(rawOverride);

  // 2) Fallback to defaults from file
  if (!names.length) {
    names = await loadDefaultNames();
  }

  // 3) Last-resort bare minimum if everything else failed
  if (!names.length) {
    names = ["Needs", "Customer actions"];
  }

  return names;
}

function saveNamesToLocalStorage(names) {
  const cleaned = names
    .map((n) => String(n || "").trim())
    .filter((n) => n); // Accept all section names

  const final = [];
  cleaned.forEach((name, idx) => {
    final.push({
      name,
      description: "",
      order: idx + 1
    });
  });

  try {
    localStorage.setItem(
      SECTION_STORAGE_KEY,
      JSON.stringify({ sections: final })
    );
  } catch (err) {
    console.warn("Failed to save section schema override", err);
    alert("Could not save sections – storage error.");
    return;
  }

  return final;
}

function renderSummary(names) {
  const el = $("sectionsSummary");
  if (!el) return;
  const count = names.length;
  const first = names.slice(0, 6).join(", ");
  el.textContent = `${count} sections configured. First: ${first || "none"}.`;
}

function renderSectionRows(names) {
  const listEl = $("sectionsList");
  if (!listEl) return;

  listEl.innerHTML = "";

  names.forEach((name, index) => {
    const row = document.createElement("div");
    row.className = "section-row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.dataset.index = String(index);

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "✕";
    deleteBtn.classList.add("secondary");

    upBtn.addEventListener("click", () => {
      if (index === 0) return;
      const tmp = names[index - 1];
      names[index - 1] = names[index];
      names[index] = tmp;
      renderSectionRows(names);
      renderSummary(names);
    });

    downBtn.addEventListener("click", () => {
      if (index === names.length - 1) return;
      const tmp = names[index + 1];
      names[index + 1] = names[index];
      names[index] = tmp;
      renderSectionRows(names);
      renderSummary(names);
    });

    deleteBtn.addEventListener("click", () => {
      names.splice(index, 1);
      renderSectionRows(names);
      renderSummary(names);
    });

    input.addEventListener("input", () => {
      names[index] = input.value;
    });

    row.appendChild(input);
    row.appendChild(upBtn);
    row.appendChild(downBtn);
    row.appendChild(deleteBtn);

    listEl.appendChild(row);
  });

  renderSummary(names);
}

// Build a schema object from the current names and localStorage-saving logic
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
    // Persist to localStorage using the same structure
    saveNamesToLocalStorage(names);
    return names;
  } catch (err) {
    console.error("Failed to import schema file", err);
    alert("Failed to read schema file.");
    return null;
  }
}

async function initSettingsPage() {
  const backBtn = $("backBtn");
  const addSectionBtn = $("addSectionBtn");
  const saveSectionsBtn = $("saveSectionsBtn");
  const resetSectionsBtn = $("resetSectionsBtn");
  const clearOverrideBtn = $("clearOverrideBtn");
  const exportSchemaBtn = $("exportSchemaBtn");
  const importSchemaBtn = $("importSchemaBtn");
  const importSchemaInput = $("importSchemaInput");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  let names = await loadSectionNamesForSettings();
  renderSectionRows(names);

  if (addSectionBtn) {
    addSectionBtn.addEventListener("click", () => {
      names.splice(Math.max(0, names.length - 1), 0, "New section");
      renderSectionRows(names);
    });
  }

  if (saveSectionsBtn) {
    saveSectionsBtn.addEventListener("click", () => {
      const inputs = Array.from(
        document.querySelectorAll(".section-row input[type='text']")
      );
      names = inputs
        .map((input) => input.value || "")
        .map((n) => String(n || "").trim())
        .filter((n) => n); // Accept all section names

      saveNamesToLocalStorage(names);
      renderSectionRows(names);
      alert("Sections saved for this device.");
    });
  }

  if (exportSchemaBtn) {
    exportSchemaBtn.addEventListener("click", () => {
      const inputs = Array.from(
        document.querySelectorAll(".section-row input[type='text']")
      );
      const currentNames = inputs
        .map((input) => input.value || "")
        .map((n) => String(n || "").trim())
        .filter((n) => n); // Accept all section names

      exportSchemaAsFile(currentNames).catch((err) => {
        console.error("Export failed", err);
        alert("Failed to export schema.");
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
      names = importedNames;
      renderSectionRows(names);
      alert("Schema imported and saved to this device.");
    });
  }

  if (resetSectionsBtn) {
    resetSectionsBtn.addEventListener("click", async () => {
      if (!confirm("Reset section list back to defaults from depot.output.schema.json?")) {
        return;
      }
      localStorage.removeItem(SECTION_STORAGE_KEY);
      names = await loadSectionNamesForSettings();
      renderSectionRows(names);
      alert("Sections reset to defaults.");
    });
  }

  if (clearOverrideBtn) {
    clearOverrideBtn.addEventListener("click", () => {
      if (!confirm("Clear the local override and fall back to defaults on next load?")) {
        return;
      }
      localStorage.removeItem(SECTION_STORAGE_KEY);
      alert("Local override cleared. Reload the main app to use defaults from the repo.");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage().catch((err) => {
    console.error("Failed to initialise settings page", err);
    alert("Failed to load settings. See console for details.");
  });
});
