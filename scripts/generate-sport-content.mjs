#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// generate-sport-content.mjs
//
// Einmalige/wiederholbare Überführung des redaktionellen Content-Entwurfs
// (content/sportmodes/exercises.draft.json) in die Markdown-Quellen unter
// content/sports/. Nach der Überführung sind die Markdown-Dateien die Quelle
// der Wahrheit – der Entwurf bleibt nur als Herkunftsnachweis liegen.
//
//   node scripts/generate-sport-content.mjs            # schreibt fehlende Dateien
//   node scripts/generate-sport-content.mjs --force    # überschreibt vorhandene
//
// Allgemeinsport (content/games/*.md) wird nicht angefasst.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRAFT = join(ROOT, 'content', 'sportmodes', 'exercises.draft.json');
const SPORTS_DIR = join(ROOT, 'content', 'sports');
const FORCE = process.argv.includes('--force');

// Akzentfarben und Reihenfolge stammen aus der Design-/UX-Spezifikation.
const SPORT_META = {
  football:   { accent: '#39c56f', order: 1, aliases: ['soccer', 'fussball'] },
  handball:   { accent: '#ef6b5b', order: 2, aliases: [] },
  volleyball: { accent: '#53a8ff', order: 3, aliases: [] },
  basketball: { accent: '#f59b42', order: 4, aliases: [] },
};

const esc = v => String(v ?? '').replace(/\r?\n/g, ' ').trim();
const yamlScalar = v => {
  const s = esc(v);
  return /^[\s>|&*#!%@`'"[\]{},]|:\s|\s$/.test(s) ? JSON.stringify(s) : s;
};

function writeIfNeeded(path, text) {
  if (!FORCE && existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

function sportFile(sport) {
  const meta = SPORT_META[sport.sportId];
  if (!meta) throw new Error(`Unbekannte sportId im Entwurf: ${sport.sportId}`);
  const aliases = meta.aliases.length ? `[${meta.aliases.join(', ')}]` : '[]';
  return `---
sportId: ${sport.sportId}
name: ${yamlScalar(sport.name)}
icon: ${sport.icon}
accent: ${JSON.stringify(meta.accent)}
order: ${meta.order}
aliases: ${aliases}
---

## Beschreibung
- Sportartspezifische Übungen für ${esc(sport.name)}.
`;
}

function modeFile(sport) {
  return `---
sportId: ${sport.sportId}
modeId: ${sport.modeId}
name: ${yamlScalar(sport.modeName)}
icon: ${sport.icon}
rulesLabel: Regeln
description: ${yamlScalar(`Übungen für ${sport.name} mit Ziel, Aufbau, Ablauf und Sicherheitshinweis.`)}
---

## Beschreibung
- Übungssammlung für ${esc(sport.name)}; Auswahl über den Sportartenumschalter oben rechts.
`;
}

function exerciseFile(sport, ex) {
  const lines = [
    '---',
    `id: ${ex.id}`,
    `sportId: ${ex.sportId}`,
    `modeId: ${ex.modeId}`,
    `name: ${yamlScalar(ex.title)}`,
    `icon: ${sport.icon}`,
    `category: ${yamlScalar(ex.category)}`,
    `goal: ${yamlScalar(ex.goal)}`,
    `setup: ${yamlScalar(ex.setup)}`,
    '---',
    '',
    '## Ablauf',
    ...ex.steps.map(s => `- ${esc(s)}`),
    '',
    '## Variationen',
    ...ex.variations.map(s => `- ${esc(s)}`),
    '',
    '## Sicherheit',
    `- ${esc(ex.safety)}`,
    '',
    '## Tipp',
    `Timer für feste Serien nutzen und nach jeder Serie die Rollen wechseln.`,
    '',
  ];
  return lines.join('\n');
}

const draft = JSON.parse(readFileSync(DRAFT, 'utf8'));
let written = 0;
let skipped = 0;
for (const sport of draft.sports) {
  const dir = join(SPORTS_DIR, sport.sportId);
  writeIfNeeded(join(dir, 'sport.md'), sportFile(sport)) ? written++ : skipped++;
  writeIfNeeded(join(dir, 'modes', `${sport.modeId}.md`), modeFile(sport)) ? written++ : skipped++;
  for (const ex of sport.exercises) {
    writeIfNeeded(join(dir, 'exercises', `${ex.id}.md`), exerciseFile(sport, ex)) ? written++ : skipped++;
  }
}

// Allgemeinsport ist der Default-Modus ohne eigene Übungsdateien: er nutzt die
// bestehende Datenbank aus content/games/*.md.
const generalWritten = writeIfNeeded(join(SPORTS_DIR, 'allgemeinsport', 'sport.md'), `---
sportId: allgemeinsport
name: Allgemeinsport
icon: 🏅
accent: "#ff9a2e"
order: 0
aliases: []
---

## Beschreibung
- Standardmodus mit der vollständigen Spiele-, Sportarten- und Übungsdatenbank.
`);
generalWritten ? written++ : skipped++;

console.log(`✓ ${written} Datei(en) geschrieben, ${skipped} übersprungen (vorhanden).`);
