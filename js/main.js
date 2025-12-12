import {
  loadWorkerEndpoint,
  isWorkerEndpointStorageKey
} from "../src/app/worker-config.js";
import { loadSchema } from "./schema.js";
import { logError, showBugReportModal } from "./bugReport.js";
import {
  processPhoto,
  generatePhotoId,
  validatePhoto,
  createThumbnail
} from "./photoUtils.js";
import {
  calculateDistance,
  formatDistanceAsCrowFlies,
  buildLocationsFromPhotos,
  calculateJobDistances,
  applyGPSPrivacy,
  getCurrentPosition
} from "./gpsUtils.js";
import {
  depotNotesToCSV,
  sessionToSingleCSV,
  downloadCSV,
  getExportFormat
} from "./csvExport.js";
import {
  initAgentMode,
  setAgentMode,
  isAgentModeEnabled,
  analyzeTranscriptForQuestions,
  resetAskedQuestions
} from "./agentMode.js";
import { showSendSectionsSlideOver, updateSendSectionsSlideOver } from "./sendSections.js";
import { initWhat3Words } from "./what3words.js";
import {
  initStructuredForm,
  getFormData,
  isFormModeActive,
  clearFormData
} from "./structuredForm.js";
import { createEmptyDepotSurveySession, buildSessionFromAppState } from "../src/state/sessionStore.js";
import { autoFillSession } from "../src/api/autoFillSession.js";
import {
  retryWithBackoff,
  categorizeError,
  offlineQueue,
  requestDeduplicator,
  networkMonitor,
  getStorageQuota,
  cleanupOldData,
  estimateCost,
  estimateTokens
} from "./appEnhancements.js";
import {
  initChecklistSearch,
  populateGroupFilter,
  resetChecklistFilters
} from "./checklistEnhancements.js";
import { getAiNotes } from "./uiEnhancements.js";
import { getSectionEmoji, getSectionStyle, applySectionStyle } from "./sectionStyles.js";
import { loadSessionFromCloud } from "./systemRecommendationUI.js";

// --- CONFIG / STORAGE KEYS ---
const SECTION_STORAGE_KEY = "depot.sectionSchema";
const LEGACY_SECTION_STORAGE_KEY = "surveybrain-schema";
const CHECKLIST_STORAGE_KEY = "depot.checklistConfig";
const LS_AUTOSAVE_KEY = "surveyBrainAutosave";
const AI_INSTRUCTIONS_STORAGE_KEY = "depot.aiInstructions";

const DEFAULT_DEPOT_NOTES_INSTRUCTIONS = `
You are generating engineer-friendly "Depot Notes" from a voice transcript for a domestic heating job.

General rules:
- Prefer clear, non-duplicated bullets.
- Avoid contradictions in the same section.
- When there is a conflict between earlier speculative text and later, typed "summary" lines from the adviser, ALWAYS prefer the later summary lines.
- Preserve the adviser's intent, not the raw transcription glitches.
- Never invent requirements that are not explicitly mentioned (for example, do not add a Powerflush unless the transcript clearly says it).

CRITICAL DETAIL RETENTION:
- RETAIN ALL SPECIFIC DETAILS: Capture exact measurements, routes, locations, sizes, and technical specifications.
- SHARPEN VAGUE DESCRIPTIONS: Convert conversational language into precise technical specifications.
  Example: "the flue goes up through the loft" → "Flue route: vertical rise from boiler through bedroom ceiling into loft space, horizontal run 3m to gable end external wall."
- ROUTES AND PATHS: When describing flue routes, pipe routes, or cable runs, capture EVERY detail:  * Start point (e.g., "from boiler in kitchen")
  * All waypoints (e.g., "through ceiling void", "across loft space", "behind boxing")
  * Direction changes (e.g., "90° elbow at ceiling level", "45° bend around joist")
  * Measurements when mentioned (e.g., "2.5m horizontal run", "1.2m vertical drop")
  * End point (e.g., "terminate at external wall with terminal kit")
- SIZES AND SPECIFICATIONS: Always include exact dimensions:
  * "22mm copper pipe" not just "pipe"
  * "Worcester Bosch Greenstar 30CDi" not just "combi boiler"
  * "60/100mm concentric flue" not just "flue"
- LOCATIONS: Be precise about locations - include room names, relative positions, and landmarks.
- Keep ALL technical details mentioned in the transcript - do not summarize them away.

Multiple quotes / A-B options:
- If the transcript clearly discusses multiple quote options (A/B/C or first/second/third quote), generate a separate set of notes for each quote, labelled "Quote A", "Quote B", etc.
- Each quote's notes should follow the same section headings; only include sections where the transcript provides detail for that quote.
- If only one quote is present, keep a single set of notes.

High-priority source of truth:
- If the transcript contains a clearly typed list or short summary entered by the adviser (for example in a "Customer summary", "Engineer notes", or "typed notes" section), treat these as the final instructions.
- When such a summary contradicts earlier spoken content, follow the summary and drop the conflicting spoken content.

---

### Gas supply rules (Pipe work section)

When generating Pipe work bullets about the gas supply:

1. If the transcript contains phrases like:
   - "increase gas supply" OR "upgrade gas supply"
   AND
   - a route phrase such as "from meter", "via cupboards", "through cupboards", "along the same route", "to the boiler position"
   then:
   - Treat that as the authoritative gas instruction.
   - Generate ONE clear bullet describing the upgrade and route, for example:

     - "• Upgrade gas supply from meter via cupboards to new boiler position (size to suit 24kW boiler output plus diversity);"

   - Do NOT also generate a bullet stating that the "existing 15mm gas supply is adequate". Avoid any wording that contradicts the upgrade.

2. If the transcript only says the gas is adequate, with no "increase"/"upgrade" wording or route:
   - Generate a simple confirmation bullet, for example:

     - "• Existing gas supply confirmed adequate for new boiler;"

3. Never output both "existing 15mm gas supply confirmed adequate" AND "increase gas supply" in the same job. If upgrade wording is present, the upgrade wins and the "adequate" line should not appear.

---

### Primary pipework (primaries) rules (Pipe work section)

When generating Pipe work bullets about primaries (primary flow and return):

1. Look for phrases in the transcript such as:
   - "primaries", "primary pipework", "flow and return"
   AND
   - power or sizing context such as "set up for up to 18 kW", "you've got 24", "change them to 28mm", "24Ri", etc.

2. When these are present, generate two distinct bullets instead of a single vague one:

   - A route / location bullet tying the change to the physical path, for example:
     - "• Replace primary flow and return between loft hatches and airing cupboard;"

   - A sizing / justification bullet, for example:
     - "• Upgrade primary pipework to 28mm to allow full 24kW boiler output without overheating;"

3. Avoid vague or duplicate wording when the above bullets are used. For example, drop weaker lines like:
   - "Pipework between loft hatches and in airing cupboard to be replaced;"
   if they would duplicate a clearer, more explicit primaries bullet.

4. If the transcript clearly states that existing primaries are undersized (e.g. "current pipework is set up for up to 18kW and you’ve got 24"), ensure the notes include the reason:
   - Mention that the upgrade to 28mm is to match boiler output and reduce overheating / cycling.

---

### S-plan, pump, and open vent / cold feed assembly

When the transcript mentions replacing the pump, mid-position valve, or open vent / cold feed:

- Use clear, standard wording such as:
  - "• Replace primary pump and motorised valve assembly;"
  - "• Replace open vent and cold feed arrangement as part of system upgrade;"
  - "• Install new S-plan with two motorised valves (one heating, one hot water) and automatic bypass;"

- Normalise common mis-heard phrases:
  - "open venting code fade" → "open vent / cold feed arrangement".

---

### Brand and component clean-ups

Correct obvious transcription errors for well-known components:

- "Ferox TF1" → "Fernox TF1"
- Similar mis-spellings of common filters, inhibitors, and boiler models should be corrected to the standard brand spelling where unambiguous.

---

### General clean-up and de-duplication

- Remove "noise" bullets that do not contain a clear instruction or could cause confusion.
  - Example to drop: "possible issues with pipework in screening area;" if it has no route, size, or action.
- Favour fewer, clearer bullets over many vague ones.
- Where possible, make each bullet:
  - Specific to a location or route (e.g. "between loft hatches and airing cupboard").
  - Explicit about size or rating when changing pipework (e.g. "upgrade to 28mm").
  - Consistent with any final typed summary from the adviser.

Output concise, engineer-ready bullets in each section: no waffle, no contradictions, just what needs doing and why.
`;

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

// --- Utility functions ---
// Debounce helper function
function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

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

function loadDepotNotesInstructions() {
  try {
    const raw = localStorage.getItem(AI_INSTRUCTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.depotNotes === "string" && parsed.depotNotes.trim()) {
        return parsed.depotNotes;
      }
    }
  } catch (_) {
    // ignore localStorage or JSON issues and fall back to defaults
  }

  return DEFAULT_DEPOT_NOTES_INSTRUCTIONS;
}

let WORKER_URL = loadWorkerEndpoint();

// --- ELEMENTS ---
const sendTextBtn = document.getElementById("sendTextBtn");
const transcriptInput = document.getElementById("transcriptInput");
const customerSummaryEl = document.getElementById("customerSummary");
const clarificationsEl = document.getElementById("clarifications");
const sectionsListEl = document.getElementById("sectionsList");
const aiNotesListEl = document.getElementById("aiNotesList");
const statusBar = document.getElementById("statusBar");
const startLiveBtn = document.getElementById("startLiveBtn");
const pauseLiveBtn = document.getElementById("pauseLiveBtn");
const finishLiveBtn = document.getElementById("finishLiveBtn");
const loadSessionBtn = document.getElementById("loadSessionBtn");
const loadCloudSessionBtn = document.getElementById("loadCloudSessionBtn");
const loadSessionInput = document.getElementById("loadSessionInput");
const importAudioBtn = document.getElementById("importAudioBtn");
const importAudioInput = document.getElementById("importAudioInput");
const newJobBtn = document.getElementById("newJobBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const partsListEl = document.getElementById("partsList");
const voiceErrorEl = document.getElementById("voice-error");
const sleepWarningEl = document.getElementById("sleep-warning");
const settingsBtn = document.getElementById("settingsBtn");
const bugReportBtn = document.getElementById("bugReportBtn");
const sendSectionsBtn = document.getElementById("sendSectionsBtn");
const autoFillSessionBtn = document.getElementById("autoFillSessionBtn");
const workerDebugEl = document.getElementById("workerDebug");
const debugSectionsPre = document.getElementById("debugSectionsJson");
const debugSectionsDetails = document.getElementById("debugSections");
// Removed: Session fields UI elements no longer in index.html
// const sessionFieldListEl = document.getElementById("sessionFieldList");
// const sessionMissingInfoEl = document.getElementById("sessionMissingInfo");

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
// Photo, GPS, and structured form state
let sessionPhotos = [];
let sessionFormData = {};
let sessionLocations = {};
let sessionDistances = {};
let currentSession = createEmptyDepotSurveySession();
let aiFilledPaths = new Set();
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

// Expose state to window for save menu access
function exposeStateToWindow() {
  updateAppStateSnapshot();
  window.__depotLastMaterials = lastMaterials;
  window.__depotLastCheckedItems = lastCheckedItems;
  window.__depotLastMissingInfo = lastMissingInfo;
  window.__depotLastCustomerSummary = lastCustomerSummary;
  window.__depotSessionAudioChunks = sessionAudioChunks;
  window.__depotLastAudioMime = lastAudioMime;
  window.__depotAppState = APP_STATE;
  window.__depotSessionPhotos = sessionPhotos;
  window.__depotSessionFormData = sessionFormData;
  window.__depotSessionLocations = sessionLocations;
  window.__depotSessionDistances = sessionDistances;
  window.__depotCurrentSession = currentSession;
  window.lastSections = lastSections; // Expose for what3words and other integrations
}

function updateAppStateSnapshot() {
  APP_STATE.sections = lastSections;
  APP_STATE.notes = lastSections;
  APP_STATE.materials = Array.isArray(lastMaterials) ? [...lastMaterials] : [];
  APP_STATE.checkedItems = Array.isArray(lastCheckedItems) ? [...lastCheckedItems] : [];
  APP_STATE.missingInfo = Array.isArray(lastMissingInfo) ? [...lastMissingInfo] : [];
  APP_STATE.customerSummary = lastCustomerSummary || "";
  APP_STATE.fullTranscript = (transcriptInput?.value || "").trim();
  APP_STATE.transcriptText = APP_STATE.fullTranscript;
  // Add new photo, form, and location data
  APP_STATE.photos = Array.isArray(sessionPhotos) ? [...sessionPhotos] : [];
  APP_STATE.formData = sessionFormData ? { ...sessionFormData } : {};
  APP_STATE.locations = sessionLocations ? { ...sessionLocations } : {};
  APP_STATE.distances = sessionDistances ? { ...sessionDistances } : {};
  APP_STATE.session = currentSession;
}

function buildStateSnapshot() {
  updateAppStateSnapshot();
  const clonedSections = Array.isArray(lastSections) ? JSON.parse(JSON.stringify(lastSections)) : [];
  return {
    ...APP_STATE,
    notes: clonedSections,
    notesJson: {
      sections: clonedSections,
      missingInfo: Array.isArray(lastMissingInfo) ? [...lastMissingInfo] : [],
      checkedItems: Array.isArray(lastCheckedItems) ? [...lastCheckedItems] : [],
      customerSummary: lastCustomerSummary || ""
    },
    transcriptText: APP_STATE.fullTranscript,
    fullTranscript: APP_STATE.fullTranscript
  };
}

const SESSION_FIELD_CONFIG = [
  { label: "Customer name", path: "meta.customerName" },
  { label: "Job type", path: "meta.jobType" },
  { label: "Existing system", path: "existingSystem.systemType" },
  { label: "Existing fuel", path: "existingSystem.fuelType" },
  { label: "Boiler job", path: "boilerJob.type" },
  { label: "Heat loss (kW)", path: "heatLoss.totalHeatLossKw" },
  { label: "Magnetic filter", path: "cleansing.magneticFilterType" },
  { label: "Installer notes", path: "installerNotes.otherNotes" }
];

function refreshCurrentSessionSnapshot() {
  updateAppStateSnapshot();
  currentSession = buildSessionFromAppState(APP_STATE, {
    transcript: APP_STATE.fullTranscript,
    sessionName: APP_STATE.meta?.sessionName
  });
  currentSession.missingInfo = Array.isArray(currentSession.missingInfo)
    ? currentSession.missingInfo
    : [];
}

function getValueAtPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function mergeSessionPatch(target, patch, prefix = []) {
  if (!patch || typeof patch !== "object") return;
  Object.entries(patch).forEach(([key, value]) => {
    const currentPath = [...prefix, key].join(".");
    const existing = target[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (existing === undefined || existing === null) {
        target[key] = {};
      }
      mergeSessionPatch(target[key], value, [...prefix, key]);
      return;
    }

    if (Array.isArray(value)) {
      if (existing === undefined || existing === null) {
        target[key] = value;
        aiFilledPaths.add(currentPath);
      }
      return;
    }

    if (existing === undefined || existing === null) {
      target[key] = value;
      aiFilledPaths.add(currentPath);
    }
  });
}

// Removed: Session fields rendering - UI elements no longer in index.html

function syncMissingInfoState() {
  const infoItems = Array.isArray(currentSession.missingInfo)
    ? currentSession.missingInfo
    : [];
  lastMissingInfo = infoItems.map((item) => {
    if (typeof item === "string") return item;
    return item.detail || item.label || item.path || "Follow up item";
  });
}

// Removed: Missing info rendering - UI elements no longer in index.html
function renderMissingInfo() {
  // Session fields removed from UI
  console.warn('renderMissingInfo called but session fields UI has been removed');
  return;
}

async function handleAutoFillFromTranscript() {
  if (!autoFillSessionBtn) return;
  autoFillSessionBtn.disabled = true;
  autoFillSessionBtn.textContent = "Working...";

  try {
    refreshCurrentSessionSnapshot();
    aiFilledPaths.clear();
    if (!currentSession.fullTranscript || !currentSession.fullTranscript.trim()) {
      alert("No transcript available yet.");
      return;
    }

    const { sessionPatch, missingInfo } = await autoFillSession(
      currentSession.fullTranscript,
      currentSession
    );

    mergeSessionPatch(currentSession, sessionPatch);
    if (Array.isArray(missingInfo) && missingInfo.length) {
      currentSession.missingInfo = currentSession.missingInfo || [];
      currentSession.missingInfo.push(...missingInfo);
    }

    syncMissingInfoState();
    updateAppStateSnapshot();
    // renderSessionFields(); // Removed: UI elements no longer exist
    // renderMissingInfo(); // Removed: UI elements no longer exist
  } catch (err) {
    console.error("Auto-fill failed", err);
    alert(err.message || "Failed to auto-fill session");
  } finally {
    autoFillSessionBtn.disabled = false;
    autoFillSessionBtn.textContent = "✨ Auto-fill from transcript";
    exposeStateToWindow();
  }
}

// Auto-save function (will be called via debounced wrapper)
function autoSaveSessionToLocal() {
  try {
    const fullTranscript = (transcriptInput?.value || "").trim();
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

    const stateSnapshot = buildStateSnapshot();
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      sections: lastRawSections,
      ...stateSnapshot
    };

    localStorage.setItem(LS_AUTOSAVE_KEY, JSON.stringify(snapshot));
    exposeStateToWindow();
  } catch (err) {
    console.warn("Auto-save failed", err);
  }
}

// Create debounced version with 500ms delay for performance
const debouncedAutoSave = debounce(autoSaveSessionToLocal, 500);

/**
 * Update a section from the tweak modal
 * Called by sendSections.js when a section is tweaked with AI
 */
window.updateSectionFromTweak = function(sectionIndex, improvedSection) {
  if (!lastSections || !Array.isArray(lastSections)) {
    console.warn('updateSectionFromTweak: lastSections not available');
    return;
  }

  if (sectionIndex < 0 || sectionIndex >= lastSections.length) {
    console.warn('updateSectionFromTweak: invalid section index', sectionIndex);
    return;
  }

  // Update the section in lastSections
  lastSections[sectionIndex] = {
    ...lastSections[sectionIndex],
    plainText: improvedSection.plainText,
    naturalLanguage: improvedSection.naturalLanguage,
    section: improvedSection.section
  };

  // Sync to APP_STATE
  APP_STATE.sections = lastSections;
  APP_STATE.notes = lastSections;

  // Re-expose to window
  exposeStateToWindow();

  // Refresh UI to show updated content
  refreshUiFromState();

  // Save to localStorage (debounced)
  debouncedAutoSave();

  console.log('Section updated from tweak:', improvedSection.section);
};

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

function normaliseChecklistConfigSource(raw) {
  const base = { sectionsOrder: [], items: [] };

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    base.sectionsOrder = Array.isArray(raw.sectionsOrder) ? raw.sectionsOrder.slice() : [];
    base.items = sanitiseChecklistArray(raw.items);
    return base;
  }

  base.items = sanitiseChecklistArray(raw);
  return base;
}

async function loadChecklistConfig() {
  // 1) Try local override from browser storage
  const localRaw = safeParseJSON(localStorage.getItem(CHECKLIST_STORAGE_KEY), null);

  // 2) Try defaults from checklist.config.json
  const defaultsRaw = await fetchJSONNoStore("checklist.config.json");

  const localConfig = normaliseChecklistConfigSource(localRaw);
  const defaultsConfig = normaliseChecklistConfigSource(defaultsRaw);

  // 3) Prefer local override if it has content
  const candidate = localConfig.items.length ? localConfig : defaultsConfig;

  if (!candidate.items.length) {
    console.warn("Checklist config: no items from localStorage or checklist.config.json");
  } else {
    const sourceLabel = localConfig.items.length ? "browser override" : "checklist.config.json";
    console.log(`Checklist config: loaded ${candidate.items.length} items (${sourceLabel})`);
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

// Helper function to update liveState and dispatch event
function setLiveState(newState) {
  liveState = newState;
  window.dispatchEvent(new CustomEvent('liveSessionStateChange', {
    detail: { state: newState }
  }));
}
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

function normaliseQuoteVariants(rawVariants) {
  if (!Array.isArray(rawVariants) || !rawVariants.length) return [];

  return rawVariants
    .map((variant, idx) => {
      if (!variant || typeof variant !== "object") return null;

      const label = String(
        variant.label ||
        variant.title ||
        variant.name ||
        variant.quoteName ||
        variant.option ||
        ""
      ).trim();

      const sections = normaliseDepotSections(
        Array.isArray(variant.sections)
          ? variant.sections
          : Array.isArray(variant.notes)
            ? variant.notes
            : []
      );

      const hasContent = sections.some((sec) =>
        (sec.plainText && sec.plainText.trim()) ||
        (sec.naturalLanguage && sec.naturalLanguage.trim())
      );

      if (!hasContent) return null;

      return {
        label: label || `Quote ${String.fromCharCode(65 + idx)}`,
        sections
      };
    })
    .filter(Boolean);
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

function mergeSectionsAndQuoteVariants(baseSections, quoteVariants) {
  const merged = Array.isArray(baseSections)
    ? baseSections.map((sec) => ({ ...sec }))
    : [];

  if (!Array.isArray(quoteVariants) || !quoteVariants.length) {
    return merged;
  }

  quoteVariants.forEach((variant) => {
    if (!variant || !Array.isArray(variant.sections)) return;
    const label = variant.label || "Quote option";
    variant.sections.forEach((sec) => {
      if (!sec || typeof sec !== "object") return;
      merged.push({
        section: `${label} — ${sec.section || "Section"}`,
        plainText: sec.plainText || "",
        naturalLanguage: sec.naturalLanguage || ""
      });
    });
  });

  return merged;
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
  updateAppStateSnapshot();
  updateDebugSnapshot();

  const combinedSections = mergeSectionsAndQuoteVariants(normalised, lastQuoteNotes);

  // Update the slide-over if it's open
  updateSendSectionsSlideOver({
    autoSections: combinedSections,
    aiSections: getAiNotes()
  });
}

function getSectionsForSharing() {
  return mergeSectionsAndQuoteVariants(lastSections, lastQuoteNotes);
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
  
  // Check if this is a connection-related error
  const isConnectionError = message && (
    message.includes('Network') || 
    message.includes('connection') || 
    message.includes('Connection') ||
    message.includes('fetch') ||
    message.includes('Failed to fetch')
  );
  
  // Clear previous content
  voiceErrorEl.innerHTML = "";
  
  // Add message text (safely)
  const messageText = document.createTextNode(message);
  voiceErrorEl.appendChild(messageText);
  
  // Add helpful link for connection errors
  if (isConnectionError) {
    const link = document.createElement('a');
    link.href = 'settings.html';
    link.style.color = '#2563eb';
    link.style.textDecoration = 'underline';
    link.textContent = 'Check API status in Settings';
    voiceErrorEl.appendChild(document.createTextNode(' '));
    voiceErrorEl.appendChild(link);
  }
  
  voiceErrorEl.style.display = "block";
}
function clearVoiceError() {
  if (!voiceErrorEl) return;
  voiceErrorEl.innerHTML = "";
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

  const request = {
    url,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };

  // Use request deduplication and retry logic
  return await requestDeduplicator.execute(request, async () => {
    return await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return res;
      },
      {
        maxRetries: 4,
        onRetry: (info) => {
          setStatus(`Retry ${info.attempt}/${info.maxRetries} after network error...`);
          console.log(`Retrying request to ${path} (attempt ${info.attempt}/${info.maxRetries})`);
        }
      }
    );
  });
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
    showSleepWarning("Audio recording not supported on this device. Text capture only.");
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

    // Try multiple codecs in order of preference, with Safari iOS compatibility
    const codecPriority = [
      "audio/webm;codecs=opus",  // Chrome/Firefox
      "audio/mp4",                // Safari iOS/macOS
      "audio/webm",               // Generic webm
      "audio/x-m4a",              // Safari fallback
      "audio/wav"                 // Universal fallback
    ];

    let options = undefined;
    let selectedCodec = null;

    if (window.MediaRecorder.isTypeSupported) {
      for (const codec of codecPriority) {
        if (window.MediaRecorder.isTypeSupported(codec)) {
          options = { mimeType: codec };
          selectedCodec = codec;
          console.log("Selected audio codec:", codec);
          break;
        }
      }
    }

    if (!options) {
      console.log("Using browser default audio codec");
    }

    mediaRecorder = new MediaRecorder(mediaStream, options);
    lastAudioMime = mediaRecorder.mimeType || selectedCodec || "audio/webm";
    console.log("MediaRecorder initialized with MIME type:", lastAudioMime);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        sessionAudioChunks.push(event.data);
        console.log("Audio chunk recorded:", event.data.size, "bytes");
      }
    };
    mediaRecorder.onstop = () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      mediaRecorder = null;
      console.log("Audio recording stopped. Total chunks:", sessionAudioChunks.length);
    };
    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event.error);
      showSleepWarning("Audio recording error: " + (event.error?.message || "Unknown error"));
    };
    mediaRecorder.start();
    console.log("Audio recording started successfully");
  } catch (err) {
    console.error("Audio capture error", err);
    showSleepWarning("⚠️ Audio recording failed: " + (err.message || "Permission denied or not supported") + ". Text capture still running.");
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

  // Check if multiple quotes detection is enabled (Voice Notes 2.0)
  const multipleQuotesEnabled = localStorage.getItem('depot.enableMultipleQuotesDetection') !== 'false'; // Default to true
  const multipleQuotesHint = multipleQuotesEnabled && detectMultipleQuotesInTranscript();

  // Include clarification context if provided (Voice Notes 2.0)
  let enhancedTranscript = transcript;
  if (window.__clarificationContext) {
    enhancedTranscript = `${transcript}\n\n[Additional context from surveyor: ${window.__clarificationContext}]`;
  }

  const payload = {
    transcript: enhancedTranscript,
    alreadyCaptured: existingSections,
    expectedSections,
    sectionHints: deriveSectionHints(),
    multipleQuotesHint,
    forceStructured: true,
    checklistItems: CHECKLIST_SOURCE,
    depotSections: canonicalSchema,
    depotNotesInstructions: loadDepotNotesInstructions()
  };

  // Add requested quote count if specified
  if (window.__requestedQuoteCount && window.__requestedQuoteCount !== 'auto') {
    payload.requestedQuoteCount = parseInt(window.__requestedQuoteCount);
  }

  return payload;
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

function extractQuoteVariants(data) {
  if (!data || typeof data !== "object") return [];

  const fromTopLevel = Array.isArray(data.quoteNotes)
    ? data.quoteNotes
    : Array.isArray(data.quoteVariants)
      ? data.quoteVariants
      : Array.isArray(data.quoteOptions)
        ? data.quoteOptions
        : null;

  const fromDepotNotes = data.depotNotes && typeof data.depotNotes === "object"
    ? (Array.isArray(data.depotNotes.quoteNotes)
      ? data.depotNotes.quoteNotes
      : Array.isArray(data.depotNotes.quoteVariants)
        ? data.depotNotes.quoteVariants
        : Array.isArray(data.depotNotes.quotes)
          ? data.depotNotes.quotes
          : null)
    : null;

  const candidate = fromTopLevel || fromDepotNotes || [];
  return normaliseQuoteVariants(candidate);
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
    header.dataset.group = groupName; // Tag header with group
    header.innerHTML = `<span>${groupName}</span><span>${items[0].section || ""}</span>`;
    container.appendChild(header);

    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "clar-chip checklist-item" + (item.done ? " done" : "");
      div.dataset.itemId = String(item.id);
      div.dataset.group = groupName; // Tag with group for filtering
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

  // Initialize checklist search and filter UI (only once)
  if (!container.querySelector('.checklist-filter')) {
    initChecklistSearch(container);
    populateGroupFilter(CHECKLIST_ITEMS);
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
  // 1) Customer summary (removed from UI, kept for data persistence)
  if (customerSummaryEl) {
    customerSummaryEl.textContent = lastCustomerSummary || "(none)";
  }

  // 2) Render sections from the canonical state
  let resolved = Array.isArray(lastSections) ? lastSections : [];
  if (!resolved.length && getCanonicalSectionNames().length) {
    syncSectionsState(lastRawSections);
    resolved = Array.isArray(lastSections) ? lastSections : [];
  }

  const sectionsToRender = resolved.length ? resolved : normaliseDepotSections([]);

  // Render TECHNICAL NOTES (plainText only) in sectionsListEl
  sectionsListEl.innerHTML = "";
  sectionsToRender.forEach((sec, index) => {
    const plainTextRaw = typeof sec.plainText === "string" ? sec.plainText : "";
    const formattedPlain = plainTextRaw
      ? formatPlainTextForSection(sec.section, plainTextRaw).trim()
      : "";

    // Skip empty sections in technical notes
    if (!formattedPlain || formattedPlain === "No bullets yet.") return;

    const div = document.createElement("div");
    div.className = "section-item";
    div.dataset.sectionIndex = index;
    const preClassAttr = formattedPlain ? "" : " class=\"placeholder\"";
    
    // Get emoji and style for this section
    const emoji = getSectionEmoji(sec.section);
    const style = getSectionStyle(sec.section);

    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <h4 style="margin: 0; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 1.2em;">${emoji}</span>
          <span>${sec.section}</span>
        </h4>
        <div class="section-actions" style="display: flex; gap: 6px;">
          <button class="edit-section-btn-inline" data-section-index="${index}" title="Edit this section inline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Edit
          </button>
          <button class="tweak-section-btn-main" data-section-index="${index}" title="Tweak this section with AI">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Tweak
          </button>
        </div>
      </div>
      <div class="section-content-view">
        <pre${preClassAttr}>${formattedPlain || "No bullets yet."}</pre>
      </div>
      <div class="section-content-edit" style="display: none;">
        <label style="display: block; margin-bottom: 4px; font-size: 0.7rem; font-weight: 600; color: #475569;">Plain Text (bullets):</label>
        <textarea class="edit-plaintext" style="width: 100%; min-height: 80px; margin-bottom: 8px; font-size: 0.7rem; font-family: monospace;">${plainTextRaw}</textarea>
        <label style="display: block; margin-bottom: 4px; font-size: 0.7rem; font-weight: 600; color: #475569;">Natural Language:</label>
        <textarea class="edit-naturallang" style="width: 100%; min-height: 60px; margin-bottom: 8px; font-size: 0.7rem;">${typeof sec.naturalLanguage === "string" ? sec.naturalLanguage.trim() : ""}</textarea>
        <div style="display: flex; gap: 6px;">
          <button class="save-edit-btn" style="background: #10b981; padding: 6px 12px; font-size: 0.7rem;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Save
          </button>
          <button class="cancel-edit-btn" class="pill-secondary" style="background: #94a3b8; padding: 6px 12px; font-size: 0.7rem;">Cancel</button>
        </div>
      </div>
    `;
    
    // Apply section-specific styling
    applySectionStyle(div, sec.section);
    
    sectionsListEl.appendChild(div);
  });

  if (sectionsListEl.children.length === 0) {
    sectionsListEl.innerHTML = '<span class="small">No technical notes yet.</span>';
  }

  // Render CUSTOMER NOTES (naturalLanguage only) in aiNotesListEl
  if (aiNotesListEl) {
    aiNotesListEl.innerHTML = "";
    sectionsToRender.forEach((sec) => {
      const naturalLanguage = typeof sec.naturalLanguage === "string" ? sec.naturalLanguage.trim() : "";

      // Skip empty or placeholder sections in customer notes
      if (!naturalLanguage || naturalLanguage === "No additional notes.") return;

      const div = document.createElement("div");
      div.className = "section-item";
      
      // Get emoji and style for this section
      const emoji = getSectionEmoji(sec.section);
      const style = getSectionStyle(sec.section);

      div.innerHTML = `
        <h4 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 1.2em;">${emoji}</span>
          <span>${sec.section}</span>
        </h4>
        <p style="line-height: 1.6; margin: 0;">${naturalLanguage}</p>
      `;
      
      // Apply section-specific styling
      applySectionStyle(div, sec.section);
      
      aiNotesListEl.appendChild(div);
    });

    if (aiNotesListEl.children.length === 0) {
      aiNotesListEl.innerHTML = '<span class="small">No customer notes yet.</span>';
    }
  }

  if (Array.isArray(lastQuoteNotes) && lastQuoteNotes.length) {
    const divider = document.createElement("div");
    divider.className = "quote-variant-divider";
    divider.innerHTML = `
      <h3 style="margin: 12px 0 4px 0;">Additional quote options</h3>
      <p class="small" style="margin: 0 0 8px 0; color: var(--muted);">Separate notes for alternative quotes (read-only).</p>
    `;
    sectionsListEl.appendChild(divider);

    lastQuoteNotes.forEach((variant) => {
      const header = document.createElement("div");
      header.className = "quote-variant-header";
      header.innerHTML = `<h4 style="margin: 6px 0;">${variant.label || "Alternate quote"}</h4>`;
      sectionsListEl.appendChild(header);

      const variantSections = Array.isArray(variant.sections) ? variant.sections : [];
      variantSections.forEach((variantSection) => {
        const div = document.createElement("div");
        div.className = "section-item quote-variant";
        const plainTextRaw = typeof variantSection.plainText === "string" ? variantSection.plainText : "";
        const formattedPlain = plainTextRaw
          ? formatPlainTextForSection(variantSection.section, plainTextRaw).trim()
          : "";
        const naturalLanguage = typeof variantSection.naturalLanguage === "string" ? variantSection.naturalLanguage.trim() : "";
        const preClassAttr = formattedPlain ? "" : " class=\"placeholder\"";
        const naturalMarkup = naturalLanguage
          ? `<p class="small" style="margin-top:3px;">${naturalLanguage}</p>`
          : "";
        
        // Get emoji for the variant section
        const emoji = getSectionEmoji(variantSection.section);
        
        div.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <h4 style="margin: 0; display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 1.1em;">${emoji}</span>
              <span>${variantSection.section || "Section"}</span>
            </h4>
            <span class="small" style="color: var(--muted);">${variant.label || "Quote option"}</span>
          </div>
          <div class="section-content-view">
            <pre${preClassAttr}>${formattedPlain || "No bullets yet."}</pre>
            ${naturalMarkup}
          </div>
        `;
        sectionsListEl.appendChild(div);
      });
    });
  }

  // Attach event listeners to edit buttons
  const editBtns = sectionsListEl.querySelectorAll('.edit-section-btn-inline');
  editBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sectionItem = e.currentTarget.closest('.section-item');
      const viewDiv = sectionItem.querySelector('.section-content-view');
      const editDiv = sectionItem.querySelector('.section-content-edit');
      const actionsDiv = sectionItem.querySelector('.section-actions');

      viewDiv.style.display = 'none';
      editDiv.style.display = 'block';
      actionsDiv.style.display = 'none';
    });
  });

  // Attach event listeners to save/cancel buttons
  const saveBtns = sectionsListEl.querySelectorAll('.save-edit-btn');
  saveBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sectionItem = e.currentTarget.closest('.section-item');
      const index = parseInt(sectionItem.dataset.sectionIndex, 10);
      const plainTextArea = sectionItem.querySelector('.edit-plaintext');
      const naturalLangArea = sectionItem.querySelector('.edit-naturallang');

      // Update the section
      if (sectionsToRender[index]) {
        sectionsToRender[index].plainText = plainTextArea.value;
        sectionsToRender[index].naturalLanguage = naturalLangArea.value;
        lastSections[index] = sectionsToRender[index];
        lastRawSections[index] = sectionsToRender[index];

        // Save and refresh
        debouncedAutoSave();
        refreshUiFromState();
      }
    });
  });

  const cancelBtns = sectionsListEl.querySelectorAll('.cancel-edit-btn');
  cancelBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sectionItem = e.currentTarget.closest('.section-item');
      const viewDiv = sectionItem.querySelector('.section-content-view');
      const editDiv = sectionItem.querySelector('.section-content-edit');
      const actionsDiv = sectionItem.querySelector('.section-actions');

      viewDiv.style.display = 'block';
      editDiv.style.display = 'none';
      actionsDiv.style.display = 'flex';
    });
  });

  // Attach event listeners to tweak buttons
  const tweakBtns = sectionsListEl.querySelectorAll('.tweak-section-btn-main');
  tweakBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.sectionIndex, 10);
      const section = sectionsToRender[index];
      if (section && window.showTweakModal) {
        window.showTweakModal(section, index);
      }
    });
  });

  // 3) Parts + checklist
  renderPartsList(lastMaterials);
  renderChecklist(clarificationsEl, lastCheckedItems, lastMissingInfo);

  // 4) Expose state to window for save menu
  refreshCurrentSessionSnapshot();
  // renderSessionFields(); // Removed: UI elements no longer exist
  // renderMissingInfo(); // Removed: UI elements no longer exist
  renderQuoteResult();
  exposeStateToWindow();
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
  const prevQuoteNotes = Array.isArray(lastQuoteNotes) ? lastQuoteNotes.slice() : [];

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

  const quoteVariants = extractQuoteVariants(result);
  const prevQuoteJson = JSON.stringify(prevQuoteNotes);
  const nextQuoteJson = JSON.stringify(quoteVariants);
  if (prevQuoteJson !== nextQuoteJson) {
    updated = true;
  }
  lastQuoteNotes = quoteVariants;
  updateAppStateSnapshot();
  updateSendSectionsSlideOver({
    autoSections: getSectionsForSharing(),
    aiSections: getAiNotes()
  });

  if (Array.isArray(result.materials) && result.materials.length) {
    lastMaterials = result.materials.slice();
    updated = true;
  } else if (result.materials === undefined) {
    lastMaterials = prevMaterials;
  } else {
    lastMaterials = prevMaterials;
  }

  if (Array.isArray(result.checkedItems)) {
    const knownIds = new Set((CHECKLIST_ITEMS || []).map(item => String(item.id)));
    const filtered = result.checkedItems
      .map(id => String(id))
      .filter(id => knownIds.size === 0 || knownIds.has(id));

    if (filtered.length && knownIds.size && filtered.length >= knownIds.size) {
      lastCheckedItems = prevChecked;
    } else if (filtered.length) {
      lastCheckedItems = filtered;
    } else {
      lastCheckedItems = prevChecked;
    }
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
    const errorInfo = categorizeError(err);
    const message = err && err.voiceMessage
      ? err.voiceMessage
      : errorInfo.userMessage || ("Voice AI failed: " + (err && err.message ? err.message : "Unknown error"));
    showVoiceError(message);
    
    // Provide more specific status based on error type
    const statusMessage = errorInfo.category === 'network' 
      ? "Connection failed - check network"
      : errorInfo.category === 'auth'
      ? "Authentication failed - check API key"
      : errorInfo.category === 'rate_limit'
      ? "Rate limit - please wait"
      : errorInfo.category === 'server'
      ? "Server error - retrying..."
      : "Text send failed - see error above";
    setStatus(statusMessage);
  }
}

async function sendAudio(blob) {
  setStatus("Uploading audio…");
  clearVoiceError();
  try {
    const schemaSnapshot = await ensureSectionSchema();
    const baseUrl = requireWorkerBaseUrl();

    // Wrap with retry logic for audio uploads
    const res = await retryWithBackoff(
      async () => {
        const response = await fetch(baseUrl + "/audio", {
          method: "POST",
          headers: { "Content-Type": blob.type || "audio/webm" },
          body: blob
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      },
      {
        maxRetries: 4,
        onRetry: (info) => {
          setStatus(`Retry ${info.attempt}/${info.maxRetries} uploading audio...`);
          console.log(`Retrying audio upload (attempt ${info.attempt}/${info.maxRetries})`);
        }
      }
    );

    const raw = await res.text();
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
    if (data.fullTranscript || data.transcript) {
      const transcriptText = data.fullTranscript || data.transcript;
      transcriptInput.value = transcriptText;
      committedTranscript = transcriptText.trim();
      lastSentTranscript = committedTranscript;
      updateTranscriptDisplay();
    }
    applyVoiceResult(data);
    setStatus("Audio processed.");
  } catch (err) {
    console.error(err);
    const errorInfo = categorizeError(err);
    const message = err && err.voiceMessage
      ? err.voiceMessage
      : errorInfo.userMessage || ("Voice AI failed: " + (err && err.message ? err.message : "Unknown error"));
    showVoiceError(message);
    
    // Provide more specific status based on error type
    const statusMessage = errorInfo.category === 'network' 
      ? "Connection failed - check network"
      : errorInfo.category === 'auth'
      ? "Authentication failed - check API key"
      : errorInfo.category === 'rate_limit'
      ? "Rate limit - please wait"
      : errorInfo.category === 'server'
      ? "Server error - retrying..."
      : "Audio upload failed - see error above";
    setStatus(statusMessage);
    throw err;
  }
}

// --- EXPORT / SESSION / AUDIO IMPORT ---
// NOTE: Export button has been replaced by the unified Save menu
// The old exportBtn handler has been removed - use saveMenuBtn instead

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

// --- PHOTO HELPER FUNCTIONS ---

/**
 * Update locations and distances based on current photos
 */
function updateLocationsFromPhotos() {
  sessionLocations = buildLocationsFromPhotos(sessionPhotos);
  sessionDistances = calculateJobDistances(sessionLocations);
  console.log("Updated locations:", Object.keys(sessionLocations).length);
  console.log("Calculated distances:", Object.keys(sessionDistances).length);
}

// Removed: Photo gallery rendering - UI elements no longer in index.html
function renderPhotoGallery() {
  // Photos and locations removed from UI
  console.warn('renderPhotoGallery called but photos UI has been removed');
  return;
}

// Removed: Distances rendering - UI elements no longer in index.html
// function renderDistances() {
//   ... (removed content)
// }

// Removed: Distances rendering - UI elements no longer in index.html
function renderDistances() {
  // Photos and locations removed from UI
  console.warn('renderDistances called but locations UI has been removed');
  return;
}

/**
 * Open photo modal for viewing/editing
 */
function openPhotoModal(photo) {
  const modal = document.getElementById("photoModal");
  const canvas = document.getElementById("photoCanvas");
  const sectionSelect = document.getElementById("photoSectionSelect");
  const descriptionInput = document.getElementById("photoDescriptionInput");
  const gpsDisplay = document.getElementById("photoGpsDisplay");
  const capturedDisplay = document.getElementById("photoCapturedDisplay");
  const cameraDisplay = document.getElementById("photoCameraDisplay");

  if (!modal || !canvas) return;

  // Store current photo ID for editing
  modal.dataset.photoId = photo.id;

  // Populate section dropdown - use actual sections from the app, not just schema
  sectionSelect.innerHTML = '<option value="">Not assigned</option>';

  // Get sections that are actually being displayed in the app
  const sectionsToShow = Array.isArray(lastSections) && lastSections.length
    ? lastSections
    : (Array.isArray(SECTION_SCHEMA) ? SECTION_SCHEMA : []);

  // Create a Set to track unique section names (avoid duplicates)
  const addedSections = new Set();

  sectionsToShow.forEach((section) => {
    const sectionName = section.section || section.name;
    if (!sectionName || addedSections.has(sectionName)) return;

    addedSections.add(sectionName);
    const option = document.createElement("option");
    option.value = sectionName;
    option.textContent = sectionName;
    if (sectionName === photo.section) {
      option.selected = true;
    }
    sectionSelect.appendChild(option);
  });

  // Populate metadata
  descriptionInput.value = photo.description || "";

  if (photo.gps) {
    const accuracy = photo.gps.accuracy ? ` (±${photo.gps.accuracy.toFixed(1)}m)` : "";
    gpsDisplay.innerHTML = `
      Lat: ${photo.gps.lat.toFixed(6)}, Lng: ${photo.gps.lng.toFixed(6)}${accuracy}<br>
      ${photo.gps.alt ? `Alt: ${photo.gps.alt.toFixed(1)}m` : ""}
    `;
  } else {
    gpsDisplay.textContent = "No GPS data available";
  }

  capturedDisplay.textContent = new Date(photo.capturedAt).toLocaleString();

  if (photo.camera) {
    cameraDisplay.textContent = `${photo.camera.make || ""} ${photo.camera.model || ""}`.trim() || "Unknown";
  } else {
    cameraDisplay.textContent = "Unknown";
  }

  // Load image onto canvas
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Draw existing markers and annotations
    drawPhotoAnnotations(canvas, photo);
  };
  img.src = photo.base64;

  // Show modal
  modal.classList.add("active");
}

/**
 * Draw annotations on photo canvas
 */
function drawPhotoAnnotations(canvas, photo) {
  const ctx = canvas.getContext("2d");

  // Draw markers
  if (photo.markers && photo.markers.length > 0) {
    photo.markers.forEach((marker) => {
      const x = marker.x * canvas.width;
      const y = marker.y * canvas.height;

      // Draw marker pin
      ctx.fillStyle = "rgba(255, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();

      // Draw label
      if (marker.label) {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.font = "bold 14px sans-serif";
        ctx.strokeText(marker.label, x + 12, y - 12);
        ctx.fillText(marker.label, x + 12, y - 12);
      }
    });
  }

  // Draw annotations (lines, arrows, rectangles, etc.)
  if (photo.annotations && photo.annotations.length > 0) {
    photo.annotations.forEach((annotation) => {
      ctx.strokeStyle = annotation.color || "red";
      ctx.fillStyle = annotation.color || "red";
      ctx.lineWidth = annotation.width || 3;

      if (annotation.type === "line") {
        ctx.beginPath();
        ctx.moveTo(annotation.x1 * canvas.width, annotation.y1 * canvas.height);
        ctx.lineTo(annotation.x2 * canvas.width, annotation.y2 * canvas.height);
        ctx.stroke();
      } else if (annotation.type === "arrow") {
        const x1 = annotation.x1 * canvas.width;
        const y1 = annotation.y1 * canvas.height;
        const x2 = annotation.x2 * canvas.width;
        const y2 = annotation.y2 * canvas.height;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowLength = 15;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - arrowLength * Math.cos(angle - Math.PI / 6),
          y2 - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - arrowLength * Math.cos(angle + Math.PI / 6),
          y2 - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (annotation.type === "rectangle") {
        const x = Math.min(annotation.x1, annotation.x2) * canvas.width;
        const y = Math.min(annotation.y1, annotation.y2) * canvas.height;
        const width = Math.abs(annotation.x2 - annotation.x1) * canvas.width;
        const height = Math.abs(annotation.y2 - annotation.y1) * canvas.height;

        ctx.strokeRect(x, y, width, height);
      }
    });
  }
}

async function saveSessionToFile() {
  const fullTranscript = transcriptInput.value.trim() || committedTranscript || "";
  const session = {
    version: 2, // Incremented for new photo/form/location features
    createdAt: new Date().toISOString(),
    fullTranscript,
    sections: lastRawSections,
    materials: lastMaterials,
    checkedItems: lastCheckedItems,
    missingInfo: lastMissingInfo,
    customerSummary: lastCustomerSummary,
    quoteNotes: lastQuoteNotes,
    // New fields for photo, GPS, and structured form support
    photos: sessionPhotos,
    formData: sessionFormData,
    locations: sessionLocations,
    distances: sessionDistances
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

  const format = getExportFormat();
  const defaultName = "depot-voice-session";
  const userName = prompt("Session file name (without extension):", defaultName);
  if (userName === null) return;
  const safeName = (userName || defaultName).replace(/[^a-z0-9_\-]+/gi, "-");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  let fileBlob, filename;

  if (format === 'csv') {
    // Note: CSV format cannot include audio data
    if (session.audioBase64) {
      const includeAudioWarning = confirm(
        "CSV format cannot include audio data. The session will be saved without audio. Continue?"
      );
      if (!includeAudioWarning) return;
    }
    const csvContent = sessionToSingleCSV(session);
    fileBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    filename = `${safeName}-${ts}.csv`;
  } else {
    const jsonStr = JSON.stringify(session, null, 2);
    fileBlob = new Blob([jsonStr], { type: "application/json" });
    filename = `${safeName}-${ts}.depotvoice.json`;
  }

  const url = URL.createObjectURL(fileBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// NOTE: saveSessionBtn has been replaced by the unified Save menu
// The old saveSessionBtn.onclick handler has been removed - use saveMenuBtn instead

importAudioBtn.onclick = () => importAudioInput.click();
importAudioInput.onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await sendAudio(file);
  } catch (_) {}
  importAudioInput.value = "";
};

// --- PHOTO UPLOAD --- (Removed: UI elements no longer in index.html)

loadSessionBtn.onclick = () => loadSessionInput.click();
if (loadCloudSessionBtn) {
  loadCloudSessionBtn.onclick = async () => {
    await loadSessionFromCloud();
  };
}
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
    // Load new photo, form, and location data (backward compatible)
    sessionPhotos = Array.isArray(session.photos) ? session.photos : [];
    sessionFormData = session.formData && typeof session.formData === 'object' ? session.formData : {};
    sessionLocations = session.locations && typeof session.locations === 'object' ? session.locations : {};
    sessionDistances = session.distances && typeof session.distances === 'object' ? session.distances : {};
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
    lastQuoteNotes = extractQuoteVariants(session);
    const normalisedFromSession = normaliseSectionsFromResponse({ sections: lastRawSections }, SECTION_SCHEMA);
    lastRawSections = Array.isArray(normalisedFromSession) ? normalisedFromSession : [];
    syncSectionsState(lastRawSections);
    refreshUiFromState();
    renderPhotoGallery();
    renderDistances();
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

// --- DUPLICATE SESSION ---
const duplicateSessionBtn = document.getElementById("duplicateSessionBtn");
if (duplicateSessionBtn) {
  duplicateSessionBtn.onclick = async () => {
    try {
      // Check if there's any content to duplicate
      const fullTranscript = (transcriptInput.value || "").trim();
      const hasContent =
        fullTranscript ||
        (Array.isArray(lastRawSections) && lastRawSections.length > 0) ||
        (Array.isArray(lastMaterials) && lastMaterials.length > 0) ||
        (Array.isArray(lastCheckedItems) && lastCheckedItems.length > 0) ||
        (Array.isArray(lastMissingInfo) && lastMissingInfo.length > 0) ||
        (lastCustomerSummary && lastCustomerSummary.trim());

      if (!hasContent) {
        showVoiceError("No content to duplicate. Create some notes first.");
        return;
      }

      // Create a deep copy of the current session with new timestamp
      const duplicatedSession = {
        version: 1,
        createdAt: new Date().toISOString(),
        fullTranscript: fullTranscript,
        sections: JSON.parse(JSON.stringify(lastRawSections)),
        materials: JSON.parse(JSON.stringify(lastMaterials)),
        checkedItems: JSON.parse(JSON.stringify(lastCheckedItems)),
        missingInfo: JSON.parse(JSON.stringify(lastMissingInfo)),
        customerSummary: lastCustomerSummary
      };

      // Duplicate audio if present
      if (sessionAudioChunks && sessionAudioChunks.length > 0) {
        try {
          const mime = lastAudioMime || "audio/webm";
          const audioBlob = new Blob(sessionAudioChunks, { type: mime });
          const base64 = await blobToBase64(audioBlob);
          duplicatedSession.audioMime = mime;
          duplicatedSession.audioBase64 = base64;
        } catch (audioErr) {
          console.warn("Failed to duplicate audio", audioErr);
        }
      }

      // Generate filename
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultName = "depot-voice-session-copy";
      const userName = prompt("Enter filename for duplicated session (without extension):", defaultName);
      if (userName === null) return;

      const safeName = (userName || defaultName).replace(/[^a-z0-9_\-]+/gi, "-");
      const filename = `${safeName}-${ts}.depotvoice.json`;

      // Create and download the file
      const jsonStr = JSON.stringify(duplicatedSession, null, 2);
      const fileBlob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus("Session duplicated and downloaded successfully.");
    } catch (err) {
      console.error("Duplicate session error:", err);
      showVoiceError("Could not duplicate session: " + (err.message || "Unknown error"));
    }
  };
}

// --- LIVE SPEECH (on-device) ---
function updateTextareaFromBuffers() {
  const committed = committedTranscript.trim();
  const interim = interimTranscript.trim();
  const parts = [];
  if (committed) parts.push(committed);
  if (interim) parts.push(interim);
  const combined = parts.join(parts.length > 1 ? " " : "");
  transcriptInput.value = combined.trim();
  // Update the display to show real-time transcription
  if (typeof renderTranscriptDisplay === 'function') {
    renderTranscriptDisplay();
  }
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
    if (sawFinal) {
      // Auto-save transcript locally whenever we get final text
      autoSaveSessionToLocal();
      if (liveState === "running") {
        scheduleNextChunk();
      }
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
      setLiveState("idle");
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
        setLiveState("idle");
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
  setLiveState("running");
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
    setLiveState("idle");
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
    setLiveState("paused");
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
    setLiveState("running");
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
      setLiveState("idle");
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
  setLiveState("idle");
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
    setStatus("📴 Offline – storing notes locally.");
    showSleepWarning("You're offline. Transcript is saved locally but won't be processed until you're back online.");
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

      // Provide more specific error messages based on status code
      let errorMessage = `Worker error ${res.status}`;
      if (res.status === 404) {
        errorMessage = "⚠️ AI worker not found. Service may be unavailable.";
      } else if (res.status === 500 || res.status === 502 || res.status === 503) {
        errorMessage = "⚠️ AI worker is temporarily unavailable. Your transcript is saved locally.";
      } else if (res.status === 401 || res.status === 403) {
        errorMessage = "⚠️ Authentication error. Please check your settings.";
      } else if (res.status >= 400 && res.status < 500) {
        errorMessage = `⚠️ Request error (${res.status}). Check your configuration.`;
      }

      throw new Error(errorMessage + snippet);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("Voice worker returned non-JSON:", raw);
      showVoiceError("⚠️ AI response wasn't in the expected format. Your transcript is saved. Please try again or check connection.");
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
    console.error("Worker communication error:", err);

    // Check if it's a network error
    const isNetworkError = err.message && (
      err.message.includes('fetch') ||
      err.message.includes('network') ||
      err.message.includes('NetworkError') ||
      err.message.includes('Failed to fetch') ||
      err.name === 'TypeError'
    );

    if (isNetworkError) {
      showVoiceError("🌐 Network error. Your transcript is saved locally. Check your internet connection or try again later.");
      if (liveState === "running") {
        setStatus("Network issue – will retry automatically.");
      } else {
        setStatus("Network error. Data saved locally.");
      }
    } else {
      showVoiceError(err.message || "⚠️ AI processing failed. Your transcript is saved locally.");
      if (liveState === "running") {
        setStatus("Update failed – will retry later.");
      } else {
        setStatus("Update failed. Data saved locally.");
      }
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

if (sendSectionsBtn) {
  sendSectionsBtn.addEventListener("click", () => {
    const autoSections = getSectionsForSharing();
    const aiSections = getAiNotes();
    showSendSectionsSlideOver({ autoSections, aiSections });
  });
}

if (autoFillSessionBtn) {
  autoFillSessionBtn.addEventListener("click", handleAutoFillFromTranscript);
}

// Customer Summary Print Button
const printCustomerSummaryBtn = document.getElementById("printCustomerSummaryBtn");
if (printCustomerSummaryBtn) {
  printCustomerSummaryBtn.addEventListener("click", () => {
    generateAndPrintCustomerSummary();
  });
}

function generateAndPrintCustomerSummary() {
  // Extract customer notes (natural language) from sections
  const customerNotes = lastSections
    .filter(sec => sec.naturalLanguage && sec.naturalLanguage.trim() !== "No additional notes.")
    .map(sec => ({
      section: sec.section,
      description: sec.naturalLanguage
    }));

  if (customerNotes.length === 0) {
    alert("No customer notes available yet. Please capture or generate notes first.");
    return;
  }

  // Generate customer summary HTML
  const summaryHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Customer Summary - Heating Installation</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .subtitle {
      margin: 0;
      opacity: 0.9;
      font-size: 16px;
    }
    .date {
      margin-top: 10px;
      opacity: 0.8;
      font-size: 14px;
    }
    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    .section-title {
      color: #667eea;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 5px;
    }
    .section-content {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #667eea;
    }
    .feature-item {
      margin-bottom: 15px;
      padding: 12px;
      background: white;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .feature-title {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 5px;
    }
    .benefit {
      color: #059669;
      font-style: italic;
      margin-top: 5px;
    }
    .print-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 20px;
    }
    .print-btn:hover {
      background: #5568d3;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print This Summary</button>

  <div class="header">
    <h1>Heating Installation Summary</h1>
    <p class="subtitle">Proposed work and benefits for your property</p>
    <p class="date">Generated: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>

  ${customerNotes.map(note => `
    <div class="section">
      <div class="section-title">${note.section}</div>
      <div class="section-content">
        ${extractFeaturesAndBenefits(note.description)}
      </div>
    </div>
  `).join('')}

  ${lastCustomerSummary ? `
    <div class="section">
      <div class="section-title">Overall Summary</div>
      <div class="section-content">
        <p>${lastCustomerSummary}</p>
      </div>
    </div>
  ` : ''}

  <div class="footer">
    <p>This summary is based on your property survey and requirements discussed.<br>
    All work will be carried out by qualified engineers to current building regulations.</p>
  </div>
</body>
</html>
  `;

  // Open in new window and trigger print
  const printWindow = window.open('', '_blank');
  printWindow.document.write(summaryHTML);
  printWindow.document.close();
}

function extractFeaturesAndBenefits(description) {
  // Simple formatting to extract features and benefits
  const sentences = description.split(/[.!?]+/).filter(s => s.trim());

  return sentences.map(sentence => {
    const trimmed = sentence.trim();
    if (!trimmed) return '';

    // Detect benefit keywords
    const hasBenefit = /\b(benefit|advantage|improve|ensure|provide|reduce|increase|save|efficient|safer|better|more reliable)\b/i.test(trimmed);

    if (hasBenefit) {
      return `<div class="feature-item">
        <div class="feature-title">✓ ${trimmed}</div>
        <div class="benefit">Benefit: This ${trimmed.toLowerCase().includes('save') ? 'saves you money' : trimmed.toLowerCase().includes('safe') ? 'improves safety' : trimmed.toLowerCase().includes('efficient') ? 'increases efficiency' : 'provides better comfort'}</div>
      </div>`;
    } else {
      return `<div class="feature-item">
        <div class="feature-title">${trimmed}</div>
      </div>`;
    }
  }).join('');
}

window.addEventListener("aiNotesUpdated", (event) => {
  updateSendSectionsSlideOver({
    autoSections: getSectionsForSharing(),
    aiSections: (event?.detail?.notes && Array.isArray(event.detail.notes)) ? event.detail.notes : getAiNotes()
  });
});

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
            lastQuoteNotes = Array.isArray(snap.quoteNotes) ? normaliseQuoteVariants(snap.quoteNotes) : [];
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
  lastQuoteNotes = [];
  currentSession = createEmptyDepotSurveySession();
  aiFilledPaths.clear();
  localStorage.removeItem(LS_AUTOSAVE_KEY);
  clearVoiceError();
  clearSleepWarning();
  setWorkerDebugPayload(null);
  syncSectionsState([]);
  refreshUiFromState();
  updateLiveControls();
  setStatus("Ready for new job.");
  transcriptInput.focus?.();
  renderTranscriptDisplay();
}

// ============================================================================
// CLARIFICATION MODAL (Voice Notes 2.0)
// ============================================================================

let clarificationModalActive = false;
let clarificationData = {
  quoteCount: 'auto',
  additionalContext: '',
  skipModal: false
};

function showClarificationModal() {
  return new Promise((resolve) => {
    // Check if modal should be skipped (from settings)
    const skipClarification = localStorage.getItem('depot.skipClarificationModal');
    if (skipClarification === 'true') {
      resolve({ proceed: true, context: '', quoteCount: 'auto' });
      return;
    }

    const modal = document.getElementById('clarificationModal');
    const multipleQuotesSection = document.getElementById('multipleQuotesSection');
    const clarificationContext = document.getElementById('clarificationContext');
    const quoteCountBtns = document.querySelectorAll('.quote-count-btn');

    // Detect if multiple quotes are mentioned
    const hasMultipleQuotes = detectMultipleQuotesInTranscript();
    if (hasMultipleQuotes) {
      multipleQuotesSection.style.display = 'block';
    } else {
      multipleQuotesSection.style.display = 'none';
    }

    // Reset form
    clarificationContext.value = '';
    clarificationData.quoteCount = 'auto';

    // Update active button
    quoteCountBtns.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.count === 'auto') {
        btn.classList.add('active');
      }
    });

    modal.style.display = 'flex';
    clarificationModalActive = true;

    // Handle quote count button clicks
    const handleQuoteCountClick = (e) => {
      if (e.target.classList.contains('quote-count-btn')) {
        quoteCountBtns.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        clarificationData.quoteCount = e.target.dataset.count;
      }
    };

    // Close/Skip handlers
    const closeModal = (proceed) => {
      modal.style.display = 'none';
      clarificationModalActive = false;

      // Clean up event listeners
      multipleQuotesSection.removeEventListener('click', handleQuoteCountClick);

      resolve({
        proceed,
        context: clarificationContext.value.trim(),
        quoteCount: clarificationData.quoteCount
      });
    };

    // Attach event listeners
    multipleQuotesSection.addEventListener('click', handleQuoteCountClick);

    document.getElementById('closeClarificationBtn').onclick = () => closeModal(false);
    document.getElementById('skipClarificationBtn').onclick = () => closeModal(true);
    document.getElementById('proceedWithClarificationBtn').onclick = () => closeModal(true);

    // Close on background click
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal(false);
      }
    };
  });
}

async function sendTextWithClarification() {
  const result = await showClarificationModal();

  if (!result.proceed) {
    console.log('User cancelled clarification modal');
    return;
  }

  // Store clarification context for the request
  if (result.context) {
    window.__clarificationContext = result.context;
  }
  if (result.quoteCount && result.quoteCount !== 'auto') {
    window.__requestedQuoteCount = result.quoteCount;
  }

  // Proceed with original sendText
  await sendText();

  // Clean up
  delete window.__clarificationContext;
  delete window.__requestedQuoteCount;
}

sendTextBtn.onclick = sendTextWithClarification;
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
if (clearAllBtn) {
  clearAllBtn.onclick = () => {
    if (confirm("Clear everything and reset the app?")) {
      resetSessionState();
      clearSessionName();
      localStorage.removeItem(SESSION_TRANSCRIPTS_KEY);
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

    // Auto-recording disabled - user must manually click Start button
    // if (originalStartLiveSession) {
    //   originalStartLiveSession();
    // }
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
// PHOTO MODAL HANDLERS
// ============================================================================

const photoModal = document.getElementById("photoModal");
const closePhotoModalBtn = document.getElementById("closePhotoModalBtn");
const savePhotoBtn = document.getElementById("savePhotoBtn");
const deletePhotoBtn = document.getElementById("deletePhotoBtn");
const addMarkerBtn = document.getElementById("addMarkerBtn");
const drawLineBtn = document.getElementById("drawLineBtn");
const drawArrowBtn = document.getElementById("drawArrowBtn");
const drawRectBtn = document.getElementById("drawRectBtn");
const clearAnnotationsBtn = document.getElementById("clearAnnotationsBtn");

// Helper function to get coordinates from mouse or touch event
function getEventCoords(e, rect) {
  const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || e.changedTouches?.[0]?.clientX);
  const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || e.changedTouches?.[0]?.clientY);
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

// Close modal
if (closePhotoModalBtn) {
  closePhotoModalBtn.addEventListener('click', () => {
    if (photoModal) {
      photoModal.classList.remove('active');
    }
  });
}

// Save photo changes
if (savePhotoBtn) {
  savePhotoBtn.addEventListener('click', () => {
    const photoId = photoModal?.dataset.photoId;
    if (!photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    // Update section and description
    const sectionSelect = document.getElementById("photoSectionSelect");
    const descriptionInput = document.getElementById("photoDescriptionInput");

    if (sectionSelect) {
      photo.section = sectionSelect.value;
    }

    if (descriptionInput) {
      photo.description = descriptionInput.value.trim();
    }

    // Update locations and distances
    updateLocationsFromPhotos();
    renderPhotoGallery();
    renderDistances();
    exposeStateToWindow();

    // Close modal
    photoModal.classList.remove('active');
    setStatus("Photo updated");
  });
}

// Delete photo
if (deletePhotoBtn) {
  deletePhotoBtn.addEventListener('click', () => {
    const photoId = photoModal?.dataset.photoId;
    if (!photoId) return;

    const confirmed = confirm("Delete this photo?");
    if (!confirmed) return;

    // Remove photo from array
    const index = sessionPhotos.findIndex(p => p.id === photoId);
    if (index >= 0) {
      sessionPhotos.splice(index, 1);
    }

    // Update UI
    updateLocationsFromPhotos();
    renderPhotoGallery();
    renderDistances();
    exposeStateToWindow();

    // Close modal
    photoModal.classList.remove('active');
    setStatus("Photo deleted");
  });
}

// Add marker to photo
if (addMarkerBtn) {
  addMarkerBtn.addEventListener('click', () => {
    const canvas = document.getElementById("photoCanvas");
    const photoId = photoModal?.dataset.photoId;
    if (!canvas || !photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    const label = prompt("Enter marker label (e.g., 'Boiler', 'Gas meter', 'Flue terminal'):");
    if (!label) return;

    // Set up one-time click/touch handler on canvas
    const handleClick = (e) => {
      e.preventDefault(); // Prevent default touch behavior
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const x = coords.x / canvas.width;
      const y = coords.y / canvas.height;

      // Add marker
      if (!photo.markers) photo.markers = [];
      photo.markers.push({
        id: `marker-${Date.now()}`,
        label,
        x,
        y
      });

      // Redraw canvas
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        drawPhotoAnnotations(canvas, photo);
      };
      img.src = photo.base64;

      // Remove click/touch handlers
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchend', handleClick);
      canvas.style.cursor = 'crosshair';
      setStatus("Marker added");
    };

    canvas.style.cursor = 'crosshair';
    setStatus("Click on the photo to place the marker");
    canvas.addEventListener('click', handleClick, { once: true });
    canvas.addEventListener('touchend', handleClick, { once: true });
  });
}

// Draw Line button
if (drawLineBtn) {
  drawLineBtn.addEventListener('click', () => {
    const canvas = document.getElementById("photoCanvas");
    const photoId = photoModal?.dataset.photoId;
    if (!canvas || !photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    let startPoint = null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.style.position = 'absolute';
    tempCanvas.style.top = '0';
    tempCanvas.style.left = '0';
    tempCanvas.style.pointerEvents = 'none';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tempCanvas);

    // First click: set start point
    const handleFirstClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      startPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };
      canvas.style.cursor = 'crosshair';
      setStatus("Click where the line should end");
      canvas.removeEventListener('click', handleFirstClick);
      canvas.removeEventListener('touchend', handleFirstClick);
      canvas.addEventListener('click', handleSecondClick);
      canvas.addEventListener('touchend', handleSecondClick);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('touchmove', handleTouchMove);
    };

    // Mouse/touch move: show preview line
    const handleMouseMove = (e) => {
      if (!startPoint) return;
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);
      tempCtx.beginPath();
      tempCtx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
      tempCtx.lineTo(currentX, currentY);
      tempCtx.stroke();
      tempCtx.setLineDash([]);
    };

    const handleTouchMove = (e) => {
      if (!startPoint) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);
      tempCtx.beginPath();
      tempCtx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
      tempCtx.lineTo(coords.x, coords.y);
      tempCtx.stroke();
      tempCtx.setLineDash([]);
    };

    // Second click: complete the line
    const handleSecondClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const endPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };

      // Add annotation
      if (!photo.annotations) photo.annotations = [];
      photo.annotations.push({
        id: `line-${Date.now()}`,
        type: 'line',
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        color: 'red',
        width: 3
      });

      // Cleanup
      canvas.removeEventListener('click', handleSecondClick);
      canvas.removeEventListener('touchend', handleSecondClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.style.cursor = 'default';
      if (tempCanvas.parentElement) {
        tempCanvas.parentElement.removeChild(tempCanvas);
      }

      // Redraw canvas with new annotation
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        drawPhotoAnnotations(canvas, photo);
      };
      img.src = photo.base64;

      setStatus("Line added");
    };

    canvas.style.cursor = 'crosshair';
    setStatus("Click where the line should start");
    canvas.addEventListener('click', handleFirstClick);
    canvas.addEventListener('touchend', handleFirstClick);
  });
}

// Draw Arrow button
if (drawArrowBtn) {
  drawArrowBtn.addEventListener('click', () => {
    const canvas = document.getElementById("photoCanvas");
    const photoId = photoModal?.dataset.photoId;
    if (!canvas || !photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    let startPoint = null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.style.position = 'absolute';
    tempCanvas.style.top = '0';
    tempCanvas.style.left = '0';
    tempCanvas.style.pointerEvents = 'none';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tempCanvas);

    const handleFirstClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      startPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };
      canvas.style.cursor = 'crosshair';
      setStatus("Click where the arrow should point");
      canvas.removeEventListener('click', handleFirstClick);
      canvas.removeEventListener('touchend', handleFirstClick);
      canvas.addEventListener('click', handleSecondClick);
      canvas.addEventListener('touchend', handleSecondClick);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('touchmove', handleTouchMove);
    };

    const handleMouseMove = (e) => {
      if (!startPoint) return;
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const currentX = coords.x;
      const currentY = coords.y;

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);

      const x1 = startPoint.x * canvas.width;
      const y1 = startPoint.y * canvas.height;

      // Draw line
      tempCtx.beginPath();
      tempCtx.moveTo(x1, y1);
      tempCtx.lineTo(currentX, currentY);
      tempCtx.stroke();

      // Draw arrowhead preview
      const angle = Math.atan2(currentY - y1, currentX - x1);
      const arrowLength = 15;
      tempCtx.beginPath();
      tempCtx.moveTo(currentX, currentY);
      tempCtx.lineTo(
        currentX - arrowLength * Math.cos(angle - Math.PI / 6),
        currentY - arrowLength * Math.sin(angle - Math.PI / 6)
      );
      tempCtx.moveTo(currentX, currentY);
      tempCtx.lineTo(
        currentX - arrowLength * Math.cos(angle + Math.PI / 6),
        currentY - arrowLength * Math.sin(angle + Math.PI / 6)
      );
      tempCtx.stroke();
      tempCtx.setLineDash([]);
    };

    const handleTouchMove = (e) => {
      if (!startPoint) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const currentX = coords.x;
      const currentY = coords.y;

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);

      const x1 = startPoint.x * canvas.width;
      const y1 = startPoint.y * canvas.height;

      // Draw line
      tempCtx.beginPath();
      tempCtx.moveTo(x1, y1);
      tempCtx.lineTo(currentX, currentY);
      tempCtx.stroke();

      // Draw arrowhead preview
      const angle = Math.atan2(currentY - y1, currentX - x1);
      const arrowLength = 15;
      tempCtx.beginPath();
      tempCtx.moveTo(currentX, currentY);
      tempCtx.lineTo(
        currentX - arrowLength * Math.cos(angle - Math.PI / 6),
        currentY - arrowLength * Math.sin(angle - Math.PI / 6)
      );
      tempCtx.moveTo(currentX, currentY);
      tempCtx.lineTo(
        currentX - arrowLength * Math.cos(angle + Math.PI / 6),
        currentY - arrowLength * Math.sin(angle + Math.PI / 6)
      );
      tempCtx.stroke();
      tempCtx.setLineDash([]);
    };

    const handleSecondClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const endPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };

      if (!photo.annotations) photo.annotations = [];
      photo.annotations.push({
        id: `arrow-${Date.now()}`,
        type: 'arrow',
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        color: 'red',
        width: 3
      });

      canvas.removeEventListener('click', handleSecondClick);
      canvas.removeEventListener('touchend', handleSecondClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.style.cursor = 'default';
      if (tempCanvas.parentElement) {
        tempCanvas.parentElement.removeChild(tempCanvas);
      }

      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        drawPhotoAnnotations(canvas, photo);
      };
      img.src = photo.base64;

      setStatus("Arrow added");
    };

    canvas.style.cursor = 'crosshair';
    setStatus("Click where the arrow should start");
    canvas.addEventListener('click', handleFirstClick);
    canvas.addEventListener('touchend', handleFirstClick);
  });
}

// Draw Rectangle button
if (drawRectBtn) {
  drawRectBtn.addEventListener('click', () => {
    const canvas = document.getElementById("photoCanvas");
    const photoId = photoModal?.dataset.photoId;
    if (!canvas || !photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    let startPoint = null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.style.position = 'absolute';
    tempCanvas.style.top = '0';
    tempCanvas.style.left = '0';
    tempCanvas.style.pointerEvents = 'none';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tempCanvas);

    const handleFirstClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      startPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };
      canvas.style.cursor = 'crosshair';
      setStatus("Click opposite corner of rectangle");
      canvas.removeEventListener('click', handleFirstClick);
      canvas.removeEventListener('touchend', handleFirstClick);
      canvas.addEventListener('click', handleSecondClick);
      canvas.addEventListener('touchend', handleSecondClick);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('touchmove', handleTouchMove);
    };

    const handleMouseMove = (e) => {
      if (!startPoint) return;
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);

      const x = Math.min(startPoint.x * canvas.width, coords.x);
      const y = Math.min(startPoint.y * canvas.height, coords.y);
      const width = Math.abs(coords.x - startPoint.x * canvas.width);
      const height = Math.abs(coords.y - startPoint.y * canvas.height);

      tempCtx.strokeRect(x, y, width, height);
      tempCtx.setLineDash([]);
    };

    const handleTouchMove = (e) => {
      if (!startPoint) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);

      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      tempCtx.lineWidth = 3;
      tempCtx.setLineDash([5, 5]);

      const x = Math.min(startPoint.x * canvas.width, coords.x);
      const y = Math.min(startPoint.y * canvas.height, coords.y);
      const width = Math.abs(coords.x - startPoint.x * canvas.width);
      const height = Math.abs(coords.y - startPoint.y * canvas.height);

      tempCtx.strokeRect(x, y, width, height);
      tempCtx.setLineDash([]);
    };

    const handleSecondClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const coords = getEventCoords(e, rect);
      const endPoint = {
        x: coords.x / canvas.width,
        y: coords.y / canvas.height
      };

      if (!photo.annotations) photo.annotations = [];
      photo.annotations.push({
        id: `rect-${Date.now()}`,
        type: 'rectangle',
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        color: 'red',
        width: 3
      });

      canvas.removeEventListener('click', handleSecondClick);
      canvas.removeEventListener('touchend', handleSecondClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.style.cursor = 'default';
      if (tempCanvas.parentElement) {
        tempCanvas.parentElement.removeChild(tempCanvas);
      }

      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        drawPhotoAnnotations(canvas, photo);
      };
      img.src = photo.base64;

      setStatus("Rectangle added");
    };

    canvas.style.cursor = 'crosshair';
    setStatus("Click first corner of rectangle");
    canvas.addEventListener('click', handleFirstClick);
    canvas.addEventListener('touchend', handleFirstClick);
  });
}

// Clear all annotations
if (clearAnnotationsBtn) {
  clearAnnotationsBtn.addEventListener('click', () => {
    const photoId = photoModal?.dataset.photoId;
    if (!photoId) return;

    const photo = sessionPhotos.find(p => p.id === photoId);
    if (!photo) return;

    const confirmed = confirm("Clear all markers and annotations from this photo?");
    if (!confirmed) return;

    // Clear arrays
    photo.markers = [];
    photo.annotations = [];

    // Redraw canvas
    const canvas = document.getElementById("photoCanvas");
    if (canvas) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = photo.base64;
    }

    setStatus("Annotations cleared");
  });
}

// ============================================================================
// ENHANCED FINISH SESSION
// ============================================================================

const originalFinishLiveSession = finishLiveSession;
async function enhancedFinishLiveSession() {
  if (originalFinishLiveSession) {
    await originalFinishLiveSession();
  }

  // Popup removed - recording will remain on main page
  // setTimeout(() => {
  //   showFinishSessionModal();
  // }, 500);

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
    lastQuoteNotes = Array.isArray(snap.quoteNotes) ? normaliseQuoteVariants(snap.quoteNotes) : [];

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

// Checklist interactions (manual toggling)
if (clarificationsEl) {
  clarificationsEl.addEventListener('click', (event) => {
    const target = event.target.closest('.checklist-item');
    if (!target || !clarificationsEl.contains(target)) return;

    const itemId = target.dataset.itemId;
    if (!itemId) return;

    const isDone = target.classList.contains('done');
    const icon = target.querySelector('.icon');
    const updatedSet = new Set(lastCheckedItems.map(String));

    if (isDone) {
      updatedSet.delete(itemId);
      target.classList.remove('done');
      if (icon) icon.textContent = '⭕';
    } else {
      updatedSet.add(itemId);
      target.classList.add('done');
      if (icon) icon.textContent = '✅';
    }

    lastCheckedItems = Array.from(updatedSet);
    const checklistSearchInput = document.getElementById('checklistSearchInput');
    if (checklistSearchInput) {
      checklistSearchInput.dispatchEvent(new Event('input'));
    }
    exposeStateToWindow();
  });
}

// Allow agent responses to be appended directly to the transcript
window.addEventListener('appendAgentTranscript', (event) => {
  const text = event.detail?.text;
  if (!text || !transcriptInput) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const formattedLine = `[${timestamp}] Agent: ${text.trim()}`;
  const existing = transcriptInput.value.trim();

  transcriptInput.value = existing ? `${transcriptInput.value.trim()}\n${formattedLine}` : formattedLine;
  committedTranscript = transcriptInput.value.trim();
  transcriptWasManuallyEdited = true;

  if (transcriptEditedBadge) {
    transcriptEditedBadge.style.display = 'inline-flex';
  }

  renderTranscriptDisplay();
  autoSaveSessionToLocal();
});

// Transcript Editing Functionality
const editTranscriptBtn = document.getElementById('editTranscriptBtn');
const transcriptEditedBadge = document.getElementById('transcriptEditedBadge');
let isEditingTranscript = false;
let transcriptWasManuallyEdited = false;

if (editTranscriptBtn && transcriptDisplay) {
  editTranscriptBtn.addEventListener('click', () => {
    isEditingTranscript = !isEditingTranscript;

    if (isEditingTranscript) {
      // Enter edit mode
      editTranscriptBtn.textContent = '💾 Save';
      editTranscriptBtn.style.background = 'var(--success)';
      editTranscriptBtn.style.color = 'white';

      // Make the display editable
      transcriptDisplay.contentEditable = 'true';
      transcriptDisplay.style.border = '2px solid var(--accent)';
      transcriptDisplay.style.outline = 'none';
      transcriptDisplay.focus();

      // Disable search while editing
      if (transcriptSearch) transcriptSearch.disabled = true;
      if (searchPrevBtn) searchPrevBtn.disabled = true;
      if (searchNextBtn) searchNextBtn.disabled = true;

    } else {
      // Exit edit mode - save changes
      editTranscriptBtn.textContent = '✏️ Edit';
      editTranscriptBtn.style.background = '';
      editTranscriptBtn.style.color = '';

      // Get the edited text
      const editedText = transcriptDisplay.innerText || transcriptDisplay.textContent;

      // Update the hidden textarea
      transcriptInput.value = editedText;
      committedTranscript = editedText.trim();

      // Mark as manually edited
      transcriptWasManuallyEdited = true;
      if (transcriptEditedBadge) {
        transcriptEditedBadge.style.display = 'inline-flex';
      }

      // Make the display non-editable
      transcriptDisplay.contentEditable = 'false';
      transcriptDisplay.style.border = '';

      // Re-render the display
      renderTranscriptDisplay();

      // Re-enable search
      if (transcriptSearch) transcriptSearch.disabled = false;

      // Auto-save the changes
      autoSaveSessionToLocal();

      console.log('Transcript manually edited and saved');
    }
  });

  // Disable editing while live session is running
  window.addEventListener('liveSessionStateChange', (e) => {
    if (e.detail && e.detail.state === 'running') {
      if (isEditingTranscript) {
        // Force save and exit edit mode
        editTranscriptBtn.click();
      }
      editTranscriptBtn.disabled = true;
      editTranscriptBtn.title = 'Cannot edit while live session is running';
    } else {
      editTranscriptBtn.disabled = false;
      editTranscriptBtn.title = '';
    }
  });
}

// Initialize internet speed monitoring
startSpeedMonitoring();

// ============================================================================
// AGENT MODE & SEND SECTIONS INTEGRATION
// ============================================================================

// Initialize Agent Mode
initAgentMode();

// Initialize what3words
initWhat3Words();

// Initialize structured form
initStructuredForm();

// Initialize CloudSense survey form
if (typeof window.initCloudSenseSurveyForm === 'function') {
  window.initCloudSenseSurveyForm();
}



// Expose functions for external integrations
window.refreshUiFromState = refreshUiFromState;
window.saveToLocalStorage = autoSaveSessionToLocal;
window.renderPhotoGallery = renderPhotoGallery;
window.renderDistances = renderDistances;
window.updateLocationsFromPhotos = updateLocationsFromPhotos;

// Agent suggestions are always available by default
const agentSuggestionsPanel = document.getElementById('agentSuggestionsPanel');
if (agentSuggestionsPanel) {
  agentSuggestionsPanel.style.display = 'flex';
  setAgentMode(true);
}

// Hook into section updates to trigger agent analysis
const originalRefreshUiFromState = refreshUiFromState;
if (typeof refreshUiFromState === 'function') {
  window.refreshUiFromState = function(...args) {
    originalRefreshUiFromState.apply(this, args);

    // Trigger agent analysis if enabled
    if (isAgentModeEnabled() && APP_STATE.sections) {
      analyzeTranscriptForQuestions(APP_STATE.sections);
    }
  };
}

// ============================================================================
// ENHANCEMENT INTEGRATIONS
// ============================================================================

// Network status monitoring
const networkStatusEl = document.getElementById('networkStatusText');
const storageStatusEl = document.getElementById('storageStatusText');

function updateNetworkStatusUI(status) {
  if (!networkStatusEl) return;

  if (!status.isOnline) {
    networkStatusEl.textContent = 'Offline';
    networkStatusEl.style.color = '#ef4444';
  } else {
    const speedEmoji = {
      fast: '⚡',
      medium: '📶',
      slow: '🐌',
      unknown: '📡'
    };
    networkStatusEl.textContent = `${speedEmoji[status.speed] || '📡'} ${status.speed}`;
    networkStatusEl.style.color = status.speed === 'slow' ? '#f59e0b' : '#10b981';
  }
}

async function updateStorageStatusUI() {
  if (!storageStatusEl) return;

  try {
    const quota = await getStorageQuota();
    if (quota) {
      const percentUsed = quota.percentUsed.toFixed(1);
      const color = percentUsed > 80 ? '#ef4444' : percentUsed > 50 ? '#f59e0b' : '#10b981';
      storageStatusEl.innerHTML = `<span style="color: ${color}">${percentUsed}% used</span>`;
      storageStatusEl.title = `${(quota.usage / 1024 / 1024).toFixed(2)}MB / ${(quota.quota / 1024 / 1024).toFixed(2)}MB`;

      // Warn if storage is running low
      if (percentUsed > 90) {
        console.warn('Storage quota critical:', percentUsed + '%');
        showVoiceError('Storage space is running low. Consider exporting and clearing old sessions.');
      }
    } else {
      storageStatusEl.textContent = 'N/A';
    }
  } catch (err) {
    console.warn('Failed to check storage quota:', err);
    storageStatusEl.textContent = 'N/A';
  }
}

// Initialize network monitoring
networkMonitor.addListener((status) => {
  updateNetworkStatusUI(status);
  console.log('Network status:', status);
});

// Initial network status update
updateNetworkStatusUI(networkMonitor.getStatus());

// Update storage status periodically
updateStorageStatusUI();
setInterval(updateStorageStatusUI, 30000); // Update every 30 seconds

// Automatic storage cleanup on app init (remove data older than 60 days)
(async function initStorageCleanup() {
  try {
    const cleaned = cleanupOldData(60); // 60 days
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old storage items (>60 days)`);
    }
  } catch (err) {
    console.warn('Storage cleanup failed:', err);
  }
})();

// Offline queue status monitoring
offlineQueue.addListener((status) => {
  if (status.queueLength > 0) {
    setStatus(`${status.isOnline ? 'Processing' : 'Queued'}: ${status.queueLength} request(s)`);
  }
});

console.log('✅ Enhancement modules integrated successfully');
