// Mosselkapitein service worker — offline play + instant reloads.
// Bump CACHE when you change index.html / game.js so phones pick up the new version.
const CACHE = 'mosselkapitein-v4';

// Same-origin app shell + the Three.js modules from the CDN.
const ASSETS = [
  './',
  './index.html',
  './game.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', e => {
  // Cache best-effort: one failed CDN fetch shouldn't abort the whole install.
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.allSettled(ASSETS.map(u => c.add(u)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations: network-first so updates land, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (game.js, icons, three.js): cache-first, then network (and cache it).
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
