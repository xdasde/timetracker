export class Countdown {
  constructor() {
    this.state = 'picking';
    this.targetMs = 0;
    this.remaining = 0;
    this.t0 = 0;
    this._raf = null;
    this._onTick = null;
    this._onDone = null;
  }

  getState() { return this.state; }
  getTargetMs() { return this.targetMs; }
  getRemaining() { return this.remaining; }

  setDuration(ms) {
    this.targetMs = ms;
    this.remaining = ms;
  }

  start(onTick, onDone) {
    if (this.remaining <= 0) return;
    this._onTick = onTick;
    this._onDone = onDone;
    this.t0 = performance.now();
    this.state = 'running';
    this._tick();
  }

  pause() {
    if (this.state !== 'running') return;
    this.remaining -= performance.now() - this.t0;
    this.state = 'paused';
    cancelAnimationFrame(this._raf);
  }

  resume(onTick, onDone) {
    if (this.state !== 'paused') return;
    this._onTick = onTick;
    this._onDone = onDone;
    this.t0 = performance.now();
    this.state = 'running';
    this._tick();
  }

  reset() {
    cancelAnimationFrame(this._raf);
    this.state = 'picking';
    this.remaining = this.targetMs;
  }

  _tick() {
    const r = Math.max(0, this.remaining - (performance.now() - this.t0));
    this._onTick?.(r);
    if (r <= 0) {
      this.state = 'done';
      this._onDone?.();
      return;
    }
    this._raf = requestAnimationFrame(() => this._tick());
  }
}

export function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
