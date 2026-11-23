// LuzMap service worker: offline access to the app shell after the first visit.
// Large media (demo video) and user files are never cached here.
const VERSION = 'luzmap-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './output.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/audio.js',
  './js/calibration.js',
  './js/capabilities.js',
  './js/demo.js',
  './js/editor.js',
  './js/effects.js',
  './js/gl.js',
  './js/inspector.js',
  './js/mapping.js',
  './js/media.js',
  './js/output.js',
  './js/panels.js',
  './js/presets.js',
  './js/projector.js',
  './js/recorder.js',
  './js/renderer.js',
  './js/room.js',
  './js/state.js',
  './js/storage.js',
  './js/sync.js',
  './js/timeline.js',
  './js/transport.js',
  './js/ui.js',
  './js/utils.js',
  './shaders/common.js',
  './shaders/effects.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] precache incompleto', err)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('luzmap-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return;
  // Stale-while-revalidate: instant from cache, refreshed in the background.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || new Response('Offline e sem cópia em cache.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }),
  );
});
