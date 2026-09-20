import { readFileSync, readdirSync } from 'node:fs';

const path = 'content/sportmodes/exercises.draft.json';
const data = JSON.parse(readFileSync(path, 'utf8'));
const expected = { football: 30, handball: 15, volleyball: 15, basketball: 15 };
const required = ['id', 'sportId', 'modeId', 'title', 'category', 'goal', 'setup', 'steps', 'variations', 'safety'];
if (data.schemaVersion !== 1 || data.status !== 'draft') throw new Error('schemaVersion/status ungültig');
if (!Array.isArray(data.sports) || data.sports.length !== 4) throw new Error('Vier Sportarten erwartet');
for (const sport of data.sports) {
  if (!(sport.sportId in expected)) throw new Error(`Unerwartete Sportart: ${sport.sportId}`);
  if (sport.exercises.length < expected[sport.sportId]) throw new Error(`${sport.sportId}: zu wenige Übungen`);
  const ids = new Set();
  for (const exercise of sport.exercises) {
    for (const field of required) if (!exercise[field]) throw new Error(`${exercise.id}: Feld ${field} fehlt`);
    if (exercise.sportId !== sport.sportId || exercise.modeId !== sport.modeId) throw new Error(`${exercise.id}: IDs inkonsistent`);
    if (ids.has(exercise.id)) throw new Error(`${exercise.id}: ID doppelt`);
    ids.add(exercise.id);
    if (!Array.isArray(exercise.steps) || exercise.steps.length < 3) throw new Error(`${exercise.id}: Ablauf unvollständig`);
    if (!Array.isArray(exercise.variations) || exercise.variations.length < 2) throw new Error(`${exercise.id}: Variationen unvollständig`);
  }
}
const allFiles = readdirSync('content/games').filter((name) => name.endsWith('.md'));
if (allFiles.length < 60) throw new Error('Bestehender Allgemeinsport-Content wirkt verändert/zu klein');
console.log(`✓ Sportmodus-Entwurf valide: ${data.sports.reduce((n, s) => n + s.exercises.length, 0)} Übungen; ${allFiles.length} Allgemeinsport-Dateien erhalten.`);
