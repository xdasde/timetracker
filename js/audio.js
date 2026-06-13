let _ctx = null;

function ctx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  return _ctx;
}

export function playBeep() {
  const c = ctx();
  if (!c) return;
  try {
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, c.currentTime);
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.2);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 1.2);
  } catch { /* Browser-Einschränkung – ignorieren */ }
}
