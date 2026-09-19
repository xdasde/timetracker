const CACHE = 'sportzaehler-v34';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/storage.js',
  './js/router.js',
  './js/ui.js',
  './js/match.js',
  './js/content.generated.js',
  './js/customgames.js',
  './js/gameimages.js',
  './js/communitygames.js',
  './js/community-deeplink.js',
  './js/config.js',
  './js/webpush.js',
  './js/presets.js',
  './js/rules.js',
  './js/stopwatch.js',
  './js/timer.js',
  './js/history.js',
  './js/export.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/teambuilder.js',
  './js/fanger.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/generated/brand-assets/derived/badminton.png',
  './assets/generated/brand-assets/derived/basketball.png',
  './assets/generated/brand-assets/derived/bear.png',
  './assets/generated/brand-assets/derived/clock.png',
  './assets/generated/brand-assets/derived/eagle.png',
  './assets/generated/brand-assets/derived/fox.png',
  './assets/generated/brand-assets/derived/penguin.png',
  './assets/generated/brand-assets/derived/runner.png',
  './assets/generated/brand-assets/derived/soccer.png',
  './assets/generated/brand-assets/derived/quick-stopwatch.png',
  './assets/generated/brand-assets/derived/stopwatch.png',
  './assets/generated/brand-assets/derived/team.png',
  './assets/generated/brand-assets/derived/tiger.png',
  './assets/generated/brand-assets/derived/volleyball.png',
  './assets/generated/brand-assets/derived/whistle.png',
  './assets/generated/brand-assets/derived/wolf.png',
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
          // Nur erfolgreiche Antworten cachen – ein 404 für ein Spielbild darf
          // nicht dauerhaft den Icon-Fallback erzwingen.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
      )
    );
  }
});

const COMMUNITY_GAME_ID = /^community~[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isCommunityGameId(id) {
  return typeof id === 'string' && COMMUNITY_GAME_ID.test(id);
}

// Deep-Link nur öffnen, wenn er same-origin im App-Pfad liegt UND genau das
// Spiel aus der validierten gameId adressiert – sonst App-Wurzel.
function safeAppUrl(rawUrl, expectedGameId) {
  const fallback = new URL('./', self.location.href);
  if (typeof rawUrl !== 'string' || !rawUrl || !isCommunityGameId(expectedGameId)) return fallback;
  try {
    const url = new URL(rawUrl, self.location.origin);
    const ids = url.searchParams.getAll('communityGame');
    if (url.origin !== self.location.origin
      || !url.pathname.startsWith(fallback.pathname)
      || ids.length !== 1
      || ids[0] !== expectedGameId) {
      return fallback;
    }
    return url;
  } catch {
    return fallback;
  }
}

function safeNotificationIcon(rawIcon) {
  const fallback = new URL('./icons/icon-192.png', self.location.href);
  if (typeof rawIcon !== 'string' || !rawIcon) return fallback.href;
  try {
    const icon = new URL(rawIcon, self.location.origin);
    return icon.origin === self.location.origin ? icon.href : fallback.href;
  } catch {
    return fallback.href;
  }
}

self.addEventListener('push', e => {
  let payload = null;
  try { payload = e.data ? e.data.json() : null; } catch { /* ungültige Fremddaten ignorieren */ }
  const gameId = payload?.data?.gameId;
  if (payload?.type !== 'community-game-created' || !isCommunityGameId(gameId)) return;

  const url = safeAppUrl(payload.data.url, gameId);
  e.waitUntil(self.registration.showNotification(
    typeof payload.title === 'string' && payload.title ? payload.title : 'Neues Community-Spiel',
    {
      body: typeof payload.body === 'string' ? payload.body : 'Ein neues Spiel ist verfügbar.',
      icon: safeNotificationIcon(payload.icon),
      badge: safeNotificationIcon(payload.badge),
      tag: `community-game-${gameId}`,
      data: { type: payload.data.type, eventId: payload.data.eventId, gameId, url: url.href },
    },
  ));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification?.data;
  const target = safeAppUrl(data?.url, data?.gameId);
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async cs => {
      const exact = cs.find(c => {
        try { return new URL(c.url).href === target.href; } catch { return false; }
      });
      if (exact) return exact.focus();

      const sameOrigin = cs.find(c => {
        try { return new URL(c.url).origin === target.origin; } catch { return false; }
      });
      if (sameOrigin) {
        if ('navigate' in sameOrigin) await sameOrigin.navigate(target.href);
        return sameOrigin.focus();
      }
      if (clients.openWindow) return clients.openWindow(target.href);
    })
  );
});
