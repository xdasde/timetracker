// Regelwerk-Daten. Quelle der Wahrheit sind die Markdown-Dateien in
// content/games/*.md, die per scripts/build-content.mjs zu content.generated.js
// kompiliert werden. Diese Datei leitet daraus die bekannte RULES-API ab.
import { CONTENT } from './content.generated.js';

export const RULES = Object.fromEntries(CONTENT.map(c => [c.id, {
  name: c.name,
  icon: c.icon,
  structure: c.structure,
  periods: c.periods,
  periodLabel: c.periodLabel,
  scoring: c.scoring,
  basics: c.basics,
  tip: c.tip,
  // Zusatz-Metadaten für die durchsuchbare Datenbank-Ansicht:
  kind: c.kind,
  categories: c.categories,
  difficulty: c.difficulty,
  ageGroup: c.ageGroup,
  material: c.material,
  players: c.players,
  source: c.source,
}]));

export function getRule(key) {
  return RULES[key] || null;
}

export function getAllRules() {
  return Object.entries(RULES).map(([key, rule]) => ({ key, ...rule }));
}
