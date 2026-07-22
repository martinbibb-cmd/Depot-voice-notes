export const OUTCOME_STATES = [
  "included",
  "not_required",
  "customer_arranging",
  "separate_quote",
  "unresolved"
];

const STATE_LABELS = {
  included: "Included",
  not_required: "Not required",
  customer_arranging: "Customer arranging",
  separate_quote: "Separate quote",
  unresolved: "Unresolved"
};

const CONTRADICTIONS = [
  {
    tags: ["gas:retain", "gas:upgrade"],
    question: "Gas supply is marked as both retained and upgraded. Which scope is correct?"
  },
  {
    tags: ["cylinder:retain", "cylinder:remove"],
    question: "Cylinder is marked as both retained and removed. Which scope is correct?"
  },
  {
    tags: ["system:vented", "system:unvented"],
    question: "Final scope includes both vented and unvented system types. Which applies?"
  },
  {
    tags: ["specialist:none", "specialist:builder"],
    question: "Specialist work is marked as both not required and builder required. Which applies?"
  }
];

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
  return [];
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function normaliseOutcome(item, outcome) {
  if (!outcome || typeof outcome !== "object") return null;
  const id = cleanText(outcome.id);
  if (!id) return null;
  const state = OUTCOME_STATES.includes(outcome.state) ? outcome.state : "included";
  return {
    id,
    state,
    label: cleanText(outcome.label) || STATE_LABELS[state] || id,
    section: cleanText(outcome.section || outcome.depotSection || item.section || item.depotSection),
    plainText: cleanText(outcome.plainText),
    naturalLanguage: cleanText(outcome.naturalLanguage),
    detailPrompt: cleanText(outcome.detailPrompt),
    tags: Array.isArray(outcome.tags) ? outcome.tags.map(cleanText).filter(Boolean) : [],
    quoteScope: cleanText(outcome.quoteScope || "base"),
    materials: Array.isArray(outcome.materials) ? outcome.materials : []
  };
}

function fallbackOutcome(item) {
  const plainText = cleanText(item.plainText);
  const naturalLanguage = cleanText(item.naturalLanguage);
  if (!plainText && !naturalLanguage) return [];
  return [{
    id: "included",
    state: "included",
    label: "Included",
    section: cleanText(item.section || item.depotSection),
    plainText,
    naturalLanguage,
    detailPrompt: cleanText(item.detailPrompt),
    tags: Array.isArray(item.tags) ? item.tags.map(cleanText).filter(Boolean) : [],
    quoteScope: "base",
    materials: Array.isArray(item.materials) ? item.materials : []
  }];
}

export function normaliseChecklistItems(config) {
  return asArray(config).map((item) => {
    if (!item) return null;
    const id = cleanText(item.id);
    if (!id) return null;
    const base = {
      id,
      group: cleanText(item.group || item.category || "Checklist"),
      section: cleanText(item.section || item.depotSection),
      label: cleanText(item.label || item.name || id),
      hint: cleanText(item.hint || item.description),
      outcomes: []
    };
    const outcomes = Array.isArray(item.outcomes)
      ? item.outcomes.map((outcome) => normaliseOutcome(base, outcome)).filter(Boolean)
      : fallbackOutcome(item);
    base.outcomes = outcomes;
    return base;
  }).filter(Boolean);
}

export function selectedOutcomeForItem(item, selections = {}) {
  const raw = selections[item.id];
  const outcomeId = typeof raw === "string" ? raw : raw && raw.outcome;
  if (!outcomeId) return null;
  return item.outcomes.find((outcome) => outcome.id === outcomeId) || null;
}

export function selectedDetailForItem(item, selections = {}) {
  const raw = selections[item.id];
  if (!raw || typeof raw !== "object") return "";
  return cleanText(raw.detail);
}

function addSectionLine(map, sectionName, line) {
  const section = cleanText(sectionName);
  const text = cleanText(line);
  if (!section || !text) return;
  if (!map.has(section)) map.set(section, []);
  const lines = map.get(section);
  if (!lines.some((existing) => existing.toLowerCase() === text.toLowerCase())) {
    lines.push(text);
  }
}

function lineForOutcome(outcome, detail = "") {
  const text = cleanText(outcome.plainText || outcome.label);
  if (!text) return "";
  const scopedText = detail ? `${text} - ${detail}` : text;
  if (outcome.quoteScope && outcome.quoteScope !== "base") {
    const scopeLabel = outcome.quoteScope.replace(/^option\b/i, "Option");
    return `${scopeLabel} - ${scopedText}`;
  }
  return scopedText;
}

export function buildDeterministicScope(checklistItems, selections = {}) {
  const items = normaliseChecklistItems(checklistItems);
  const sectionsMap = new Map();
  const materials = [];
  const selectedItems = [];
  const tags = new Set();

  items.forEach((item) => {
    const outcome = selectedOutcomeForItem(item, selections);
    if (!outcome) return;
    const detail = selectedDetailForItem(item, selections);
    selectedItems.push({
      id: item.id,
      label: item.label,
      group: item.group,
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      detail,
      state: outcome.state,
      quoteScope: outcome.quoteScope,
      section: outcome.section
    });
    outcome.tags.forEach((tag) => tags.add(tag));
    addSectionLine(sectionsMap, outcome.section, lineForOutcome(outcome, detail));
    outcome.materials.forEach((material) => materials.push(material));
  });

  const sections = Array.from(sectionsMap.entries()).map(([section, lines]) => ({
    section,
    plainText: lines.join("; ") + (lines.length ? ";" : ""),
    naturalLanguage: ""
  }));

  return {
    selectedItems,
    sections,
    materials,
    tags: Array.from(tags)
  };
}

export function detectConfirmationQuestions(scope) {
  const tagSet = new Set(scope && Array.isArray(scope.tags) ? scope.tags : []);
  return CONTRADICTIONS
    .filter((rule) => rule.tags.every((tag) => tagSet.has(tag)))
    .map((rule) => ({ target: "expert", question: rule.question }));
}

export function buildRecap(scope, dictatedText = "") {
  const selectedBySection = new Map();
  (scope?.selectedItems || []).forEach((item) => {
    const key = item.section || "Unassigned";
    if (!selectedBySection.has(key)) selectedBySection.set(key, []);
    const detail = item.detail ? ` - ${item.detail}` : "";
    selectedBySection.get(key).push(`${item.label}: ${item.outcomeLabel}${detail}`);
  });

  return {
    selectedBySection: Array.from(selectedBySection.entries()).map(([section, items]) => ({ section, items })),
    dictatedAdditions: cleanText(dictatedText)
  };
}
