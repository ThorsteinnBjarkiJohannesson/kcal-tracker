// Offline app shell. Serves from cache instantly and refreshes the cache in the
// background, so a new deploy shows up on the next launch.
const CACHE = 'kcal-v4';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'vendor/zxing.min.js',
  'vendor/anthropic-sdk.mjs',
  'vendor/otel-api.mjs',
  'vendor/standardwebhooks.mjs',
  'vendor/stablelib-base64.mjs',
  'vendor/fast-sha256.mjs',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends max-age=600),
  // so a new version never gets installed with stale copies of its files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Open Food Facts etc. go straight to network
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request.url, { cache: 'no-cache' })
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
