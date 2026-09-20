// Auswahl-/Persistenzschicht für den aktiven Sportmodus.
// Kein Zustand in app.js: dort wird nur gerendert und verdrahtet.
//
// Persistenz: localStorage-Key "tt.sportModeSelection"
//   { version: 1, sportId, modeId, selectedAt }
// Ungültige, unbekannte oder alte Werte fallen still auf Allgemeinsport zurück.
import * as storage from './storage.js';
import * as sports from './sports.js';

export const STORAGE_KEY = 'sportModeSelection';
export const SELECTION_VERSION = 1;

const listeners = new Set();
let _selection = { sportId: sports.GENERAL_SPORT_ID, modeId: null };

function notify() {
  const snapshot = getSelection();
  for (const fn of listeners) {
    try { fn(snapshot); } catch { /* ein defekter Listener darf nichts blockieren */ }
  }
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSelection() {
  return { ...JSON.parse(JSON.stringify(_selection)) };
}

export function getSelectedSport() {
  return sports.getSport(_selection.sportId);
}

export function getSelectedMode() {
  if (isGeneral()) return null;
  return sports.getMode(_selection.sportId, _selection.modeId);
}

export function isGeneral() {
  return sports.isGeneralSport(_selection.sportId);
}

// Regeln-Label erscheint ausschließlich in echten Sportmodi.
export function getRulesLabel() {
  if (isGeneral()) return null;
  return getSelectedMode()?.rulesLabel ?? 'Regeln';
}

function normalize(sportId, modeId) {
  const resolved = sports.resolveSportId(sportId);
  if (resolved === sports.GENERAL_SPORT_ID) {
    return { sportId: sports.GENERAL_SPORT_ID, modeId: null };
  }
  const mode = (modeId && sports.getMode(resolved, modeId)) || sports.getDefaultMode(resolved);
  if (!mode) return { sportId: sports.GENERAL_SPORT_ID, modeId: null };
  return { sportId: resolved, modeId: mode.modeId };
}

export function select(sportId, modeId = null) {
  const next = normalize(sportId, modeId);
  const changed = next.sportId !== _selection.sportId || next.modeId !== _selection.modeId;
  _selection = next;
  storage.setItem(STORAGE_KEY, {
    version: SELECTION_VERSION,
    sportId: next.sportId,
    modeId: next.modeId,
    selectedAt: Date.now(),
  });
  if (changed) notify();
  return getSelection();
}

// Beim Start aufrufen: liest die gespeicherte Auswahl und validiert sie gegen
// den aktuell ausgelieferten Content.
export function restore() {
  let stored = null;
  try { stored = storage.getItem(STORAGE_KEY); } catch { stored = null; }
  if (!stored || typeof stored !== 'object' || stored.version !== SELECTION_VERSION) {
    _selection = { sportId: sports.GENERAL_SPORT_ID, modeId: null };
    notify();
    return getSelection();
  }
  _selection = normalize(stored.sportId, stored.modeId);
  notify();
  return getSelection();
}

export function clear() {
  storage.removeItem(STORAGE_KEY);
  _selection = { sportId: sports.GENERAL_SPORT_ID, modeId: null };
  notify();
  return getSelection();
}

// Kontext für neue Matches/Sessions – alte Datensätze ohne diese Felder
// bleiben gültig und werden als Allgemeinsport gelesen.
export function getMatchContext() {
  if (isGeneral()) return { sportId: sports.GENERAL_SPORT_ID, modeId: null };
  return { sportId: _selection.sportId, modeId: _selection.modeId };
}
