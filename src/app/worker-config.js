const BUILT_IN_ENDPOINT = "https://depot-voice-notes.martinbibb.workers.dev";
const PRIMARY_STORAGE_KEY = "depot.workerUrl";
const LEGACY_STORAGE_KEYS = ["depot-worker-url"];
const STORAGE_KEYS = [PRIMARY_STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

function resolveStorage(customStorage) {
  if (customStorage) return customStorage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

function readStoredEndpoint(storage) {
  if (!storage) return null;
  for (const key of STORAGE_KEYS) {
    try {
      const raw = storage.getItem(key);
      if (raw && typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    } catch (_) {
      // ignore storage access issues
    }
  }
  return null;
}

function removeStoredEndpoint(storage) {
  if (!storage) return;
  STORAGE_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch (_) {
      // ignore storage access issues
    }
  });
}

export function loadWorkerEndpoint(options = {}) {
  const { storage: customStorage, fallback = BUILT_IN_ENDPOINT } = options;
  const storage = resolveStorage(customStorage);
  const stored = readStoredEndpoint(storage);
  return stored || fallback;
}

export function saveWorkerEndpointOverride(url, options = {}) {
  const { storage: customStorage } = options;
  const storage = resolveStorage(customStorage);
  if (!storage) return;
  const trimmed = (url || "").trim();
  if (!trimmed) {
    removeStoredEndpoint(storage);
    return;
  }
  try {
    storage.setItem(PRIMARY_STORAGE_KEY, trimmed);
  } catch (_) {
    // ignore storage access issues
  }
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch (_) {
      // ignore
    }
  });
}

export function clearWorkerEndpointOverride(options = {}) {
  const { storage: customStorage } = options;
  const storage = resolveStorage(customStorage);
  removeStoredEndpoint(storage);
}

export function hasWorkerEndpointOverride(options = {}) {
  const { storage: customStorage } = options;
  const storage = resolveStorage(customStorage);
  return Boolean(readStoredEndpoint(storage));
}

export function isWorkerEndpointStorageKey(key) {
  return STORAGE_KEYS.includes(key);
}

export const DEFAULT_WORKER_ENDPOINT = BUILT_IN_ENDPOINT;
export const WORKER_ENDPOINT_STORAGE_KEY = PRIMARY_STORAGE_KEY;
export const WORKER_ENDPOINT_STORAGE_KEYS = STORAGE_KEYS.slice();

if (typeof window !== "undefined") {
  window.DepotWorkerConfig = Object.freeze({
    getDefaultEndpoint: () => BUILT_IN_ENDPOINT,
    getWorkerEndpoint: () => loadWorkerEndpoint(),
    setWorkerEndpointOverride: (url) => saveWorkerEndpointOverride(url),
    clearWorkerEndpointOverride: () => clearWorkerEndpointOverride(),
    hasWorkerEndpointOverride: () => hasWorkerEndpointOverride()
  });
}
