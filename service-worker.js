const CACHE = 'sportzaehler-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/storage.js',
  './js/router.js',
  './js/ui.js',
  './js/match.js',
  './js/stopwatch.js',
  './js/timer.js',
  './js/history.js',
  './js/export.js',
  './js/audio.js',
  './js/wakelock.js',
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
