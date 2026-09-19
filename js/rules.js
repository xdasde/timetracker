// Regelwerk-Daten. Quelle der Wahrheit sind die Markdown-Dateien in
// content/games/*.md, die per scripts/build-content.mjs zu content.generated.js
// kompiliert werden. Diese Datei leitet daraus die bekannte RULES-API ab.
import { CONTENT } from './content.generated.js';
import * as customgames from './customgames.js';
import * as communitygames from './communitygames.js';

const toRule = c => ({
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
  custom: !!c.custom,
  // Community-Spiele kommen aus dem geteilten Sheet: nur lesen, dafür bewertbar.
  community: !!c.community,
  author: c.author ?? null,
  ratingAverage: c.ratingAverage ?? null,
  ratingCount: c.ratingCount ?? 0,
  // Optionales Spielbild (Prüfung vor dem Anzeigen: js/gameimages.js).
  image: c.image ?? null,
  imageKey: c.imageKey ?? null,
  imageAlt: c.imageAlt ?? null,
  imageStatus: c.imageStatus ?? null,
});

export const RULES = Object.fromEntries(CONTENT.map(c => [c.id, toRule(c)]));

export function getRule(key) {
  if (RULES[key]) return RULES[key];
  const custom = customgames.getById(key);
  if (custom) return toRule(custom);
  const community = communitygames.getById(key);
  return community ? toRule(community) : null;
}

export function getAllRules() {
  const builtIn = Object.entries(RULES).map(([key, rule]) => ({ key, ...rule }));
  const custom = customgames.getAll().map(c => ({ key: c.id, ...toRule(c) }));
  const community = communitygames.getAll().map(c => ({ key: c.id, ...toRule(c) }));
  return [...builtIn, ...custom, ...community];
}
