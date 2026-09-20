import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BALL_VARIANTS,
  CTA_TARGETS,
  appUrl,
  ballCycle,
  createBallRotator,
  nextBallIndex,
  resolveFeedbackTarget,
  sportCardHref,
} from '../landingpage.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'landingpage.html'), 'utf8');

 test('Ballvarianten haben die freigegebene Reihenfolge und Softball bleibt visuell', () => {
  assert.deepEqual(BALL_VARIANTS.map(({ id }) => id), ['football', 'volleyball', 'basketball', 'softball']);
  assert.equal(BALL_VARIANTS.at(-1).appSportId, null);
  assert.deepEqual(ballCycle(5), ['football', 'volleyball', 'basketball', 'softball', 'football']);
});

test('Ballindex rotiert zyklisch auch bei ungültigem Start', () => {
  assert.equal(nextBallIndex(3), 0);
  assert.equal(nextBallIndex(-1), 0);
  assert.equal(nextBallIndex('x'), 0);
  assert.equal(nextBallIndex(0, 0), 0);
});

test('Ballrotator nutzt den injizierten Timer und liefert die Sequenz', () => {
  const timers = [];
  const seen = [];
  const rotator = createBallRotator({
    intervalMs: 10,
    setTimer(fn, ms) { timers.push({ fn, ms }); return timers.length - 1; },
    clearTimer() {},
    onChange(variant) { seen.push(variant.id); },
  });
  rotator.emit();
  rotator.start();
  assert.equal(timers.length, 1);
  timers.shift().fn();
  assert.deepEqual(seen, ['football', 'volleyball']);
  assert.equal(timers[0].ms, 10);
  rotator.stop();
});

test('Reduced motion deaktiviert Automatik, manueller Wechsel bleibt möglich', () => {
  let scheduled = 0;
  const seen = [];
  const rotator = createBallRotator({
    reducedMotion: true,
    setTimer() { scheduled += 1; return 1; },
    onChange(variant) { seen.push(variant.id); },
  });
  rotator.start();
  assert.equal(scheduled, 0);
  rotator.emit();
  rotator.next();
  assert.deepEqual(seen, ['football', 'volleyball']);
});

test('CTAs und Sportkarten verlinken rückwärtskompatibel in die App', () => {
  assert.equal(appUrl(), 'index.html');
  assert.equal(CTA_TARGETS.app, 'index.html');
  assert.equal(CTA_TARGETS.exercises, 'index.html?view=exercises');
  assert.equal(sportCardHref('football'), 'index.html?sport=football&view=exercises');
});

test('Feedback bleibt ehrlich konfigurierbar und akzeptiert nur Web-/Mailziele', () => {
  assert.equal(resolveFeedbackTarget({ target: 'javascript:alert(1)' }).configured, false);
  assert.equal(resolveFeedbackTarget({ target: 'ftp://example.org' }).configured, false);
  assert.equal(resolveFeedbackTarget({ target: 'mailto:team@example.org' }).href, 'mailto:team@example.org');
  assert.equal(resolveFeedbackTarget({ target: 'https://example.org/issues' }).configured, true);
});

test('Landingpage enthält zentrale Bereiche, lokale Assets und echte App-CTAs', () => {
  for (const marker of ['id="main"', 'id="sportarten"', 'id="uebung"', 'id="nrw"', 'id="mitmachen"', 'id="hero-ball"', 'id="hero-ball-status"', 'id="feedback-link"']) {
    assert.match(html, new RegExp(marker.replace(/["?]/g, '\\$&')));
  }
  assert.match(html, /href="landingpage\.css"/);
  assert.match(html, /src="landingpage\.js"/);
  assert.match(html, /href="index\.html\?view=exercises"/);
  assert.doesNotMatch(html, /https?:\/\/(?!schema\.org)/i);
});
