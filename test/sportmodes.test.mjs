// Tests für die Sportmodi: Content-Schema, Vollständigkeit, Alias-Auflösung,
// Filter, Auswahl/Persistenz und Regeln-Label.
// Bewusst ohne Abhängigkeiten – `node --test` genügt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseSport, parseMode, parseExercise, validateCollection, buildAliasMap,
  MIN_EXERCISES, GENERAL_SPORT_ID,
} from '../scripts/sportcontent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// localStorage-Ersatz muss vor dem Import von sportmode.js stehen.
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

const sports = await import('../js/sports.js');
const sportmode = await import('../js/sportmode.js');

const resetSelection = () => { store.clear(); sportmode.clear(); };

// ── Schema-Parser ────────────────────────────────────────────────────────────

test('parseSport liest Pflichtfelder und Aliase', () => {
  const s = parseSport(`---
sportId: football
name: Fußball
icon: ⚽
accent: "#39c56f"
order: 1
aliases: [soccer, fussball]
---

## Beschreibung
- Test
`, 'sport.md');
  assert.equal(s.sportId, 'football');
  assert.equal(s.accent, '#39c56f');
  assert.deepEqual(s.aliases, ['soccer', 'fussball']);
});

test('parseSport lehnt ungültige sportId und accent ab', () => {
  const base = sportId => `---
sportId: ${sportId}
name: X
icon: ⚽
accent: "#39c56f"
order: 1
aliases: []
---
`;
  assert.throws(() => parseSport(base('Football'), 'f.md'), /sportId/);
  assert.throws(() => parseSport(base('foot_ball'), 'f.md'), /sportId/);
  assert.throws(() => parseSport(`---
sportId: football
name: X
icon: ⚽
accent: gruen
order: 1
aliases: []
---
`, 'f.md'), /accent/);
});

test('parseMode verlangt sportId, modeId, name und description', () => {
  const m = parseMode(`---
sportId: football
modeId: football-uebungen
name: Übungen
icon: ⚽
rulesLabel: Regeln
description: Übungen für Fußball.
---
`, 'm.md');
  assert.equal(m.modeId, 'football-uebungen');
  assert.equal(m.rulesLabel, 'Regeln');
  assert.throws(() => parseMode(`---
sportId: football
modeId: football-uebungen
name: Übungen
icon: ⚽
---
`, 'm.md'), /description/);
});

test('parseExercise liest Ablauf, Variationen, Sicherheit und Tipp', () => {
  const e = parseExercise(`---
id: football-01
sportId: football
modeId: football-uebungen
name: Dribbling-Parcours
icon: ⚽
category: Dribbling
goal: Ballführung
setup: Hütchen
---

## Ablauf
- Schritt eins
- Schritt zwei

## Variationen
- Leichter

## Sicherheit
- Abstände sichern

## Tipp
Timer nutzen.
`, 'e.md');
  assert.equal(e.id, 'football-01');
  assert.equal(e.steps.length, 2);
  assert.deepEqual(e.variations, ['Leichter']);
  assert.equal(e.safety, 'Abstände sichern');
  assert.equal(e.tip, 'Timer nutzen.');
});

test('parseExercise meldet fehlende Pflichtabschnitte', () => {
  const doc = extra => `---
id: x-01
sportId: football
modeId: football-uebungen
name: X
icon: ⚽
category: Technik
goal: Y
setup: Z
---
${extra}
`;
  assert.throws(() => parseExercise(doc('\n## Ablauf\n- a\n\n## Variationen\n- b\n\n## Tipp\nT\n'), 'e.md'), /Sicherheit/);
  assert.throws(() => parseExercise(doc('\n## Ablauf\n- a\n\n## Sicherheit\n- s\n\n## Tipp\nT\n'), 'e.md'), /Variationen/);
  assert.throws(() => parseExercise(doc('\n## Variationen\n- b\n\n## Sicherheit\n- s\n\n## Tipp\nT\n'), 'e.md'), /Ablauf/);
});

// ── Kollektionsvalidierung ───────────────────────────────────────────────────

const mkSport = (sportId, aliases = []) => ({ sportId, name: sportId, icon: '⚽', accent: '#39c56f', order: 1, aliases });
const mkMode = sportId => ({ sportId, modeId: `${sportId}-uebungen`, name: 'Übungen', icon: '⚽', rulesLabel: 'Regeln', description: 'd' });
const mkEx = (sportId, i, category = 'Technik') => ({
  id: `${sportId}-${String(i).padStart(2, '0')}`, sportId, modeId: `${sportId}-uebungen`,
  name: `Ü${i}`, icon: '⚽', category, goal: 'g', setup: 's',
  steps: ['a'], variations: ['b'], safety: 'c', tip: 't',
});

test('validateCollection meldet doppelte IDs und unbekannte Referenzen', () => {
  const errs = validateCollection({
    sports: [mkSport(GENERAL_SPORT_ID), mkSport('football'), mkSport('football')],
    modes: [mkMode('football')],
    exercises: [mkEx('football', 1), mkEx('football', 1), { ...mkEx('handball', 1) }],
  });
  assert.ok(errs.some(e => /Doppelte sportId/.test(e)), errs.join('|'));
  assert.ok(errs.some(e => /Doppelte Übungs-id/.test(e)), errs.join('|'));
  assert.ok(errs.some(e => /unbekannte sportId/.test(e)), errs.join('|'));
});

test('validateCollection verlangt Allgemeinsport und Mindestumfang', () => {
  const errs = validateCollection({ sports: [mkSport('football')], modes: [mkMode('football')], exercises: [] });
  assert.ok(errs.some(e => new RegExp(GENERAL_SPORT_ID).test(e)), errs.join('|'));

  const few = validateCollection({
    sports: [mkSport(GENERAL_SPORT_ID), mkSport('football')],
    modes: [mkMode('football')],
    exercises: Array.from({ length: 5 }, (_, i) => mkEx('football', i)),
  });
  assert.ok(few.some(e => /mindestens 30/.test(e)), few.join('|'));
});

test('buildAliasMap bildet sportId und Aliase auf die kanonische ID ab', () => {
  const map = buildAliasMap([mkSport('football', ['soccer', 'fussball'])]);
  assert.equal(map.football, 'football');
  assert.equal(map.soccer, 'football');
  assert.equal(map.fussball, 'football');
});

// ── Gelieferter Content (Vollständigkeit) ────────────────────────────────────

test('ausgelieferter Sport-Content erfüllt den geforderten Mindestumfang', () => {
  for (const [sportId, min] of Object.entries(MIN_EXERCISES)) {
    const count = sports.countExercises(sportId);
    assert.ok(count >= min, `${sportId}: ${count} < ${min}`);
    const ids = new Set(sports.getExercises(sportId).map(e => e.id));
    assert.equal(ids.size, count, `${sportId}: doppelte Übungs-IDs`);
    const names = new Set(sports.getExercises(sportId).map(e => e.name));
    assert.equal(names.size, count, `${sportId}: doppelte Übungsnamen`);
  }
});

test('Fußball deckt mehrere Übungskategorien ab', () => {
  const cats = sports.getCategories('football');
  assert.ok(cats.length >= 4, `nur ${cats.length} Kategorien: ${cats.join(', ')}`);
});

test('Allgemeinsport-Datenbank bleibt unangetastet', () => {
  const gamesDir = join(ROOT, 'content', 'games');
  const files = readdirSync(gamesDir).filter(f => f.endsWith('.md'));
  assert.equal(files.length, 62);
  // Allgemeinsport hat keine sportartspezifischen Übungen und keinen Modus.
  assert.equal(sports.countExercises(GENERAL_SPORT_ID), 0);
  assert.deepEqual(sports.getModes(GENERAL_SPORT_ID), []);
});

test('jede Übungsdatei hat eine passende Markdown-Quelle', () => {
  for (const ex of sports.getExercises('football')) {
    const path = join(ROOT, 'content', 'sports', ex.sportId, 'exercises', `${ex.id}.md`);
    assert.ok(existsSync(path), `fehlt: ${path}`);
    assert.match(readFileSync(path, 'utf8'), new RegExp(`id: ${ex.id}\\b`));
  }
});

// ── Alias-Auflösung und Filter ───────────────────────────────────────────────

test('resolveSportId löst Legacy-Alias soccer auf football auf', () => {
  assert.equal(sports.resolveSportId('soccer'), 'football');
  assert.equal(sports.resolveSportId('Football'), 'football');
  assert.equal(sports.resolveSportId(' fussball '), 'football');
});

test('resolveSportId fällt bei Unbekanntem auf Allgemeinsport zurück', () => {
  for (const v of ['', null, undefined, 'curling', 42, {}]) {
    assert.equal(sports.resolveSportId(v), GENERAL_SPORT_ID, String(v));
  }
  assert.equal(sports.isGeneralSport('curling'), true);
  assert.equal(sports.isGeneralSport('handball'), false);
});

test('filterExercises kombiniert Suche und Kategorie mit UND', () => {
  const cat = sports.getCategories('football')[0];
  const byCat = sports.filterExercises('football', { category: cat });
  assert.ok(byCat.length > 0);
  assert.ok(byCat.every(e => e.category === cat));

  const combined = sports.filterExercises('football', { category: cat, search: 'zzzz-kein-treffer' });
  assert.equal(combined.length, 0);

  const bySearch = sports.filterExercises('football', { search: byCat[0].name.toLowerCase() });
  assert.ok(bySearch.some(e => e.id === byCat[0].id));
});

test('Filter liefert nie Übungen einer anderen Sportart', () => {
  for (const sportId of Object.keys(MIN_EXERCISES)) {
    const res = sports.filterExercises(sportId, {});
    assert.ok(res.length > 0);
    assert.ok(res.every(e => e.sportId === sportId), sportId);
  }
  // Auch über den Alias darf nichts durchsickern.
  assert.ok(sports.filterExercises('soccer', {}).every(e => e.sportId === 'football'));
});

test('getMode/getDefaultMode liefern stabile Tupel', () => {
  const def = sports.getDefaultMode('football');
  assert.equal(def.sportId, 'football');
  assert.equal(sports.getMode('soccer', def.modeId).modeId, def.modeId);
  assert.equal(sports.getMode('football', 'gibt-es-nicht'), null);
  assert.equal(sports.getDefaultMode(GENERAL_SPORT_ID), null);
});

// ── Auswahl, Persistenz, Reload ──────────────────────────────────────────────

test('Standardauswahl ohne gespeicherten Wert ist Allgemeinsport', () => {
  resetSelection();
  const sel = sportmode.restore();
  assert.equal(sel.sportId, GENERAL_SPORT_ID);
  assert.equal(sel.modeId, null);
  assert.equal(sportmode.isGeneral(), true);
});

test('select speichert die Auswahl und übersteht einen Reload', () => {
  resetSelection();
  sportmode.select('football');
  const raw = JSON.parse(store.get('tt.sportModeSelection'));
  assert.equal(raw.version, 1);
  assert.equal(raw.sportId, 'football');
  assert.equal(raw.modeId, 'football-uebungen');

  // "Reload": Zustand verwerfen, aus dem Speicher wiederherstellen.
  sportmode.select(GENERAL_SPORT_ID);
  store.set('tt.sportModeSelection', JSON.stringify(raw));
  const restored = sportmode.restore();
  assert.equal(restored.sportId, 'football');
  assert.equal(restored.modeId, 'football-uebungen');
});

test('select normalisiert Legacy-Alias und unbekannte modeId', () => {
  resetSelection();
  assert.equal(sportmode.select('soccer').sportId, 'football');
  assert.equal(sportmode.select('football', 'gibt-es-nicht').modeId, 'football-uebungen');
});

test('restore fällt bei ungültigem oder veraltetem Wert sicher zurück', () => {
  const bad = [
    JSON.stringify({ version: 1, sportId: 'curling', modeId: 'x' }),
    JSON.stringify({ version: 0, sportId: 'football', modeId: 'football-uebungen' }),
    JSON.stringify('kaputt'),
    'kein-json',
  ];
  for (const value of bad) {
    store.clear();
    store.set('tt.sportModeSelection', value);
    const sel = sportmode.restore();
    assert.equal(sel.sportId, GENERAL_SPORT_ID, value);
    assert.equal(sel.modeId, null, value);
  }
});

test('onChange meldet nur echte Wechsel', () => {
  resetSelection();
  const seen = [];
  const off = sportmode.onChange(sel => seen.push(sel.sportId));
  sportmode.select('handball');
  sportmode.select('handball');
  sportmode.select(GENERAL_SPORT_ID);
  off();
  sportmode.select('volleyball');
  assert.deepEqual(seen, ['handball', GENERAL_SPORT_ID]);
});

// ── Regeln-Label nur im Sportmodus ───────────────────────────────────────────

test('Regeln-Label erscheint nur in echten Sportmodi', () => {
  resetSelection();
  assert.equal(sportmode.getRulesLabel(), null);
  for (const sportId of Object.keys(MIN_EXERCISES)) {
    sportmode.select(sportId);
    assert.equal(sportmode.getRulesLabel(), 'Regeln', sportId);
  }
  sportmode.select(GENERAL_SPORT_ID);
  assert.equal(sportmode.getRulesLabel(), null);
  assert.equal(sportmode.getSelectedMode(), null);
});

test('getMatchContext liefert den Sportkontext für neue Matches', () => {
  resetSelection();
  assert.deepEqual(sportmode.getMatchContext(), { sportId: GENERAL_SPORT_ID, modeId: null });
  sportmode.select('basketball');
  assert.deepEqual(sportmode.getMatchContext(), { sportId: 'basketball', modeId: 'basketball-uebungen' });
});

// ── Match-Persistenz mit Sportkontext ────────────────────────────────────────

test('startMatch übernimmt den Sportkontext, alte Sessions bleiben gültig', async () => {
  store.clear();
  const match = await import('../js/match.js');
  match.startMatch('A', 'B', 0, null, null, 2, null, { sportId: 'handball', modeId: 'handball-uebungen' });
  assert.equal(match.getLive().sportId, 'handball');
  const saved = match.saveMatch();
  assert.equal(saved.sportId, 'handball');
  assert.equal(saved.modeId, 'handball-uebungen');

  // Ohne Kontext (bestehender Aufrufpfad) bleibt alles null.
  match.startMatch('A', 'B', 0);
  assert.equal(match.getLive().sportId, null);
  match.discardMatch();

  // Alte Session ohne Sportfelder lädt weiterhin.
  match.restoreSession({ savedAt: Date.now(), state: { id: 'm_1', createdAt: 1, teamA: { name: 'A', score: 0 }, teamB: { name: 'B', score: 0 }, accMs: 0, running: false } });
  assert.equal(match.getLive().sportId, null);
  match.discardMatch();
});
