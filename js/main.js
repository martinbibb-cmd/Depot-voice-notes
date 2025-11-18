import {
  loadWorkerEndpoint,
  isWorkerEndpointStorageKey
} from "../src/app/worker-config.js";
import { loadSchema } from "./schema.js";
import { loadPricebook, matchMaterialsToPricebook, findCorePack } from "./pricebook.js";
import { showQuoteBuilderModal } from "./quoteBuilder.js";
import { showPackSelectorModal } from "./packSelector.js";
import { generateMultipleQuotePDFs, downloadPDF } from "./quotePDF.js";
import { logError, showBugReportModal } from "./bugReport.js";

// --- CONFIG / STORAGE KEYS ---
const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "depot.checklistConfig";
const LS_AUTOSAVE_KEY = "surveyBrainAutosave";

// Canonical Depot notes section order fallback
const DEFAULT_DEPOT_SECTION_ORDER = [
  "Needs",
  "Working at heights",
  "System characteristics",
  "Components that require assistance",
  "Restrictions to work",
  "External hazards",
  "Delivery notes",
  "Office notes",
  "New boiler and controls",
  "Flue",
  "Pipe work",
  "Disruption",
  "Customer actions",
  "Future plans"
];

// --- Small helpers shared by config loaders ---
function safeParseJSON(raw, fallback = null) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function fetchJSONNoStore(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

let WORKER_URL = loadWorkerEndpoint();

// --- ELEMENTS ---
const sendTextBtn = document.getElementById("sendTextBtn");
const transcriptInput = document.getElementById("transcriptInput");
const customerSummaryEl = document.getElementById("customerSummary");
const clarificationsEl = document.getElementById("clarifications");
const sectionsListEl = document.getElementById("sectionsList");
const statusBar = document.getElementById("statusBar");
const startLiveBtn = document.getElementById("startLiveBtn");
const pauseLiveBtn = document.getElementById("pauseLiveBtn");
const finishLiveBtn = document.getElementById("finishLiveBtn");
const exportBtn = document.getElementById("exportBtn");
const createQuoteBtn = document.getElementById("createQuoteBtn");
const saveSessionBtn = document.getElementById("saveSessionBtn");
const loadSessionBtn = document.getElementById("loadSessionBtn");
const loadSessionInput = document.getElementById("loadSessionInput");
const importAudioBtn = document.getElementById("importAudioBtn");
const importAudioInput = document.getElementById("importAudioInput");
const newJobBtn = document.getElementById("newJobBtn");
const partsListEl = document.getElementById("partsList");
const voiceErrorEl = document.getElementById("voice-error");
const sleepWarningEl = document.getElementById("sleep-warning");
const settingsBtn = document.getElementById("settingsBtn");
const bugReportBtn = document.getElementById("bugReportBtn");
const workerDebugEl = document.getElementById("workerDebug");
const debugSectionsPre = document.getElementById("debugSectionsJson");
const debugSectionsDetails = document.getElementById("debugSections");

if (typeof window !== "undefined") {
  window.__depotVoiceNotesDebug = window.__depotVoiceNotesDebug || {
    lastWorkerResponse: null,
    lastNormalisedSections: []
  };
  window.__depotDebug = window.__depotDebug || {
    lastWorkerResponse: null,
    sections: []
  };
}

// --- STATE ---
const APP_STATE = {
  sections: [],
  notes: []
};
let lastMaterials = [];
let lastRawSections = [];
let lastSections = [];
let lastCheckedItems = [];
let lastMissingInfo = [];
let lastCustomerSummary = "";
let wasBackgroundedDuringSession = false;
let pauseReason = null;
let lastWorkerPayload = null;
let SECTION_SCHEMA = [];
let SECTION_ORDER = [];
let SECTION_ORDER_MAP = new Map();
let SECTION_KEY_LOOKUP = new Map();
let schemaLoaded = false;
let CHECKLIST_SOURCE = [];
let CHECKLIST_ITEMS = [];

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

async function loadChecklistConfig() {
  // 1) Try local override from browser storage
  const localRaw = safeParseJSON(localStorage.getItem(CHECKLIST_STORAGE_KEY), null);

  // 2) Try defaults from checklist.config.json
  const defaultsRaw = await fetchJSONNoStore("checklist.config.json");

  const localClean = sanitiseChecklistArray(localRaw);
  const defaultsClean = sanitiseChecklistArray(defaultsRaw);

  // 3) Prefer local override if it has content
  const candidate = localClean.length ? localClean : defaultsClean;

  if (!candidate.length) {
    console.warn("Checklist config: no items from localStorage or checklist.config.json");
  } else {
    const sourceLabel = localClean.length ? "browser override" : "checklist.config.json";
    console.log(`Checklist config: loaded ${candidate.length} items (${sourceLabel})`);
  }

  return candidate;
}

function saveLocalChecklistConfig(cfg) {
  const cleaned = sanitiseChecklistArray(cfg);
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.warn("Failed to persist checklist override", err);
  }
  return cleaned;
}

let mediaRecorder = null;
let mediaStream = null;
let sessionAudioChunks = [];
let lastAudioMime = null;

// Live session speech state
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let recognition = null;
let liveState = "idle"; // idle | running | paused
let recognitionActive = false;
let shouldRestartRecognition = false;
let recognitionStopMode = null; // null | "pause" | "finish"
let committedTranscript = "";
let interimTranscript = "";
let lastSentTranscript = "";
let chunkTimerId = null;
const LIVE_CHUNK_INTERVAL_MS = 20000; // Default 20 seconds
let currentChunkInterval = LIVE_CHUNK_INTERVAL_MS; // Adaptive interval
let pendingFinishSend = false;

// Internet speed measurement
let internetSpeed = "unknown"; // "fast" | "medium" | "slow" | "unknown"
let lastSpeedTest = 0;
const SPEED_TEST_INTERVAL = 60000; // Test every 60 seconds
let speedTestInProgress = false;

// --- HELPERS ---
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

  const final = unique.map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: idx + 1
  }));

  return final;
}

function rebuildSectionState(schema) {
  SECTION_SCHEMA = Array.isArray(schema) ? schema.map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: typeof entry.order === "number" ? entry.order : idx + 1
  })) : [];
  SECTION_ORDER = SECTION_SCHEMA.map((entry) => entry.name);
  SECTION_ORDER_MAP = new Map();
  SECTION_KEY_LOOKUP = new Map();

  SECTION_SCHEMA.forEach((entry, idx) => {
    const order = idx + 1;
    SECTION_ORDER_MAP.set(entry.name, order);
    const key = normaliseSectionKey(entry.name);
    if (!key) return;
    const variants = new Set([key]);
    if (key.endsWith("s")) variants.add(key.replace(/s$/, ""));
    if (key.endsWith("ies")) {
      variants.add(key.replace(/ies$/, "y"));
    } else if (key.endsWith("y")) {
      variants.add(key.replace(/y$/, "ies"));
    }
    if (key.includes(" and ")) {
      variants.add(key.replace(/\band\b/g, "").replace(/\s+/g, " ").trim());
    }
    variants.forEach((variant) => {
      if (variant && !SECTION_KEY_LOOKUP.has(variant)) {
        SECTION_KEY_LOOKUP.set(variant, entry.name);
      }
    });
  });

  schemaLoaded = SECTION_SCHEMA.length > 0;
  syncSectionsState(lastRawSections);
}

function getCanonicalDepotSectionOrder() {
  if (SECTION_ORDER.length) {
    return SECTION_ORDER.slice();
  }
  return DEFAULT_DEPOT_SECTION_ORDER.slice();
}

function normaliseDepotSections(rawSections) {
  const entries = Array.isArray(rawSections) ? rawSections : [];
  const sectionMap = new Map();
  const hadRawSections = entries.length > 0;

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const rawName = typeof entry.section === "string"
      ? entry.section.trim()
      : typeof entry.name === "string"
        ? entry.name.trim()
        : typeof entry.title === "string"
          ? entry.title.trim()
          : typeof entry.heading === "string"
            ? entry.heading.trim()
            : "";
    if (!rawName) return;
    const canonical = resolveRequiredSectionName(rawName) || rawName;
    if (!canonical || canonical.toLowerCase() === "arse_cover_notes") return;
    if (sectionMap.has(canonical)) return;
    const plainText = typeof entry.plainText === "string"
      ? entry.plainText
      : typeof entry.plain_text === "string"
        ? entry.plain_text
        : typeof entry.text === "string"
          ? entry.text
          : typeof entry.body === "string"
            ? entry.body
            : typeof entry.content === "string"
              ? entry.content
              : String(entry.plainText || entry.plain_text || entry.text || entry.body || entry.content || "");
    const naturalLanguage = typeof entry.naturalLanguage === "string"
      ? entry.naturalLanguage
      : typeof entry.natural_language === "string"
        ? entry.natural_language
        : typeof entry.summary === "string"
          ? entry.summary
          : typeof entry.notes === "string"
            ? entry.notes
            : "";
    sectionMap.set(canonical, {
      section: canonical,
      plainText: plainText || "",
      naturalLanguage: naturalLanguage || ""
    });
  });

  const canonicalOrder = getCanonicalDepotSectionOrder();
  const seenOrder = new Set(canonicalOrder);
  const missing = [];

  const ordered = canonicalOrder.map((name) => {
    const existing = sectionMap.get(name);
    if (existing) {
      return {
        section: existing.section,
        plainText: existing.plainText || "",
        naturalLanguage: existing.naturalLanguage || ""
      };
    }
    missing.push(name);
    return {
      section: name,
      plainText: "",
      naturalLanguage: ""
    };
  });

  sectionMap.forEach((value, key) => {
    if (seenOrder.has(key)) return;
    ordered.push({
      section: value.section,
      plainText: value.plainText || "",
      naturalLanguage: value.naturalLanguage || ""
    });
  });

  if (!ordered.length) {
    return DEFAULT_DEPOT_SECTION_ORDER.map((name) => ({
      section: name,
      plainText: "",
      naturalLanguage: ""
    }));
  }

  if (missing.length && hadRawSections) {
    console.warn("Depot notes: worker response missing sections:", missing);
  }

  return ordered;
}

// --- Semantic Deduplication Helpers ---
function normalizeTextForComparison(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

function getTextTokens(text) {
  const normalized = normalizeTextForComparison(text);
  if (!normalized) return new Set();

  // Remove common stop words that don't add meaning
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "will", "with", "have", "this", "but", "they", "been"
  ]);

  return new Set(
    normalized.split(/\s+/).filter(token => token.length > 2 && !stopWords.has(token))
  );
}

function calculateSimilarity(text1, text2) {
  const tokens1 = getTextTokens(text1);
  const tokens2 = getTextTokens(text2);

  if (tokens1.size === 0 && tokens2.size === 0) return 1.0; // Both empty
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0; // One empty

  // Calculate Jaccard similarity (intersection over union)
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

function areLinesSemanticallySimilar(line1, line2, threshold = 0.6) {
  // Exact match (case-insensitive)
  if (normalizeTextForComparison(line1) === normalizeTextForComparison(line2)) {
    return true;
  }

  // One contains the other (with significant overlap)
  const norm1 = normalizeTextForComparison(line1);
  const norm2 = normalizeTextForComparison(line2);
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  // Semantic similarity via token overlap
  const similarity = calculateSimilarity(line1, line2);
  return similarity >= threshold;
}

function deduplicateLines(lines, similarityThreshold = 0.6) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const uniqueLines = [];
  const processed = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (processed.has(i)) continue;

    const currentLine = lines[i];
    let bestLine = currentLine;
    let bestLength = currentLine.length;
    processed.add(i);

    // Find all similar lines and keep the most detailed one
    for (let j = i + 1; j < lines.length; j++) {
      if (processed.has(j)) continue;

      if (areLinesSemanticallySimilar(currentLine, lines[j], similarityThreshold)) {
        processed.add(j);
        // Keep the longer, more detailed version
        if (lines[j].length > bestLength) {
          bestLine = lines[j];
          bestLength = lines[j].length;
        }
      }
    }

    uniqueLines.push(bestLine);
  }

  return uniqueLines;
}

function cleanSectionContent(section) {
  if (!section || typeof section !== "object") return section;

  const cleaned = { ...section };

  if (typeof cleaned.plainText === "string") {
    const rawLines = cleaned.plainText
      .split(/;\s*\n|\n+|;/)
      .map((line) => line.trim())
      .filter(Boolean);

    // Apply semantic deduplication instead of just exact match
    let uniqueLines = deduplicateLines(rawLines, 0.6);

    const hasDetail = uniqueLines.some((line) => !/^no\b/i.test(line));
    if (hasDetail) {
      uniqueLines = uniqueLines.filter((line) => !/^no\b/i.test(line));
    }

    cleaned.plainText = uniqueLines.length ? `${uniqueLines.join("; ")};` : "";
  }

  if (typeof cleaned.naturalLanguage === "string") {
    const paras = cleaned.naturalLanguage
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paras.length > 1) {
      cleaned.naturalLanguage = paras[paras.length - 1];
    } else if (paras.length === 1) {
      cleaned.naturalLanguage = paras[0];
    } else {
      cleaned.naturalLanguage = "";
    }
  }

  return cleaned;
}

function cleanSectionsList(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => cleanSectionContent(section));
}

function getCanonicalSectionNames(schemaOverride) {
  if (Array.isArray(schemaOverride) && schemaOverride.length) {
    return schemaOverride
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && entry.name) return String(entry.name).trim();
        if (entry && entry.section) return String(entry.section).trim();
        return "";
      })
      .filter(Boolean);
  }
  if (Array.isArray(SECTION_SCHEMA) && SECTION_SCHEMA.length) {
    return SECTION_SCHEMA.map((entry) => entry.name).filter(Boolean);
  }
  if (SECTION_ORDER.length) {
    return SECTION_ORDER.slice();
  }
  return [];
}

async function ensureSectionSchema() {
  if (schemaLoaded && SECTION_SCHEMA.length) {
    return SECTION_SCHEMA;
  }
  await ensureSchemaIntoState();
  return SECTION_SCHEMA;
}

function clearCachedSchema() {
  schemaLoaded = false;
  SECTION_SCHEMA = [];
  SECTION_ORDER = [];
  SECTION_ORDER_MAP = new Map();
  SECTION_KEY_LOOKUP = new Map();
  CHECKLIST_SOURCE = [];
  CHECKLIST_ITEMS = [];
}

function normaliseSectionKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveRequiredSectionName(name) {
  const key = normaliseSectionKey(name);
  if (!key) return null;
  return SECTION_KEY_LOOKUP.get(key) || null;
}

function normaliseSectionsForState(rawSections) {
  const normalised = normaliseDepotSections(rawSections);
  return cleanSectionsList(normalised);
}

function syncSectionsState(rawSections = lastRawSections) {
  const normalised = normaliseSectionsForState(rawSections);
  lastSections = normalised;
  APP_STATE.sections = normalised;
  APP_STATE.notes = normalised;
  updateDebugSnapshot();
}

function firstDefined(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function coerceSectionField(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : ""))
      .filter(Boolean)
      .join(" ");
  }
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.parts)) {
      return value.parts
        .map((part) => (typeof part === "string" ? part : ""))
        .filter(Boolean)
        .join(" ");
    }
  }
  if (value === undefined || value === null) return "";
  return String(value);
}

function mergeTextFields(existing, incoming) {
  const prev = typeof existing === "string" ? existing : "";
  const next = typeof incoming === "string" ? incoming : "";
  const prevTrim = prev.trim();
  const nextTrim = next.trim();

  if (!prevTrim && !nextTrim) return next || prev || "";
  if (!prevTrim) return next;
  if (!nextTrim) return prev;

  // Exact match (case-insensitive)
  if (prevTrim.toLowerCase() === nextTrim.toLowerCase()) return next || prev;

  // Substring containment
  if (prevTrim.includes(nextTrim)) return prev;
  if (nextTrim.includes(prevTrim)) return next;

  // Check semantic similarity - if very similar, keep the longer one
  const similarity = calculateSimilarity(prevTrim, nextTrim);
  if (similarity >= 0.75) {
    // Very similar - keep the more detailed version
    return prevTrim.length >= nextTrim.length ? prevTrim : nextTrim;
  }

  // Different content - merge both
  return `${prevTrim}\n${nextTrim}`.trim();
}

function normaliseSectionCandidate(section, index = 0) {
  if (!section) return null;
  const rawName = firstDefined(section.section, section.name, section.heading, section.title);
  const trimmedName = typeof rawName === "string" ? rawName.trim() : "";
  if (!trimmedName) return null;
  if (trimmedName.toLowerCase() === "arse_cover_notes") return null;
  const canonical = resolveRequiredSectionName(trimmedName);
  const plainSource = firstDefined(section.plainText, section.plain_text, section.text, section.content, section.body);
  const naturalSource = firstDefined(
    section.naturalLanguage,
    section.natural_language,
    section.summary,
    section.description,
    section.notes
  );
  return {
    section: canonical || trimmedName,
    originalName: trimmedName,
    plainText: coerceSectionField(plainSource || ""),
    naturalLanguage: coerceSectionField(naturalSource || ""),
    isRequired: Boolean(canonical),
    index
  };
}

function mergeIncomingSection(existing, incoming) {
  if (!incoming) return existing || null;
  if (!existing) {
    return {
      section: incoming.section,
      plainText: typeof incoming.plainText === "string" ? incoming.plainText : "",
      naturalLanguage: typeof incoming.naturalLanguage === "string" ? incoming.naturalLanguage : ""
    };
  }
  return {
    section: incoming.section || existing.section,
    plainText: mergeTextFields(existing.plainText, incoming.plainText),
    naturalLanguage: mergeTextFields(existing.naturalLanguage, incoming.naturalLanguage)
  };
}

function partitionSectionsByRequirement(sections) {
  const required = new Map();
  const extras = new Map();
  (Array.isArray(sections) ? sections : []).forEach((section, idx) => {
    const normalised = normaliseSectionCandidate(section, idx);
    if (!normalised) return;
    if (normalised.isRequired) {
      const existing = required.get(normalised.section);
      required.set(normalised.section, mergeIncomingSection(existing, normalised));
    } else {
      const key = normaliseSectionKey(normalised.originalName || normalised.section) || `${idx}-${normalised.section}`;
      const existingExtra = extras.get(key);
      const merged = mergeIncomingSection(existingExtra && existingExtra.entry, normalised);
      extras.set(key, {
        entry: merged,
        order: existingExtra ? existingExtra.order : idx
      });
    }
  });
  return { required, extras };
}

function combineSectionEntries(prev, next, sectionName) {
  const plainText = mergeTextFields(prev && prev.plainText, next && next.plainText);
  const naturalLanguage = mergeTextFields(prev && prev.naturalLanguage, next && next.naturalLanguage);
  if (!plainText.trim() && !naturalLanguage.trim()) {
    return null;
  }
  return {
    section: sectionName,
    plainText,
    naturalLanguage
  };
}

function countPartitionEntries(partition) {
  if (!partition) return 0;
  let count = 0;
  partition.required.forEach((entry) => {
    if (entry) count += 1;
  });
  partition.extras.forEach((wrapper) => {
    if (wrapper && wrapper.entry) count += 1;
  });
  return count;
}

function mergeSectionsPreservingRequired(previousSections, incomingSections) {
  const prevPartition = partitionSectionsByRequirement(previousSections);
  const incomingPartition = partitionSectionsByRequirement(incomingSections);
  const merged = [];

  const canonicalNames = SECTION_ORDER.length ? SECTION_ORDER : SECTION_SCHEMA.map((entry) => entry.name);
  canonicalNames.forEach((name) => {
    const mergedEntry = combineSectionEntries(
      prevPartition.required.get(name),
      incomingPartition.required.get(name),
      name
    );
    if (mergedEntry) merged.push(mergedEntry);
  });

  const extraKeys = new Set([
    ...Array.from(prevPartition.extras.keys()),
    ...Array.from(incomingPartition.extras.keys())
  ]);
  const extraEntries = [];
  extraKeys.forEach((key) => {
    const prevWrapper = prevPartition.extras.get(key);
    const nextWrapper = incomingPartition.extras.get(key);
    const sectionName = (nextWrapper && nextWrapper.entry && nextWrapper.entry.section)
      || (prevWrapper && prevWrapper.entry && prevWrapper.entry.section)
      || "";
    if (!sectionName) return;
    const mergedEntry = combineSectionEntries(
      prevWrapper && prevWrapper.entry,
      nextWrapper && nextWrapper.entry,
      sectionName
    );
    if (!mergedEntry) return;
    const fallbackOrder = canonicalNames.length || SECTION_SCHEMA.length || 0;
    const order = nextWrapper
      ? nextWrapper.order
      : prevWrapper
        ? prevWrapper.order
        : fallbackOrder;
    extraEntries.push({ entry: mergedEntry, order });
  });
  extraEntries
    .sort((a, b) => a.order - b.order)
    .forEach((item) => {
      merged.push(item.entry);
    });

  return {
    merged,
    incomingCount: countPartitionEntries(incomingPartition)
  };
}

function showVoiceError(message) {
  // Log error to bug report system
  logError(new Error(message), { source: 'voiceError', timestamp: new Date().toISOString() });

  if (!voiceErrorEl) {
    console.error("Voice error:", message);
    alert(message);
    return;
  }
  voiceErrorEl.textContent = message;
  voiceErrorEl.style.display = "block";
}
function clearVoiceError() {
  if (!voiceErrorEl) return;
  voiceErrorEl.textContent = "";
  voiceErrorEl.style.display = "none";
}
function showSleepWarning(message) {
  if (!sleepWarningEl) return;
  sleepWarningEl.textContent = message;
  sleepWarningEl.style.display = "block";
}
function clearSleepWarning() {
  if (!sleepWarningEl) return;
  sleepWarningEl.textContent = "";
  sleepWarningEl.style.display = "none";
}
function currentModeLabel() {
  return liveState === "running" || liveState === "paused" ? "Live" : "Manual";
}
function setStatus(msg) {
  const onlinePart = navigator.onLine ? "Online" : "Offline";
  statusBar.textContent = `${msg || "Idle"} (${onlinePart} • ${currentModeLabel()})`;
}
function cloneDeep(val) {
  try { return JSON.parse(JSON.stringify(val)); } catch (_) { return val; }
}

function renderWorkerDebug() {
  if (!workerDebugEl) return;
  if (!lastWorkerPayload) {
    workerDebugEl.textContent = "No worker response yet.";
    workerDebugEl.classList.add("empty");
    return;
  }
  try {
    workerDebugEl.textContent = JSON.stringify(lastWorkerPayload, null, 2);
  } catch (_) {
    workerDebugEl.textContent = String(lastWorkerPayload);
  }
  workerDebugEl.classList.remove("empty");
}

function updateDebugView() {
  if (!debugSectionsPre) return;
  const snapshot = typeof window !== "undefined" ? window.__depotVoiceNotesDebug : null;
  if (!snapshot) {
    debugSectionsPre.textContent = "No debug data yet.";
    debugSectionsPre.classList.add("empty");
    return;
  }
  try {
    debugSectionsPre.textContent = JSON.stringify(snapshot, null, 2);
  } catch (_) {
    debugSectionsPre.textContent = String(snapshot);
  }
  debugSectionsPre.classList.remove("empty");
  if (debugSectionsDetails) {
    debugSectionsDetails.style.display = "block";
  }
}

function updateDebugSnapshot(sourcePayload = lastWorkerPayload) {
  const snapshot = {
    lastWorkerResponse: sourcePayload ? cloneDeep(sourcePayload) : null,
    lastNormalisedSections: Array.isArray(lastSections) ? cloneDeep(lastSections) : []
  };
  if (typeof window !== "undefined") {
    window.__depotVoiceNotesDebug = snapshot;
    window.__depotDebug = {
      lastWorkerResponse: snapshot.lastWorkerResponse,
      sections: snapshot.lastNormalisedSections
    };
  }
  updateDebugView();
}

function setWorkerDebugPayload(payload) {
  if (payload) {
    lastWorkerPayload = cloneDeep(payload);
  } else {
    lastWorkerPayload = null;
  }
  renderWorkerDebug();
  updateDebugSnapshot();
}

function requireWorkerBaseUrl() {
  const trimmed = (WORKER_URL || "").trim();
  if (!trimmed) {
    const err = new Error("Worker URL not configured");
    err.voiceMessage = "Voice AI worker URL not configured. Contact your admin.";
    throw err;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    const err = new Error("Worker URL must start with http:// or https://");
    err.voiceMessage = "Voice AI worker URL looks invalid. Contact your admin.";
    throw err;
  }
  return trimmed.replace(/\/$/, "");
}

async function postJSON(path, body) {
  const base = requireWorkerBaseUrl();
  const url = base + path;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res;
}

// Internet speed measurement function
async function measureInternetSpeed() {
  if (speedTestInProgress) return;
  speedTestInProgress = true;

  const speedBadge = document.getElementById("internetSpeedBadge");
  const chunkIntervalDisplay = document.getElementById("chunkIntervalDisplay");

  try {
    // Test with a small payload to the worker
    const testPayload = {
      transcript: "Speed test",
      alreadyCaptured: [],
      expectedSections: [],
      sectionHints: {},
      forceStructured: false
    };

    const startTime = performance.now();
    const base = requireWorkerBaseUrl();
    const res = await fetch(base + "/health", {
      method: "GET"
    });
    const endTime = performance.now();

    const latency = endTime - startTime;

    // Classify speed based on latency
    if (latency < 200) {
      internetSpeed = "fast";
      currentChunkInterval = 10000; // 10 seconds for fast connection
      if (speedBadge) {
        speedBadge.textContent = "🟢 Fast";
        speedBadge.className = "speed-badge fast";
      }
    } else if (latency < 500) {
      internetSpeed = "medium";
      currentChunkInterval = 20000; // 20 seconds for medium connection
      if (speedBadge) {
        speedBadge.textContent = "🟡 Medium";
        speedBadge.className = "speed-badge medium";
      }
    } else {
      internetSpeed = "slow";
      currentChunkInterval = 30000; // 30 seconds for slow connection
      if (speedBadge) {
        speedBadge.textContent = "🔴 Slow";
        speedBadge.className = "speed-badge slow";
      }
    }

    if (chunkIntervalDisplay) {
      chunkIntervalDisplay.textContent = `Chunk: ${currentChunkInterval / 1000}s`;
    }

    lastSpeedTest = Date.now();
    console.log(`Internet speed: ${internetSpeed}, latency: ${latency.toFixed(0)}ms, chunk interval: ${currentChunkInterval}ms`);
  } catch (err) {
    console.error("Speed test failed:", err);
    internetSpeed = "unknown";
    currentChunkInterval = LIVE_CHUNK_INTERVAL_MS; // Use default
    if (speedBadge) {
      speedBadge.textContent = "⚠️ Unknown";
      speedBadge.className = "speed-badge testing";
    }
    if (chunkIntervalDisplay) {
      chunkIntervalDisplay.textContent = `Chunk: ${currentChunkInterval / 1000}s`;
    }
  } finally {
    speedTestInProgress = false;
  }
}

// Periodically test internet speed
async function startSpeedMonitoring() {
  await measureInternetSpeed();
  setInterval(() => {
    if (Date.now() - lastSpeedTest >= SPEED_TEST_INTERVAL) {
      measureInternetSpeed();
    }
  }, SPEED_TEST_INTERVAL);
}

async function startAudioCapture(resetChunks = false) {
  if (!navigator.mediaDevices || typeof window.MediaRecorder === "undefined") {
    console.warn("MediaRecorder not supported; audio backup disabled.");
    return;
  }
  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }
  try {
    if (resetChunks) {
      sessionAudioChunks = [];
    } else if (!Array.isArray(sessionAudioChunks)) {
      sessionAudioChunks = [];
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : undefined;
    mediaRecorder = new MediaRecorder(mediaStream, options);
    lastAudioMime = mediaRecorder.mimeType || (options && options.mimeType) || lastAudioMime || "audio/webm";
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        sessionAudioChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      mediaRecorder = null;
    };
    mediaRecorder.start();
  } catch (err) {
    console.error("Audio capture error", err);
    showSleepWarning("Audio backup could not start; text capture still running.");
  }
}

function stopAudioCapture() {
  try {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  } catch (err) {
    console.warn("Error stopping audio capture", err);
  }
  if (mediaRecorder && mediaRecorder.state !== "recording") {
    mediaRecorder = null;
  }
  if (mediaStream) {
    try {
      mediaStream.getTracks().forEach((track) => track.stop());
    } catch (trackErr) {
      console.warn("Failed to stop media tracks", trackErr);
    }
    mediaStream = null;
  }
}

function normaliseChecklistConfig(items) {
  if (items && typeof items === "object" && !Array.isArray(items) && Array.isArray(items.items)) {
    return normaliseChecklistConfig(items.items);
  }
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (!item) return null;
    const id = item.id != null ? String(item.id).trim() : "";
    if (!id) return null;
    return {
      id,
      group: item.group || item.category || "Checklist",
      section: item.section || item.sectionName || "",
      label: item.label || item.name || id,
      hint: item.hint || item.description || ""
    };
  }).filter(Boolean);
}

function deriveSectionHints() {
  const hints = {};
  const addHint = (rawKey, sectionName) => {
    const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : String(rawKey || "").trim().toLowerCase();
    const section = typeof sectionName === "string" ? sectionName.trim() : String(sectionName || "").trim();
    if (!key || !section || hints[key]) return;
    hints[key] = section;
  };

  SECTION_SCHEMA.forEach(sec => {
    if (!sec || !sec.name) return;
    addHint(sec.name, sec.name);
    const tokens = String(sec.name)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);
    tokens.forEach(token => addHint(token, sec.name));
  });

  CHECKLIST_ITEMS.forEach(item => {
    if (!item) return;
    const sectionName = (item.section || "").trim();
    if (!sectionName) return;
    addHint(item.id, sectionName);
    const textBits = [item.label || "", item.hint || ""]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);
    textBits.forEach(token => addHint(token, sectionName));
  });

  return hints;
}

function buildVoiceRequestPayload(transcript, schema = SECTION_SCHEMA) {
  const existingSections = Array.isArray(lastRawSections)
    ? lastRawSections
        .map(sec => {
          if (!sec || typeof sec !== "object") return null;
          const section = typeof sec.section === "string" ? sec.section.trim() : String(sec.section || "").trim();
          if (!section) return null;
          return {
            section,
            plainText: typeof sec.plainText === "string" ? sec.plainText : String(sec.plainText || ""),
            naturalLanguage: typeof sec.naturalLanguage === "string" ? sec.naturalLanguage : String(sec.naturalLanguage || "")
          };
        })
        .filter(sec => sec && sec.section.toLowerCase() !== "arse_cover_notes")
    : [];

  const canonicalSchema = Array.isArray(schema) ? schema : [];
  const expectedSections = canonicalSchema
    .map(sec => (sec && sec.name ? String(sec.name).trim() : ""))
    .filter(Boolean);

  return {
    transcript,
    alreadyCaptured: existingSections,
    expectedSections,
    sectionHints: deriveSectionHints(),
    forceStructured: true,
    checklistItems: CHECKLIST_SOURCE,
    depotSections: canonicalSchema
  };
}

function normaliseSectionsFromResponse(data, _schema = SECTION_SCHEMA) {
  if (!data || typeof data !== "object") {
    return normaliseDepotSections([]);
  }
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : (data.depotNotes && Array.isArray(data.depotNotes.sections))
      ? data.depotNotes.sections
      : Array.isArray(data.notes)
        ? data.notes
        : [];
  const normalised = normaliseDepotSections(rawSections);
  data.sections = normalised;
  return normalised;
}

// Plaintext shaping helpers
function ensureSemi(s){ s=String(s||"").trim(); return s ? (s.endsWith(";")?s:s+";") : s; }
function splitClauses(text){
  return String(text||"")
    .split(/[\n;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
function stripPreamble(line){
  let s = String(line||"").trim();
  s = s
    .replace(/^(then|next|first|second|after|before|finally|so)\b[:,\s-]*/i, "")
    .replace(/^(we(?:'|’)ll|we will|i(?:'|’)ll|engineer will|installer will|we need to|need to|we can|we should)\b[:,\s-]*/i, "")
    .replace(/^(please|note|recommended to)\b[:,\s-]*/i, "");
  s = s.replace(/\bwill need to\b/gi, "required to");
  return s.trim();
}
function bulletify(lines){
  const out=[];
  for (let raw of lines){
    const t = stripPreamble(raw);
    if (!t) continue;
    out.push("• " + ensureSemi(t));
  }
  return out.join("\n");
}
function formatPlainTextForSection(section, plain){
  if (!plain) return "";
  return bulletify(splitClauses(plain));
}

function renderPartsList(materials) {
  lastMaterials = Array.isArray(materials) ? materials.slice() : [];
  if (!partsListEl) return;
  partsListEl.innerHTML = "";
  if (!lastMaterials.length) {
    partsListEl.innerHTML = `<span class="small">No suggestions yet.</span>`;
    return;
  }
  const byCategory = new Map();
  lastMaterials.forEach(item => {
    const cat = item.category || "Misc";
    const arr = byCategory.get(cat) || [];
    arr.push(item);
    byCategory.set(cat, arr);
  });
  byCategory.forEach((items, cat) => {
    const h = document.createElement("div");
    h.className = "small";
    h.style.fontWeight = "600";
    h.style.margin = "4px 0 2px";
    h.textContent = cat;
    partsListEl.appendChild(h);
    const ul = document.createElement("ul");
    ul.style.margin = "0 0 4px 14px";
    ul.style.padding = "0";
    ul.style.listStyle = "disc";
    items.forEach(p => {
      const li = document.createElement("li");
      li.style.fontSize = ".68rem";
      const detail = [];
      if (p.item) detail.push(p.item);
      if (p.qty && Number(p.qty) !== 1) detail.push(`× ${p.qty}`);
      if (p.notes) detail.push(p.notes);
      li.textContent = detail.length ? detail.join(" — ") : (p.item || "Item");
      ul.appendChild(li);
    });
    partsListEl.appendChild(ul);
  });
}

function postProcessSections(sections) {
  const orderFor = (name) => {
    if (!name) return Number.MAX_SAFE_INTEGER;
    const resolved = resolveRequiredSectionName(name) || name;
    if (SECTION_ORDER_MAP.has(resolved)) {
      return SECTION_ORDER_MAP.get(resolved);
    }
    return Number.MAX_SAFE_INTEGER;
  };

  const out = [];
  const seen = new Set();
  (Array.isArray(sections) ? sections : []).forEach(sec => {
    if (!sec || !sec.section) return;
    const name = String(sec.section).trim();
    if (!name || name.toLowerCase() === "arse_cover_notes") return;
    const resolved = resolveRequiredSectionName(name) || name;
    if (!resolved || (SECTION_ORDER_MAP.size && !SECTION_ORDER_MAP.has(resolved))) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);
    out.push({
      section: resolved,
      plainText: sec.plainText || "",
      naturalLanguage: sec.naturalLanguage || ""
    });
  });
  out.sort((a, b) => {
    const diff = orderFor(a.section) - orderFor(b.section);
    return diff !== 0 ? diff : a.section.localeCompare(b.section);
  });
  out.forEach(sec => {
    if (sec.plainText) sec.plainText = formatPlainTextForSection(sec.section, sec.plainText);
  });
  return out;
}

function renderChecklist(container, checkedIds, missingInfoFromServer) {
  const checkedSet = new Set((checkedIds || []).map(String));
  const questions = Array.isArray(missingInfoFromServer) ? missingInfoFromServer : [];
  container.innerHTML = "";

  if (!CHECKLIST_ITEMS.length && !checkedSet.size && !questions.length) {
    container.innerHTML = `<span class="small">No checklist items.</span>`;
    return;
  }

  const byGroup = new Map();
  const knownIds = new Set();
  CHECKLIST_ITEMS.forEach(item => {
    const group = item.group || "Checklist";
    const arr = byGroup.get(group) || [];
    knownIds.add(String(item.id));
    arr.push({
      id: item.id,
      section: item.section || "",
      label: item.label || item.id,
      hint: item.hint || "",
      done: checkedSet.has(String(item.id))
    });
    byGroup.set(group, arr);
  });

  const unknownFromAi = Array.from(checkedSet).filter(id => id && !knownIds.has(id));
  if (unknownFromAi.length) {
    const arr = unknownFromAi.map(id => ({
      id,
      section: "",
      label: String(id),
      hint: "",
      done: true
    }));
    byGroup.set("Other (from AI)", arr);
  }

  if (!byGroup.size && !questions.length) {
    container.innerHTML = `<span class="small">No checklist items.</span>`;
    return;
  }

  [...byGroup.entries()].forEach(([groupName, items]) => {
    const header = document.createElement("div");
    header.className = "check-group-title";
    header.innerHTML = `<span>${groupName}</span><span>${items[0].section || ""}</span>`;
    container.appendChild(header);

    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "clar-chip checklist-item" + (item.done ? " done" : "");
      div.innerHTML = `
        <span class="icon">${item.done ? "✅" : "⭕"}</span>
        <span class="label">
          ${item.label}
          <span class="hint">
            ${item.hint || ""}
            ${item.section ? ` • <strong>${item.section}</strong>` : ""}
          </span>
        </span>
      `;
      container.appendChild(div);
    });
  });

  if (questions.length) {
    const sep = document.createElement("div");
    sep.className = "small";
    sep.style.marginTop = "6px";
    sep.textContent = "Additional questions:";
    container.appendChild(sep);
    questions.forEach(q => {
      const div = document.createElement("div");
      div.className = "clar-chip";
      div.dataset.target = q.target || "expert";
      div.innerHTML = `<strong>${q.target || "expert"}:</strong> ${q.question}`;
      container.appendChild(div);
    });
  }
}

async function loadChecklistConfigIntoState() {
  try {
    CHECKLIST_SOURCE = await loadChecklistConfig();
  } catch (err) {
    console.warn("Failed to load checklist config; falling back to empty list.", err);
    CHECKLIST_SOURCE = [];
  }

  CHECKLIST_ITEMS = normaliseChecklistConfig(CHECKLIST_SOURCE);

  console.log("Checklist items in main app:", CHECKLIST_ITEMS.length);

  // Re-render checklist immediately so you see items even before the AI ticks anything
  renderChecklist(clarificationsEl, lastCheckedItems, lastMissingInfo);
}

// NOTE: Assumes SECTION_SCHEMA has been populated via loadStaticConfig()/ensureSectionSchema().
// This allows placeholder sections (schema headings) to appear before any worker output arrives.
function refreshUiFromState() {
  // 1) Customer summary
  customerSummaryEl.textContent = lastCustomerSummary || "(none)";

  // 2) Render sections from the canonical state
  let resolved = Array.isArray(lastSections) ? lastSections : [];
  if (!resolved.length && getCanonicalSectionNames().length) {
    syncSectionsState(lastRawSections);
    resolved = Array.isArray(lastSections) ? lastSections : [];
  }

  const sectionsToRender = resolved.length ? resolved : normaliseDepotSections([]);
  sectionsListEl.innerHTML = "";
  sectionsToRender.forEach((sec) => {
    const div = document.createElement("div");
    div.className = "section-item";
    const plainTextRaw = typeof sec.plainText === "string" ? sec.plainText : "";
    const formattedPlain = plainTextRaw
      ? formatPlainTextForSection(sec.section, plainTextRaw).trim()
      : "";
    const naturalLanguage = typeof sec.naturalLanguage === "string" ? sec.naturalLanguage.trim() : "";
    const preClassAttr = formattedPlain ? "" : " class=\"placeholder\"";
    const naturalMarkup = naturalLanguage
      ? `<p class="small" style="margin-top:3px;">${naturalLanguage}</p>`
      : "";
    div.innerHTML = `
      <h4>${sec.section}</h4>
      <pre${preClassAttr}>${formattedPlain || "No bullets yet."}</pre>
      ${naturalMarkup}
    `;
    sectionsListEl.appendChild(div);
  });

  // 3) Parts + checklist
  renderPartsList(lastMaterials);
  renderChecklist(clarificationsEl, lastCheckedItems, lastMissingInfo);
}

function applyVoiceResult(result) {
  if (!result || typeof result !== "object") {
    showVoiceError("AI gave an empty result.");
    return;
  }

  const prevSections = cloneDeep(lastRawSections || []);
  const prevMaterials = Array.isArray(lastMaterials) ? lastMaterials.slice() : [];
  const prevSummary = lastCustomerSummary;
  const prevChecked = Array.isArray(lastCheckedItems) ? lastCheckedItems.slice() : [];
  const prevMissing = Array.isArray(lastMissingInfo) ? lastMissingInfo.slice() : [];

  let updated = false;

  const sectionsCandidateRaw = Array.isArray(result.sections)
    ? result.sections
    : (result.depotNotes && Array.isArray(result.depotNotes.sections))
      ? result.depotNotes.sections
      : [];
  const { merged: mergedSections, incomingCount: incomingSectionsCount } = mergeSectionsPreservingRequired(
    prevSections,
    sectionsCandidateRaw
  );
  const prevSectionsJson = JSON.stringify(prevSections);
  const mergedSectionsJson = JSON.stringify(mergedSections);
  if (mergedSectionsJson !== prevSectionsJson) {
    updated = true;
  }
  lastRawSections = cloneDeep(mergedSections);
  syncSectionsState(lastRawSections);

  if (Array.isArray(result.materials) && result.materials.length) {
    lastMaterials = result.materials.slice();
    updated = true;
  } else if (result.materials === undefined) {
    lastMaterials = prevMaterials;
  } else {
    lastMaterials = prevMaterials;
  }

  if (Array.isArray(result.checkedItems)) {
    lastCheckedItems = result.checkedItems.slice();
  } else if (result.checkedItems === undefined) {
    lastCheckedItems = prevChecked;
  }

  if (Array.isArray(result.missingInfo)) {
    lastMissingInfo = result.missingInfo.slice();
  } else if (result.missingInfo === undefined) {
    lastMissingInfo = prevMissing;
  }

  const summaryCandidate =
    typeof result.customerSummary === "string"
      ? result.customerSummary
      : typeof result.summary === "string"
        ? result.summary
        : null;
  if (summaryCandidate !== null) {
    lastCustomerSummary = summaryCandidate;
    updated = true;
  } else {
    lastCustomerSummary = prevSummary;
  }

  if (updated) {
    clearVoiceError();
  } else {
    const hasMaterials = Array.isArray(result.materials)
      ? result.materials.length > 0
      : !!result.materials;
    if (!incomingSectionsCount && !hasMaterials) {
      showVoiceError("AI didn’t return any depot notes. Existing notes kept.");
    }
  }

  refreshUiFromState();
}

async function sendText() {
  const transcript = transcriptInput.value.trim();
  if (!transcript) return;
  setStatus("Sending text…");
  clearVoiceError();
  try {
    const schemaSnapshot = await ensureSectionSchema();
    const res = await postJSON("/text", buildVoiceRequestPayload(transcript, schemaSnapshot));
    const raw = await res.text();
    if (!res.ok) {
      const snippet = raw ? `: ${raw.slice(0, 200)}` : "";
      throw new Error(`Worker error ${res.status} ${res.statusText}${snippet}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Voice worker returned non-JSON:", raw);
      const parseError = new Error("AI response wasn't in the expected format. Please try again.");
      parseError.voiceMessage = parseError.message;
      throw parseError;
    }
    setWorkerDebugPayload(data);
    normaliseSectionsFromResponse(data, schemaSnapshot);
    applyVoiceResult(data);
    setStatus("Done.");
    committedTranscript = transcript;
    lastSentTranscript = transcript;
  } catch (err) {
    console.error(err);
    const message = err && err.voiceMessage
      ? err.voiceMessage
      : "Voice AI failed: " + (err && err.message ? err.message : "Unknown error");
    showVoiceError(message);
    setStatus("Text send failed.");
  }
}

async function sendAudio(blob) {
  setStatus("Uploading audio…");
  clearVoiceError();
  try {
    const schemaSnapshot = await ensureSectionSchema();
    const baseUrl = requireWorkerBaseUrl();
    const res = await fetch(baseUrl + "/audio", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob
    });
    const raw = await res.text();
    if (!res.ok) {
      const snippet = raw ? `: ${raw.slice(0, 200)}` : "";
      throw new Error(`Worker error ${res.status} ${res.statusText}${snippet}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Voice worker returned non-JSON:", raw);
      const parseError = new Error("AI response wasn't in the expected format. Please try again.");
      parseError.voiceMessage = parseError.message;
      throw parseError;
    }
    setWorkerDebugPayload(data);
    normaliseSectionsFromResponse(data, schemaSnapshot);
    applyVoiceResult(data);
    setStatus("Audio processed.");
  } catch (err) {
    console.error(err);
    const message = err && err.voiceMessage
      ? err.voiceMessage
      : "Voice AI failed: " + (err && err.message ? err.message : "Unknown error");
    showVoiceError(message);
    setStatus("Audio failed.");
    throw err;
  }
}

// --- EXPORT / SESSION / AUDIO IMPORT ---
exportBtn.onclick = async () => {
  setStatus("Preparing notes…");
  const payload = {
    exportedAt: new Date().toISOString(),
    sections: lastSections || []
  };
  const pretty = JSON.stringify(payload, null, 2);
  const blob = new Blob([pretty], { type: "application/json" });
  const defaultName = "depot-notes";
  const userName = prompt("File name (without extension):", defaultName);
  if (userName === null) {
    setStatus("Export cancelled.");
    return;
  }
  const safeName = (userName || defaultName).replace(/[^a-z0-9_\-]+/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${safeName}-${timestamp}.json`;
  const fileForShare = new File([blob], filename, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [fileForShare] })) {
    try {
      await navigator.share({ files: [fileForShare] });
      setStatus("Notes shared.");
      return;
    } catch (err) {
      console.error("Share failed", err);
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setStatus("Notes downloaded.");
};

// --- CREATE QUOTE ---
createQuoteBtn.onclick = async () => {
  // Check if we have materials to quote
  if (!lastMaterials || lastMaterials.length === 0) {
    alert("No materials found to create a quote. Please process a transcript first with the 'Send text' button.");
    return;
  }

  setStatus("Loading pricebook...");

  try {
    // Load pricebook
    const pricebook = await loadPricebook();

    // Auto-detect core pack from transcript/sections
    const systemDetails = detectSystemDetails();
    const recommendedPack = findCorePack(pricebook, systemDetails);

    setStatus("Select core pack...");

    // Show pack selector modal first
    showPackSelectorModal(
      pricebook,
      systemDetails,
      recommendedPack,
      // onConfirm callback - receives selected pack (or null if skipped)
      async (selectedPack) => {
        // Combine selected pack with other materials
        let allMaterials = [...lastMaterials];
        if (selectedPack) {
          allMaterials.unshift({
            category: 'Core Packs',
            item: selectedPack.description,
            qty: 1,
            notes: `Selected: ${selectedPack.component_id}`
          });
        }

        // Match materials to pricebook items
        const matchedItems = matchMaterialsToPricebook(pricebook, allMaterials);

        setStatus("Review quote items...");

        // Extract customer name and job reference from transcript/sections
        const customerInfo = extractCustomerInfo();

        // Detect if multiple quotes are discussed
        const allowMultipleQuotes = detectMultipleQuotesInTranscript();

        // Show quote builder modal
        showQuoteBuilderModal(pricebook, matchedItems, {
          customerName: customerInfo.name,
          jobReference: customerInfo.reference,
          allowMultipleQuotes,
          onConfirm: async (quoteData) => {
            setStatus("Generating PDF quote(s)...");

            try {
              const pdfs = await generateMultipleQuotePDFs(quoteData);

              // Download each PDF
              pdfs.forEach(({ doc, filename }) => {
                downloadPDF(doc, filename);
              });

              setStatus(`Quote PDF${pdfs.length > 1 ? 's' : ''} generated successfully!`);
            } catch (error) {
              console.error("Error generating PDF:", error);
              alert("Error generating PDF: " + error.message);
              setStatus("Error generating PDF.");
            }
          },
          onCancel: () => {
            setStatus("Quote creation cancelled.");
          }
        });
      },
      // onCancel callback - user cancelled pack selection
      () => {
        setStatus("Pack selection cancelled.");
      }
    );

  } catch (error) {
    console.error("Error creating quote:", error);
    alert("Error creating quote: " + error.message);
    setStatus("Error creating quote.");
  }
};

// Helper: Detect system details from transcript and sections
function detectSystemDetails() {
  const transcript = transcriptInput.value.toLowerCase();
  const details = {
    systemType: 'Full System',
    boilerKw: 18,
    isCombiToCombi: false,
    isConventionalToCombi: false
  };

  // Detect system type
  if (transcript.includes('part') && (transcript.includes('central') || transcript.includes('pch'))) {
    details.systemType = 'Part System';
  }

  // Detect replacement type
  if (transcript.includes('combi to combi') || (transcript.includes('replace') && transcript.includes('combi'))) {
    details.isCombiToCombi = true;
  }
  if (transcript.includes('conventional to combi')) {
    details.isConventionalToCombi = true;
  }

  // Detect boiler kW from sections or materials
  const kwMatches = transcript.match(/(\d+)\s*kw/i);
  if (kwMatches) {
    details.boilerKw = parseInt(kwMatches[1]);
  } else {
    // Check materials for boiler specifications
    lastMaterials.forEach(material => {
      const itemText = (material.item || '').toLowerCase();
      const kwMatch = itemText.match(/(\d+)\s*kw/i);
      if (kwMatch) {
        details.boilerKw = parseInt(kwMatch[1]);
      }
    });
  }

  return details;
}

// Helper: Extract customer info from transcript
function extractCustomerInfo() {
  const info = {
    name: '',
    reference: ''
  };

  // Try to extract from customer summary
  if (lastCustomerSummary) {
    const nameMatch = lastCustomerSummary.match(/(?:customer|client|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (nameMatch) {
      info.name = nameMatch[1];
    }
  }

  // Try to extract from sections
  if (lastSections && lastSections.length > 0) {
    lastSections.forEach(section => {
      if (section.title && section.title.toLowerCase().includes('customer')) {
        const content = section.content || '';
        const nameMatch = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (nameMatch) {
          info.name = nameMatch[1];
        }
      }
    });
  }

  // Generate reference from date if not found
  if (!info.reference) {
    const date = new Date();
    info.reference = `JOB-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }

  return info;
}

// Helper: Detect if multiple quotes are discussed in transcript
function detectMultipleQuotesInTranscript() {
  const transcript = transcriptInput.value.toLowerCase();

  // Look for phrases indicating multiple options
  const multipleQuoteIndicators = [
    'two quotes',
    'two options',
    'option 1',
    'option 2',
    'quote 1',
    'quote 2',
    'first option',
    'second option',
    'alternative',
    'or alternatively'
  ];

  return multipleQuoteIndicators.some(indicator => transcript.includes(indicator));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, mime) {
  const byteChars = atob(b64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNums);
  return new Blob([byteArray], { type: mime || "application/octet-stream" });
}

async function saveSessionToFile() {
  const fullTranscript = transcriptInput.value.trim() || committedTranscript || "";
  const session = {
    version: 1,
    createdAt: new Date().toISOString(),
    fullTranscript,
    sections: lastRawSections,
    materials: lastMaterials,
    checkedItems: lastCheckedItems,
    missingInfo: lastMissingInfo,
    customerSummary: lastCustomerSummary
  };

  if (sessionAudioChunks && sessionAudioChunks.length > 0) {
    try {
      const mime = lastAudioMime || (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
      const audioBlob = new Blob(sessionAudioChunks, { type: mime });
      const base64 = await blobToBase64(audioBlob);
      session.audioMime = mime;
      session.audioBase64 = base64;
    } catch (err) {
      console.warn("Failed to attach audio to session", err);
    }
  }
  const jsonStr = JSON.stringify(session, null, 2);
  const fileBlob = new Blob([jsonStr], { type: "application/json" });
  const defaultName = "depot-voice-session";
  const userName = prompt("Session file name (without extension):", defaultName);
  if (userName === null) return;
  const safeName = (userName || defaultName).replace(/[^a-z0-9_\-]+/gi, "-");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${safeName}-${ts}.depotvoice.json`;
  const url = URL.createObjectURL(fileBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

saveSessionBtn.onclick = saveSessionToFile;

function autoSaveSessionToLocal() {
  try {
    const fullTranscript = (transcriptInput.value || "").trim();
    const hasContent =
      fullTranscript ||
      (Array.isArray(lastRawSections) && lastRawSections.length) ||
      (Array.isArray(lastMaterials) && lastMaterials.length) ||
      (Array.isArray(lastCheckedItems) && lastCheckedItems.length) ||
      (Array.isArray(lastMissingInfo) && lastMissingInfo.length) ||
      (lastCustomerSummary && lastCustomerSummary.trim());

    if (!hasContent) {
      localStorage.removeItem(LS_AUTOSAVE_KEY);
      return;
    }

    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      fullTranscript,
      sections: lastRawSections,
      materials: lastMaterials,
      checkedItems: lastCheckedItems,
      missingInfo: lastMissingInfo,
      customerSummary: lastCustomerSummary
    };

    localStorage.setItem(LS_AUTOSAVE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("Auto-save failed", err);
  }
}

importAudioBtn.onclick = () => importAudioInput.click();
importAudioInput.onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await sendAudio(file);
  } catch (_) {}
  importAudioInput.value = "";
};

loadSessionBtn.onclick = () => loadSessionInput.click();
loadSessionInput.onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    stopAudioCapture();
    const text = await file.text();
    const session = JSON.parse(text);
    transcriptInput.value = session.fullTranscript || "";
    committedTranscript = transcriptInput.value.trim();
    lastSentTranscript = committedTranscript;
    lastRawSections = Array.isArray(session.sections) ? session.sections : [];
    lastMaterials = Array.isArray(session.materials) ? session.materials : [];
    lastCheckedItems = Array.isArray(session.checkedItems) ? session.checkedItems : [];
    lastMissingInfo = Array.isArray(session.missingInfo) ? session.missingInfo : [];
    lastCustomerSummary = session.customerSummary || "";
    if (session.audioBase64) {
      try {
        const mime = session.audioMime || "audio/webm";
        const audioBlob = base64ToBlob(session.audioBase64, mime);
        sessionAudioChunks = [audioBlob];
        lastAudioMime = mime || audioBlob.type || "audio/webm";
      } catch (audioErr) {
        console.warn("Failed to restore audio from session", audioErr);
        sessionAudioChunks = [];
      }
    } else {
      sessionAudioChunks = [];
      lastAudioMime = null;
    }
    mediaStream = null;
    mediaRecorder = null;
    await ensureSectionSchema();
    const normalisedFromSession = normaliseSectionsFromResponse({ sections: lastRawSections }, SECTION_SCHEMA);
    lastRawSections = Array.isArray(normalisedFromSession) ? normalisedFromSession : [];
    syncSectionsState(lastRawSections);
    refreshUiFromState();
    setWorkerDebugPayload(null);
    setStatus("Session loaded.");
    clearSleepWarning();
  } catch (err) {
    console.error(err);
    showVoiceError("Could not load session file: " + (err.message || "Unknown error"));
  } finally {
    loadSessionInput.value = "";
  }
};

// --- LIVE SPEECH (on-device) ---
function updateTextareaFromBuffers() {
  const committed = committedTranscript.trim();
  const interim = interimTranscript.trim();
  const parts = [];
  if (committed) parts.push(committed);
  if (interim) parts.push(interim);
  const combined = parts.join(parts.length > 1 ? " " : "");
  transcriptInput.value = combined.trim();
}

function updateLiveControls() {
  if (!startLiveBtn || !pauseLiveBtn || !finishLiveBtn) return;
  if (!SpeechRec || !recognition) {
    startLiveBtn.disabled = true;
    pauseLiveBtn.disabled = true;
    finishLiveBtn.disabled = true;
    pauseLiveBtn.textContent = "Pause";
    return;
  }
  const running = liveState === "running";
  const paused = liveState === "paused";
  startLiveBtn.disabled = running || paused;
  pauseLiveBtn.disabled = liveState === "idle";
  finishLiveBtn.disabled = liveState === "idle";
  pauseLiveBtn.textContent = paused ? "Resume" : "Pause";
}

async function completeLiveSessionIfNeeded(message = "Live session finished.") {
  if (!pendingFinishSend) return;
  pendingFinishSend = false;
  committedTranscript = transcriptInput.value.trim();
  const ok = await sendTranscriptChunkToWorker(true);
  if (ok) {
    setStatus(message);
  }
}

if (SpeechRec) {
  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-GB";

  recognition.onstart = () => {
    recognitionActive = true;
    console.log("Speech recognition started and active");
  };

  recognition.onresult = (event) => {
    let sawFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (!r || !r[0]) continue;
      const text = r[0].transcript ? r[0].transcript.trim() : "";
      if (!text) continue;
      if (r.isFinal) {
        committedTranscript = committedTranscript
          ? `${committedTranscript} ${text}`.replace(/\s+/g, " ").trim()
          : text;
        interimTranscript = "";
        sawFinal = true;
        console.log("Final transcript:", text);
      } else {
        interimTranscript = text;
        console.log("Interim transcript:", text);
      }
    }
    updateTextareaFromBuffers();
    if (sawFinal && liveState === "running") {
      scheduleNextChunk();
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event);
    recognitionActive = false;
    shouldRestartRecognition = false;
    clearChunkTimer();
    if (liveState !== "idle") {
      const reason = event && event.error ? `: ${event.error}` : "";
      showVoiceError(`Speech recognition error${reason}`);
      liveState = "idle";
      updateLiveControls();
      setStatus("Speech error.");
      stopAudioCapture();
    }
  };

  recognition.onend = async () => {
    recognitionActive = false;
    const stopMode = recognitionStopMode;
    recognitionStopMode = null;
    if (stopMode === "pause") {
      updateTextareaFromBuffers();
      const pauseMsg = pauseReason === "background"
        ? "Paused (app in background)."
        : "Paused (live)";
      setStatus(pauseMsg);
      return;
    }
    if (stopMode === "finish") {
      updateTextareaFromBuffers();
      await completeLiveSessionIfNeeded();
      return;
    }
    if (liveState === "running" && shouldRestartRecognition) {
      try {
        recognition.start();
      } catch (err) {
        console.error("Speech recognition restart failed", err);
        liveState = "idle";
        shouldRestartRecognition = false;
        updateLiveControls();
        showVoiceError("Could not restart speech recognition.");
        setStatus("Speech stopped.");
        stopAudioCapture();
      }
      return;
    }
    if (pendingFinishSend) {
      updateTextareaFromBuffers();
      await completeLiveSessionIfNeeded();
    }
  };
} else {
  if (startLiveBtn && pauseLiveBtn && finishLiveBtn) {
    const msg = "This browser does not support on-device speech recognition.";
    startLiveBtn.disabled = true;
    pauseLiveBtn.disabled = true;
    finishLiveBtn.disabled = true;
    startLiveBtn.title = msg;
    pauseLiveBtn.title = msg;
    finishLiveBtn.title = msg;
  }
}

async function startLiveSession() {
  if (!SpeechRec || !recognition) {
    console.error("Speech recognition not available. SpeechRec:", SpeechRec, "recognition:", recognition);
    showVoiceError("On-device speech recognition not supported in this browser. Try Chrome, Edge, or Safari.");
    return;
  }
  if (liveState === "running") {
    console.log("Session already running");
    return;
  }
  console.log("Starting live transcription session...");
  clearSleepWarning();
  wasBackgroundedDuringSession = false;
  pauseReason = null;
  committedTranscript = transcriptInput.value.trim();
  interimTranscript = "";
  updateTextareaFromBuffers();
  lastSentTranscript = committedTranscript;
  shouldRestartRecognition = true;
  recognitionStopMode = null;
  pendingFinishSend = false;
  clearVoiceError();
  liveState = "running";
  updateLiveControls();
  try {
    console.log("Starting speech recognition...");
    recognition.start();
    console.log("Speech recognition started successfully");
    await startAudioCapture(true);
    console.log("Audio capture started");
    setStatus("Listening… (Speak now)");
    scheduleNextChunk();
    console.log("Chunk scheduling initiated");
  } catch (err) {
    console.error("Speech recognition start failed", err);
    liveState = "idle";
    shouldRestartRecognition = false;
    updateLiveControls();
    showVoiceError("Couldn't start speech recognition: " + (err.message || "Unknown error") + ". Check browser permissions.");
    setStatus("Live session unavailable.");
    stopAudioCapture();
  }
}

function togglePauseResumeLive(reason = null) {
  if (!SpeechRec || !recognition) return;
  if (liveState === "running") {
    liveState = "paused";
    shouldRestartRecognition = false;
    recognitionStopMode = "pause";
    pauseReason = reason || "manual";
    clearChunkTimer();
    stopAudioCapture();
    updateLiveControls();
    try {
      recognition.stop();
      setStatus("Pausing…");
    } catch (err) {
      console.error("Speech recognition pause failed", err);
      recognitionStopMode = null;
      setStatus("Paused (live)");
    }
  } else if (liveState === "paused") {
    shouldRestartRecognition = true;
    recognitionStopMode = null;
    liveState = "running";
    clearVoiceError();
    clearSleepWarning();
    pauseReason = null;
    updateLiveControls();
    try {
      recognition.start();
      startAudioCapture();
      setStatus("Listening…");
      scheduleNextChunk();
    } catch (err) {
      console.error("Speech recognition resume failed", err);
      liveState = "idle";
      shouldRestartRecognition = false;
      updateLiveControls();
      showVoiceError("Couldn't resume speech recognition: " + (err.message || "Unknown error"));
      setStatus("Live session unavailable.");
      stopAudioCapture();
    }
  }
}

async function finishLiveSession() {
  clearChunkTimer();
  shouldRestartRecognition = false;
  pauseReason = null;
  wasBackgroundedDuringSession = false;
  clearSleepWarning();
  liveState = "idle";
  interimTranscript = "";
  updateTextareaFromBuffers();
  committedTranscript = transcriptInput.value.trim();
  pendingFinishSend = true;
  stopAudioCapture();
  updateLiveControls();
  setStatus("Finishing live session…");
  if (SpeechRec && recognition && recognitionActive) {
    recognitionStopMode = "finish";
    try {
      recognition.stop();
      return;
    } catch (err) {
      console.error("Speech recognition stop failed", err);
    }
  }
  recognitionStopMode = null;
  await completeLiveSessionIfNeeded();
}

async function sendTranscriptChunkToWorker(force = false) {
  const fullTranscript = transcriptInput.value.trim();
  if (!force && (!fullTranscript || fullTranscript === lastSentTranscript)) return false;
  if (!navigator.onLine) {
    setStatus("Offline – storing notes locally.");
    return false;
  }
  try {
    setStatus("Updating notes…");
    clearVoiceError();

    // Measure actual transfer speed
    const startTime = performance.now();
    const schemaSnapshot = await ensureSectionSchema();
    const res = await postJSON("/text", buildVoiceRequestPayload(fullTranscript, schemaSnapshot));
    const raw = await res.text();
    const endTime = performance.now();
    const transferTime = endTime - startTime;

    // Update speed indicator based on actual transfer
    const speedBadge = document.getElementById("internetSpeedBadge");
    const chunkIntervalDisplay = document.getElementById("chunkIntervalDisplay");

    if (transferTime < 2000) {
      internetSpeed = "fast";
      currentChunkInterval = 10000;
      if (speedBadge) {
        speedBadge.textContent = "🟢 Fast";
        speedBadge.className = "speed-badge fast";
      }
    } else if (transferTime < 5000) {
      internetSpeed = "medium";
      currentChunkInterval = 20000;
      if (speedBadge) {
        speedBadge.textContent = "🟡 Medium";
        speedBadge.className = "speed-badge medium";
      }
    } else {
      internetSpeed = "slow";
      currentChunkInterval = 30000;
      if (speedBadge) {
        speedBadge.textContent = "🔴 Slow";
        speedBadge.className = "speed-badge slow";
      }
    }

    if (chunkIntervalDisplay) {
      chunkIntervalDisplay.textContent = `Chunk: ${currentChunkInterval / 1000}s (${Math.round(transferTime)}ms)`;
    }

    if (!res.ok) {
      const snippet = raw ? `: ${raw.slice(0, 200)}` : "";
      throw new Error(`Worker error ${res.status} ${res.statusText}${snippet}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Voice worker returned non-JSON:", raw);
      showVoiceError("AI response wasn't in the expected format. Please try again.");
      return false;
    }
    setWorkerDebugPayload(data);
    normaliseSectionsFromResponse(data, schemaSnapshot);
    applyVoiceResult(data);
    lastSentTranscript = fullTranscript;
    if (liveState === "running") {
      setStatus("Listening (live)…");
    } else if (liveState === "paused") {
      setStatus("Paused (live)");
    } else {
      setStatus("Notes updated.");
    }
    return true;
  } catch (err) {
    console.error(err);
    showVoiceError("Voice AI failed: " + (err.message || "Unknown error"));
    if (liveState === "running") {
      setStatus("Update failed – will retry later.");
    } else {
      setStatus("Update failed.");
    }
    return false;
  }
}

function clearChunkTimer() {
  if (chunkTimerId) {
    clearTimeout(chunkTimerId);
    chunkTimerId = null;
  }
}

function scheduleNextChunk() {
  clearChunkTimer();
  if (liveState !== "running") return;
  chunkTimerId = setTimeout(async () => {
    await sendTranscriptChunkToWorker();
    scheduleNextChunk();
  }, currentChunkInterval); // Use adaptive interval based on internet speed
}

// --- SETTINGS ---
async function ensureSchemaIntoState() {
  try {
    // Load unified schema from js/schema.js
    const unified = await loadSchema();
    const sections = Array.isArray(unified.sections) ? unified.sections : [];

    // Build SECTION_SCHEMA using the section names, preserving their configured order
    const sectionEntries = sections.map((name, idx) => ({
      name,
      description: "",
      order: idx + 1
    }));

    const sanitised = sanitiseSectionSchema(sectionEntries);
    rebuildSectionState(sanitised);

    schemaLoaded = true;
  } catch (err) {
    console.warn("Falling back to minimal schema", err);
    const fallback = sanitiseSectionSchema([]);
    rebuildSectionState(fallback);
    schemaLoaded = true;
  }

  await loadChecklistConfigIntoState();
}

async function loadStaticConfig() {
  WORKER_URL = loadWorkerEndpoint();
  await ensureSchemaIntoState();
  refreshUiFromState();
}

if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    window.location.href = "settings.html";
  });
}

if (bugReportBtn) {
  bugReportBtn.addEventListener("click", () => {
    showBugReportModal();
  });
}

window.addEventListener("storage", (event) => {
  if (isWorkerEndpointStorageKey(event.key)) {
    WORKER_URL = loadWorkerEndpoint();
  }
  if (
    event.key === SECTION_STORAGE_KEY ||
    event.key === LEGACY_SECTION_STORAGE_KEY ||
    event.key === CHECKLIST_STORAGE_KEY
  ) {
    clearCachedSchema();
    ensureSchemaIntoState()
      .then(() => {
        refreshUiFromState();
      })
      .catch((err) => console.warn("Failed to refresh schema after storage event", err));
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    autoSaveSessionToLocal();
    if (liveState === "running") {
      wasBackgroundedDuringSession = true;
      togglePauseResumeLive("background");
    }
  } else {
    let warningShown = false;
    const autosaved = localStorage.getItem(LS_AUTOSAVE_KEY);
    if (autosaved) {
      try {
        const snap = JSON.parse(autosaved);
        if (snap && snap.fullTranscript) {
          const hasExistingContent =
            (transcriptInput.value && transcriptInput.value.trim()) ||
            (Array.isArray(lastRawSections) && lastRawSections.length) ||
            (Array.isArray(lastMaterials) && lastMaterials.length) ||
            (Array.isArray(lastCheckedItems) && lastCheckedItems.length) ||
            (Array.isArray(lastMissingInfo) && lastMissingInfo.length) ||
            (lastCustomerSummary && lastCustomerSummary.trim());
          if (!hasExistingContent) {
            transcriptInput.value = snap.fullTranscript || "";
            committedTranscript = transcriptInput.value.trim();
            lastSentTranscript = committedTranscript;
            lastRawSections = Array.isArray(snap.sections) ? snap.sections : [];
            lastMaterials = Array.isArray(snap.materials) ? snap.materials : [];
            lastCheckedItems = Array.isArray(snap.checkedItems) ? snap.checkedItems : [];
            lastMissingInfo = Array.isArray(snap.missingInfo) ? snap.missingInfo : [];
            lastCustomerSummary = snap.customerSummary || "";
            syncSectionsState(lastRawSections);
            refreshUiFromState();
          }
          showSleepWarning(
            "Phone slept or app went into the background. Live capture was paused. Check the recovered notes and tap Start for a new session or Resume to continue."
          );
          warningShown = true;
        }
      } catch (err) {
        console.warn("Failed to parse autosave", err);
      }
    }

    if (wasBackgroundedDuringSession && !warningShown) {
      showSleepWarning(
        "Phone slept or app went into the background. Live capture was paused. Check the recovered notes and tap Start for a new session or Resume to continue."
      );
      wasBackgroundedDuringSession = false;
    } else if (wasBackgroundedDuringSession) {
      wasBackgroundedDuringSession = false;
    }
  }
});

// --- BOOT ---
function resetSessionState() {
  clearChunkTimer();
  stopAudioCapture();
  if (SpeechRec && recognition) {
    try { recognition.stop(); } catch (_) {}
  }
  liveState = "idle";
  recognitionActive = false;
  shouldRestartRecognition = false;
  recognitionStopMode = null;
  pauseReason = null;
  wasBackgroundedDuringSession = false;
  pendingFinishSend = false;
  committedTranscript = "";
  interimTranscript = "";
  lastSentTranscript = "";
  transcriptInput.value = "";
  sessionAudioChunks = [];
  lastAudioMime = null;
  lastRawSections = [];
  lastSections = [];
  lastMaterials = [];
  lastCheckedItems = [];
  lastMissingInfo = [];
  lastCustomerSummary = "";
  localStorage.removeItem(LS_AUTOSAVE_KEY);
  clearVoiceError();
  clearSleepWarning();
  setWorkerDebugPayload(null);
  syncSectionsState([]);
  refreshUiFromState();
  updateLiveControls();
  setStatus("Ready for new job.");
  transcriptInput.focus?.();
}

sendTextBtn.onclick = sendText;
if (startLiveBtn) startLiveBtn.onclick = startLiveSession;
if (pauseLiveBtn) pauseLiveBtn.onclick = () => togglePauseResumeLive();
if (finishLiveBtn) finishLiveBtn.onclick = () => { finishLiveSession(); };
if (newJobBtn) {
  newJobBtn.onclick = () => {
    if (confirm("Start a new job? This will clear the current transcript and notes.")) {
      resetSessionState();
    }
  };
}
transcriptInput.addEventListener("input", () => {
  if (liveState !== "running") {
    committedTranscript = transcriptInput.value.trim();
  }
  renderChecklist(clarificationsEl, lastCheckedItems, lastMissingInfo);
});
loadStaticConfig().catch((err) => {
  console.warn("Failed initial config load", err);
});
renderChecklist(clarificationsEl, [], []);
renderWorkerDebug();
committedTranscript = transcriptInput.value.trim();
lastSentTranscript = committedTranscript;
updateLiveControls();
setStatus("Boot OK – ready to test.");

// ============================================================================
// SESSION MANAGEMENT ENHANCEMENTS
// ============================================================================

const SESSION_NAME_KEY = "depot.currentSessionName";
const SESSION_ACTIVE_KEY = "depot.sessionActive";
const SESSION_START_TIME_KEY = "depot.sessionStartTime";
const SESSION_TRANSCRIPTS_KEY = "depot.sessionTranscripts";

let currentSessionName = "";
let sessionStartTime = null;
let transcriptSegments = []; // Array of {timestamp, speaker, text}

// Get UI elements for new features
const sessionNameDisplay = document.getElementById("sessionNameDisplay");
const transcriptDisplay = document.getElementById("transcriptDisplay");
const transcriptSearch = document.getElementById("transcriptSearch");
const searchPrevBtn = document.getElementById("searchPrevBtn");
const searchNextBtn = document.getElementById("searchNextBtn");

// Modal elements
const sessionNameModal = document.getElementById("sessionNameModal");
const sessionNameInput = document.getElementById("sessionNameInput");
const confirmSessionNameBtn = document.getElementById("confirmSessionNameBtn");
const cancelSessionNameBtn = document.getElementById("cancelSessionNameBtn");
const sessionResumeModal = document.getElementById("sessionResumeModal");
const resumeSessionText = document.getElementById("resumeSessionText");
const continueSessionBtn = document.getElementById("continueSessionBtn");
const startNewFromResumeBtn = document.getElementById("startNewFromResumeBtn");
const finishSessionModal = document.getElementById("finishSessionModal");
const closeFinishModalBtn = document.getElementById("closeFinishModalBtn");

let searchMatches = [];
let currentSearchIndex = -1;

// ============================================================================
// SESSION NAME FUNCTIONS
// ============================================================================

function validateSessionName(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Only allow letters, numbers, and dashes
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
}

function setSessionName(name) {
  currentSessionName = name;
  localStorage.setItem(SESSION_NAME_KEY, name);
  if (sessionNameDisplay) {
    sessionNameDisplay.textContent = `Session: ${name}`;
    sessionNameDisplay.style.display = name ? "block" : "none";
  }
}

function getSessionName() {
  return currentSessionName || localStorage.getItem(SESSION_NAME_KEY) || "";
}

function clearSessionName() {
  currentSessionName = "";
  localStorage.removeItem(SESSION_NAME_KEY);
  localStorage.removeItem(SESSION_ACTIVE_KEY);
  localStorage.removeItem(SESSION_START_TIME_KEY);
  if (sessionNameDisplay) {
    sessionNameDisplay.style.display = "none";
  }
}

function showSessionNameModal() {
  if (sessionNameModal) {
    sessionNameModal.classList.add("active");
    if (sessionNameInput) {
      sessionNameInput.value = "";
      sessionNameInput.focus();
    }
  }
}

function hideSessionNameModal() {
  if (sessionNameModal) {
    sessionNameModal.classList.remove("active");
  }
}

function markSessionActive() {
  localStorage.setItem(SESSION_ACTIVE_KEY, "true");
  sessionStartTime = new Date().toISOString();
  localStorage.setItem(SESSION_START_TIME_KEY, sessionStartTime);
}

function isSessionActive() {
  return localStorage.getItem(SESSION_ACTIVE_KEY) === "true";
}

// ============================================================================
// TRANSCRIPT DISPLAY WITH DIARISATION
// ============================================================================

function parseTranscriptSegments(fullText) {
  if (!fullText) return [];

  const segments = [];
  const lines = fullText.split('\n').filter(l => l.trim());

  let currentTime = 0;

  lines.forEach((line, index) => {
    // Try to extract timestamp and speaker from various formats
    // Format: [00:12] Speaker: text
    // Or: Speaker: text
    // Or: plain text

    const timestampMatch = line.match(/^\[(\d+):(\d+)\]\s*/);
    const speakerMatch = line.match(/^(?:\[\d+:\d+\]\s*)?([^:]+):\s*(.+)/);

    let timestamp = null;
    let speaker = null;
    let text = line;

    if (timestampMatch) {
      const minutes = parseInt(timestampMatch[1]);
      const seconds = parseInt(timestampMatch[2]);
      timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      text = line.substring(timestampMatch[0].length);
      currentTime = minutes * 60 + seconds;
    }

    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2].trim();
    }

    // Auto-generate timestamp if not present
    if (!timestamp && index > 0) {
      currentTime += 5; // Approximate 5 seconds per segment
      const minutes = Math.floor(currentTime / 60);
      const seconds = currentTime % 60;
      timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else if (!timestamp) {
      timestamp = '00:00';
    }

    // Auto-detect speaker if not present (alternating pattern)
    if (!speaker) {
      speaker = index % 2 === 0 ? 'Expert' : 'Customer';
    }

    segments.push({ timestamp, speaker, text: text.trim() });
  });

  return segments.filter(s => s.text);
}

function renderTranscriptDisplay() {
  if (!transcriptDisplay) return;

  const fullText = transcriptInput.value.trim();

  if (!fullText) {
    transcriptDisplay.innerHTML = '<p class="small" style="color: var(--muted); padding: 8px;">No transcript yet. Start recording or enter text above.</p>';
    return;
  }

  // Parse segments from transcript
  const segments = parseTranscriptSegments(fullText);

  if (segments.length === 0) {
    // Fallback: show as plain text
    transcriptDisplay.innerHTML = `<div class="transcript-line">${escapeHtml(fullText)}</div>`;
  } else {
    // Render with diarisation
    let html = '';
    segments.forEach(seg => {
      html += `
        <div class="transcript-line">
          <span class="transcript-timestamp">[${seg.timestamp}]</span>
          <span class="transcript-speaker">${escapeHtml(seg.speaker)}:</span>
          <span>${escapeHtml(seg.text)}</span>
        </div>
      `;
    });
    transcriptDisplay.innerHTML = html;
  }

  // Auto-scroll to bottom
  transcriptDisplay.scrollTop = transcriptDisplay.scrollHeight;

  // Apply search highlighting if active
  if (transcriptSearch && transcriptSearch.value.trim()) {
    performSearch(transcriptSearch.value.trim());
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update transcript display whenever the input changes
const originalUpdateTextarea = updateTextareaFromBuffers;
window.updateTextareaFromBuffers = function() {
  if (typeof originalUpdateTextarea === 'function') {
    originalUpdateTextarea();
  }
  renderTranscriptDisplay();
};

// ============================================================================
// TRANSCRIPT SEARCH FUNCTIONALITY
// ============================================================================

function performSearch(query) {
  if (!transcriptDisplay || !query) {
    clearSearchHighlights();
    return;
  }

  const content = transcriptDisplay.innerHTML;
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');

  // Remove previous highlights
  const cleaned = content.replace(/<span class="highlight">(.*?)<\/span>/gi, '$1');

  // Add new highlights
  const highlighted = cleaned.replace(regex, '<span class="highlight">$1</span>');
  transcriptDisplay.innerHTML = highlighted;

  // Find all matches
  searchMatches = Array.from(transcriptDisplay.querySelectorAll('.highlight'));
  currentSearchIndex = searchMatches.length > 0 ? 0 : -1;

  // Enable/disable navigation buttons
  if (searchPrevBtn) searchPrevBtn.disabled = searchMatches.length === 0;
  if (searchNextBtn) searchNextBtn.disabled = searchMatches.length === 0;

  // Scroll to first match
  if (searchMatches.length > 0) {
    scrollToMatch(0);
  }
}

function clearSearchHighlights() {
  if (!transcriptDisplay) return;

  const content = transcriptDisplay.innerHTML;
  const cleaned = content.replace(/<span class="highlight">(.*?)<\/span>/gi, '$1');
  transcriptDisplay.innerHTML = cleaned;

  searchMatches = [];
  currentSearchIndex = -1;

  if (searchPrevBtn) searchPrevBtn.disabled = true;
  if (searchNextBtn) searchNextBtn.disabled = true;
}

function scrollToMatch(index) {
  if (index < 0 || index >= searchMatches.length) return;

  currentSearchIndex = index;
  const match = searchMatches[index];

  // Remove active class from all
  searchMatches.forEach(m => m.style.background = '#fef08a');

  // Highlight current
  match.style.background = '#facc15';

  // Scroll into view
  match.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wire up search events
if (transcriptSearch) {
  transcriptSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query) {
      performSearch(query);
    } else {
      clearSearchHighlights();
    }
  });
}

if (searchPrevBtn) {
  searchPrevBtn.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    const newIndex = currentSearchIndex - 1;
    scrollToMatch(newIndex < 0 ? searchMatches.length - 1 : newIndex);
  });
}

if (searchNextBtn) {
  searchNextBtn.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchMatches.length;
    scrollToMatch(newIndex);
  });
}

// ============================================================================
// FINISH SESSION MODAL
// ============================================================================

function showFinishSessionModal() {
  if (!finishSessionModal) return;

  // Populate session info
  const sessionNameEl = document.getElementById('finishSessionName');
  const sessionTimeEl = document.getElementById('finishSessionTime');
  if (sessionNameEl) {
    sessionNameEl.textContent = currentSessionName ? `Session: ${currentSessionName}` : 'Session: (no name)';
  }
  if (sessionTimeEl && sessionStartTime) {
    const start = new Date(sessionStartTime);
    const end = new Date();
    const duration = Math.round((end - start) / 1000 / 60);
    sessionTimeEl.textContent = `Started: ${start.toLocaleString()} • Duration: ${duration} minutes`;
  }

  // Populate transcript
  const finishTranscript = document.getElementById('finishTranscript');
  if (finishTranscript) {
    finishTranscript.innerHTML = transcriptDisplay ? transcriptDisplay.innerHTML : escapeHtml(transcriptInput.value);
  }

  // Populate customer summary
  const finishCustomerSummary = document.getElementById('finishCustomerSummary');
  if (finishCustomerSummary) {
    finishCustomerSummary.textContent = lastCustomerSummary || '(none)';
  }

  // Populate checklist
  const finishChecklist = document.getElementById('finishChecklist');
  if (finishChecklist) {
    renderChecklist(finishChecklist, lastCheckedItems, lastMissingInfo);
  }

  // Populate sections
  const finishSections = document.getElementById('finishSections');
  if (finishSections) {
    finishSections.innerHTML = sectionsListEl ? sectionsListEl.innerHTML : '';
  }

  // Setup audio player if available
  const finishAudioSection = document.getElementById('finishAudioSection');
  const finishAudioPlayer = document.getElementById('finishAudioPlayer');
  if (sessionAudioChunks && sessionAudioChunks.length > 0 && finishAudioPlayer) {
    const mime = lastAudioMime || "audio/webm";
    const audioBlob = new Blob(sessionAudioChunks, { type: mime });
    const audioUrl = URL.createObjectURL(audioBlob);
    finishAudioPlayer.src = audioUrl;
    if (finishAudioSection) finishAudioSection.style.display = 'block';
  } else {
    if (finishAudioSection) finishAudioSection.style.display = 'none';
  }

  finishSessionModal.classList.add('active');
}

function hideFinishSessionModal() {
  if (finishSessionModal) {
    finishSessionModal.classList.remove('active');
  }
}

// Wire up finish modal events
if (closeFinishModalBtn) {
  closeFinishModalBtn.addEventListener('click', hideFinishSessionModal);
}

// Export buttons
const copyNotesBtn = document.getElementById('copyNotesBtn');
const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
const copyEverythingBtn = document.getElementById('copyEverythingBtn');
const exportJSONBtn = document.getElementById('exportJSONBtn');

if (copyNotesBtn) {
  copyNotesBtn.addEventListener('click', () => {
    let text = 'DEPOT NOTES\n\n';
    lastSections.forEach(sec => {
      text += `${sec.section}\n`;
      text += `${sec.plainText || 'No content'}\n\n`;
    });
    navigator.clipboard.writeText(text).then(() => alert('Notes copied to clipboard!'));
  });
}

if (copyTranscriptBtn) {
  copyTranscriptBtn.addEventListener('click', () => {
    const text = transcriptInput.value.trim();
    navigator.clipboard.writeText(text).then(() => alert('Transcript copied to clipboard!'));
  });
}

if (copyEverythingBtn) {
  copyEverythingBtn.addEventListener('click', () => {
    let text = `SESSION: ${currentSessionName || '(no name)'}\n\n`;
    text += `TRANSCRIPT\n${transcriptInput.value.trim()}\n\n`;
    text += `CUSTOMER SUMMARY\n${lastCustomerSummary || '(none)'}\n\n`;
    text += `DEPOT NOTES\n`;
    lastSections.forEach(sec => {
      text += `\n${sec.section}\n`;
      text += `${sec.plainText || 'No content'}\n`;
    });
    navigator.clipboard.writeText(text).then(() => alert('Everything copied to clipboard!'));
  });
}

if (exportJSONBtn) {
  exportJSONBtn.addEventListener('click', () => {
    saveSessionToFile();
  });
}

// ============================================================================
// SESSION RESUME PROMPT
// ============================================================================

function showSessionResumeModal(sessionName) {
  if (!sessionResumeModal) return;

  if (resumeSessionText) {
    resumeSessionText.textContent = `You were in a session named "${sessionName}". Continue or start a new one?`;
  }

  sessionResumeModal.classList.add('active');
}

function hideSessionResumeModal() {
  if (sessionResumeModal) {
    sessionResumeModal.classList.remove('active');
  }
}

// Wire up resume modal events
if (continueSessionBtn) {
  continueSessionBtn.addEventListener('click', () => {
    hideSessionResumeModal();
    // Session data is already loaded from autosave
  });
}

if (startNewFromResumeBtn) {
  startNewFromResumeBtn.addEventListener('click', () => {
    hideSessionResumeModal();
    resetSessionState();
    showSessionNameModal();
  });
}

// ============================================================================
// ENHANCED START LIVE SESSION
// ============================================================================

const originalStartLiveSession = startLiveSession;
async function enhancedStartLiveSession() {
  if (!currentSessionName) {
    showSessionNameModal();
    return;
  }

  markSessionActive();
  if (originalStartLiveSession) {
    await originalStartLiveSession();
  }
}

// Session name modal handlers
if (confirmSessionNameBtn) {
  confirmSessionNameBtn.addEventListener('click', () => {
    const name = sessionNameInput.value.trim();
    const validated = validateSessionName(name);

    if (!validated) {
      alert('Invalid session name. Use only letters, numbers, and dashes.');
      return;
    }

    setSessionName(validated);
    hideSessionNameModal();
    markSessionActive();

    // Now start the live session
    if (originalStartLiveSession) {
      originalStartLiveSession();
    }
  });
}

if (cancelSessionNameBtn) {
  cancelSessionNameBtn.addEventListener('click', () => {
    hideSessionNameModal();
  });
}

// Allow Enter key to confirm
if (sessionNameInput) {
  sessionNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      confirmSessionNameBtn.click();
    }
  });
}

// Override the start live button
if (startLiveBtn) {
  startLiveBtn.onclick = enhancedStartLiveSession;
}

// ============================================================================
// ENHANCED FINISH SESSION
// ============================================================================

const originalFinishLiveSession = finishLiveSession;
async function enhancedFinishLiveSession() {
  if (originalFinishLiveSession) {
    await originalFinishLiveSession();
  }

  // Show finish modal
  setTimeout(() => {
    showFinishSessionModal();
  }, 500);

  // Mark session as inactive
  localStorage.removeItem(SESSION_ACTIVE_KEY);
}

// Override the finish live button
if (finishLiveBtn) {
  finishLiveBtn.onclick = enhancedFinishLiveSession;
}

// ============================================================================
// ENHANCED NEW JOB
// ============================================================================

const originalResetSessionState = resetSessionState;
function enhancedResetSessionState() {
  clearSessionName();
  if (originalResetSessionState) {
    originalResetSessionState();
  }
  renderTranscriptDisplay();
}

// Override the new job button
if (newJobBtn) {
  newJobBtn.onclick = () => {
    const confirmed = confirm('Start a new session? This will clear the current transcript and notes.');
    if (confirmed) {
      enhancedResetSessionState();
      showSessionNameModal();
    }
  };
}

// ============================================================================
// ENHANCED AUTOSAVE WITH SESSION RECOVERY
// ============================================================================

(async function restoreAutosaveOnLoad() {
  try {
    const autosaved = localStorage.getItem(LS_AUTOSAVE_KEY);
    if (!autosaved) {
      // Check if we need to prompt for session name on first load
      renderTranscriptDisplay();
      return;
    }

    const snap = JSON.parse(autosaved);
    if (!snap || !snap.fullTranscript) {
      renderTranscriptDisplay();
      return;
    }

    transcriptInput.value = snap.fullTranscript || "";
    committedTranscript = transcriptInput.value.trim();
    lastSentTranscript = committedTranscript;
    lastRawSections = Array.isArray(snap.sections) ? snap.sections : [];
    lastMaterials = Array.isArray(snap.materials) ? snap.materials : [];
    lastCheckedItems = Array.isArray(snap.checkedItems) ? snap.checkedItems : [];
    lastMissingInfo = Array.isArray(snap.missingInfo) ? snap.missingInfo : [];
    lastCustomerSummary = snap.customerSummary || "";

    await ensureSectionSchema();
    const normalisedFromAutosave = normaliseSectionsFromResponse({ sections: lastRawSections }, SECTION_SCHEMA);
    lastRawSections = Array.isArray(normalisedFromAutosave) ? normalisedFromAutosave : [];
    syncSectionsState(lastRawSections);
    refreshUiFromState();
    setWorkerDebugPayload(null);

    // Check if session was active
    const wasActive = isSessionActive();
    const savedSessionName = getSessionName();

    if (wasActive && savedSessionName) {
      // Restore session name display
      setSessionName(savedSessionName);

      // Show resume prompt
      showSessionResumeModal(savedSessionName);
    } else {
      showSleepWarning(
        "Recovered an auto-saved session. Check details, then tap Start for a new visit or Resume to continue."
      );
    }

    // Render the transcript display
    renderTranscriptDisplay();

  } catch (err) {
    console.warn("No valid autosave on load", err);
    renderTranscriptDisplay();
  }
})();

// Update transcript display whenever text input changes
if (transcriptInput) {
  const originalInputHandler = transcriptInput.oninput;
  transcriptInput.addEventListener('input', () => {
    renderTranscriptDisplay();
  });
}

// Initial render
renderTranscriptDisplay();

// Initialize internet speed monitoring
startSpeedMonitoring();
