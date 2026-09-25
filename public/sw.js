const CACHE_NAME = 'brukina-access-v3';

const IMMUTABLE_APP_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg'
];

// 1. Install Event: Hydrate and establish the structural app shell cache matrix
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SERVICE WORKER] Caching core static application shell assets...');
      return cache.addAll(IMMUTABLE_APP_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up deprecated cache versions from local storage namespaces
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log(`[SERVICE WORKER] Purging out-of-date cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Intercept shell assets and isolate volatile data transactions
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // FIXED: Explicitly bypass data layer transactions, tracking streams, and non-GET requests
  if (
    event.request.method !== 'GET' ||
    url.includes('.supabase.co') || 
    url.includes('postgres_changes')
  ) {
    return; // Direct network execution fallback
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // FIXED: Cache-First for static assets to ensure near-instant load times on mobile
      const isStaticShellAsset = IMMUTABLE_APP_ASSETS.some(asset => url.endsWith(asset) || (asset === '/' && url === self.location.origin + '/'));
      
      if (cachedResponse && isStaticShellAsset) {
        return cachedResponse;
      }

      // Network-First with Cache Fallback strategy for dynamic app assets
      return fetch(event.request)
        .then((networkResponse) => {
          // Verify valid response parameters prior to populating the local cache ledger
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, serve from cache or fall back to index.html for Single Page Application navigation
          if (cachedResponse) return cachedResponse;
          
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
