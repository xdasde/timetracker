const CACHE = 'sportzaehler-v7';
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
  './js/stopwatch.js',
  './js/timer.js',
  './js/history.js',
  './js/export.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/teambuilder.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request)
      .then(hit => hit || fetch(e.request).catch(() => caches.match('./index.html')))
  );
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
