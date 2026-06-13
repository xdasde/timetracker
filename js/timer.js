let state = 'picking';
let targetMs = 0;
let remaining = 0;
let t0 = 0;
let _raf = null;
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
  t0 = performance.now();
  state = 'running';
  _tick();
}

export function pause() {
  if (state !== 'running') return;
  remaining -= performance.now() - t0;
  state = 'paused';
  cancelAnimationFrame(_raf);
}

export function resume(onTick, onDone) {
  if (state !== 'paused') return;
  _onTick = onTick;
  _onDone = onDone;
  t0 = performance.now();
  state = 'running';
  _tick();
}

export function reset() {
  cancelAnimationFrame(_raf);
  state = 'picking';
  remaining = targetMs;
}

export function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function _tick() {
  const r = Math.max(0, remaining - (performance.now() - t0));
  _onTick?.(r);
  if (r <= 0) {
    state = 'done';
    _onDone?.();
    return;
  }
  _raf = requestAnimationFrame(_tick);
}
