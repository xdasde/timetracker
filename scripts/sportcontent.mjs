// ─────────────────────────────────────────────────────────────────────────────
// sportcontent.mjs
//
// Reine Parse-/Validierungsfunktionen für die Sportmodus-Inhalte unter
// content/sports/. Bewusst ohne Dateisystem-Zugriff in den Kernfunktionen,
// damit `node --test` sie direkt prüfen kann.
//
// Verzeichnisstruktur (Architektur-Handoff):
//   content/sports/<sportId>/sport.md
//   content/sports/<sportId>/modes/<modeId>.md
//   content/sports/<sportId>/exercises/<exerciseId>.md
// ─────────────────────────────────────────────────────────────────────────────

export const ID_RE = /^[a-z0-9-]+$/;
export const GENERAL_SPORT_ID = 'allgemeinsport';

// ── Mini-YAML (Teilmenge: Skalare, Inline-/Block-Listen) ─────────────────────
export function parseFrontmatter(yaml, file = 'frontmatter') {
  const data = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
    const m = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) throw new Error(`${file}: ungültige Frontmatter-Zeile: "${raw}"`);
    const key = m[1];
    const rest = m[2].trim();
    if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(parseScalar(lines[i + 1].replace(/^\s*-\s+/, '').trim()));
        i++;
      }
      data[key] = items;
    } else if (rest.startsWith('[')) {
      const inner = rest.replace(/^\[/, '').replace(/\]$/, '').trim();
      data[key] = inner ? inner.split(',').map(s => parseScalar(s.trim())) : [];
    } else {
      data[key] = parseScalar(rest);
    }
    i++;
  }
  return data;
}

export function parseScalar(v) {
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

// ── Body: "## Überschrift" → Liste der "- " Punkte bzw. Fließtext ────────────
export function parseSections(body) {
  const sections = {};
  let current = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { current = h[1].trim().toLowerCase(); sections[current] = []; continue; }
    if (current) sections[current].push(line);
  }
  return sections;
}

const bullets = lines => (lines || [])
  .map(l => l.trim())
  .filter(l => l.startsWith('- '))
  .map(l => l.replace(/^-\s+/, '').trim())
  .filter(Boolean);

const paragraph = lines => (lines || []).map(l => l.trim()).filter(Boolean).join(' ');

export function splitDocument(text, file) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const fm = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fm) throw new Error(`${file}: kein gültiges Frontmatter (--- ... ---) gefunden`);
  return { meta: parseFrontmatter(fm[1], file), body: fm[2] };
}

// ── Sport ────────────────────────────────────────────────────────────────────
export function parseSport(text, file) {
  const { meta } = splitDocument(text, file);
  const err = msg => { throw new Error(`${file}: ${msg}`); };
  if (!ID_RE.test(String(meta.sportId ?? ''))) err(`"sportId" fehlt oder ungültig: "${meta.sportId}"`);
  if (!meta.name) err('"name" fehlt');
  if (!meta.icon) err('"icon" fehlt');
  const accent = String(meta.accent ?? '');
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) err(`"accent" muss ein Hex-Farbwert sein: "${meta.accent}"`);
  const order = meta.order ?? 0;
  if (typeof order !== 'number' || order < 0) err('"order" muss eine Zahl ≥ 0 sein');
  const aliases = Array.isArray(meta.aliases) ? meta.aliases.map(String) : [];
  for (const a of aliases) if (!ID_RE.test(a)) err(`"aliases" enthält ungültigen Wert: "${a}"`);
  return { sportId: meta.sportId, name: meta.name, icon: meta.icon, accent, order, aliases };
}

// ── Modus ────────────────────────────────────────────────────────────────────
export function parseMode(text, file) {
  const { meta } = splitDocument(text, file);
  const err = msg => { throw new Error(`${file}: ${msg}`); };
  if (!ID_RE.test(String(meta.sportId ?? ''))) err(`"sportId" fehlt oder ungültig: "${meta.sportId}"`);
  if (!ID_RE.test(String(meta.modeId ?? ''))) err(`"modeId" fehlt oder ungültig: "${meta.modeId}"`);
  if (!meta.name) err('"name" fehlt');
  if (!meta.icon) err('"icon" fehlt');
  if (!meta.description) err('"description" fehlt');
  return {
    sportId: meta.sportId,
    modeId: meta.modeId,
    name: meta.name,
    icon: meta.icon,
    rulesLabel: meta.rulesLabel ?? 'Regeln',
    description: meta.description,
  };
}

// ── Übung ────────────────────────────────────────────────────────────────────
export function parseExercise(text, file) {
  const { meta, body } = splitDocument(text, file);
  const err = msg => { throw new Error(`${file}: ${msg}`); };
  const sections = parseSections(body);
  const steps = bullets(sections['ablauf']);
  const variations = bullets(sections['variationen']);
  const safety = bullets(sections['sicherheit']);
  const tip = paragraph(sections['tipp']);

  if (!ID_RE.test(String(meta.id ?? ''))) err(`"id" fehlt oder ungültig: "${meta.id}"`);
  if (!ID_RE.test(String(meta.sportId ?? ''))) err(`"sportId" fehlt oder ungültig: "${meta.sportId}"`);
  if (!ID_RE.test(String(meta.modeId ?? ''))) err(`"modeId" fehlt oder ungültig: "${meta.modeId}"`);
  if (!meta.name) err('"name" fehlt');
  if (!meta.icon) err('"icon" fehlt');
  if (!meta.category) err('"category" fehlt');
  if (!meta.goal) err('"goal" fehlt');
  if (!meta.setup) err('"setup" fehlt');
  if (!steps.length) err('Abschnitt "## Ablauf" mit mindestens einem "- " Punkt fehlt');
  if (!variations.length) err('Abschnitt "## Variationen" mit mindestens einem "- " Punkt fehlt');
  if (!safety.length) err('Abschnitt "## Sicherheit" mit mindestens einem "- " Punkt fehlt');
  if (!tip) err('Abschnitt "## Tipp" fehlt oder ist leer');

  return {
    id: meta.id,
    sportId: meta.sportId,
    modeId: meta.modeId,
    name: meta.name,
    icon: meta.icon,
    category: meta.category,
    goal: meta.goal,
    setup: meta.setup,
    steps,
    variations,
    safety: safety.join(' '),
    tip,
  };
}

// ── Gesamtprüfung über alle geparsten Datensätze ─────────────────────────────
// Nimmt fertige Objekte entgegen (keine Datei-IO), damit Tests sie direkt
// füttern können. Liefert eine Liste von Fehlermeldungen (leer = alles ok).
export function validateCollection({ sports = [], modes = [], exercises = [] }) {
  const errors = [];
  const sportIds = new Set();
  const aliasMap = new Map();

  for (const s of sports) {
    if (sportIds.has(s.sportId)) errors.push(`Doppelte sportId: "${s.sportId}"`);
    sportIds.add(s.sportId);
    for (const alias of s.aliases) {
      if (sportIds.has(alias) && alias !== s.sportId) errors.push(`Alias "${alias}" kollidiert mit einer sportId`);
      if (aliasMap.has(alias)) errors.push(`Doppelter Alias: "${alias}"`);
      aliasMap.set(alias, s.sportId);
    }
  }
  if (!sportIds.has(GENERAL_SPORT_ID)) errors.push(`Sportart "${GENERAL_SPORT_ID}" fehlt`);

  const modeKeys = new Set();
  for (const m of modes) {
    const key = `${m.sportId}/${m.modeId}`;
    if (modeKeys.has(key)) errors.push(`Doppelter Modus: "${key}"`);
    modeKeys.add(key);
    if (!sportIds.has(m.sportId)) errors.push(`Modus "${key}" verweist auf unbekannte sportId`);
  }

  const exerciseIds = new Set();
  for (const e of exercises) {
    if (exerciseIds.has(e.id)) errors.push(`Doppelte Übungs-id: "${e.id}"`);
    exerciseIds.add(e.id);
    if (!sportIds.has(e.sportId)) errors.push(`Übung "${e.id}" verweist auf unbekannte sportId "${e.sportId}"`);
    if (!modeKeys.has(`${e.sportId}/${e.modeId}`)) {
      errors.push(`Übung "${e.id}" verweist auf unbekannten Modus "${e.sportId}/${e.modeId}"`);
    }
  }

  // Redaktioneller Mindestumfang laut Karte/Architektur-Handoff.
  for (const [sportId, min] of Object.entries(MIN_EXERCISES)) {
    const count = exercises.filter(e => e.sportId === sportId).length;
    if (count < min) errors.push(`Sportart "${sportId}" hat nur ${count} Übungen (mindestens ${min} erforderlich)`);
    const cats = new Set(exercises.filter(e => e.sportId === sportId).map(e => e.category));
    if (count && cats.size < 3) errors.push(`Sportart "${sportId}" deckt nur ${cats.size} Kategorien ab (mindestens 3)`);
  }
  return errors;
}

export const MIN_EXERCISES = {
  football: 30,
  handball: 15,
  volleyball: 15,
  basketball: 15,
};

// Zentrale Alias-Auflösung – identisch zur Runtime in js/sports.js.
export function buildAliasMap(sports) {
  const map = {};
  for (const s of sports) {
    map[s.sportId] = s.sportId;
    for (const alias of s.aliases) map[alias] = s.sportId;
  }
  return map;
}
