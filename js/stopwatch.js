export class Stopwatch {
  constructor() { this._reset(); }

  _reset() {
    this.state = 'idle';
    this.elapsed = 0;
    this.startTime = 0;
    this.laps = [];
  }

  toggle() {
    if (this.state === 'running') {
      this.elapsed += performance.now() - this.startTime;
      this.state = 'paused';
    } else {
      this.startTime = performance.now();
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
      ? this.elapsed + (performance.now() - this.startTime)
      : this.elapsed;
  }

  isRunning() { return this.state === 'running'; }
  hasContent() { return this.elapsed > 0 || this.laps.length > 0 || this.state !== 'idle'; }
}

export function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const min  = String(Math.floor(s / 60)).padStart(2, '0');
  const sec  = String(s % 60).padStart(2, '0');
  const hund = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${min}:${sec}.${hund}`;
}
