// Eigene Spiele/Übungen, die Nutzer:innen direkt in der App anlegen.
//
//  • Werden lokal im Gerät gespeichert (sofort im Roulette/Setup & in der
//    Datenbank nutzbar – auch ohne Internet/Merge).
//  • Lassen sich als gültige Markdown-Datei exportieren und per vorausgefüllter
//    GitHub-URL als Pull-Request einreichen (GitHub legt automatisch Fork + PR an).
//
// Die Einträge haben dieselbe Form wie die kompilierten CONTENT-Einträge
// (siehe content.generated.js / content/SCHEMA.md), plus { custom: true }.
import * as storage from './storage.js';
import { CONTENT } from './content.generated.js';

const COLLECTION = 'customGames';
const REPO = 'xdasde/timetracker';
const BRANCH = 'main';

export const KINDS = ['sport', 'spiel', 'uebung'];
export const CATEGORIES = ['lauf', 'ball', 'team'];
export const DIFFICULTIES = ['einfach', 'mittel', 'schwer'];

export function getAll() {
  return storage.getCollection(COLLECTION).map(normalize);
}

export function getById(id) {
  return getAll().find(g => g.id === id) || null;
}

export function save(entry) {
  const games = storage.getCollection(COLLECTION);
  const idx = games.findIndex(g => g.id === entry.id);
  if (idx >= 0) games[idx] = entry; else games.push(entry);
  storage.setCollection(COLLECTION, games);
}

export function remove(id) {
  storage.removeFromCollection(COLLECTION, id);
}

// Stellt sicher, dass ältere/teilweise Einträge alle erwarteten Felder haben.
function normalize(g) {
  return {
    id: g.id,
    name: g.name,
    shortName: g.shortName ?? null,
    icon: g.icon || '🎯',
    kind: KINDS.includes(g.kind) ? g.kind : 'spiel',
    categories: Array.isArray(g.categories) ? g.categories : [],
    difficulty: g.difficulty ?? null,
    ageGroup: g.ageGroup ?? null,
    material: Array.isArray(g.material) ? g.material : [],
    players: g.players ?? null,
    teamA: g.teamA || 'Team A',
    teamB: g.teamB || 'Team B',
    colorIndex: typeof g.colorIndex === 'number' ? g.colorIndex : 0,
    durationMs: g.durationMs ?? null,
    breakMs: g.breakMs ?? null,
    periods: typeof g.periods === 'number' ? g.periods : 1,
    periodLabel: g.periodLabel || 'Halbzeit',
    structure: g.structure || '',
    scoring: g.scoring || '',
    basics: Array.isArray(g.basics) ? g.basics : [],
    tip: g.tip || '',
    source: g.source ?? null,
    custom: true,
  };
}

// ── ID aus Namen ableiten (eindeutig gegenüber Built-ins + eigenen) ───────────
export function slugify(name) {
  return (name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'spiel';
}

export function uniqueId(name, ownId = null) {
  const taken = new Set([
    ...CONTENT.map(c => c.id),
    ...getAll().map(g => g.id).filter(id => id !== ownId),
  ]);
  const base = slugify(name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ── Validierung (Spiegelbild der Build-Skript-Prüfung) ────────────────────────
export function validate(e) {
  const errors = [];
  if (!e.name?.trim()) errors.push('Name fehlt.');
  if (!e.icon?.trim()) errors.push('Icon (Emoji) fehlt.');
  if (!KINDS.includes(e.kind)) errors.push('Art ist ungültig.');
  if (e.difficulty && !DIFFICULTIES.includes(e.difficulty)) errors.push('Schwierigkeit ist ungültig.');
  if (e.categories.some(c => !CATEGORIES.includes(c))) errors.push('Ungültige Kategorie.');
  if (!e.structure?.trim()) errors.push('Aufbau fehlt.');
  if (!e.scoring?.trim()) errors.push('Wertung fehlt.');
  if (!e.basics.length) errors.push('Mindestens ein Ablauf-Punkt nötig.');
  if (!e.tip?.trim()) errors.push('App-Tipp fehlt.');
  return errors;
}

// ── Markdown-Serialisierung (passt zum Parser in build-content.mjs) ───────────
export function toMarkdown(e) {
  const L = ['---', `id: ${e.id}`, `name: ${e.name}`];
  if (e.shortName) L.push(`shortName: ${e.shortName}`);
  L.push(`icon: ${e.icon}`, `kind: ${e.kind}`);
  if (e.categories.length) L.push(`categories: [${e.categories.join(', ')}]`);
  if (e.difficulty) L.push(`difficulty: ${e.difficulty}`);
  if (e.ageGroup) L.push(`ageGroup: ${e.ageGroup}`);
  if (e.material.length) L.push(`material: [${e.material.join(', ')}]`);
  if (e.players) L.push(`players: ${e.players}`);
  L.push(
    `teamA: ${e.teamA}`,
    `teamB: ${e.teamB}`,
    `colorIndex: ${e.colorIndex}`,
    `durationMs: ${e.durationMs ?? 'null'}`,
    `breakMs: ${e.breakMs ?? 'null'}`,
    `periods: ${e.periods}`,
    `periodLabel: ${e.periodLabel}`,
    `structure: ${e.structure}`,
    `scoring: ${e.scoring}`,
  );
  if (e.source) L.push(`source: ${e.source}`);
  L.push('---', '', '## Ablauf', ...e.basics.map(b => `- ${b}`), '', '## Tipp', e.tip, '');
  return L.join('\n');
}

// Vorausgefüllte GitHub-„neue Datei"-URL → öffnet Web-Editor, GitHub erzeugt für
// Nutzer ohne Schreibrechte automatisch Fork + Pull-Request.
export function prefillUrl(e) {
  const value = encodeURIComponent(toMarkdown(e));
  return `https://github.com/${REPO}/new/${BRANCH}?filename=content/games/${e.id}.md&value=${value}`;
}
