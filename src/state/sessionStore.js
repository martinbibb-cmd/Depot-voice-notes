const STORAGE_KEY = "depot.surveySession";

export function createEmptyDepotSurveySession() {
  return {
    meta: {},
    vulnerability: {},
    existingSystem: {},
    electrical: {},
    workingAtHeight: {},
    asbestos: {},
    waterSystem: {},
    boilerJob: {},
    cleansing: {},
    heatLoss: { sections: [] },
    installerNotes: {},
    allowances: { discounts: [], charges: [] },
    stores: [],
    cylinders: [],
    radiators: [],
    materials: [],
    ai: {},
    sections: [],
    missingInfo: [],
    photos: []
  };
}

function mergeDefaults(session = {}) {
  return {
    ...createEmptyDepotSurveySession(),
    ...(session || {})
  };
}

export function migrateLegacySession(legacy = {}) {
  const base = mergeDefaults();

  base.meta = {
    ...(base.meta || {}),
    ...(legacy.meta || {}),
    sessionName: legacy.sessionName || legacy.meta?.sessionName,
    version: legacy.version || legacy.meta?.version || 1,
    createdAt: legacy.createdAt || legacy.meta?.createdAt || new Date().toISOString(),
    customerName: legacy.customerName || legacy.meta?.customerName,
    customerAddress: legacy.customerAddress || legacy.meta?.customerAddress
  };

  base.vulnerability = {
    ...(base.vulnerability || {}),
    ...(legacy.vulnerability || {}),
    customerNeeds: legacy.customerNeeds || legacy.vulnerability?.customerNeeds || []
  };

  base.existingSystem = {
    ...(base.existingSystem || {}),
    ...(legacy.existingSystem || {}),
    systemType: legacy.systemType || legacy.existingSystem?.systemType,
    issues: legacy.issues || legacy.existingSystem?.issues || []
  };

  base.electrical = { ...(base.electrical || {}), ...(legacy.electrical || {}) };
  base.workingAtHeight = { ...(base.workingAtHeight || {}), ...(legacy.workingAtHeight || {}) };
  base.asbestos = { ...(base.asbestos || {}), ...(legacy.asbestos || {}) };
  base.waterSystem = { ...(base.waterSystem || {}), ...(legacy.waterSystem || {}) };
  base.boilerJob = { ...(base.boilerJob || {}), ...(legacy.boilerJob || {}) };
  base.cleansing = { ...(base.cleansing || {}), ...(legacy.cleansing || {}) };
  base.heatLoss = { ...(base.heatLoss || {}), ...(legacy.heatLoss || {}) };
  base.installerNotes = { ...(base.installerNotes || {}), ...(legacy.installerNotes || {}) };
  base.allowances = { ...(base.allowances || {}), ...(legacy.allowances || {}) };

  base.stores = Array.isArray(legacy.stores) ? legacy.stores : base.stores;
  base.cylinders = Array.isArray(legacy.cylinders) ? legacy.cylinders : base.cylinders;
  base.radiators = Array.isArray(legacy.radiators) ? legacy.radiators : base.radiators;
  base.materials = Array.isArray(legacy.materials) ? legacy.materials : base.materials;

  base.sections = Array.isArray(legacy.sections) ? legacy.sections : base.sections;
  base.missingInfo = Array.isArray(legacy.missingInfo) ? legacy.missingInfo : base.missingInfo;
  base.photos = Array.isArray(legacy.photos) ? legacy.photos : base.photos;

  base.fullTranscript = legacy.fullTranscript || legacy.transcript || base.fullTranscript;
  base.checkedItems = legacy.checkedItems || legacy.formData?.checkedItems || base.checkedItems;
  base.quoteNotes = legacy.quoteNotes || base.quoteNotes;
  base.formData = legacy.formData || base.formData;
  base.locations = legacy.locations || base.locations;
  base.distances = legacy.distances || base.distances;
  base.audioBase64 = legacy.audioBase64 || base.audioBase64;
  base.audioMime = legacy.audioMime || base.audioMime;

  base.ai = {
    ...(base.ai || {}),
    ...(legacy.ai || {}),
    customerSummary: legacy.customerSummary || legacy.ai?.customerSummary,
    customerPack: legacy.aiNotes || legacy.ai?.customerPack,
    installerPack: legacy.ai?.installerPack,
    officeNotes: legacy.ai?.officeNotes
  };

  return base;
}

export function loadSessionFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return migrateLegacySession(parsed || {});
  } catch (err) {
    console.warn("[sessionStore] Failed to load session", err);
    return null;
  }
}

export function saveSessionToStorage(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn("[sessionStore] Failed to save session", err);
  }
}

export function buildSessionFromAppState(appState = {}, options = {}) {
  const merged = migrateLegacySession(appState);
  merged.fullTranscript = options.transcript || merged.fullTranscript;
  merged.meta = {
    ...(merged.meta || {}),
    sessionName: options.sessionName || merged.meta?.sessionName,
    createdAt: merged.meta?.createdAt || new Date().toISOString()
  };
  if (options.audioBase64) merged.audioBase64 = options.audioBase64;
  if (options.audioMime) merged.audioMime = options.audioMime;
  return merged;
}

export default {
  createEmptyDepotSurveySession,
  migrateLegacySession,
  loadSessionFromStorage,
  saveSessionToStorage,
  buildSessionFromAppState
};
