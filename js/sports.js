// Runtime-Adapter für die Sportmodi. Einzige Datenquelle ist das generierte
// Bundle js/sports.generated.js (Quelle: content/sports/**/*.md).
// Der Allgemeinsport bleibt der Default und nutzt weiterhin die bestehende
// Datenbank aus js/content.generated.js – hier wird er nur als auswählbarer
// Modus geführt, nicht neu modelliert.
import { SPORTS, SPORT_MODES, SPORT_EXERCISES, SPORT_ALIASES } from './sports.generated.js';

export const GENERAL_SPORT_ID = 'allgemeinsport';

export function getSports() {
  return SPORTS.map(s => ({ ...s }));
}

export function getSport(sportId) {
  const id = resolveSportId(sportId);
  const sport = SPORTS.find(s => s.sportId === id);
  return sport ? { ...sport } : null;
}

// Zentrale Alias-Auflösung: "soccer"/"fussball" → "football". Unbekannte oder
// leere Werte fallen bewusst auf den Allgemeinsport zurück, damit ein alter
// gespeicherter Wert die App nie blockiert.
export function resolveSportId(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return GENERAL_SPORT_ID;
  return SPORT_ALIASES[key] ?? GENERAL_SPORT_ID;
}

export function isGeneralSport(value) {
  return resolveSportId(value) === GENERAL_SPORT_ID;
}

export function getModes(sportId) {
  const id = resolveSportId(sportId);
  return SPORT_MODES.filter(m => m.sportId === id).map(m => ({ ...m }));
}

export function getMode(sportId, modeId) {
  const id = resolveSportId(sportId);
  const mode = SPORT_MODES.find(m => m.sportId === id && m.modeId === modeId);
  return mode ? { ...mode } : null;
}

// Default-Modus einer Sportart: der erste definierte. Allgemeinsport hat keinen.
export function getDefaultMode(sportId) {
  return getModes(sportId)[0] ?? null;
}

export function getExercises(sportId, modeId = null) {
  const id = resolveSportId(sportId);
  return SPORT_EXERCISES
    .filter(e => e.sportId === id && (!modeId || e.modeId === modeId))
    .map(e => ({ ...e }));
}

export function getExercise(exerciseId) {
  const ex = SPORT_EXERCISES.find(e => e.id === exerciseId);
  return ex ? { ...ex } : null;
}

export function getCategories(sportId) {
  const seen = [];
  for (const ex of getExercises(sportId)) {
    if (!seen.includes(ex.category)) seen.push(ex.category);
  }
  return seen.sort((a, b) => a.localeCompare(b, 'de'));
}

// Filter für die Sport-Übungsliste. Suche ist AND-verknüpft mit der Kategorie;
// es werden nie Übungen einer anderen Sportart geliefert.
export function filterExercises(sportId, { search = '', category = 'all', modeId = null } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return getExercises(sportId, modeId).filter(ex => {
    if (category !== 'all' && ex.category !== category) return false;
    if (!q) return true;
    const hay = [ex.name, ex.category, ex.goal, ex.setup, ex.steps.join(' '),
      ex.variations.join(' '), ex.safety].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// Anzahl der Übungen je Sportart – für Tests und die Count-Zeile.
export function countExercises(sportId) {
  return getExercises(sportId).length;
}
