import { loadDepotNotesSchema } from "../app/state.js";

const PLACEHOLDER_KEY = "no additional notes";

function normaliseClauseKey(text) {
  return String(text || "")
    .replace(/^•\s*/, "")
    .replace(/[.;:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractPlainClauses(chunks = []) {
  const seen = new Set();
  const clauses = [];
  (Array.isArray(chunks) ? chunks : []).forEach((chunk) => {
    String(chunk || "")
      .split(/[;\n]+/)
      .map((part) => part.replace(/^•\s*/, "").trim())
      .filter(Boolean)
      .forEach((clause) => {
        const key = normaliseClauseKey(clause);
        if (!key || seen.has(key)) return;
        seen.add(key);
        clauses.push(clause);
      });
  });
  const hasMeaningful = clauses.some((clause) => normaliseClauseKey(clause) !== PLACEHOLDER_KEY);
  if (!hasMeaningful) {
    return clauses;
  }
  return clauses.filter((clause) => normaliseClauseKey(clause) !== PLACEHOLDER_KEY);
}

function joinPlainClauses(clauses) {
  if (!Array.isArray(clauses) || !clauses.length) return "";
  return clauses
    .map((clause) => {
      const trimmed = clause.trim();
      if (!trimmed) return "";
      return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
    })
    .filter(Boolean)
    .join(" ");
}

function buildPlainTextFromChunks(chunks) {
  return joinPlainClauses(extractPlainClauses(chunks));
}

function normaliseNaturalKey(text) {
  return String(text || "")
    .replace(/[.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildNaturalLanguageFromChunks(chunks = []) {
  const seen = new Set();
  const parts = [];
  (Array.isArray(chunks) ? chunks : []).forEach((chunk) => {
    String(chunk || "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const key = normaliseNaturalKey(part);
        if (!key || seen.has(key)) return;
        seen.add(key);
        parts.push(part);
      });
  });
  const hasMeaningful = parts.some((part) => normaliseNaturalKey(part) !== PLACEHOLDER_KEY);
  const filtered = hasMeaningful
    ? parts.filter((part) => normaliseNaturalKey(part) !== PLACEHOLDER_KEY)
    : parts;
  return filtered.join("\n");
}

export function buildDepotOutputFromChecklist(checklistState = {}) {
  const { sections: sectionOrder = [], checklist: checklistConfig = {} } = loadDepotNotesSchema();

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
  const order = Array.isArray(sectionOrder) && sectionOrder.length
    ? sectionOrder
    : Array.isArray(checklistConfig.sectionsOrder)
      ? checklistConfig.sectionsOrder
      : [];

  order.forEach((sectionName) => {
    const bucket = sectionsMap.get(sectionName);
    if (!bucket) return;
    const plainText = buildPlainTextFromChunks(bucket.plain);
    const naturalLanguage = buildNaturalLanguageFromChunks(bucket.nl);
    if (!plainText && !naturalLanguage) return;
    sections.push({
      section: sectionName,
      plainText,
      naturalLanguage
    });
  });

  return {
    sections,
    materials
  };
}
