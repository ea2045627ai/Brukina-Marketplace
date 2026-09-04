const CACHE = 'brukina-v3';
const ASSETS = ['./', './index.html', './styles.css', './pages.css', './login.css', './app.js', './lib/validation.mjs', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))));
