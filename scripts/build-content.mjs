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

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { resolveBuiltinImageFields, sniffImageType, extensionMatchesType } from '../js/gameimages.js';
import { validateImageManifest, MANIFEST_FILE } from './image-manifest.mjs';
import {
  parseSport, parseMode, parseExercise, parseRuleSet, validateCollection, buildAliasMap,
} from './sportcontent.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'games');
const OUT_FILE = join(ROOT, 'js', 'content.generated.js');
const IMAGE_DIR = join(ROOT, 'assets', 'games');
const SPORTS_DIR = join(ROOT, 'content', 'sports');
const SPORTS_OUT_FILE = join(ROOT, 'js', 'sports.generated.js');

const CHECK_ONLY = process.argv.includes('--check');
const VALIDATE_ONLY = process.argv.includes('--validate');

// Erlaubte Werte für die Validierung.
const KINDS = ['sport', 'spiel', 'uebung'];
const CATEGORIES = ['lauf', 'ball', 'team'];
const DIFFICULTIES = ['einfach', 'mittel', 'schwer'];
const MAX_IMAGE_BYTES = 400 * 1024;

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

  // Optionale Bildfelder nur ausgeben, wenn sie gesetzt sind – Einträge ohne
  // Bild bleiben im Bundle unverändert.
  const img = resolveBuiltinImageFields(meta);
  if (img.errors.length) throw new Error(`${basename(file)}: ${img.errors[0]}`);
  if (img.imageKey) entry.imageKey = img.imageKey;
  if (img.image) {
    validateImageFile(img.image, basename(file));
    entry.image = img.image;
    if (img.imageAlt) entry.imageAlt = img.imageAlt;
  }

  validate(entry, basename(file));
  return entry;
}

// Das referenzierte Bild muss lokal existieren, klein genug sein und seinem
// Dateityp entsprechen (keine umbenannten SVG/HTML-Dateien).
function validateImageFile(path, file) {
  const abs = join(ROOT, path);
  if (!existsSync(abs)) throw new Error(`${file}: Bild "${path}" existiert nicht`);
  const { size } = statSync(abs);
  if (size > MAX_IMAGE_BYTES) throw new Error(`${file}: Bild "${path}" ist größer als ${MAX_IMAGE_BYTES / 1024} KB`);
  const type = sniffImageType(readFileSync(abs).subarray(0, 16));
  if (!type || !extensionMatchesType(path, type)) {
    throw new Error(`${file}: Bild "${path}" ist kein gültiges WebP/PNG/JPEG/AVIF passend zur Endung`);
  }
}

// Gelieferte Spielbilder: Manifest (Provenienz, Hashes, Anzahl) muss zu den
// Dateien in assets/games/ und zu den Markdown-Einträgen passen.
function validateImages(entries) {
  const manifestPath = join(IMAGE_DIR, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    if (entries.some(e => e.image)) throw new Error(`assets/games/${MANIFEST_FILE} fehlt`);
    return;
  }
  const errors = validateImageManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), {
    contentEntries: entries,
    readAsset: path => readFileSync(join(ROOT, path)),
    listAssets: () => readdirSync(IMAGE_DIR),
  });
  if (errors.length) throw new Error(`assets/games/${MANIFEST_FILE}: ${errors.slice(0, 5).join('; ')}`);
}

// ── Sportmodus-Content (content/sports/**) ───────────────────────────────────
// Eigene Quelle, getrennt von der Allgemeinsport-Datenbank in content/games.
function buildSports() {
  const sports = [];
  const modes = [];
  const exercises = [];
  const ruleSets = [];
  if (!existsSync(SPORTS_DIR)) throw new Error(`Verzeichnis ${SPORTS_DIR} fehlt`);

  const sportDirs = readdirSync(SPORTS_DIR)
    .filter(d => statSync(join(SPORTS_DIR, d)).isDirectory())
    .sort();

  for (const dir of sportDirs) {
    const sportPath = join(SPORTS_DIR, dir, 'sport.md');
    if (!existsSync(sportPath)) throw new Error(`content/sports/${dir}/sport.md fehlt`);
    const sport = parseSport(readFileSync(sportPath, 'utf8'), `content/sports/${dir}/sport.md`);
    if (sport.sportId !== dir) throw new Error(`content/sports/${dir}/sport.md: sportId "${sport.sportId}" passt nicht zum Ordnernamen`);
    sports.push(sport);

    const modesDir = join(SPORTS_DIR, dir, 'modes');
    if (existsSync(modesDir)) {
      for (const f of readdirSync(modesDir).filter(f => f.endsWith('.md')).sort()) {
        const rel = `content/sports/${dir}/modes/${f}`;
        const mode = parseMode(readFileSync(join(modesDir, f), 'utf8'), rel);
        if (mode.sportId !== dir) throw new Error(`${rel}: sportId passt nicht zum Ordner`);
        if (basename(f, '.md') !== mode.modeId) throw new Error(`${rel}: Dateiname muss "${mode.modeId}.md" lauten`);
        modes.push(mode);
      }
    }

    const exDir = join(SPORTS_DIR, dir, 'exercises');
    if (existsSync(exDir)) {
      for (const f of readdirSync(exDir).filter(f => f.endsWith('.md')).sort()) {
        const rel = `content/sports/${dir}/exercises/${f}`;
        const ex = parseExercise(readFileSync(join(exDir, f), 'utf8'), rel);
        if (ex.sportId !== dir) throw new Error(`${rel}: sportId passt nicht zum Ordner`);
        if (basename(f, '.md') !== ex.id) throw new Error(`${rel}: Dateiname muss "${ex.id}.md" lauten`);
        exercises.push(ex);
      }
    }

    // Regel-/Spielbetriebscontent liegt bewusst in einem eigenen Ordner und
    // wird nie mit den Übungen zusammengeführt.
    const rulesDir = join(SPORTS_DIR, dir, 'rules');
    if (existsSync(rulesDir)) {
      for (const f of readdirSync(rulesDir).filter(f => f.endsWith('.md')).sort()) {
        const rel = `content/sports/${dir}/rules/${f}`;
        const rs = parseRuleSet(readFileSync(join(rulesDir, f), 'utf8'), rel);
        if (rs.sportId !== dir) throw new Error(`${rel}: sportId passt nicht zum Ordner`);
        if (basename(f, '.md') !== rs.id) throw new Error(`${rel}: Dateiname muss "${rs.id}.md" lauten`);
        ruleSets.push(rs);
      }
    }
  }

  ruleSets.sort((a, b) => a.sportId.localeCompare(b.sportId) || a.order - b.order || a.id.localeCompare(b.id));
  sports.sort((a, b) => a.order - b.order || a.sportId.localeCompare(b.sportId));
  const errors = validateCollection({ sports, modes, exercises, ruleSets });
  if (errors.length) throw new Error(errors.slice(0, 5).join('; '));

  const header =
`// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  AUTOMATISCH GENERIERT – NICHT MANUELL BEARBEITEN.                          ║
// ║  Quelle: content/sports/**/*.md   ·   Build: scripts/build-content.mjs      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
`;
  const out = `${header}export const SPORTS = ${JSON.stringify(sports, null, 2)};

export const SPORT_MODES = ${JSON.stringify(modes, null, 2)};

export const SPORT_EXERCISES = ${JSON.stringify(exercises, null, 2)};

export const SPORT_RULE_SETS = ${JSON.stringify(ruleSets, null, 2)};

export const SPORT_ALIASES = ${JSON.stringify(buildAliasMap(sports), null, 2)};
`;
  return { sports, modes, exercises, ruleSets, out };
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
  validateImages(entries);

  const header =
`// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  AUTOMATISCH GENERIERT – NICHT MANUELL BEARBEITEN.                          ║
// ║  Quelle: content/games/*.md   ·   Build: scripts/build-content.mjs          ║
// ║  Neuen Eintrag hinzufügen? Lege eine .md in content/games/ an (s. CONTRIBUTING.md). ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
`;
  const out = `${header}export const CONTENT = ${JSON.stringify(entries, null, 2)};\n`;
  const sportsBuild = buildSports();

  if (VALIDATE_ONLY) {
    console.log(`✓ ${entries.length} Einträge erfolgreich validiert.`);
    console.log(`✓ ${sportsBuild.sports.length} Sportarten, ${sportsBuild.modes.length} Modi, ${sportsBuild.exercises.length} Übungen, ${sportsBuild.ruleSets.length} Regelkarten validiert.`);
    return;
  }

  if (CHECK_ONLY) {
    let existing = '';
    try { existing = readFileSync(OUT_FILE, 'utf8'); } catch { /* fehlt = veraltet */ }
    if (existing !== out) {
      console.error('✗ js/content.generated.js ist nicht aktuell. Bitte "npm run build:content" ausführen und committen.');
      process.exit(1);
    }
    let existingSports = '';
    try { existingSports = readFileSync(SPORTS_OUT_FILE, 'utf8'); } catch { /* fehlt = veraltet */ }
    if (existingSports !== sportsBuild.out) {
      console.error('✗ js/sports.generated.js ist nicht aktuell. Bitte "npm run build:content" ausführen und committen.');
      process.exit(1);
    }
    console.log(`✓ ${entries.length} Einträge validiert – Bundle ist aktuell.`);
    console.log(`✓ ${sportsBuild.sports.length} Sportarten, ${sportsBuild.modes.length} Modi, ${sportsBuild.exercises.length} Übungen, ${sportsBuild.ruleSets.length} Regelkarten – Sport-Bundle ist aktuell.`);
    return;
  }

  writeFileSync(OUT_FILE, out);
  console.log(`✓ ${entries.length} Einträge → js/content.generated.js`);
  writeFileSync(SPORTS_OUT_FILE, sportsBuild.out);
  console.log(`✓ ${sportsBuild.sports.length} Sportarten / ${sportsBuild.modes.length} Modi / ${sportsBuild.exercises.length} Übungen / ${sportsBuild.ruleSets.length} Regelkarten → js/sports.generated.js`);
}

try {
  build();
} catch (e) {
  console.error(`✗ Build fehlgeschlagen:\n  ${e.message}`);
  process.exit(1);
}
