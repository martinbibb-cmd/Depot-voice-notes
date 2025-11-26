/**
 * App Enhancements Module
 * Provides advanced features for efficiency, reliability, and user control
 */

// ============================================================================
// ERROR RETRY LOGIC WITH EXPONENTIAL BACKOFF
// ============================================================================

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 4,
    initialDelay = 2000,
    maxDelay = 16000,
    factor = 2,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);

        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxRetries,
            delay,
            error
          });
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Max retries (${maxRetries}) exceeded. Last error: ${lastError.message}`);
}

/**
 * Categorize error types
 * @param {Error} error - Error object
 * @returns {Object} Categorized error information
 */
export function categorizeError(error) {
  const errorStr = error.message || String(error);

  // Network errors
  if (errorStr.match(/network|fetch|connection|timeout|ECONNREFUSED/i)) {
    return {
      category: 'network',
      severity: 'warning',
      userMessage: 'Network connection issue. Retrying...',
      recoverable: true
    };
  }

  // Authentication errors
  if (errorStr.match(/401|403|unauthorized|forbidden|api.?key/i)) {
    return {
      category: 'auth',
      severity: 'error',
      userMessage: 'Authentication failed. Please check your API key.',
      recoverable: false
    };
  }

  // Rate limit errors
  if (errorStr.match(/429|rate.?limit|too.?many.?requests/i)) {
    return {
      category: 'rate_limit',
      severity: 'warning',
      userMessage: 'Rate limit exceeded. Please wait a moment.',
      recoverable: true
    };
  }

  // Server errors
  if (errorStr.match(/500|502|503|504|server.?error/i)) {
    return {
      category: 'server',
      severity: 'error',
      userMessage: 'Server error. Retrying...',
      recoverable: true
    };
  }

  // Parse/validation errors
  if (errorStr.match(/json|parse|invalid|syntax/i)) {
    return {
      category: 'parse',
      severity: 'error',
      userMessage: 'Invalid response format.',
      recoverable: false
    };
  }

  // Default unknown error
  return {
    category: 'unknown',
    severity: 'error',
    userMessage: 'An unexpected error occurred.',
    recoverable: false
  };
}

// ============================================================================
// OFFLINE REQUEST QUEUE
// ============================================================================

class OfflineRequestQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.listeners = [];
    this.loadQueue();

    // Listen for online/offline events
    window.addEventListener('online', () => this.processQueue());
    window.addEventListener('offline', () => this.onOffline());
  }

  /**
   * Add a request to the queue
   * @param {Object} request - Request object with url, method, body, etc.
   * @returns {Promise} Promise that resolves when request completes
   */
  enqueue(request) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        id: Date.now() + Math.random(),
        request,
        resolve,
        reject,
        timestamp: new Date().toISOString(),
        retries: 0
      };

      this.queue.push(queueItem);
      this.saveQueue();
      this.notifyListeners();

      if (navigator.onLine) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.isProcessing || !navigator.onLine || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && navigator.onLine) {
      const item = this.queue[0];

      try {
        const response = await fetch(item.request.url, {
          method: item.request.method || 'POST',
          headers: item.request.headers || {},
          body: item.request.body
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        item.resolve(data);
        this.queue.shift();
      } catch (error) {
        item.retries++;

        if (item.retries >= 3) {
          item.reject(error);
          this.queue.shift();
        } else {
          // Move to end of queue for retry
          this.queue.push(this.queue.shift());
        }
      }

      this.saveQueue();
      this.notifyListeners();
    }

    this.isProcessing = false;
  }

  /**
   * Save queue to localStorage
   */
  saveQueue() {
    try {
      const serializable = this.queue.map(item => ({
        id: item.id,
        request: item.request,
        timestamp: item.timestamp,
        retries: item.retries
      }));
      localStorage.setItem('depot.offlineQueue', JSON.stringify(serializable));
    } catch (err) {
      console.warn('Failed to save offline queue:', err);
    }
  }

  /**
   * Load queue from localStorage
   */
  loadQueue() {
    try {
      const saved = localStorage.getItem('depot.offlineQueue');
      if (saved) {
        const items = JSON.parse(saved);
        // Note: resolve/reject functions lost on reload, will need to be re-enqueued
        this.queue = items.map(item => ({
          ...item,
          resolve: () => {},
          reject: () => {}
        }));
      }
    } catch (err) {
      console.warn('Failed to load offline queue:', err);
    }
  }

  /**
   * Handle offline event
   */
  onOffline() {
    console.log('App went offline. Requests will be queued.');
    this.notifyListeners();
  }

  /**
   * Add listener for queue changes
   * @param {Function} callback - Callback function
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners() {
    this.listeners.forEach(cb => cb({
      queueLength: this.queue.length,
      isOnline: navigator.onLine,
      isProcessing: this.isProcessing
    }));
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isOnline: navigator.onLine,
      isProcessing: this.isProcessing,
      oldestRequest: this.queue[0]?.timestamp
    };
  }
}

// Create singleton instance
export const offlineQueue = new OfflineRequestQueue();

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

class RequestDeduplicator {
  constructor(timeWindow = 1000) {
    this.timeWindow = timeWindow; // ms
    this.pending = new Map();
    this.recentHashes = new Map();
  }

  /**
   * Generate hash for request
   * @param {Object} request - Request object
   * @returns {string} Hash string
   */
  hashRequest(request) {
    const str = JSON.stringify({
      url: request.url,
      method: request.method,
      body: request.body
    });
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Execute request with deduplication
   * @param {Object} request - Request object
   * @param {Function} executor - Function that executes the request
   * @returns {Promise} Request result
   */
  async execute(request, executor) {
    const hash = this.hashRequest(request);

    // Check if identical request is pending
    if (this.pending.has(hash)) {
      console.log('Duplicate request detected, reusing pending request');
      return this.pending.get(hash);
    }

    // Check if identical request completed recently
    const recent = this.recentHashes.get(hash);
    if (recent && (Date.now() - recent.timestamp < this.timeWindow)) {
      console.log('Duplicate request detected, reusing recent result');
      return recent.result;
    }

    // Execute new request
    const promise = executor();
    this.pending.set(hash, promise);

    try {
      const result = await promise;

      // Cache result
      this.recentHashes.set(hash, {
        timestamp: Date.now(),
        result
      });

      // Cleanup after time window
      setTimeout(() => {
        this.recentHashes.delete(hash);
      }, this.timeWindow);

      return result;
    } finally {
      this.pending.delete(hash);
    }
  }

  /**
   * Clear cache
   */
  clear() {
    this.pending.clear();
    this.recentHashes.clear();
  }
}

export const requestDeduplicator = new RequestDeduplicator(1000);

// ============================================================================
// NETWORK STATUS DETECTION
// ============================================================================

class NetworkMonitor {
  constructor() {
    this.status = {
      isOnline: navigator.onLine,
      speed: 'unknown',
      lastCheck: null
    };
    this.listeners = [];

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Test speed periodically
    this.testSpeed();
    setInterval(() => this.testSpeed(), 60000); // Every minute
  }

  /**
   * Handle online event
   */
  handleOnline() {
    this.status.isOnline = true;
    this.testSpeed();
    this.notifyListeners();
  }

  /**
   * Handle offline event
   */
  handleOffline() {
    this.status.isOnline = false;
    this.status.speed = 'offline';
    this.notifyListeners();
  }

  /**
   * Test network speed
   */
  async testSpeed() {
    if (!navigator.onLine) return;

    const startTime = Date.now();
    const testUrl = 'https://www.cloudflare.com/cdn-cgi/trace';

    try {
      await fetch(testUrl, { cache: 'no-store' });
      const duration = Date.now() - startTime;

      if (duration < 200) {
        this.status.speed = 'fast';
      } else if (duration < 1000) {
        this.status.speed = 'medium';
      } else {
        this.status.speed = 'slow';
      }

      this.status.lastCheck = new Date().toISOString();
      this.notifyListeners();
    } catch (err) {
      this.status.speed = 'unknown';
    }
  }

  /**
   * Add listener
   * @param {Function} callback - Callback function
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notify listeners
   */
  notifyListeners() {
    this.listeners.forEach(cb => cb(this.status));
  }

  /**
   * Get current status
   * @returns {Object} Network status
   */
  getStatus() {
    return { ...this.status };
  }
}

export const networkMonitor = new NetworkMonitor();

// ============================================================================
// STORAGE QUOTA MONITORING
// ============================================================================

export async function getStorageQuota() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        percentUsed: (estimate.usage / estimate.quota) * 100,
        available: estimate.quota - estimate.usage
      };
    } catch (err) {
      console.warn('Failed to get storage quota:', err);
    }
  }
  return null;
}

export function checkStorageHealth() {
  try {
    const testKey = 'depot.storageTest';
    const testData = 'x'.repeat(1000); // 1KB test

    localStorage.setItem(testKey, testData);
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);

    return retrieved === testData;
  } catch (err) {
    return false;
  }
}

export function cleanupOldData(daysOld = 30) {
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const keysToRemove = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('depot.')) continue;

    try {
      const item = JSON.parse(localStorage.getItem(key));
      const savedAt = item.savedAt || item.timestamp;

      if (savedAt && new Date(savedAt).getTime() < cutoffTime) {
        keysToRemove.push(key);
      }
    } catch (err) {
      // Skip non-JSON items
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key));
  return keysToRemove.length;
}

// ============================================================================
// MODEL COST ESTIMATION
// ============================================================================

const MODEL_COSTS = {
  'gpt-4.1': { input: 0.00003, output: 0.00006 },
  'gpt-4': { input: 0.00003, output: 0.00006 },
  'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  'claude-sonnet-4-5-20250929': { input: 0.000003, output: 0.000015 },
  'claude-opus-3-5': { input: 0.000015, output: 0.000075 },
  'claude-haiku-3-5': { input: 0.00000025, output: 0.00000125 }
};

export function estimateCost(model, inputTokens, outputTokens = 1000) {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-4.1'];
  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;
  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
    currency: 'USD'
  };
}

export function estimateTokens(text) {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}
