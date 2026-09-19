// Tests für die reinen Funktionen der Community-Datenquelle.
// Bewusst ohne Abhängigkeiten – `node --test` genügt.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ID_PREFIX, isCommunityId, slugify, communityId,
  normalizeGame, validateSubmission, parseGamesResponse, parsePostResponse,
  clampRating, applyOwnRating,
} from '../js/communitygames.js';
import { matchesRouletteCategory } from '../js/presets.js';

const validDraft = {
  name: 'Burgball',
  kind: 'spiel',
  categories: ['ball'],
  structure: '2 × 10 Min.',
  scoring: 'Treffer auf die Burg zählen.',
  basics: ['Zwei Teams bilden', 'Burg verteidigen'],
  tip: 'Timer auf 10 Minuten stellen.',
};

// ── IDs ──────────────────────────────────────────────────────────────────────

test('slugify macht Umlaute und Sonderzeichen URL-tauglich', () => {
  assert.equal(slugify('Völkerball für Große!'), 'voelkerball-fuer-grosse');
  assert.equal(slugify('   '), 'spiel');
  assert.equal(slugify('<img src=x onerror=alert(1)>'), 'img-src-x-onerror-alert-1');
});

test('communityId nutzt das Präfix und bleibt eindeutig', () => {
  assert.equal(communityId('Burgball'), `${ID_PREFIX}burgball`);
  assert.equal(communityId('Burgball', [`${ID_PREFIX}burgball`]), `${ID_PREFIX}burgball-2`);
  assert.equal(
    communityId('Burgball', [`${ID_PREFIX}burgball`, `${ID_PREFIX}burgball-2`]),
    `${ID_PREFIX}burgball-3`,
  );
});

test('Community-IDs können nicht mit Built-in-/lokalen IDs kollidieren', () => {
  // slugify() erzeugt nur [a-z0-9-] – das Präfix enthält `~` und ist damit
  // für Built-ins und lokale eigene Spiele unerreichbar.
  assert.ok(isCommunityId(communityId('Community Spiel')));
  assert.equal(isCommunityId('burgball'), false);
  assert.equal(isCommunityId('community-spiel'), false);
  assert.ok(isCommunityId('COMMUNITY~spiel'));
  assert.ok(!slugify('Community~Spiel').includes('~'));
});

test('normalizeGame behält eine vorhandene Community-ID bei und säubert sie', () => {
  assert.equal(normalizeGame({ ...validDraft, id: `${ID_PREFIX}burgball` }).id, `${ID_PREFIX}burgball`);
  assert.equal(normalizeGame({ ...validDraft, id: 'Fremde ID' }).id, `${ID_PREFIX}fremde-id`);
  assert.equal(normalizeGame({ ...validDraft, id: `${ID_PREFIX}Böse/ID` }).id, `${ID_PREFIX}boese-id`);
  assert.equal(normalizeGame({ ...validDraft, id: 'COMMUNITY~Burgball' }).id, `${ID_PREFIX}burgball`);
});

// ── Normalisieren ────────────────────────────────────────────────────────────

test('normalizeGame füllt Standardwerte und verwirft Unbekanntes', () => {
  const g = normalizeGame({ ...validDraft, kind: 'KAPUTT', difficulty: 'unmöglich', categories: ['ball', 'hack'] });
  assert.equal(g.kind, 'spiel');
  assert.equal(g.difficulty, null);
  assert.deepEqual(g.categories, ['ball']);
  assert.equal(g.teamA, 'Team A');
  assert.equal(g.periods, 1);
  assert.equal(g.community, true);
});

test('normalizeGame verlangt einen Namen', () => {
  assert.equal(normalizeGame({ ...validDraft, name: '   ' }), null);
  assert.equal(normalizeGame(null), null);
  assert.equal(normalizeGame('kein Objekt'), null);
});

test('normalizeGame begrenzt Zeiten, Perioden und Farbindex', () => {
  const g = normalizeGame({ ...validDraft, durationMs: -5, breakMs: 1e12, periods: 99, colorIndex: 42 });
  assert.equal(g.durationMs, null);
  assert.equal(g.breakMs, 24 * 60 * 60 * 1000);
  assert.equal(g.periods, 9);
  assert.equal(g.colorIndex, 3);
});

test('normalizeGame nimmt Listen als Array oder mehrzeiligen Text', () => {
  assert.deepEqual(normalizeGame({ ...validDraft, basics: 'Eins\nZwei' }).basics, ['Eins', 'Zwei']);
  assert.deepEqual(normalizeGame({ ...validDraft, material: 'Ball, Hütchen' }).material, ['Ball', 'Hütchen']);
});

test('normalizeGame liest JSON-Listen aus Google-Sheet-Zeilen', () => {
  const game = normalizeGame({
    ...validDraft,
    categories: '["ball","team"]',
    material: '["Hütchen","Bälle"]',
    basics: '["Start","Lauf"]',
  });
  assert.deepEqual(game.categories, ['ball', 'team']);
  assert.deepEqual(game.material, ['Hütchen', 'Bälle']);
  assert.deepEqual(game.basics, ['Start', 'Lauf']);
});

test('normalizeGame übernimmt den optionalen Autor', () => {
  assert.equal(normalizeGame({ ...validDraft, author: '  Frau Meier ' }).author, 'Frau Meier');
  assert.equal(normalizeGame(validDraft).author, null);
});

test('normalizeGame speichert Text unverändert (HTML wird nie interpretiert)', () => {
  const g = normalizeGame({ ...validDraft, name: '<b>Ball</b>', tip: '<script>x</script>' });
  assert.equal(g.name, '<b>Ball</b>');
  assert.equal(g.tip, '<script>x</script>');
});

test('normalizeGame normalisiert Bewertungswerte', () => {
  assert.equal(normalizeGame({ ...validDraft, ratingAverage: 4.26, ratingCount: '7' }).ratingAverage, 4.3);
  assert.equal(normalizeGame({ ...validDraft, ratingAverage: 'x' }).ratingAverage, null);
  assert.equal(normalizeGame({ ...validDraft, ratingCount: -3 }).ratingCount, 0);
});

// ── Validieren ───────────────────────────────────────────────────────────────

test('validateSubmission akzeptiert einen vollständigen Entwurf', () => {
  assert.deepEqual(validateSubmission(normalizeGame(validDraft)), []);
});

test('validateSubmission meldet fehlende Pflichtfelder', () => {
  const errors = validateSubmission(normalizeGame({ ...validDraft, structure: '', scoring: '', basics: [], tip: '' }));
  assert.equal(errors.length, 4);
  assert.ok(errors.some(e => e.includes('Aufbau')));
  assert.ok(errors.some(e => e.includes('Ablauf')));
});

test('validateSubmission lehnt ungültige Werte ab', () => {
  const errors = validateSubmission({ ...normalizeGame(validDraft), kind: 'unfug', categories: ['hack'] });
  assert.ok(errors.some(e => e.includes('Art')));
  assert.ok(errors.some(e => e.includes('Kategorie')));
});

test('validateSubmission bleibt bei kaputten Listen robust', () => {
  const errors = validateSubmission({ ...validDraft, categories: 'ball', basics: 'Ein Punkt' });
  assert.ok(errors.some(e => e.includes('Kategorie')));
  assert.ok(errors.some(e => e.includes('Ablauf')));
});

// ── Antwort des Sheets ───────────────────────────────────────────────────────

test('parseGamesResponse verträgt Array, Wrapper und Unsinn', () => {
  assert.equal(parseGamesResponse([validDraft]).length, 1);
  assert.equal(parseGamesResponse({ games: [validDraft] }).length, 1);
  assert.deepEqual(parseGamesResponse(null), []);
  assert.deepEqual(parseGamesResponse({ error: 'boom' }), []);
});

test('parseGamesResponse wirft kaputte Zeilen weg und entdoppelt IDs', () => {
  const rows = [validDraft, { name: '' }, null, { ...validDraft, id: `${ID_PREFIX}burgball` }];
  const games = parseGamesResponse(rows);
  assert.equal(games.length, 1);
  assert.equal(games[0].id, `${ID_PREFIX}burgball`);
});

test('parseGamesResponse verwirft Spiele ohne vollständige Regeln', () => {
  assert.deepEqual(parseGamesResponse([{ name: 'Nur ein Name' }]), []);
});

test('parsePostResponse verlangt eine bestätigte JSON-Erfolgsmeldung', () => {
  const success = { ok: true, game: { id: `${ID_PREFIX}spiel` } };
  assert.deepEqual(parsePostResponse(success), success);
  assert.equal(parsePostResponse({}), null);
  assert.equal(parsePostResponse({ ok: false }), null);
  assert.equal(parsePostResponse([]), null);
});

test('parseGamesResponse vergibt eindeutige IDs für gleichnamige Spiele ohne ID', () => {
  const games = parseGamesResponse([validDraft, { ...validDraft }]);
  assert.deepEqual(games.map(g => g.id), [`${ID_PREFIX}burgball`, `${ID_PREFIX}burgball-2`]);
});

// ── Bewertungen ──────────────────────────────────────────────────────────────

test('clampRating lässt nur 1–5 durch', () => {
  assert.equal(clampRating(1), 1);
  assert.equal(clampRating('5'), 5);
  assert.equal(clampRating(3.4), 3);
  assert.equal(clampRating(0), null);
  assert.equal(clampRating(6), null);
  assert.equal(clampRating('viele'), null);
  assert.equal(clampRating(null), null);
});

test('applyOwnRating zählt eine neue Bewertung hinzu', () => {
  const g = applyOwnRating({ ratingAverage: 4, ratingCount: 2 }, 5);
  assert.equal(g.ratingCount, 3);
  assert.equal(g.ratingAverage, 4.3);
});

test('applyOwnRating ersetzt die frühere Bewertung desselben Geräts', () => {
  const g = applyOwnRating({ ratingAverage: 4, ratingCount: 2 }, 2, 4);
  assert.equal(g.ratingCount, 2, 'kein Doppelzählen beim erneuten Bewerten');
  assert.equal(g.ratingAverage, 3);
});

test('applyOwnRating startet sauber bei noch unbewerteten Spielen', () => {
  const g = applyOwnRating({ ratingAverage: null, ratingCount: 0 }, 4);
  assert.equal(g.ratingCount, 1);
  assert.equal(g.ratingAverage, 4);
});

test('applyOwnRating ignoriert ungültige Werte', () => {
  const base = { ratingAverage: 4, ratingCount: 2 };
  assert.deepEqual(applyOwnRating(base, 0), base);
  assert.deepEqual(applyOwnRating(base, 'x'), base);
});

test('Roulette-Communityfilter lässt nur Community-Presets durch', () => {
  const community = { fromCommunity: true, categories: ['team'] };
  const custom = { fromCustomGame: true, categories: ['team'] };
  const builtin = { builtIn: true, categories: ['team'] };
  assert.equal(matchesRouletteCategory(community, 'community'), true);
  assert.equal(matchesRouletteCategory(custom, 'community'), false);
  assert.equal(matchesRouletteCategory(builtin, 'community'), false);
  assert.equal(matchesRouletteCategory(community, 'team'), true);
  assert.equal(matchesRouletteCategory(community, 'ball'), false);
});
