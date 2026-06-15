let _ctx = null;

function ctx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  return _ctx;
}

function _tone(c, freq, type, startAt, duration, gainVal = 0.35) {
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  g.gain.setValueAtTime(gainVal, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

// Timer-Abschluss-Beep (Original)
export function playBeep() {
  const c = ctx();
  if (!c) return;
  try {
    _tone(c, 880, 'sine', c.currentTime, 1.2, 0.35);
  } catch { /* Browser-Einschränkung – ignorieren */ }
}

// Anpfiff-Pfeife – kurzer hoher Ton zum Match-Start
export function playWhistle() {
  const c = ctx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = 'sine';
    // leichter Chirp: startet bei 2100 Hz, steigt auf 2350 Hz
    osc.frequency.setValueAtTime(2100, c.currentTime);
    osc.frequency.linearRampToValueAtTime(2350, c.currentTime + 0.08);
    osc.frequency.setValueAtTime(2250, c.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(2150, c.currentTime + 0.45);
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.5);
  } catch { /* ignorieren */ }
}

// Dreifach-Pfeife – Spielende
export function playMatchEnd() {
  const c = ctx();
  if (!c) return;
  try {
    [0, 0.38, 0.76].forEach(offset => {
      const osc = c.createOscillator();
      const g   = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200, c.currentTime + offset);
      osc.frequency.linearRampToValueAtTime(2350, c.currentTime + offset + 0.06);
      osc.frequency.setValueAtTime(2200, c.currentTime + offset + 0.06);
      g.gain.setValueAtTime(0.25, c.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.28);
      osc.start(c.currentTime + offset);
      osc.stop(c.currentTime + offset + 0.3);
    });
  } catch { /* ignorieren */ }
}

// Tor-/Punkt-Sound – aufsteigendes Dreiklang-Ding
export function playGoal() {
  const c = ctx();
  if (!c) return;
  try {
    [523, 659, 784].forEach((freq, i) => {
      const t = c.currentTime + i * 0.11;
      _tone(c, freq, 'sine', t, 0.22, 0.28);
    });
  } catch { /* ignorieren */ }
}

// Countdown-Tick – kurzer Klick, letzter Tick höher
export function playCountdownTick(isFinal = false) {
  const c = ctx();
  if (!c) return;
  try {
    _tone(c, isFinal ? 1200 : 880, 'sine', c.currentTime, 0.1, 0.22);
  } catch { /* ignorieren */ }
}
