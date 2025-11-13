import { loadChecklistConfig, loadDepotSchema } from "../app/state.js";

export function buildDepotOutputFromChecklist(checklistState = {}) {
  const checklistConfig = loadChecklistConfig();
  const depotSchema = loadDepotSchema();

  const sectionsMap = new Map();
  const materials = [];

  function addSnippet(sectionName, plain, nl) {
    if (!sectionName || (!plain && !nl)) return;
    if (!sectionsMap.has(sectionName)) {
      sectionsMap.set(sectionName, { plain: [], nl: [] });
    }
    const bucket = sectionsMap.get(sectionName);
    if (plain) bucket.plain.push(plain);
    if (nl) bucket.nl.push(nl);
  }

  (checklistConfig.items || []).forEach((item) => {
    const state = checklistState[item.id];
    if (!state || !state.checked) return;

    let plain = item.plainText || "";
    let nl = item.naturalLanguage || "";

    if (state.extra && state.extra.trim()) {
      const extra = state.extra.trim();
      if (plain) plain += ` ${extra}`;
      if (nl) nl += ` ${extra}`;
    }

    addSnippet(item.depotSection, plain, nl);

    if (Array.isArray(item.materials)) {
      item.materials.forEach((m) => {
        materials.push({
          category: m.category || "Other",
          item: m.item || "",
          qty: m.qty ?? 1,
          notes: m.notes || ""
        });
      });
    }
  });

  const sections = [];
  const order = (depotSchema && depotSchema.sectionsOrder) || (checklistConfig && checklistConfig.sectionsOrder) || [];

  order.forEach((sectionName) => {
    const bucket = sectionsMap.get(sectionName);
    if (!bucket) return;
    const plainText = bucket.plain.join("; ");
    const naturalLanguage = bucket.nl.join(" ");
    if (!plainText && !naturalLanguage) return;
    sections.push({
      section: sectionName,
      plainText,
      naturalLanguage
    });
  });

  // Include any sections not explicitly ordered (fallback)
  sectionsMap.forEach((bucket, name) => {
    if (order.includes(name)) return;
    const plainText = bucket.plain.join("; ");
    const naturalLanguage = bucket.nl.join(" ");
    if (!plainText && !naturalLanguage) return;
    sections.push({ section: name, plainText, naturalLanguage });
  });

  return {
    sections,
    materials
  };
}
