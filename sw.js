// LuzMap service worker.
// - Offline: the app shell is pre-cached; every same-origin GET is served
//   network-first (always the newest version when online, so modules of
//   different versions are never mixed) and falls back to the cache offline.
// - Share target (Android): files shared to the installed app arrive as a
//   POST to ./share-target, are parked in a cache and picked up by the app.
// Large videos and range requests are never cached here.
const VERSION = 'luzmap-v1.2.0';
const SHARE_CACHE = 'luzmap-share';
const NETWORK_TIMEOUT_MS = 4000;
const SHELL = [
  './',
  './index.html',
  './output.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/audio.js',
  './js/backstack.js',
  './js/calibration.js',
  './js/capabilities.js',
  './js/christmas.js',
  './js/christmas-catalog.js',
  './js/demo.js',
  './js/editor.js',
  './js/effects.js',
  './js/gl.js',
  './js/inspector.js',
  './js/install.js',
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
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  // Christmas library thumbnails (the full files are cached when first used).
  // <natal-thumbs> (gerado por tools/make-christmas.mjs)
  './assets/natal/thumbs/arvore.webp',
  './assets/natal/thumbs/estrela.webp',
  './assets/natal/thumbs/estrela-guia.webp',
  './assets/natal/thumbs/bola-vermelha.webp',
  './assets/natal/thumbs/bola-dourada.webp',
  './assets/natal/thumbs/bola-azul.webp',
  './assets/natal/thumbs/guirlanda.webp',
  './assets/natal/thumbs/laco.webp',
  './assets/natal/thumbs/sinos.webp',
  './assets/natal/thumbs/bengala.webp',
  './assets/natal/thumbs/presente-vermelho.webp',
  './assets/natal/thumbs/presente-verde.webp',
  './assets/natal/thumbs/presentes.webp',
  './assets/natal/thumbs/boneco-neve.webp',
  './assets/natal/thumbs/floco.webp',
  './assets/natal/thumbs/gorro.webp',
  './assets/natal/thumbs/meia.webp',
  './assets/natal/thumbs/azevinho.webp',
  './assets/natal/thumbs/vela.webp',
  './assets/natal/thumbs/casinha.webp',
  './assets/natal/thumbs/biscoito.webp',
  './assets/natal/thumbs/presepio.webp',
  './assets/natal/thumbs/pisca-pisca.webp',
  './assets/natal/thumbs/festao.webp',
  './assets/natal/thumbs/moldura.webp',
  './assets/natal/thumbs/neve-topo.webp',
  './assets/natal/thumbs/feliz-natal.webp',
  './assets/natal/thumbs/boas-festas.webp',
  './assets/natal/thumbs/feliz-ano-novo.webp',
  './assets/natal/thumbs/noite-neve.webp',
  './assets/natal/thumbs/lareira.webp',
  './assets/natal/thumbs/papel-vermelho.webp',
  './assets/natal/thumbs/papel-verde.webp',
  './assets/natal/thumbs/xadrez.webp',
  './assets/natal/thumbs/flocos-azul.webp',
  // </natal-thumbs>
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('luzmap-v') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('media').filter((f) => f && typeof f === 'object' && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    let n = 0;
    for (const f of files) {
      const key = new Request(`./__shared/${Date.now()}-${n++}`);
      await cache.put(
        key,
        new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name || `arquivo-${n}`) } }),
      );
    }
    return Response.redirect(`./index.html?shared=${n}`, 303);
  } catch (err) {
    return Response.redirect('./index.html?shared=0', 303);
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

async function networkFirst(event) {
  const req = event.request;
  const cache = await caches.open(VERSION);
  const network = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  const fresh = await withTimeout(network, NETWORK_TIMEOUT_MS);
  if (fresh) return fresh;
  const cached = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
  if (cached) {
    event.waitUntil(network.catch(() => null));
    return cached;
  }
  const late = await network.catch(() => null);
  return late || new Response('LuzMap offline: este arquivo ainda não foi salvo no aparelho.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return;
  event.respondWith(networkFirst(event));
});
