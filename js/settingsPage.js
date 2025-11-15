// js/settingsPage.js
import { loadSchema, saveSchema, getDefaultSchema } from "./schema.js";

function $(id) {
  return document.getElementById(id);
}

async function initialise() {
  const sectionsInput = $("sectionsJson");
  const checklistInput = $("checklistJson");
  const summaryEl = $("schemaSummary");
  const saveSectionsBtn = $("saveSectionsBtn");
  const resetSectionsBtn = $("resetSectionsBtn");
  const saveChecklistBtn = $("saveChecklistBtn");
  const resetChecklistBtn = $("resetChecklistBtn");
  const resetAllBtn = $("resetAllBtn");
  const backBtn = $("backBtn");

  let current = await loadSchema();

  function render() {
    if (sectionsInput) {
      sectionsInput.value = JSON.stringify(current.sections, null, 2);
    }
    if (checklistInput) {
      checklistInput.value = JSON.stringify(current.checklist, null, 2);
    }
    if (summaryEl) {
      const countSections = (current.sections || []).length;
      const countItems = (current.checklist?.items || []).length;
      const firstSections = (current.sections || []).slice(0, 6);
      summaryEl.innerHTML = `
        <p><strong>Sections:</strong> ${countSections}</p>
        <p>${firstSections.map((s) => `• ${s}`).join("<br>") || "(none)"}</p>
        <p style="margin-top:0.5rem;"><strong>Checklist items:</strong> ${countItems}</p>
      `;
    }
  }

  function parseJsonOrAlert(textarea, label) {
    try {
      const value = JSON.parse(textarea.value || "null");
      return value;
    } catch (err) {
      alert(`Invalid JSON in ${label}: ${err.message}`);
      throw err;
    }
  }

  if (saveSectionsBtn && sectionsInput) {
    saveSectionsBtn.addEventListener("click", async () => {
      const rawSections = parseJsonOrAlert(sectionsInput, "Sections");
      const next = {
        sections: rawSections,
        checklist: current.checklist
      };
      current = saveSchema(next);
      render();
      alert("Sections saved.");
    });
  }

  if (resetSectionsBtn) {
    resetSectionsBtn.addEventListener("click", async () => {
      const defaults = await getDefaultSchema();
      current = saveSchema({
        sections: defaults.sections,
        checklist: current.checklist
      });
      render();
      alert("Sections reset to defaults.");
    });
  }

  if (saveChecklistBtn && checklistInput) {
    saveChecklistBtn.addEventListener("click", async () => {
      const rawChecklist = parseJsonOrAlert(checklistInput, "Checklist");
      const next = {
        sections: current.sections,
        checklist: rawChecklist
      };
      current = saveSchema(next);
      render();
      alert("Checklist saved.");
    });
  }

  if (resetChecklistBtn) {
    resetChecklistBtn.addEventListener("click", async () => {
      const defaults = await getDefaultSchema();
      current = saveSchema({
        sections: current.sections,
        checklist: defaults.checklist
      });
      render();
      alert("Checklist reset to defaults.");
    });
  }

  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", async () => {
      if (!confirm("Reset sections and checklist to defaults?")) return;
      const defaults = await getDefaultSchema();
      current = saveSchema(defaults);
      render();
      alert("Schema reset to defaults.");
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  render();
}

document.addEventListener("DOMContentLoaded", () => {
  initialise().catch((err) => {
    console.error("Failed to initialise settings page", err);
    alert("Failed to load schema. See console for details.");
  });
});
