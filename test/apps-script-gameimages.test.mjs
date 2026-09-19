// Tests für den GameImages-Vertrag des Apps Scripts (scripts/google-apps-script).
// Code.gs wird mit minimalen Fakes für SpreadsheetApp, DriveApp & Co. in einer
// VM ausgeführt. Geprüft wird vor allem, dass Games/Ratings unangetastet
// bleiben, Bilddaten nie in eine Games-Zeile gelangen und nur freigegebene
// Drive-Bilder ausgeliefert werden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'google-apps-script');
const CODE_GS = readFileSync(join(DIR, 'Code.gs'), 'utf8');
const CODE_TXT = readFileSync(join(DIR, 'Code.txt'), 'utf8');

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const DRIVE_URL = `https://drive.google.com/thumbnail?id=${FILE_ID}&sz=w1200`;
const ORIGINAL_GAME_HEADERS = [
  'id', 'name', 'shortName', 'icon', 'kind', 'categories', 'difficulty',
  'ageGroup', 'material', 'players', 'teamA', 'teamB', 'colorIndex',
  'durationMs', 'breakMs', 'periods', 'periodLabel', 'structure', 'scoring',
  'basics', 'tip', 'source', 'author', 'createdAt',
];

class FakeSheet {
  constructor(name) { this.name = name; this.values = []; this.appended = []; this.headerWrites = 0; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return this.values.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, rows, cols) {
    return {
      getValues: () => [Array.from({ length: cols }, (_, i) => (this.values[row - 1] || [])[col - 1 + i] ?? '')],
      setValues: v => { this.headerWrites++; this.values[row - 1] = [...v[0]]; },
    };
  }
  getDataRange() { return { getValues: () => this.values.map(r => [...r]) }; }
  appendRow(row) { this.appended.push(row); this.values.push([...row]); }
}

function loadScript({ driveFiles = {} } = {}) {
  const sheets = {};
  const sharing = [];
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = new FakeSheet(name)),
  };
  const cache = new Map();
  const ctx = {
    console: { log() {} },
    SpreadsheetApp: { openById: () => spreadsheet },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    UrlFetchApp: { fetch: () => { throw new Error('kein Netz im Test'); } },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
      Permission: { VIEW: 'VIEW', NONE: 'NONE' },
      getFileById: id => {
        const f = driveFiles[id];
        if (!f) throw new Error('Datei nicht gefunden');
        return {
          getMimeType: () => f.mimeType,
          getSize: () => f.size,
          setSharing: (access, permission) => sharing.push({ id, access, permission }),
        };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${CODE_GS}\n;globalThis.__consts = { GAME_HEADERS, RATING_HEADERS, GAME_IMAGES_SHEET, GAME_IMAGE_HEADERS, GAME_IMAGE_STATUSES, MAX_COMMUNITY_IMAGE_BYTES, COMMUNITY_IMAGE_MIME_TYPES };`, ctx);
  return { ctx, sheets, sharing, consts: ctx.__consts };
}

const parse = output => JSON.parse(output.text);
const post = (ctx, body) => parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }));
const GAME = {
  id: 'community~smoke-test', name: 'Community Smoke Test', kind: 'spiel',
  structure: 'Kleines Feld', scoring: 'Punkte zählen', basics: ['Los geht es'], tip: 'Timer nutzen',
};

function seedGame(env, game = GAME) {
  const r = post(env.ctx, { type: 'game', game, deviceId: 'device-1234' });
  assert.equal(r.ok, true, r.error);
  return r.game;
}

test('Code.txt ist eine identische Kopie von Code.gs', () => {
  assert.equal(CODE_TXT, CODE_GS);
});

test('Games-/Ratings-Kopfzeilen bleiben unverändert; GameImages ist ein eigener Tab', () => {
  const { consts } = loadScript();
  assert.deepEqual([...consts.GAME_HEADERS], ORIGINAL_GAME_HEADERS);
  assert.deepEqual([...consts.RATING_HEADERS], ['gameId', 'deviceId', 'rating', 'updatedAt']);
  assert.equal(consts.GAME_IMAGES_SHEET, 'GameImages');
  for (const field of ['gameId', 'driveFileId', 'url', 'status', 'alt']) {
    assert.ok(consts.GAME_IMAGE_HEADERS.includes(field), field);
    assert.equal(consts.GAME_HEADERS.includes(field), false, field);
  }
  assert.deepEqual([...consts.GAME_IMAGE_STATUSES], ['approved', 'pending', 'blocked', 'revoked']);
  assert.deepEqual([...consts.COMMUNITY_IMAGE_MIME_TYPES], ['image/webp', 'image/png', 'image/jpeg']);
  assert.equal(consts.MAX_COMMUNITY_IMAGE_BYTES, 2 * 1024 * 1024);
});

test('driveImageUrl_ baut nur aus gültigen Drive-File-IDs eine HTTPS-URL', () => {
  const { ctx } = loadScript();
  assert.equal(ctx.driveImageUrl_(FILE_ID), DRIVE_URL);
  for (const bad of ['', 'kurz', '../../etc', `${FILE_ID}&sz=w1`, 'javascript:alert(1)', null]) {
    assert.equal(ctx.driveImageUrl_(bad), null, String(bad));
  }
});

test('normalizeGameImageRow_ prüft ID, Status, Drive-ID und Alt-Text serverseitig', () => {
  const { ctx } = loadScript();
  const ok = ctx.normalizeGameImageRow_({ gameId: 'community~burg', driveFileId: FILE_ID, status: ' Approved ', alt: '  Burg  aus Kästen ' });
  assert.equal(ok.gameId, 'community~burg');
  assert.equal(ok.status, 'approved');
  assert.equal(ok.url, DRIVE_URL);
  assert.equal(ok.alt, 'Burg aus Kästen');

  assert.equal(ctx.normalizeGameImageRow_({ gameId: 'burgball', driveFileId: FILE_ID, status: 'approved' }), null);
  assert.equal(ctx.normalizeGameImageRow_({ gameId: 'community~burg', driveFileId: FILE_ID, status: 'ok' }), null);
  assert.equal(ctx.normalizeGameImageRow_({ gameId: 'community~burg', driveFileId: 'x', status: 'approved' }), null);
  // Formel-Präfix im Alt-Text wird nicht ausgeliefert.
  assert.equal(ctx.normalizeGameImageRow_({ gameId: 'community~burg', driveFileId: FILE_ID, status: 'approved', alt: '=IMPORTXML()' }).alt, null);
  // Revoked/blocked darf ohne Datei gesetzt werden.
  assert.equal(ctx.normalizeGameImageRow_({ gameId: 'community~burg', driveFileId: '', status: 'revoked' }).status, 'revoked');
});

test('doGet liefert nur freigegebene Bilder, der letzte GameImages-Eintrag gewinnt', () => {
  const env = loadScript({ driveFiles: { [FILE_ID]: { mimeType: 'image/webp', size: 90_000 } } });
  seedGame(env);
  seedGame(env, { ...GAME, id: 'community~teesfft', name: 'Teesfft' });
  const gamesBefore = JSON.stringify(env.sheets.Games.values);

  env.ctx.moderateGameImage('community~smoke-test', FILE_ID, 'approved', 'Teamspiel mit Ball');
  let games = parse(env.ctx.doGet()).games;
  const smoke = games.find(g => g.id === 'community~smoke-test');
  assert.equal(smoke.image, DRIVE_URL);
  assert.equal(smoke.imageAlt, 'Teamspiel mit Ball');
  assert.equal(smoke.imageStatus, 'approved');
  assert.equal(games.find(g => g.id === 'community~teesfft').image, undefined);

  env.ctx.moderateGameImage('community~smoke-test', FILE_ID, 'revoked', '');
  games = parse(env.ctx.doGet()).games;
  assert.equal(games.find(g => g.id === 'community~smoke-test').image, undefined);

  // Append-only: Games unverändert, GameImages hat zwei Zeilen (Kopf + 2).
  assert.equal(JSON.stringify(env.sheets.Games.values), gamesBefore);
  assert.equal(env.sheets.GameImages.appended.length, 2);
  assert.deepEqual(env.sharing.map(s => s.access), ['ANYONE_WITH_LINK', 'PRIVATE']);
});

test('doGet bleibt bei defektem GameImages-Tab funktionsfähig (Spiele ohne Bild)', () => {
  const env = loadScript();
  seedGame(env);
  env.sheets.GameImages = new FakeSheet('GameImages');
  env.sheets.GameImages.values = [['falscher', 'kopf']];
  const r = parse(env.ctx.doGet());
  assert.equal(r.ok, true);
  assert.equal(r.games.length, 1);
  assert.equal(r.games[0].image, undefined);
});

test('moderateGameImage lehnt SVG, zu große Dateien, unbekannte Spiele und Status ab', () => {
  const env = loadScript({
    driveFiles: {
      [FILE_ID]: { mimeType: 'image/svg+xml', size: 1000 },
      [`${FILE_ID}B`]: { mimeType: 'image/png', size: 2 * 1024 * 1024 + 1 },
      [`${FILE_ID}C`]: { mimeType: 'image/jpeg', size: 1000 },
    },
  });
  seedGame(env);
  assert.throws(() => env.ctx.moderateGameImage('community~smoke-test', FILE_ID, 'approved', ''), /WebP, PNG oder JPEG/);
  assert.throws(() => env.ctx.moderateGameImage('community~smoke-test', `${FILE_ID}B`, 'approved', ''), /2 MB/);
  assert.throws(() => env.ctx.moderateGameImage('community~unbekannt', `${FILE_ID}C`, 'approved', ''), /Unbekanntes/);
  assert.throws(() => env.ctx.moderateGameImage('community~smoke-test', `${FILE_ID}C`, 'ok', ''), /Status/);
  assert.throws(() => env.ctx.moderateGameImage('community~smoke-test', `${FILE_ID}C`, 'approved', '=HYPERLINK()'), /Alt/);
  assert.equal(env.sheets.GameImages?.appended.length ?? 0, 0);
  assert.equal(env.sharing.length, 0);
});

test('POST type:image wird mit verständlicher Meldung abgelehnt und schreibt nichts', () => {
  const env = loadScript();
  seedGame(env);
  const gamesRows = env.sheets.Games.values.length;
  const r = post(env.ctx, { type: 'image', gameId: 'community~smoke-test', data: 'UklGRg==', mimeType: 'image/webp' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'image-upload-disabled');
  assert.match(r.error, /Bild-Upload/);
  assert.match(r.error, /2 MB/);
  assert.equal(env.sheets.Games.values.length, gamesRows);
  assert.equal(env.sheets.GameImages?.appended.length ?? 0, 0);
});

test('Bildfelder und Bilddaten in einem Spiel-POST landen nie in der Games-Zeile', () => {
  const env = loadScript();
  const saved = seedGame(env, {
    ...GAME, image: 'data:image/webp;base64,UklGRg==', imageUrl: 'https://x.example/a.webp',
    imageAlt: 'Alt', imageStatus: 'approved', driveFileId: FILE_ID,
  });
  const row = env.sheets.Games.appended[0];
  assert.equal(row.length, ORIGINAL_GAME_HEADERS.length);
  assert.equal(row.some(v => /data:|base64|x\.example|approved/.test(String(v))), false);
  assert.equal(String(row).includes(FILE_ID), false);
  assert.equal(saved.image, undefined);
  assert.equal(saved.imageStatus, undefined);
});
