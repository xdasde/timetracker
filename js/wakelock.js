// Wake-Lock pro Besitzer (z. B. 'match', 'sw-2'). Mehrfaches Freigeben durch
// denselben Besitzer bleibt folgenlos und kann keine fremde Sperre lösen.
// Der Browser gibt die Sperre beim Verlassen des Tabs selbst frei – bei der
// Rückkehr wird sie für alle aktiven Besitzer neu angefordert.
const owners = new Set();
let lock = null;
let pending = null;

async function request() {
  if (lock || pending || !owners.size || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  pending = navigator.wakeLock.request('screen')
    .then(sentinel => {
      if (!owners.size) { sentinel.release().catch(() => {}); return; }
      lock = sentinel;
      sentinel.addEventListener('release', () => { if (lock === sentinel) lock = null; });
    })
    .catch(() => { /* nicht unterstützt oder abgelehnt */ })
    .finally(() => { pending = null; });
  await pending;
}

export async function acquireWakeLock(owner = 'default') {
  owners.add(owner);
  await request();
}

export async function releaseWakeLock(owner = 'default') {
  owners.delete(owner);
  if (owners.size || !lock) return;
  const current = lock;
  lock = null;
  try { await current.release(); } catch { /* ignore */ }
}

export function hasWakeLockOwner(owner) { return owners.has(owner); }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') request();
  });
}
