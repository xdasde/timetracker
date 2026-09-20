// Stoppuhr mit Wall-Clock-Anker (Date.now statt performance.now):
// performance.now() beginnt bei jedem Reload neu und steht auf vielen Geräten
// während des Standby still. Mit Date.now() lässt sich der Zustand speichern
// und nach Reload, Tab-/App-Wechsel oder Display-Sperre korrekt fortsetzen.
export class Stopwatch {
  constructor({ now = Date.now } = {}) {
    this._now = now;
    this._reset();
  }

  _reset() {
    this.state = 'idle';
    this.elapsed = 0;     // abgeschlossene Laufzeit vor dem aktuellen Lauf
    this.startTime = 0;   // Date.now()-Anker des aktuellen Laufs
    this.laps = [];
  }

  toggle() {
    if (this.state === 'running') {
      this.elapsed += Math.max(0, this._now() - this.startTime);
      this.state = 'paused';
    } else {
      this.startTime = this._now();
      this.state = 'running';
    }
    return this.state;
  }

  lap() {
    if (this.state !== 'running') return null;
    const total = this.getMs();
    const prev = this.laps.reduce((a, b) => a + b, 0);
    this.laps.push(total - prev);
    return [...this.laps];
  }

  reset() { this._reset(); }

  getMs() {
    return this.state === 'running'
      ? this.elapsed + Math.max(0, this._now() - this.startTime)
      : this.elapsed;
  }

  isRunning() { return this.state === 'running'; }
  hasContent() { return this.elapsed > 0 || this.laps.length > 0 || this.state !== 'idle'; }

  toJSON() {
    return { state: this.state, elapsed: this.elapsed, startTime: this.startTime, laps: [...this.laps] };
  }

  // Übernimmt einen gespeicherten Zustand unverändert – der Anker bleibt
  // erhalten, damit die Zeit zwischen Speichern und Laden mitgezählt wird.
  restore(data) {
    this._reset();
    if (!data || !['idle', 'running', 'paused'].includes(data.state)) return false;
    const elapsed = Number(data.elapsed);
    const startTime = Number(data.startTime);
    if (!Number.isFinite(elapsed) || elapsed < 0) return false;
    if (data.state === 'running' && (!Number.isFinite(startTime) || startTime <= 0)) return false;
    this.state = data.state;
    this.elapsed = elapsed;
    this.startTime = data.state === 'running' ? startTime : 0;
    this.laps = Array.isArray(data.laps) ? data.laps.filter(ms => Number.isFinite(ms) && ms >= 0) : [];
    return true;
  }
}

export function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const min  = String(Math.floor(s / 60)).padStart(2, '0');
  const sec  = String(s % 60).padStart(2, '0');
  const hund = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${min}:${sec}.${hund}`;
}
