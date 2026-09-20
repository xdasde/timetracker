import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAgeGroups,
  parsePlayingTimeOptions,
  resolveFootballContext,
  SENIOR_AGE_KEY,
} from '../js/footballsetup.js';
import { filterCandidates, labels, GENERAL_LABELS } from '../js/exerciseroulette.js';

test('football context never falls back to general sport', () => {
  assert.deepEqual(resolveFootballContext({ sportId: 'football', modeId: null }, 'football-uebungen'), {
    sportId: 'football',
    modeId: 'football-uebungen',
    fallback: true,
    notice: null,
  });
});

test('playing-time phases are derived from supplied rule text', () => {
  const phases = parsePlayingTimeOptions(['7 x 10 Minuten', 'regional abweichend']);
  assert.equal(phases.length, 1);
  assert.equal(phases[0].durationMs, 7 * 10 * 60_000);
  assert.equal(phases[0].label, '7 × 10 Min.');

  const groups = buildAgeGroups([{
    id: 'g-rule',
    ageBand: 'G_U6_U7',
    ageLabel: 'G-Junior:innen / Bambini (U6/U7)',
    playingTime: ['7 x 10 Minuten'],
  }]);
  assert.equal(groups[0].phases[0].durationMs, 7 * 10 * 60_000);
  assert.equal(groups.at(-1).key, SENIOR_AGE_KEY);
  assert.deepEqual(groups.at(-1).phases, []);
});

test('exercise roulette filters only the selected exercise category', () => {
  const exercises = [
    { id: 'football-1', category: 'Passspiel', sportId: 'football' },
    { id: 'football-2', category: 'Dribbling', sportId: 'football' },
  ];
  assert.deepEqual(filterCandidates(exercises, 'Passspiel'), [exercises[0]]);
  assert.deepEqual(filterCandidates(exercises, 'missing'), []);
});

test('general roulette labels remain backward compatible', () => {
  assert.equal(GENERAL_LABELS.quickLabel, 'Spiel-Roulette');
  assert.equal(GENERAL_LABELS.title, 'Spiel-Roulette');
  assert.equal(labels('Fußball').quickLabel, 'Übungs-Roulette');
});
