/**
 * BRUKINA ACCESS MARKETPLACE - PROGRESSIVE WEB APP SERVICE WORKER
 * Path: public/sw.js
 * Implements a resilient Network-First with Cache Fallback strategy for static shell elements.
 */

const CACHE_NAME = 'brukina-access-v3';

const IMMUTABLE_APP_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg'
];

// ==========================================================================
// 1. INSTALLATION GATING (SHELL PROVISIONING)
// ==========================================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🔄 Provisioning immutable Brukina core layout shell assets...');
        return cache.addAll(IMMUTABLE_APP_ASSETS);
      })
      // Enforces execution strictly after assets are completely cached to prevent partial boots
      .then(() => self.skipWaiting())
  );
});

// ==========================================================================
// 2. ACTIVATION & CACHE CLEANUP LOOP
// ==========================================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log(`扫 SWEEPING: Clearing legacy platform cache cluster instance: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ==========================================================================
// 3. SECURE TRAFFIC INTERCEPTION MECHANISM
// ==========================================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL BYPASS: Never intercept or cache real-time Supabase database records, live states, or backend API proxies
  if (
    url.hostname.includes('.supabase.co') || 
    url.href.includes('postgres_changes') ||
    url.pathname.includes('/api/')
  ) {
    return; // Stream directly from the cloud backend without caching mutations
  }

  // Gated interception to bypass caching for non-GET requests (POST writes, wallet withdrawals, order logs)
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-First with Cache Fallback Execution Pipeline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Safe check: Only cache valid successful GET asset fetches
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline Fallback Layer: Query local storage if cell connectivity drops
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // Serve main single-page index shell if navigating deep routes offline
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
