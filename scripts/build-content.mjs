#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-content.mjs
//
// Kompiliert alle Markdown-Dateien aus content/games/*.md zu einem einzigen
// JavaScript-Modul js/content.generated.js, das die App importiert.
//
// Die Markdown-Dateien sind die Quelle der Wahrheit für die Spiele-/Übungs-
// Datenbank. Jeder kann per Pull-Request eine neue .md-Datei beitragen.
//
//   Bauen:        node scripts/build-content.mjs
//   Validieren:   node scripts/build-content.mjs --validate   (nur .md prüfen)
//   Frische-Test: node scripts/build-content.mjs --check      (Bundle aktuell?)
//
// Bewusst ohne externe Abhängigkeiten (kein npm install nötig) – das hält den
// Build in gesperrten CI-Umgebungen lauffähig und die Runtime build-frei.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'games');
const OUT_FILE = join(ROOT, 'js', 'content.generated.js');

const CHECK_ONLY = process.argv.includes('--check');
const VALIDATE_ONLY = process.argv.includes('--validate');

// Erlaubte Werte für die Validierung.
const KINDS = ['sport', 'spiel', 'uebung'];
const CATEGORIES = ['lauf', 'ball', 'team'];
const DIFFICULTIES = ['einfach', 'mittel', 'schwer'];

// ── Mini-YAML-Parser (Teilmenge: Skalare, null, Zahlen, Inline-/Block-Listen) ──
function parseFrontmatter(yaml, file) {
  const data = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
    const m = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) throw new Error(`${file}: ungültige Frontmatter-Zeile: "${raw}"`);
    const key = m[1];
    let rest = m[2].trim();

    if (rest === '') {
      // Eventuell folgt eine Block-Liste ("  - item").
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(parseScalar(lines[i + 1].replace(/^\s*-\s+/, '').trim()));
        i++;
      }
      data[key] = items; // leer => [] (= "nicht gesetzt")
    } else if (rest.startsWith('[')) {
      data[key] = parseInlineArray(rest, file);
    } else {
      data[key] = parseScalar(rest);
    }
    i++;
  }
  return data;
}

function parseInlineArray(str, file) {
  const inner = str.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map(s => parseScalar(s.trim()));
}

function parseScalar(v) {
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  // Quotes entfernen
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  // Reine Zahl?
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

// ── Body-Parser: extrahiert basics[] (## Ablauf) und tip (## Tipp) ─────────────
function parseBody(body) {
  const sections = {};
  let current = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { current = h[1].trim().toLowerCase(); sections[current] = []; continue; }
    if (current) sections[current].push(line);
  }
  const find = (...names) => {
    for (const n of names) {
      const key = Object.keys(sections).find(k => k.includes(n));
      if (key) return sections[key];
    }
    return null;
  };

  const ablaufLines = find('ablauf', 'regeln') || [];
  const basics = ablaufLines
    .map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => l.replace(/^-\s+/, '').trim())
    .filter(Boolean);

  const tipLines = find('tipp', 'app-tipp') || [];
  const tip = tipLines.map(l => l.trim()).filter(Boolean).join(' ');

  return { basics, tip };
}

// ── Eine Datei einlesen & validieren ──────────────────────────────────────────
function parseFile(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fm) throw new Error(`${basename(file)}: kein gültiges Frontmatter (--- ... ---) gefunden`);

  const meta = parseFrontmatter(fm[1], basename(file));
  const { basics, tip } = parseBody(fm[2]);

  const entry = {
    id: meta.id,
    name: meta.name,
    shortName: meta.shortName ?? null,
    icon: meta.icon,
    kind: meta.kind ?? 'spiel',
    categories: Array.isArray(meta.categories) ? meta.categories : [],
    difficulty: meta.difficulty ?? null,
    ageGroup: meta.ageGroup ?? null,
    material: Array.isArray(meta.material) ? meta.material : [],
    players: meta.players ?? null,
    teamA: meta.teamA ?? 'Team A',
    teamB: meta.teamB ?? 'Team B',
    colorIndex: meta.colorIndex ?? 0,
    durationMs: meta.durationMs ?? null,
    breakMs: meta.breakMs ?? null,
    periods: meta.periods ?? 1,
    periodLabel: meta.periodLabel ?? 'Halbzeit',
    structure: meta.structure ?? '',
    scoring: meta.scoring ?? '',
    basics,
    tip,
    source: meta.source ?? null,
  };

  validate(entry, basename(file));
  return entry;
}

function validate(e, file) {
  const err = msg => { throw new Error(`${file}: ${msg}`); };
  if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) err(`"id" fehlt oder ungültig (nur a-z, 0-9, -): "${e.id}"`);
  if (basename(file, '.md') !== e.id) err(`Dateiname muss "${e.id}.md" lauten`);
  if (!e.name) err('"name" fehlt');
  if (!e.icon) err('"icon" fehlt');
  if (!KINDS.includes(e.kind)) err(`"kind" ungültig: ${e.kind} (erlaubt: ${KINDS.join(', ')})`);
  if (e.difficulty && !DIFFICULTIES.includes(e.difficulty)) err(`"difficulty" ungültig: ${e.difficulty}`);
  for (const c of e.categories) if (!CATEGORIES.includes(c)) err(`"categories" enthält ungültigen Wert: ${c}`);
  if (typeof e.colorIndex !== 'number' || e.colorIndex < 0 || e.colorIndex > 3) err(`"colorIndex" muss 0–3 sein`);
  if (e.durationMs !== null && typeof e.durationMs !== 'number') err('"durationMs" muss Zahl oder null sein');
  if (e.breakMs !== null && typeof e.breakMs !== 'number') err('"breakMs" muss Zahl oder null sein');
  if (typeof e.periods !== 'number' || e.periods < 1) err('"periods" muss eine Zahl ≥ 1 sein');
  if (!e.structure) err('"structure" fehlt');
  if (!e.scoring) err('"scoring" fehlt');
  if (!e.basics.length) err('Abschnitt "## Ablauf" mit mindestens einem "- " Punkt fehlt');
  if (!e.tip) err('Abschnitt "## Tipp" fehlt oder ist leer');
}

// ── Build ─────────────────────────────────────────────────────────────────────
function build() {
  const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md')).sort();
  if (!files.length) throw new Error(`Keine .md-Dateien in ${CONTENT_DIR}`);

  const entries = [];
  const seen = new Set();
  for (const f of files) {
    const entry = parseFile(join(CONTENT_DIR, f));
    if (seen.has(entry.id)) throw new Error(`Doppelte id: "${entry.id}"`);
    seen.add(entry.id);
    entries.push(entry);
  }

  const header =
`// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  AUTOMATISCH GENERIERT – NICHT MANUELL BEARBEITEN.                          ║
// ║  Quelle: content/games/*.md   ·   Build: scripts/build-content.mjs          ║
// ║  Neuen Eintrag hinzufügen? Lege eine .md in content/games/ an (s. CONTRIBUTING.md). ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
`;
  const out = `${header}export const CONTENT = ${JSON.stringify(entries, null, 2)};\n`;

  if (VALIDATE_ONLY) {
    console.log(`✓ ${entries.length} Einträge erfolgreich validiert.`);
    return;
  }

  if (CHECK_ONLY) {
    let existing = '';
    try { existing = readFileSync(OUT_FILE, 'utf8'); } catch { /* fehlt = veraltet */ }
    if (existing !== out) {
      console.error('✗ js/content.generated.js ist nicht aktuell. Bitte "npm run build:content" ausführen und committen.');
      process.exit(1);
    }
    console.log(`✓ ${entries.length} Einträge validiert – Bundle ist aktuell.`);
    return;
  }

  writeFileSync(OUT_FILE, out);
  console.log(`✓ ${entries.length} Einträge → js/content.generated.js`);
}

try {
  build();
} catch (e) {
  console.error(`✗ Build fehlgeschlagen:\n  ${e.message}`);
  process.exit(1);
}
