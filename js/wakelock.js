let lock = null;
let consumers = 0;

export async function acquireWakeLock() {
  consumers++;
  if (lock || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { /* nicht unterstützt oder abgelehnt */ }
}

export async function releaseWakeLock() {
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0 || !lock) return;
  try { await lock.release(); } catch { /* ignore */ }
  lock = null;
}
