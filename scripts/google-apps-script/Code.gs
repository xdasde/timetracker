/*
 * Sportzähler – öffentliche Community-Datenquelle
 *
 * Dieses Script ist als an das Google Sheet gebundenes Apps-Script-Projekt
 * gedacht. Es enthält absichtlich keine Zugangsdaten: Die Web-App ist für
 * Lesen und Einreichen öffentlich erreichbar und läuft als Eigentümer:in.
 */

const SPREADSHEET_ID = '11bqlQzPJriCeKaRSSK-zgru3Cvm2Ft4WUoAXAIcSEAI';
const GAMES_SHEET = 'Games';
const RATINGS_SHEET = 'Ratings';
const MAX_NAME = 60;
const MAX_TEXT = 400;
const MAX_AUTHOR = 40;
const MAX_ID = 60;
const MAX_LIST = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = 60;
const MAX_GLOBAL_GAME_WRITES = 60;
const MAX_GLOBAL_RATING_WRITES = 600;
const MAX_DEVICE_GAME_WRITES = 10;
const MAX_DEVICE_RATING_WRITES = 60;
const PUSH_RELAY_ENDPOINT_PROPERTY = 'PUSH_RELAY_ENDPOINT';
const PUSH_RELAY_SECRET_PROPERTY = 'PUSH_RELAY_SECRET';

const GAME_HEADERS = [
  'id', 'name', 'shortName', 'icon', 'kind', 'categories', 'difficulty',
  'ageGroup', 'material', 'players', 'teamA', 'teamB', 'colorIndex',
  'durationMs', 'breakMs', 'periods', 'periodLabel', 'structure', 'scoring',
  'basics', 'tip', 'source', 'author', 'createdAt',
];

const RATING_HEADERS = ['gameId', 'deviceId', 'rating', 'updatedAt'];

function doGet() {
  try {
    return json_({ ok: true, games: attachGameImages_(listGames_()) });
  } catch (error) {
    return json_({ ok: false, error: safeError_(error) });
  }
}

function doPost(event) {
  try {
    const contents = event && event.postData && event.postData.contents;
    const request = JSON.parse(contents || '{}');

    if (request.type === 'game') {
      const result = withLock_(function () {
        enforceRateLimit_('game', request.deviceId);
        return addGame_(request.game);
      });
      // Der Relay wird ausschließlich nach einer tatsächlich neuen Games-Zeile
      // informiert. Idempotente Wiederholungen bleiben push-frei.
      if (result.created) notifyRelay_(result.game);
      return json_({ ok: true, game: result.game, created: result.created });
    }

    if (request.type === 'rating') {
      return json_(withLock_(function () {
        enforceRateLimit_('rating', request.deviceId);
        return saveRating_(request.gameId, request.rating, request.deviceId);
      }));
    }

    // Bilddaten nimmt die öffentliche Web-App nie an (siehe GameImages unten).
    if (request.type === 'image') return json_(imageUploadDisabled_());

    throw new Error('Unbekannter request-Typ.');
  } catch (error) {
    return json_({ ok: false, error: safeError_(error) });
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeError_(error) {
  return String((error && error.message) || error || 'Unbekannter Fehler').slice(0, 240);
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  const width = Math.max(sheet.getLastColumn(), headers.length);
  const firstRow = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, width).getValues()[0]
    : [];
  const isBlank = firstRow.length === 0 || firstRow.every(function (value) {
    return String(value || '').trim() === '';
  });

  if (sheet.getLastRow() === 0 || isBlank) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers.forEach(function (header, index) {
      if (String(firstRow[index] || '').trim() !== header) {
        throw new Error('Tabellenkopf in „' + name + '“ erwartet Spalte „' + header + '“.');
      }
    });
  }
  return sheet;
}

function rows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (header) { return String(header); });
  return values.slice(1).map(function (row, rowIndex) {
    const object = { _row: rowIndex + 2 };
    headers.forEach(function (header, columnIndex) {
      object[header] = row[columnIndex];
    });
    return object;
  });
}

function listGames_() {
  const gamesSheet = getSheet_(GAMES_SHEET, GAME_HEADERS);
  const ratings = ratingSummary_();
  return rows_(gamesSheet).map(function (row) {
    if (!cleanText_(row.id, MAX_ID) || !cleanText_(row.name, MAX_NAME)) return null;
    const game = normalizeGame_(row, row.id);
    const summary = ratings[game.id] || { sum: 0, count: 0 };
    game.ratingCount = summary.count;
    game.ratingAverage = summary.count
      ? Math.round((summary.sum / summary.count) * 10) / 10
      : null;
    game.community = true;
    return game;
  }).filter(function (game) { return game !== null; });
}

function addGame_(raw) {
  const gamesSheet = getSheet_(GAMES_SHEET, GAME_HEADERS);
  const existingRows = rows_(gamesSheet);
  const name = cleanText_(raw && raw.name, MAX_NAME);
  if (!name) throw new Error('Name fehlt.');

  const requestedId = canonicalId_(raw && raw.id, name);
  const candidate = normalizeGame_(raw, requestedId);
  validateGame_(candidate);
  const duplicate = existingRows.find(function (row) {
    return cleanText_(row.id, MAX_ID) === requestedId;
  });
  if (duplicate) {
    const existing = normalizeGame_(duplicate, requestedId);
    if (JSON.stringify(existing) === JSON.stringify(candidate)) {
      return { game: withRating_(existing), created: false };
    }
    throw new Error('Community-Spiele sind unveränderlich; für eine Änderung bitte ein neues Spiel einreichen.');
  }

  const game = candidate;
  validateGame_(game);
  gamesSheet.appendRow(gameRow_(game));
  game.ratingAverage = null;
  game.ratingCount = 0;
  game.community = true;
  return { game: game, created: true };
}

// Relay-Credentials liegen ausschließlich in ScriptProperties. Ein nicht
// erreichbarer Relay darf die bestätigte Games-Einreichung nicht rückgängig
// machen; der Fehler wird nur ohne Secret protokolliert.
function notifyRelay_(game) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const endpoint = String(properties.getProperty(PUSH_RELAY_ENDPOINT_PROPERTY) || '')
      .trim().replace(/\/+$/, '');
    const secret = String(properties.getProperty(PUSH_RELAY_SECRET_PROPERTY) || '').trim();
    if (!endpoint || !secret) return { configured: false, sent: false };

    const response = UrlFetchApp.fetch(endpoint + '/events/community-game', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Relay-Secret': secret },
      payload: JSON.stringify({
        eventId: game.id,
        game: { id: game.id, name: game.name, icon: game.icon },
      }),
      muteHttpExceptions: true,
    });
    const status = response.getResponseCode();
    console.log('Community-Push-Relay HTTP ' + status + ' für ' + game.id);
    return { configured: true, sent: status >= 200 && status < 300 };
  } catch (error) {
    console.log('Community-Push-Relay fehlgeschlagen: ' + safeError_(error));
    return { configured: true, sent: false };
  }
}

function saveRating_(gameIdValue, ratingValue, deviceIdValue) {
  const gameId = cleanText_(gameIdValue, MAX_ID);
  const deviceId = cleanText_(deviceIdValue, 128);
  const rating = clampRating_(ratingValue);
  if (!/^community~[a-z0-9-]+$/.test(gameId)) throw new Error('Ungültige Spiel-ID.');
  if (!deviceId) throw new Error('Geräte-ID fehlt.');
  if (isFormulaText_(deviceId)) throw new Error('Ungültige Geräte-ID.');
  if (rating === null) throw new Error('Bewertung muss zwischen 1 und 5 liegen.');

  const games = rows_(getSheet_(GAMES_SHEET, GAME_HEADERS));
  if (!games.some(function (game) { return cleanText_(game.id, MAX_ID) === gameId; })) {
    throw new Error('Unbekanntes Community-Spiel.');
  }

  const sheet = getSheet_(RATINGS_SHEET, RATING_HEADERS);
  // Append-only: Auch eine erneute Bewertung schreibt ausschließlich eine
  // neue Zeile. Bestehende Sheet-Zeilen werden nie geändert oder gelöscht.
  sheet.appendRow([gameId, deviceId, rating, new Date()]);

  const summary = ratingSummary_()[gameId] || { sum: 0, count: 0 };
  return {
    ok: true,
    gameId: gameId,
    ratingAverage: summary.count ? Math.round((summary.sum / summary.count) * 10) / 10 : null,
    ratingCount: summary.count,
  };
}

function ratingSummary_() {
  const sheet = getSheet_(RATINGS_SHEET, RATING_HEADERS);
  const latestByDevice = {};
  rows_(sheet).forEach(function (row) {
    const gameId = cleanText_(row.gameId, MAX_ID);
    const deviceId = cleanText_(row.deviceId, 128);
    const rating = clampRating_(row.rating);
    if (!gameId || rating === null) return;
    // Alte/importierte Zeilen ohne Geräte-ID bleiben einzeln sichtbar;
    // normale Gerätebewertungen werden nach der letzten Zeile dedupliziert.
    const key = gameId + '\u0000' + (deviceId || 'legacy-row-' + row._row);
    latestByDevice[key] = { gameId: gameId, rating: rating, row: row._row };
  });

  const summary = {};
  Object.keys(latestByDevice).forEach(function (key) {
    const entry = latestByDevice[key];
    const gameId = entry.gameId;
    const rating = entry.rating;
    if (!summary[gameId]) summary[gameId] = { sum: 0, count: 0 };
    summary[gameId].sum += rating;
    summary[gameId].count += 1;
  });
  return summary;
}

function normalizeGame_(raw, id) {
  raw = raw || {};
  const kindValue = cleanText_(raw.kind, 20).toLowerCase();
  const kind = ['sport', 'spiel', 'uebung'].indexOf(kindValue) >= 0 ? kindValue : 'spiel';
  const difficultyValue = cleanText_(raw.difficulty, 20).toLowerCase();
  const difficulty = ['einfach', 'mittel', 'schwer'].indexOf(difficultyValue) >= 0
    ? difficultyValue
    : null;
  const categories = list_(raw.categories, 3).filter(function (value) {
    return ['lauf', 'ball', 'team'].indexOf(value) >= 0;
  });

  return {
    id: cleanText_(id, MAX_ID),
    name: cleanText_(raw.name, MAX_NAME),
    shortName: nullableText_(raw.shortName, 30),
    icon: cleanText_(raw.icon, 4) || '🎯',
    kind: kind,
    categories: categories,
    difficulty: difficulty,
    ageGroup: nullableText_(raw.ageGroup, 40),
    material: list_(raw.material, 20),
    players: nullableText_(raw.players, 40),
    teamA: cleanText_(raw.teamA, 20) || 'Team A',
    teamB: cleanText_(raw.teamB, 20) || 'Team B',
    colorIndex: count_(raw.colorIndex, 0, 0, 3),
    durationMs: milliseconds_(raw.durationMs),
    breakMs: milliseconds_(raw.breakMs),
    periods: count_(raw.periods, 1, 1, 9),
    periodLabel: cleanText_(raw.periodLabel, 20) || 'Halbzeit',
    structure: cleanText_(raw.structure, 200),
    scoring: cleanText_(raw.scoring, 200),
    basics: list_(raw.basics, MAX_LIST),
    tip: cleanText_(raw.tip, MAX_TEXT),
    source: nullableText_(raw.source, 120),
    author: nullableText_(raw.author, MAX_AUTHOR),
  };
}

function validateGame_(game) {
  if (!game.name) throw new Error('Name fehlt.');
  if (!game.structure) throw new Error('Aufbau fehlt.');
  if (!game.scoring) throw new Error('Wertung fehlt.');
  if (!game.basics.length) throw new Error('Mindestens ein Ablauf-Punkt nötig.');
  if (!game.tip) throw new Error('App-Tipp fehlt.');

  [
    ['name', 'Name'], ['shortName', 'Kurzname'], ['icon', 'Icon'],
    ['ageGroup', 'Altersgruppe'], ['players', 'Spielerangabe'],
    ['teamA', 'Team A'], ['teamB', 'Team B'], ['periodLabel', 'Periodenbezeichnung'],
    ['structure', 'Aufbau'], ['scoring', 'Wertung'], ['tip', 'App-Tipp'],
    ['source', 'Quelle'], ['author', 'Autor'],
  ].forEach(function (field) {
    if (isFormulaText_(game[field[0]])) {
      throw new Error(field[1] + ' darf nicht mit =, +, - oder @ beginnen.');
    }
  });
  game.basics.concat(game.material).forEach(function (value) {
    if (isFormulaText_(value)) {
      throw new Error('Listenwerte dürfen nicht mit =, +, - oder @ beginnen.');
    }
  });
}

function gameRow_(game) {
  return [
    game.id, game.name, game.shortName || '', game.icon, game.kind,
    JSON.stringify(game.categories), game.difficulty || '', game.ageGroup || '',
    JSON.stringify(game.material), game.players || '', game.teamA, game.teamB,
    game.colorIndex, game.durationMs === null ? '' : game.durationMs,
    game.breakMs === null ? '' : game.breakMs, game.periods, game.periodLabel,
    game.structure, game.scoring, JSON.stringify(game.basics), game.tip,
    game.source || '', game.author || '', new Date(),
  ];
}

function canonicalId_(requested, name) {
  const raw = cleanText_(requested, MAX_ID);
  const seed = raw.toLowerCase().indexOf('community~') === 0
    ? raw.slice('community~'.length)
    : raw;
  return 'community~' + slugify_(seed || name);
}

function withRating_(game) {
  const summary = ratingSummary_()[game.id] || { sum: 0, count: 0 };
  game.ratingCount = summary.count;
  game.ratingAverage = summary.count
    ? Math.round((summary.sum / summary.count) * 10) / 10
    : null;
  game.community = true;
  return game;
}

function enforceRateLimit_(type, deviceIdValue) {
  const isGame = type === 'game';
  const globalLimit = isGame ? MAX_GLOBAL_GAME_WRITES : MAX_GLOBAL_RATING_WRITES;
  const deviceLimit = isGame ? MAX_DEVICE_GAME_WRITES : MAX_DEVICE_RATING_WRITES;
  const cache = CacheService.getScriptCache();
  const globalKey = 'cg-global-' + type;
  const globalCount = Number(cache.get(globalKey) || 0);
  if (globalCount >= globalLimit) throw new Error('Zu viele Anfragen; bitte später erneut versuchen.');
  cache.put(globalKey, String(globalCount + 1), RATE_WINDOW_SECONDS);

  const deviceId = cleanText_(deviceIdValue, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId)) return;
  const deviceKey = 'cg-device-' + type + '-' + deviceId;
  const deviceCount = Number(cache.get(deviceKey) || 0);
  if (deviceCount >= deviceLimit) throw new Error('Zu viele Anfragen von diesem Gerät; bitte später erneut versuchen.');
  cache.put(deviceKey, String(deviceCount + 1), RATE_WINDOW_SECONDS);
}

function slugify_(value) {
  return String(value || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spiel';
}

function cleanText_(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

// Google Sheets interpretiert bestimmte Zellwerte als Formeln. Eingaben aus
// dem öffentlichen Formular dürfen daher keine Formelpräfixe enthalten.
function isFormulaText_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value.trim());
}

function nullableText_(value, max) {
  const text = cleanText_(value, max);
  return text || null;
}

function list_(value, max) {
  let values = value;
  if (typeof value === 'string' && value.trim().charAt(0) === '[') {
    try { values = JSON.parse(value); } catch (ignore) { values = value; }
  }
  if (!Array.isArray(values)) values = String(value || '').split(/\r?\n|;|,/);
  return values.map(function (item) { return cleanText_(item, MAX_TEXT); })
    .filter(Boolean).slice(0, max);
}

function count_(value, fallback, min, max) {
  const number = Number(value);
  if (!isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function milliseconds_(value) {
  const number = Number(value);
  if (!isFinite(number) || number <= 0) return null;
  return Math.min(Math.round(number), DAY_MS);
}

function clampRating_(value) {
  const number = Number(value);
  if (!isFinite(number)) return null;
  const rating = Math.round(number);
  return rating >= 1 && rating <= 5 ? rating : null;
}

/*
 * ── GameImages: optionale Bilder für Community-Spiele ───────────────────────
 *
 * Eigener, append-only geführter Tab. Games und Ratings bleiben unverändert;
 * eine Games-Zeile enthält nie Bilddaten, Drive-IDs oder Bild-URLs.
 *
 * Ablauf:
 *  1. Die öffentliche Web-App nimmt KEINE Bilddateien an (POST type:"image"
 *     wird mit code "image-upload-disabled" abgelehnt). Ein anonymer Upload in
 *     den Drive der Betreiber:innen wäre ohne Authentifizierung nicht sicher.
 *  2. Betreiber:innen legen ein geprüftes Bild (WebP/PNG/JPEG, max. 2 MB, ohne
 *     erkennbare Personen/Logos/Texte) selbst in Google Drive ab und führen im
 *     Script-Editor moderateGameImage(gameId, driveFileId, 'approved', alt) aus.
 *     Das prüft Typ und Größe, gibt die Datei per Link frei und hängt eine
 *     Zeile an GameImages an.
 *  3. Entzug: moderateGameImage(gameId, driveFileId, 'revoked' | 'blocked', '')
 *     hängt eine neue Zeile an und nimmt die Linkfreigabe zurück.
 *  4. doGet liefert pro Spiel nur den jeweils letzten Eintrag und nur bei
 *     Status approved: image (HTTPS-URL), imageAlt, imageStatus.
 */

const GAME_IMAGES_SHEET = 'GameImages';
const GAME_IMAGE_HEADERS = [
  'gameId', 'driveFileId', 'url', 'status', 'alt', 'mimeType', 'byteSize', 'updatedAt',
];
const GAME_IMAGE_STATUSES = ['approved', 'pending', 'blocked', 'revoked'];
const COMMUNITY_IMAGE_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg'];
const MAX_COMMUNITY_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_ALT = 120;
const COMMUNITY_GAME_ID_PATTERN = /^community~[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

function imageUploadDisabled_() {
  return {
    ok: false,
    code: 'image-upload-disabled',
    error: 'Bild-Upload über die öffentliche Web-App ist deaktiviert. Bilder (WebP, PNG oder JPEG, max. 2 MB) '
      + 'werden nur von den Betreiber:innen geprüft und freigegeben; das Spiel selbst wird ohne Bild gespeichert.',
  };
}

// Direkt ladbare HTTPS-URL eines per Link freigegebenen Drive-Bildes.
function driveImageUrl_(driveFileIdValue) {
  const driveFileId = String(driveFileIdValue === null || driveFileIdValue === undefined ? '' : driveFileIdValue).trim();
  if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) return null;
  return 'https://drive.google.com/thumbnail?id=' + driveFileId + '&sz=w1200';
}

// Eine GameImages-Zeile prüfen. null = ungültig (wird nie ausgeliefert).
function normalizeGameImageRow_(row) {
  row = row || {};
  const gameId = cleanText_(row.gameId, MAX_ID);
  if (!COMMUNITY_GAME_ID_PATTERN.test(gameId)) return null;
  const status = cleanText_(row.status, 20).toLowerCase();
  if (GAME_IMAGE_STATUSES.indexOf(status) < 0) return null;
  const url = driveImageUrl_(row.driveFileId);
  if (status === 'approved' && !url) return null;
  const alt = cleanText_(row.alt, MAX_IMAGE_ALT);
  return {
    gameId: gameId,
    driveFileId: url ? cleanText_(row.driveFileId, 128) : '',
    url: url,
    status: status,
    alt: alt && !isFormulaText_(alt) ? alt : null,
  };
}

// Letzter Eintrag pro Spiel gewinnt. Eine ungültige spätere Zeile sperrt das
// Bild (fail closed), statt auf eine ältere Freigabe zurückzufallen.
function latestGameImages_(rows) {
  const latest = {};
  (rows || []).forEach(function (row) {
    const gameId = cleanText_(row && row.gameId, MAX_ID);
    if (!COMMUNITY_GAME_ID_PATTERN.test(gameId)) return;
    latest[gameId] = normalizeGameImageRow_(row)
      || { gameId: gameId, driveFileId: '', url: null, status: 'invalid', alt: null };
  });
  return latest;
}

// Ergänzt freigegebene Bilder an die ausgelieferten Spiele. Fehler im
// GameImages-Tab dürfen das Laden der Spiele nie verhindern.
function attachGameImages_(games) {
  let latest;
  try {
    latest = latestGameImages_(rows_(getSheet_(GAME_IMAGES_SHEET, GAME_IMAGE_HEADERS)));
  } catch (error) {
    console.log('GameImages nicht lesbar: ' + safeError_(error));
    return games;
  }
  return games.map(function (game) {
    const image = latest[game.id];
    if (!image || image.status !== 'approved' || !image.url) return game;
    game.image = image.url;
    game.imageAlt = image.alt;
    game.imageStatus = 'approved';
    return game;
  });
}

// Nur für Betreiber:innen im Script-Editor (nicht über die Web-App erreichbar).
// Beispiel: moderateGameImage('community~burgball', '<Drive-File-ID>', 'approved', 'Kurze Bildbeschreibung');
function moderateGameImage(gameIdValue, driveFileIdValue, statusValue, altValue) {
  return withLock_(function () {
    const gameId = cleanText_(gameIdValue, MAX_ID);
    const status = cleanText_(statusValue, 20).toLowerCase();
    if (GAME_IMAGE_STATUSES.indexOf(status) < 0) {
      throw new Error('Status muss approved, pending, blocked oder revoked sein.');
    }
    if (!COMMUNITY_GAME_ID_PATTERN.test(gameId)) throw new Error('Ungültige Spiel-ID.');
    const games = rows_(getSheet_(GAMES_SHEET, GAME_HEADERS));
    if (!games.some(function (game) { return cleanText_(game.id, MAX_ID) === gameId; })) {
      throw new Error('Unbekanntes Community-Spiel.');
    }
    const alt = cleanText_(altValue, MAX_IMAGE_ALT);
    if (isFormulaText_(alt)) throw new Error('Alt-Text darf nicht mit =, +, - oder @ beginnen.');

    const driveFileId = cleanText_(driveFileIdValue, 128);
    let url = '';
    let mimeType = '';
    let byteSize = '';
    if (driveFileId || status === 'approved') {
      url = driveImageUrl_(driveFileId);
      if (!url) throw new Error('Ungültige Drive-File-ID.');
      const file = DriveApp.getFileById(driveFileId);
      if (status === 'approved') {
        mimeType = String(file.getMimeType() || '');
        byteSize = Number(file.getSize()) || 0;
        if (COMMUNITY_IMAGE_MIME_TYPES.indexOf(mimeType) < 0) {
          throw new Error('Nur WebP, PNG oder JPEG sind erlaubt, nicht „' + mimeType + '“.');
        }
        if (byteSize <= 0 || byteSize > MAX_COMMUNITY_IMAGE_BYTES) {
          throw new Error('Das Bild ist leer oder größer als 2 MB.');
        }
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } else {
        // Gesperrte oder entzogene Bilder sind auch per Direktlink nicht mehr abrufbar.
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      }
    }

    // Append-only: Entzug und Korrekturen sind neue Zeilen, nie Änderungen.
    getSheet_(GAME_IMAGES_SHEET, GAME_IMAGE_HEADERS)
      .appendRow([gameId, driveFileId, url, status, alt, mimeType, byteSize, new Date()]);
    return { ok: true, gameId: gameId, status: status, url: url || null, alt: alt || null };
  });
}
