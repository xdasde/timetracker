// Regressionstests für Stoppuhr, Countdown und Match-Uhr (Wall-Clock-Anker,
// Hintergrund/Reload). Bewusst ohne Abhängigkeiten – `node --test` genügt.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { Stopwatch } from '../js/stopwatch.js';
import { Countdown } from '../js/timer.js';

// match.js speichert über storage.js in localStorage → kleiner In-Memory-Ersatz.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
  },
});
const match = await import('../js/match.js');

// Manuelle Uhr für Stopwatch/Countdown.
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

// Scheduler für Countdown: rAF feuert nur im Vordergrund (flushFrame),
// Timeouts auch im Hintergrund (advance).
function fakeScheduler(start = 1_000_000) {
  const clock = fakeClock(start);
  let nextId = 1;
  const frames = new Map();
  const timeouts = new Map();
  return {
    now: clock.now,
    raf: cb => { const id = nextId++; frames.set(id, cb); return id; },
    caf: id => { frames.delete(id); },
    setTimeout: (cb, ms) => { const id = nextId++; timeouts.set(id, { cb, at: clock.now() + ms }); return id; },
    clearTimeout: id => { timeouts.delete(id); },
    pendingFrames: () => frames.size,
    pendingTimeouts: () => timeouts.size,
    flushFrame() {
      const cbs = [...frames.values()];
      frames.clear();
      cbs.forEach(cb => cb());
    },
    // Zeit vergeht ohne Frames (Tab im Hintergrund); fällige Timeouts feuern.
    advance(ms) {
      clock.advance(ms);
      for (const [id, t] of [...timeouts]) {
        if (t.at <= clock.now() && timeouts.has(id)) { timeouts.delete(id); t.cb(); }
      }
    },
  };
}

// ── Stoppuhr ────────────────────────────────────────────────────────────────

test('Stopwatch zählt mit injizierter Uhr hoch', () => {
  const clock = fakeClock();
  const sw = new Stopwatch({ now: clock.now });
  assert.equal(sw.getMs(), 0);
  assert.equal(sw.toggle(), 'running');
  clock.advance(1500);
  assert.equal(sw.getMs(), 1500);
  clock.advance(60_000);   // z. B. Display gesperrt: Zeit läuft weiter
  assert.equal(sw.getMs(), 61_500);
});

test('Stopwatch Pause hält die Zeit an, Fortsetzen zählt ab dort weiter', () => {
  const clock = fakeClock();
  const sw = new Stopwatch({ now: clock.now });
  sw.toggle();
  clock.advance(2000);
  assert.equal(sw.toggle(), 'paused');
  clock.advance(10_000);
  assert.equal(sw.getMs(), 2000);
  assert.equal(sw.isRunning(), false);
  assert.equal(sw.toggle(), 'running');
  clock.advance(500);
  assert.equal(sw.getMs(), 2500);
});

test('Stopwatch Reset setzt Zeit, Runden und Zustand zurück', () => {
  const clock = fakeClock();
  const sw = new Stopwatch({ now: clock.now });
  sw.toggle();
  clock.advance(1000);
  sw.lap();
  clock.advance(1000);
  sw.reset();
  assert.equal(sw.getMs(), 0);
  assert.equal(sw.state, 'idle');
  assert.deepEqual(sw.laps, []);
  assert.equal(sw.hasContent(), false);
  clock.advance(5000);
  assert.equal(sw.getMs(), 0);
});

test('Stopwatch Serialisierung/Wiederherstellung zählt die Zeit dazwischen mit', () => {
  const clock = fakeClock();
  const sw = new Stopwatch({ now: clock.now });
  sw.toggle();
  clock.advance(3000);
  sw.lap();
  const saved = JSON.parse(JSON.stringify(sw.toJSON()));

  clock.advance(7000);   // Reload dauert 7 s
  const restored = new Stopwatch({ now: clock.now });
  assert.equal(restored.restore(saved), true);
  assert.equal(restored.isRunning(), true);
  assert.equal(restored.getMs(), 10_000);
  assert.deepEqual(restored.laps, [3000]);

  restored.toggle();
  const paused = JSON.parse(JSON.stringify(restored.toJSON()));
  clock.advance(60_000);
  const again = new Stopwatch({ now: clock.now });
  assert.equal(again.restore(paused), true);
  assert.equal(again.state, 'paused');
  assert.equal(again.getMs(), 10_000);
});

test('Stopwatch.restore verwirft ungültige Daten', () => {
  const sw = new Stopwatch({ now: () => 1000 });
  for (const bad of [null, undefined, {}, { state: 'x' }, { state: 'paused', elapsed: -1 },
    { state: 'running', elapsed: 0, startTime: 'abc' }, { state: 'running', elapsed: 0, startTime: 0 }]) {
    assert.equal(sw.restore(bad), false, JSON.stringify(bad));
    assert.equal(sw.state, 'idle');
    assert.equal(sw.getMs(), 0);
  }
});

// ── Countdown ───────────────────────────────────────────────────────────────

test('Countdown startet nicht doppelt', () => {
  const s = fakeScheduler();
  const cd = new Countdown(s);
  let done = 0;
  cd.setDuration(10_000);
  cd.start(() => {}, () => { done++; });
  s.advance(4000);
  cd.start(() => {}, () => { done++; });   // zweiter Klick darf nicht neu verankern
  assert.equal(cd.getRemaining(), 6000);
  assert.equal(s.pendingFrames(), 1);
  assert.equal(s.pendingTimeouts(), 1);
  s.advance(6000);
  assert.equal(cd.getState(), 'done');
  assert.equal(done, 1);
});

test('Countdown Pause friert die Restzeit ein, Resume läuft ab dort weiter', () => {
  const s = fakeScheduler();
  const cd = new Countdown(s);
  const ticks = [];
  cd.setDuration(10_000);
  cd.start(ms => ticks.push(ms), () => {});
  s.advance(3000);
  cd.pause();
  assert.equal(cd.getState(), 'paused');
  assert.equal(cd.getRemaining(), 7000);
  assert.equal(s.pendingFrames(), 0);
  assert.equal(s.pendingTimeouts(), 0);
  s.advance(60_000);
  assert.equal(cd.getRemaining(), 7000);

  cd.resume(ms => ticks.push(ms), () => {});
  assert.equal(cd.getState(), 'running');
  s.advance(2000);
  s.flushFrame();
  assert.equal(ticks.at(-1), 5000);
  assert.equal(cd.getRemaining(), 5000);
});

test('Countdown Reset stoppt Frames/Timeouts und stellt die Zieldauer her', () => {
  const s = fakeScheduler();
  const cd = new Countdown(s);
  let done = 0;
  cd.setDuration(5000);
  cd.start(() => {}, () => { done++; });
  s.advance(2000);
  cd.reset();
  assert.equal(cd.getState(), 'picking');
  assert.equal(cd.getRemaining(), 5000);
  assert.equal(s.pendingFrames(), 0);
  assert.equal(s.pendingTimeouts(), 0);
  s.advance(10_000);
  assert.equal(done, 0);
  cd.start(() => {}, () => { done++; });
  s.advance(5000);
  assert.equal(done, 1);
});

test('Countdown endet nach Hintergrundzeit auch ohne Animation-Frames', () => {
  const s = fakeScheduler();
  const cd = new Countdown(s);
  const ticks = [];
  let done = 0;
  cd.setDuration(30_000);
  cd.start(ms => ticks.push(ms), () => { done++; });
  s.advance(29_999);                        // Hintergrund: kein rAF
  assert.equal(done, 0);
  assert.equal(cd.getRemaining(), 1);
  s.advance(1);
  assert.equal(done, 1);
  assert.equal(cd.getState(), 'done');
  assert.equal(cd.getRemaining(), 0);
  assert.equal(ticks.at(-1), 0);
  s.flushFrame();                           // späte Frames lösen nichts mehr aus
  assert.equal(done, 1);
});

test('Countdown.refresh nach Rückkehr beendet einen abgelaufenen Countdown sofort', () => {
  const s = fakeScheduler();
  const cd = new Countdown({ ...s, setTimeout: () => 0, clearTimeout: () => {} });   // gedrosselte Timer
  let done = 0;
  cd.setDuration(1000);
  cd.start(() => {}, () => { done++; });
  s.advance(5000);
  assert.equal(done, 0);
  cd.refresh();
  assert.equal(done, 1);
  assert.equal(cd.getState(), 'done');
});

test('Countdown Serialisierung/Wiederherstellung behält den Endzeitpunkt', () => {
  const s = fakeScheduler();
  const cd = new Countdown(s);
  cd.setDuration(10_000);
  cd.start(() => {}, () => {});
  s.advance(4000);
  const saved = JSON.parse(JSON.stringify(cd.toJSON()));
  s.advance(3000);
  const restored = new Countdown(s);
  let done = 0;
  assert.equal(restored.restore(saved, () => {}, () => { done++; }), true);
  assert.equal(restored.getRemaining(), 3000);
  s.advance(3000);
  assert.equal(done, 1);
});

// ── Match ───────────────────────────────────────────────────────────────────

function withMockedDate(fn) {
  return () => {
    mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
    store.clear();
    try { fn(); }
    finally { match.discardMatch(); mock.timers.reset(); }
  };
}

test('Match: Reload zählt die Zeit seit Start inkl. Speicherabstand weiter', withMockedDate(() => {
  match.startMatch('A', 'B', 0, null);
  match.toggleTimer();                       // Start, speichert Session
  mock.timers.tick(20_000);
  match.changeScore('a', 1);                 // spätere Speicherung (savedAt = +20 s)
  mock.timers.tick(10_000);                  // App 10 s geschlossen

  const s = match.checkSession();
  assert.ok(s);
  match.restoreSession(JSON.parse(JSON.stringify(s)));
  assert.equal(match.getElapsedMs(), 30_000);
  assert.equal(match.getLive().teamA.score, 1);
  mock.timers.tick(5000);
  assert.equal(match.getElapsedMs(), 35_000);
}));

test('Match: pausierte Uhr bleibt nach Reload stehen', withMockedDate(() => {
  match.startMatch('A', 'B', 0, null);
  match.toggleTimer();
  mock.timers.tick(12_000);
  match.toggleTimer();
  mock.timers.tick(60_000);
  match.restoreSession(match.checkSession());
  assert.equal(match.getElapsedMs(), 12_000);
}));

test('Match: stopAtLimit hält die Uhr genau am Limit an, auch nach Hintergrund/Reload', withMockedDate(() => {
  match.startMatch('A', 'B', 0, 60_000);
  match.toggleTimer();
  mock.timers.tick(45_000);
  match.stopAtLimit();                       // vor dem Limit: keine Wirkung
  assert.equal(match.getLive().running, true);
  assert.equal(match.isTimeUp(), false);

  mock.timers.tick(30_000);                  // Limit im Hintergrund überschritten
  match.restoreSession(match.checkSession());
  assert.equal(match.isTimeUp(), true);
  match.stopAtLimit();
  assert.equal(match.getLive().running, false);
  assert.equal(match.getElapsedMs(), 60_000);
  assert.equal(match.getRemainingMs(), 0);
  mock.timers.tick(10_000);
  assert.equal(match.getElapsedMs(), 60_000);

  match.restoreSession(match.checkSession());   // gestoppter Zustand ist gespeichert
  assert.equal(match.getElapsedMs(), 60_000);
  assert.equal(match.getLive().running, false);
  assert.equal(match.saveMatch().durationMs, 60_000);
}));

test('Match: Halbzeit-Pause übersteht den Reload und setzt die Uhr danach zurück', withMockedDate(() => {
  match.startMatch('A', 'B', 0, 60_000, 30_000);
  match.toggleTimer();
  mock.timers.tick(60_000);
  match.stopAtLimit();
  match.startBreak(30_000);
  mock.timers.tick(10_000);
  match.restoreSession(match.checkSession());
  assert.equal(match.isBreakActive(), true);
  assert.equal(match.getBreakRemainingMs(), 20_000);
  match.endBreak();
  assert.equal(match.isBreakActive(), false);
  assert.equal(match.getElapsedMs(), 0);
  assert.equal(match.isTimeUp(), false);
}));
