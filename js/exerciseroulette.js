// Übungs-Roulette: zieht ausschließlich Übungen der aktiven Sportart.
//
// Bewusst getrennt vom Spiel-Roulette (js/presets.js + app.js): Im Sportmodus
// darf nie ein Spiel-Preset gezogen werden, im Allgemeinsport nie eine
// sportartspezifische Übung. Dieses Modul ist DOM-frei und testbar.

export const ALL_CATEGORY = 'all';

// Allgemeinsport: Wortlaut des bestehenden Spiel-Roulettes. Bewusst hier
// abgelegt, damit Startseite und Roulette-Screen denselben Text benutzen und
// der Wechsel zurück aus einem Sportmodus wieder exakt hier landet.
export const GENERAL_LABELS = {
  quickLabel: 'Spiel-Roulette',
  quickSub: 'Zufällig & fair',
  quickAria: 'Spiel-Roulette öffnen',
  title: 'Spiel-Roulette',
  intro: 'Wähle eine Kategorie und lose ein zufälliges Spiel aus.',
  empty: 'Keine Spiele in dieser Kategorie verfügbar. Passe die Ausschlussliste an (Symbol oben rechts).',
  readyName: 'Bereit?',
};

// Chip-Optionen der Kategorie-Reihe, abgeleitet aus den vorhandenen Übungen.
export function categoryOptions(categories = []) {
  return [{ key: ALL_CATEGORY, label: 'Alle Übungen' },
    ...categories.map(c => ({ key: c, label: c }))];
}

export function filterCandidates(exercises = [], category = ALL_CATEGORY) {
  if (category === ALL_CATEGORY) return [...exercises];
  return exercises.filter(ex => ex.category === category);
}

export function pick(candidates = [], random = Math.random) {
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

// Beschriftungen. Im Sportmodus heißt die Funktion nie „Spiel-Roulette“.
export function labels(sportName) {
  const name = sportName || 'Sport';
  return {
    quickLabel: 'Übungs-Roulette',
    quickSub: `Zufällige ${name}übung`,
    quickAria: `Übungs-Roulette für ${name} öffnen`,
    title: `Übungs-Roulette · ${name}`,
    intro: `Wähle eine Kategorie und lose eine zufällige ${name}übung aus.`,
    empty: `Keine ${name}übungen für diese Auswahl gefunden`,
    reset: 'Filter zurücksetzen',
    readyName: 'Bereit?',
  };
}

// Meta-Zeile unter dem Gewinner. Eine Übung hat keine Teams und keine
// Spieldauer – gezeigt wird, was tatsächlich in der Übung steht.
export function resultMeta(exercise) {
  if (!exercise) return [];
  return [exercise.category, exercise.goal].filter(part => !!String(part ?? '').trim());
}

// Unterscheidet Übung und Spiel-Preset an den Daten, nicht am Screen-Zustand:
// Ein Preset bringt immer beide Teams mit, eine Übung nie.
export function isExerciseResult(result) {
  return !!result && !result.teamA && !result.teamB;
}

export function countLabel(count) {
  return `${count} ${count === 1 ? 'Übung' : 'Übungen'} im Topf`;
}
