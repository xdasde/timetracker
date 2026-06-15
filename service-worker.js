const CACHE = 'sportzaehler-v13';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/storage.js',
  './js/router.js',
  './js/ui.js',
  './js/match.js',
  './js/presets.js',
  './js/rules.js',
  './js/stopwatch.js',
  './js/timer.js',
  './js/history.js',
  './js/export.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/teambuilder.js',
  './js/theme.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Beim Installieren alle Assets FRISCH laden – { cache: 'reload' } umgeht den
// HTTP-Cache des Browsers, sonst landen evtl. veraltete Bytes im neuen Cache
// (häufigster Grund, warum sich eine PWA "nicht aktualisiert").
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload' }))
          .then(res => { if (res.ok) return c.put(url, res); })
          .catch(() => { /* einzelnes Asset offline/fehlend ignorieren */ })
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategie:
//  • Code (HTML/JS/CSS/Manifest, Navigationen) → network-first:
//    online immer die aktuelle Version, offline Fallback auf den Cache.
//  • Übrige Assets (Icons/Bilder) → cache-first, im Hintergrund nachladen.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Fremd-Requests durchreichen

  const isCode = req.mode === 'navigate' ||
    /\.(?:html|js|css|webmanifest)$/.test(url.pathname);

  if (isCode) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
      )
    );
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
