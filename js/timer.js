let state = 'picking';
let targetMs = 0;
let remaining = 0;
let _endAt = 0;
let _raf = null;
let _timeout = null;
let _onTick = null;
let _onDone = null;

export function getState() { return state; }
export function getTargetMs() { return targetMs; }
export function getRemaining() { return remaining; }

export function setDuration(ms) {
  targetMs = ms;
  remaining = ms;
}

export function start(onTick, onDone) {
  if (remaining <= 0) return;
  _onTick = onTick;
  _onDone = onDone;
  _endAt = Date.now() + remaining;
  state = 'running';
  _armTimeout();
  _tick();
}

export function pause() {
  if (state !== 'running') return;
  remaining = Math.max(0, _endAt - Date.now());
  state = 'paused';
  cancelAnimationFrame(_raf);
  clearTimeout(_timeout);
}

export function resume(onTick, onDone) {
  if (state !== 'paused') return;
  _onTick = onTick;
  _onDone = onDone;
  _endAt = Date.now() + remaining;
  state = 'running';
  _armTimeout();
  _tick();
}

export function reset() {
  cancelAnimationFrame(_raf);
  clearTimeout(_timeout);
  state = 'picking';
  remaining = targetMs;
}

export function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Bei Rückkehr aus dem Hintergrund (visibilitychange -> visible) aufrufen:
// rAF pausiert während der Tab verborgen ist, daher muss die Anzeige anhand
// des Wandzeit-Endzeitpunkts neu berechnet werden ("catch up").
export function reconcile() {
  if (state !== 'running') return;
  const r = Math.max(0, _endAt - Date.now());
  if (r <= 0) {
    _finish();
  } else {
    _onTick?.(r);
  }
}

function _armTimeout() {
  clearTimeout(_timeout);
  const ms = Math.max(0, _endAt - Date.now());
  // setTimeout läuft (ggf. verzögert/gedrosselt) auch im Hintergrund weiter,
  // im Gegensatz zu requestAnimationFrame, das dort komplett pausiert.
  _timeout = setTimeout(() => {
    if (state !== 'running') return;
    _finish();
  }, ms);
}

function _finish() {
  if (state !== 'running') return;
  state = 'done';
  cancelAnimationFrame(_raf);
  clearTimeout(_timeout);
  remaining = 0;
  _onTick?.(0);
  _onDone?.();
}

function _tick() {
  if (state !== 'running') return;
  const r = Math.max(0, _endAt - Date.now());
  _onTick?.(r);
  if (r <= 0) {
    _finish();
    return;
  }
  _raf = requestAnimationFrame(_tick);
}
