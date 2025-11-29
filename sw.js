/**
 * Depot Voice Notes - Service Worker
 * Provides offline capability and performance optimization
 */

const CACHE_VERSION = 'depot-v1.3.2';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_API = `${CACHE_VERSION}-api`;

// Files to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/settings.html',
  '/login.html',
  '/css/proposal.css',
  '/css/cloudSenseSurvey.css',
  '/js/main.js',
  '/js/mainIntegration.js',
  '/js/saveMenu.js',
  '/js/systemRecommendationUI.js',
  '/js/customerProposalGenerator.js',
  '/js/presentationGenerator.js',
  '/js/cloudSenseSurveyForm.js',
  '/js/settingsPage.js',
  '/js/themeSettings.js',
  '/js/proposal.js',
  '/js/systemRecommendationImport.js',
  '/src/settings/settings.js',
  '/src/auth/auth-client.js',
  '/src/app/state.js',
  '/manifest.json'
];

// API endpoints to cache (with network-first strategy)
const API_PATTERNS = [
  /\/cloud-session/,
  /\/text/,
  /\/api\//
];

// Maximum cache sizes
const MAX_DYNAMIC_CACHE_SIZE = 50;
const MAX_API_CACHE_SIZE = 20;

/**
 * Install event - precache essential files
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Precaching static files...');
        // Add files one by one to avoid failing on missing files
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn(`[SW] Failed to cache ${url}:`, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting();
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete caches that don't match current version
              return cacheName.startsWith('depot-') &&
                     cacheName !== CACHE_STATIC &&
                     cacheName !== CACHE_DYNAMIC &&
                     cacheName !== CACHE_API;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip caching for chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Always use network-first for navigation and HTML requests so new versions ship immediately
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstStrategy(request, CACHE_STATIC, MAX_DYNAMIC_CACHE_SIZE));
    return;
  }

  // Different strategies for different types of requests
  if (isAPIRequest(url)) {
    // Network-first for API requests
    event.respondWith(networkFirstStrategy(request, CACHE_API, MAX_API_CACHE_SIZE));
  } else if (request.method === 'GET') {
    // Cache-first for static assets
    event.respondWith(cacheFirstStrategy(request, CACHE_DYNAMIC, MAX_DYNAMIC_CACHE_SIZE));
  } else {
    // Network-only for POST, PUT, DELETE, etc.
    event.respondWith(fetch(request));
  }
});

/**
 * Check if request is to an API endpoint
 */
function isAPIRequest(url) {
  return API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Cache-first strategy: Check cache first, fallback to network
 */
async function cacheFirstStrategy(request, cacheName, maxSize) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Cache hit:', request.url);
      return cachedResponse;
    }

    // Fallback to network
    console.log('[SW] Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());

      // Limit cache size
      limitCacheSize(cacheName, maxSize);
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);

    // Return offline fallback page
    const cache = await caches.open(CACHE_STATIC);
    const fallback = await cache.match('/index.html');
    if (fallback) {
      return fallback;
    }

    // Last resort: return error response
    return new Response('Offline - please check your connection', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

/**
 * Network-first strategy: Try network first, fallback to cache
 */
async function networkFirstStrategy(request, cacheName, maxSize) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());

      // Limit cache size
      limitCacheSize(cacheName, maxSize);
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);

    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', request.url);
      return cachedResponse;
    }

    // No cache available
    throw error;
  }
}

/**
 * Limit cache size by removing oldest entries
 */
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxSize) {
    // Remove oldest entries (first in array)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log(`[SW] Trimmed cache ${cacheName}, removed ${toDelete.length} entries`);
  }
}

/**
 * Handle messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        ))
        .then(() => {
          console.log('[SW] All caches cleared');
          return self.clients.matchAll();
        })
        .then(clients => {
          clients.forEach(client =>
            client.postMessage({ type: 'CACHE_CLEARED' })
          );
        })
    );
  }

  if (event.data && event.data.type === 'CHECK_UPDATE') {
    event.waitUntil(
      self.registration.update()
        .then(() => {
          console.log('[SW] Update check complete');
          return self.clients.matchAll();
        })
        .then(clients => {
          clients.forEach(client =>
            client.postMessage({ type: 'UPDATE_CHECKED' })
          );
        })
    );
  }
});

/**
 * Handle push notifications (placeholder for future)
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New update available',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey || 1
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Depot Voice Notes', options)
    );
  }
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  event.waitUntil(
    self.clients.openWindow('/')
  );
});

console.log('[SW] Service worker loaded');
