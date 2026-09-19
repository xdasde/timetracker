// Community-Spiele: von Nutzer:innen über das App-Formular eingereichte Spiele,
// die in einem Google Sheet liegen und über eine Apps-Script-Web-App gelesen und
// geschrieben werden (siehe scripts/google-apps-script/README.md).
//
// Grundsätze:
//  • Eingabe passiert ausschließlich über das Formular in der App (POST),
//    nie durch direktes Bearbeiten des Sheets durch App-Nutzer:innen.
//  • Kein Freigabe-/Admin-Schritt: Eingereichtes ist sofort Community-Spiel.
//  • Community-Spiele sind in der App nicht bearbeitbar und nicht löschbar.
//  • Keine Credentials im Frontend – der Endpoint ist öffentlich (js/config.js).
//  • Alles aus dem Sheet gilt als Fremddaten: normalisieren, validieren und
//    ausschließlich als Text (textContent) rendern – nie als HTML.
import * as storage from './storage.js';
import { COMMUNITY_ENDPOINT, COMMUNITY_CACHE_TTL_MS, hasCommunityEndpoint } from './config.js';
import { normalizeCommunityImage } from './gameimages.js';

export const KINDS = ['sport', 'spiel', 'uebung'];
export const CATEGORIES = ['lauf', 'ball', 'team'];
export const DIFFICULTIES = ['einfach', 'mittel', 'schwer'];

// IDs von Community-Spielen bekommen ein Präfix mit `~`. slugify() erzeugt nur
// [a-z0-9-], darum kann eine Community-ID niemals mit einer Built-in- oder
// lokalen ID kollidieren – egal wie ein Spiel heißt.
export const ID_PREFIX = 'community~';
const CACHE_KEY = 'communityGamesCache';
const RATINGS_KEY = 'communityRatings';
const DEVICE_KEY = 'communityDeviceId';
const MAX_BASICS = 40;
const MAX_TEXT = 400;

export function isCommunityId(id) {
  return typeof id === 'string' && id.toLowerCase().startsWith(ID_PREFIX);
}

// ── Reine Helfer (auch ohne Browser testbar) ─────────────────────────────────

export function slugify(name) {
  return String(name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spiel';
}

// Baut eine eindeutige Community-ID aus dem Namen. `taken` sind bereits
// vergebene Community-IDs (mit Präfix).
export function communityId(name, taken = []) {
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  const base = slugify(name);
  let id = ID_PREFIX + base;
  let n = 2;
  while (takenSet.has(id)) id = `${ID_PREFIX}${base}-${n++}`;
  return id;
}

const text = (v, max = MAX_TEXT) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nullableText = (v, max = MAX_TEXT) => text(v, max) || null;

function toList(v, max = MAX_BASICS) {
  let source = v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) source = parsed;
    } catch { /* anschließend als normalen Text behandeln */ }
  }
  if (Array.isArray(source)) return source.map(x => text(x)).filter(Boolean).slice(0, max);
  return String(source ?? '').split(/\r?\n|;|,/).map(x => text(x)).filter(Boolean).slice(0, max);
}

function toMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 24 * 60 * 60 * 1000);
}

function toCount(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

export function clampRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

// Eine Zeile aus dem Sheet (oder ein Formular-Entwurf) in die interne Spielform
// bringen. Gibt immer ein vollständiges Objekt zurück – oder null, wenn die
// Pflichtangaben fehlen.
export function normalizeGame(raw, taken = []) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 60);
  if (!name) return null;

  const rawId = text(raw.id, 60);
  const id = isCommunityId(rawId)
    ? ID_PREFIX + slugify(rawId.slice(ID_PREFIX.length))
    : (rawId ? ID_PREFIX + slugify(rawId) : communityId(name, taken));

  const categories = toList(raw.categories, 3).filter(c => CATEGORIES.includes(c));
  const difficulty = text(raw.difficulty, 20).toLowerCase();

  return {
    id,
    name,
    shortName: nullableText(raw.shortName, 30),
    icon: text(raw.icon, 4) || '🎯',
    kind: KINDS.includes(text(raw.kind, 20).toLowerCase()) ? text(raw.kind, 20).toLowerCase() : 'spiel',
    categories,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : null,
    ageGroup: nullableText(raw.ageGroup, 40),
    material: toList(raw.material, 20),
    players: nullableText(raw.players, 40),
    teamA: text(raw.teamA, 20) || 'Team A',
    teamB: text(raw.teamB, 20) || 'Team B',
    colorIndex: toCount(raw.colorIndex, 0, 0, 3),
    durationMs: toMs(raw.durationMs),
    breakMs: toMs(raw.breakMs),
    periods: toCount(raw.periods, 1, 1, 9),
    periodLabel: text(raw.periodLabel, 20) || 'Halbzeit',
    structure: text(raw.structure, 200),
    scoring: text(raw.scoring, 200),
    basics: toList(raw.basics),
    tip: text(raw.tip),
    source: nullableText(raw.source, 120),
    author: nullableText(raw.author, 40),
    ratingAverage: roundAverage(raw.ratingAverage),
    ratingCount: Math.max(0, toCount(raw.ratingCount, 0, 0, 1e6)),
    // Bild nur bei serverseitiger Freigabe (approved + HTTPS), sonst null.
    ...normalizeCommunityImage(raw),
    community: true,
  };
}

// Bildfelder vergibt ausschließlich der Server. Ein Entwurf aus der App
// sendet deshalb nie image/imageAlt/imageStatus mit.
function withoutImageFields(game) {
  const { image, imageAlt, imageStatus, ...rest } = game;
  return rest;
}

function roundAverage(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(Math.max(n, 1), 5) * 10) / 10;
}

// Prüft einen (bereits normalisierten) Eintrag vor dem Absenden.
export function validateSubmission(game) {
  const errors = [];
  if (!game || typeof game !== 'object') return ['Keine Daten.'];
  if (!text(game.name, 60)) errors.push('Name fehlt.');
  if (!KINDS.includes(game.kind)) errors.push('Art ist ungültig.');
  if (game.difficulty && !DIFFICULTIES.includes(game.difficulty)) errors.push('Schwierigkeit ist ungültig.');
  if (!Array.isArray(game.categories) || game.categories.some(c => !CATEGORIES.includes(c))) errors.push('Ungültige Kategorie.');
  if (!text(game.structure, 200)) errors.push('Aufbau fehlt.');
  if (!text(game.scoring, 200)) errors.push('Wertung fehlt.');
  if (!Array.isArray(game.basics) || !game.basics.length) errors.push('Mindestens ein Ablauf-Punkt nötig.');
  if (!text(game.tip)) errors.push('App-Tipp fehlt.');
  return errors;
}

// POST-Erfolg nur akzeptieren, wenn der Server ihn ausdrücklich bestätigt.
// Leere, HTML-artige oder sonstige 2xx-Antworten dürfen keine lokale
// Erfolgsmeldung auslösen.
export function parsePostResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.ok !== true) return null;
  return payload;
}

// Antwort der Web-App (beliebige Form) in eine saubere Spieleliste überführen.
// Doppelte IDs gewinnen nach „zuerst gesehen".
export function parseGamesResponse(payload) {
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload?.games) ? payload.games
      : Array.isArray(payload?.data) ? payload.data : [];
  const out = [];
  const taken = new Set();
  rows.forEach(row => {
    const game = normalizeGame(row, taken);
    if (!game || validateSubmission(game).length || taken.has(game.id)) return;
    taken.add(game.id);
    out.push(game);
  });
  return out;
}

// Durchschnitt/Anzahl nach einer eigenen Bewertung optimistisch fortschreiben.
// `previous` ist die frühere eigene Bewertung desselben Geräts (oder null).
export function applyOwnRating(game, value, previous = null) {
  const rating = clampRating(value);
  if (!rating) return game;
  const prev = clampRating(previous);
  const count = Math.max(0, Math.round(Number(game?.ratingCount) || 0));
  const average = Number(game?.ratingAverage);
  const sum = Number.isFinite(average) ? average * count : 0;
  const newCount = prev ? Math.max(count, 1) : count + 1;
  const newSum = prev
    ? (count > 0 ? sum - prev + rating : rating)
    : sum + rating;
  return {
    ...game,
    ratingCount: newCount,
    ratingAverage: newCount ? Math.round((newSum / newCount) * 10) / 10 : null,
  };
}

// ── Lokaler Cache + Laufzeitstatus ───────────────────────────────────────────

let _games = null;      // im Speicher gehaltene Liste (aus Cache oder Netz)
let _loading = null;    // laufender load()-Promise
const REQUEST_TIMEOUT_MS = 15000;
const _submissionIds = new WeakMap();

function request(url, options) {
  if (typeof AbortController !== 'function') return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function readCache() {
  const cached = storage.getItem(CACHE_KEY);
  if (!cached || !Array.isArray(cached.games)) return null;
  return { games: parseGamesResponse(cached.games), fetchedAt: Number(cached.fetchedAt) || 0 };
}

function writeCache(games) {
  storage.setItem(CACHE_KEY, { games, fetchedAt: Date.now() });
}

export function getAll() {
  if (_games === null) _games = readCache()?.games || [];
  return _games;
}

export function getById(id) {
  return getAll().find(g => g.id === id) || null;
}

export function isStale() {
  const cached = readCache();
  return !cached || (Date.now() - cached.fetchedAt) > COMMUNITY_CACHE_TTL_MS;
}

// Lädt die Community-Spiele. Fehler/Offline sind kein Problem: dann bleibt
// einfach der lokale Cache stehen (die App darf daran nie kaputtgehen).
export function load({ force = false } = {}) {
  if (!hasCommunityEndpoint()) return Promise.resolve(getAll());
  if (_loading) return _loading;
  if (!force && !isStale()) return Promise.resolve(getAll());

  const separator = COMMUNITY_ENDPOINT.includes('?') ? '&' : '?';
  _loading = request(`${COMMUNITY_ENDPOINT}${separator}action=games`, { method: 'GET', cache: 'no-store' })
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(json => {
      if (json && json.ok === false) throw new Error(json.error || 'Community-Spiele konnten nicht geladen werden.');
      const hasRows = Array.isArray(json) || Array.isArray(json?.games) || Array.isArray(json?.data);
      if (!hasRows) throw new Error('Ungültige Community-Antwort.');
      const games = parseGamesResponse(json);
      _games = games;
      writeCache(games);
      return games;
    })
    .catch(() => getAll())
    .finally(() => { _loading = null; });
  return _loading;
}

// POST als text/plain: vermeidet den CORS-Preflight, den Apps-Script-Web-Apps
// nicht beantworten können. Der Body bleibt JSON.
function post(body) {
  if (!hasCommunityEndpoint()) {
    return Promise.reject(new Error('Kein Community-Endpunkt konfiguriert.'));
  }
  return request(COMMUNITY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(json => {
      const response = parsePostResponse(json);
      if (!response) throw new Error(json?.error || 'Keine bestätigte Server-Antwort.');
      return response;
    });
}

export function submitGame(draft) {
  const rememberedId = draft && typeof draft === 'object' ? _submissionIds.get(draft) : null;
  const input = rememberedId ? { ...draft, id: rememberedId } : draft;
  const game = normalizeGame(input, getAll().map(g => g.id));
  const errors = game ? validateSubmission(game) : ['Name fehlt.'];
  if (errors.length) return Promise.reject(new Error(errors.join(' ')));
  if (draft && typeof draft === 'object' && !_submissionIds.has(draft)) {
    _submissionIds.set(draft, game.id);
  }

  return post({ type: 'game', game: withoutImageFields(game), deviceId: getDeviceId() }).then(json => {
    const responseGame = json?.game || (json?.name || json?.id ? json : null);
    const saved = normalizeGame(responseGame, getAll().map(g => g.id));
    if (!saved || validateSubmission(saved).length) throw new Error('Antwort enthält kein vollständiges gespeichertes Spiel.');
    _games = [...getAll().filter(g => g.id !== saved.id), saved];
    writeCache(_games);
    return saved;
  });
}

// ── Eigene Bewertungen (pro Gerät) ───────────────────────────────────────────

export function getOwnRatings() {
  const map = storage.getItem(RATINGS_KEY);
  return map && typeof map === 'object' ? map : {};
}

export function getOwnRating(id) {
  return clampRating(getOwnRatings()[id]);
}

function setOwnRating(id, value) {
  storage.setItem(RATINGS_KEY, { ...getOwnRatings(), [id]: value });
}

// Stabile, zufällige Geräte-Kennung. Kein Login, kein Token, keine personen-
// bezogenen Daten – sie dient nur dazu, dass eine erneute Bewertung desselben
// Geräts die alte ersetzt statt den Schnitt mehrfach zu zählen.
export function getDeviceId() {
  let id = storage.getItem(DEVICE_KEY);
  if (typeof id !== 'string' || !/^[a-z0-9-]{8,64}$/.test(id)) {
    id = (globalThis.crypto?.randomUUID?.() || `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    storage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Bewertet ein Community-Spiel. Die eigene Bewertung wird immer lokal
// gespeichert (auch offline); das Senden darf fehlschlagen, ohne dass etwas
// in der App blockiert.
export function rateGame(id, value) {
  const rating = clampRating(value);
  if (!rating) return Promise.reject(new Error('Bewertung muss zwischen 1 und 5 liegen.'));
  const game = getById(id);
  if (!game) return Promise.reject(new Error('Unbekanntes Community-Spiel.'));

  const previous = getOwnRating(id);
  setOwnRating(id, rating);
  const updated = applyOwnRating(game, rating, previous);
  _games = getAll().map(g => (g.id === id ? updated : g));
  writeCache(_games);

  if (!hasCommunityEndpoint()) return Promise.resolve(updated);

  return post({ type: 'rating', gameId: id, rating, deviceId: getDeviceId() })
    .then(json => {
      if (json.gameId !== id
        || !Object.prototype.hasOwnProperty.call(json, 'ratingAverage')
        || !Object.prototype.hasOwnProperty.call(json, 'ratingCount')) {
        throw new Error('Antwort enthält keine gültige Bewertungsbestätigung.');
      }
      const avg = roundAverage(json?.ratingAverage);
      const count = Number(json.ratingCount);
      if ((json.ratingAverage !== null && avg === null)
        || !Number.isInteger(count) || count < 0 || count > 1e6) {
        throw new Error('Antwort enthält ungültige Bewertungsdaten.');
      }
      const merged = {
        ...updated,
        ratingAverage: avg,
        ratingCount: count,
      };
      _games = getAll().map(g => (g.id === id ? merged : g));
      writeCache(_games);
      return merged;
    });
}

// Nur für Tests/Debug: Laufzeitstatus verwerfen.
export function _reset() {
  _games = null;
  _loading = null;
}
