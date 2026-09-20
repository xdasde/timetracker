const defaultScheduler = {
  now: () => Date.now(),
  raf: cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16)),
  caf: id => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id)),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: id => clearTimeout(id),
};

// Countdown mit festem Endzeitpunkt (Date.now-Anker). Die Anzeige läuft über
// requestAnimationFrame; zusätzlich sorgt ein Timeout dafür, dass das Ende auch
// erkannt wird, wenn der Tab im Hintergrund ist und keine Frames rendert.
export class Countdown {
  constructor(scheduler = {}) {
    this._s = { ...defaultScheduler, ...scheduler };
    this.state = 'picking';
    this.targetMs = 0;
    this.remaining = 0;
    this.endsAt = 0;
    this._raf = null;
    this._timeout = null;
    this._onTick = null;
    this._onDone = null;
  }

  getState() { return this.state; }
  getTargetMs() { return this.targetMs; }
  getRemaining() {
    return this.state === 'running'
      ? Math.max(0, this.endsAt - this._s.now())
      : this.remaining;
  }

  setDuration(ms) {
    this.targetMs = ms;
    this.remaining = ms;
  }

  start(onTick, onDone) {
    if (this.state === 'running' || this.remaining <= 0) return;
    this._run(onTick, onDone);
  }

  pause() {
    if (this.state !== 'running') return;
    this.remaining = this.getRemaining();
    this.state = 'paused';
    this._cancel();
  }

  resume(onTick, onDone) {
    if (this.state !== 'paused') return;
    this._run(onTick, onDone);
  }

  reset() {
    this._cancel();
    this.state = 'picking';
    this.remaining = this.targetMs;
    this.endsAt = 0;
  }

  // Sofortige Neuberechnung, z. B. nach Rückkehr aus dem Hintergrund.
  refresh() {
    if (this.state === 'running') this._tick();
  }

  toJSON() {
    return { state: this.state, targetMs: this.targetMs, remaining: this.getRemaining(), endsAt: this.endsAt };
  }

  // Stellt einen gespeicherten Zustand wieder her. Ein laufender Countdown
  // behält seinen Endzeitpunkt; ist dieser inzwischen erreicht, endet er sofort.
  restore(data, onTick, onDone) {
    this.reset();
    if (!data || !['running', 'paused'].includes(data.state)) return false;
    const targetMs = Number(data.targetMs);
    if (!Number.isFinite(targetMs) || targetMs <= 0) return false;
    this.targetMs = targetMs;
    this._onTick = onTick;
    this._onDone = onDone;
    if (data.state === 'paused') {
      const remaining = Number(data.remaining);
      if (!Number.isFinite(remaining) || remaining <= 0) { this.reset(); return false; }
      this.remaining = Math.min(remaining, targetMs);
      this.state = 'paused';
      return true;
    }
    const endsAt = Number(data.endsAt);
    if (!Number.isFinite(endsAt) || endsAt <= 0) { this.reset(); return false; }
    this.endsAt = endsAt;
    this.state = 'running';
    this._tick();
    return true;
  }

  _run(onTick, onDone) {
    this._onTick = onTick;
    this._onDone = onDone;
    this.endsAt = this._s.now() + this.remaining;
    this.state = 'running';
    this._tick();
  }

  _cancel() {
    if (this._raf != null) this._s.caf(this._raf);
    if (this._timeout != null) this._s.clearTimeout(this._timeout);
    this._raf = null;
    this._timeout = null;
  }

  _tick() {
    if (this.state !== 'running') return;
    this._cancel();
    const r = this.getRemaining();
    this._onTick?.(r);
    if (r <= 0) {
      this.state = 'done';
      this.remaining = 0;
      this._onDone?.();
      return;
    }
    this._raf = this._s.raf(() => this._tick());
    this._timeout = this._s.setTimeout(() => this._tick(), r);
  }
}

export function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
