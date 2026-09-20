// Runtime-Adapter für die Sportmodi. Einzige Datenquelle ist das generierte
// Bundle js/sports.generated.js (Quelle: content/sports/**/*.md).
// Der Allgemeinsport bleibt der Default und nutzt weiterhin die bestehende
// Datenbank aus js/content.generated.js – hier wird er nur als auswählbarer
// Modus geführt, nicht neu modelliert.
import { SPORTS, SPORT_MODES, SPORT_EXERCISES, SPORT_RULE_SETS, SPORT_ALIASES } from './sports.generated.js';

export const GENERAL_SPORT_ID = 'allgemeinsport';

// Altersklassen (Anzeigereihenfolge). Spiegelbild von scripts/sportcontent.mjs;
// die Build-Validierung stellt sicher, dass beide Listen zusammenpassen.
export const AGE_BANDS = [
  { key: 'G_U6_U7', label: 'G/Bambini (U6/U7)', short: 'G' },
  { key: 'F_U8_U9', label: 'F (U8/U9)', short: 'F' },
  { key: 'E_U10_U11', label: 'E (U10/U11)', short: 'E' },
  { key: 'D_U12_U13', label: 'D (U12/U13)', short: 'D' },
  { key: 'C_U14_U15', label: 'C (U14/U15)', short: 'C' },
  { key: 'B_U16_U17', label: 'B (U16/U17)', short: 'B' },
  { key: 'A_U18_U19', label: 'A (U18/U19)', short: 'A' },
];

export function ageBandLabel(key) {
  return AGE_BANDS.find(b => b.key === key)?.label ?? key;
}

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

// Altersklassen, die in den Übungen einer Sportart tatsächlich vorkommen.
// Sportarten ohne Altersangaben liefern eine leere Liste – dort blendet die UI
// den Altersklassenfilter aus (Rückwärtskompatibilität).
export function getExerciseAgeBands(sportId) {
  const present = new Set();
  for (const ex of getExercises(sportId)) for (const b of ex.ageBands ?? []) present.add(b);
  return AGE_BANDS.filter(b => present.has(b.key));
}

// Filter für die Sport-Übungsliste. Suche, Kategorie und Altersklasse sind
// AND-verknüpft; es werden nie Übungen einer anderen Sportart geliefert.
// Übungen ohne Altersangabe gelten für alle Altersklassen.
export function filterExercises(sportId, { search = '', category = 'all', ageBand = 'all', modeId = null } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return getExercises(sportId, modeId).filter(ex => {
    if (category !== 'all' && ex.category !== category) return false;
    if (ageBand !== 'all' && (ex.ageBands ?? []).length && !ex.ageBands.includes(ageBand)) return false;
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

// ── Regel-/Spielbetriebsdomäne (content_type "rule_set") ─────────────────────
// Strikt getrennt von den Übungen: eigene Getter, eigener Datentyp. Nichts hier
// liefert jemals eine Übung, und filterExercises liefert nie eine Regelkarte.

export function getRuleSets(sportId, { ageBand = 'all' } = {}) {
  const id = resolveSportId(sportId);
  return SPORT_RULE_SETS
    .filter(r => r.sportId === id && (ageBand === 'all' || r.ageBand === ageBand))
    .map(r => ({ ...r }));
}

export function getRuleSet(ruleSetId) {
  const rs = SPORT_RULE_SETS.find(r => r.id === ruleSetId);
  return rs ? { ...rs } : null;
}

export function hasRuleSets(sportId) {
  return getRuleSets(sportId).length > 0;
}

// Altersklassen, für die eine Sportart Regelkarten mitbringt.
export function getRuleAgeBands(sportId) {
  const present = new Set(getRuleSets(sportId).map(r => r.ageBand));
  return AGE_BANDS.filter(b => present.has(b.key));
}

// Übungsbezeichnung je Sportmodus. In Sportmodi heißt ein Eintrag immer
// „Übung" – nie „Datensatz" oder „Eintrag".
export function exerciseNoun(count = 1) {
  return count === 1 ? 'Übung' : 'Übungen';
}

export function exerciseCountLabel(count) {
  return `${count} ${exerciseNoun(count)}`;
}
