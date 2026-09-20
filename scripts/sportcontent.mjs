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
//   content/sports/<sportId>/rules/<ruleSetId>.md
//
// Übungen (content_type "exercise") und Regel-/Spielbetriebscontent
// (content_type "rule_set") sind zwei getrennte Domänen: Sie liegen in
// getrennten Ordnern, werden getrennt validiert und dürfen in der App nie in
// einem gemeinsamen Pool landen (weder Liste noch Roulette).
// ─────────────────────────────────────────────────────────────────────────────

export const ID_RE = /^[a-z0-9-]+$/;
export const GENERAL_SPORT_ID = 'allgemeinsport';

// Altersklassen laut Recherche-Handoff. Reihenfolge = Anzeigereihenfolge.
export const AGE_BANDS = [
  { key: 'G_U6_U7', label: 'G/Bambini (U6/U7)', short: 'G' },
  { key: 'F_U8_U9', label: 'F (U8/U9)', short: 'F' },
  { key: 'E_U10_U11', label: 'E (U10/U11)', short: 'E' },
  { key: 'D_U12_U13', label: 'D (U12/U13)', short: 'D' },
  { key: 'C_U14_U15', label: 'C (U14/U15)', short: 'C' },
  { key: 'B_U16_U17', label: 'B (U16/U17)', short: 'B' },
  { key: 'A_U18_U19', label: 'A (U18/U19)', short: 'A' },
];
export const AGE_BAND_KEYS = AGE_BANDS.map(b => b.key);

// Geltungsstatus einer Regelkarte – bewusst explizit, damit ungeprüfter
// Content nie wie eine verbindliche Verbandsangabe aussieht.
export const RULE_STATUS = [
  'binding_national', 'binding_regional', 'recommendation', 'local_practice', 'needs_review',
];
export const JURISDICTIONS = ['DFB', 'WDFV', 'FLVW', 'LOCAL_ASSOCIATION'];

// Pflichtabschnitte einer Regelkarte (Reihenfolge = Anzeigereihenfolge).
export const RULE_SECTIONS = [
  { key: 'formats', heading: 'spielformen', label: 'Spielformen' },
  { key: 'field', heading: 'feld und tore', label: 'Feld und Tore' },
  { key: 'playingTime', heading: 'spielzeit', label: 'Spielzeit' },
  { key: 'specifics', heading: 'regelbesonderheiten', label: 'Regelbesonderheiten' },
  { key: 'variants', heading: 'varianten und widersprüche', label: 'Varianten und Widersprüche' },
  { key: 'openPoints', heading: 'offene punkte', label: 'Offene Punkte' },
];

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

  // Altersklassen sind optional: Sportarten ohne Angabe (Handball, Volleyball,
  // Basketball, künftige Sportarten) bleiben unverändert gültig und gelten im
  // Filter als "für alle Altersklassen".
  const ageBands = Array.isArray(meta.ageBands) ? meta.ageBands.map(String) : [];
  for (const b of ageBands) {
    if (!AGE_BAND_KEYS.includes(b)) err(`"ageBands" enthält unbekannte Altersklasse: "${b}"`);
  }

  return {
    id: meta.id,
    sportId: meta.sportId,
    modeId: meta.modeId,
    contentType: 'exercise',
    name: meta.name,
    icon: meta.icon,
    category: meta.category,
    ageBands,
    goal: meta.goal,
    setup: meta.setup,
    steps,
    variations,
    safety: safety.join(' '),
    tip,
  };
}

// ── Regelkarte (content_type: rule_set) ──────────────────────────────────────
// Getrennt von den Übungen: eigenes Schema, eigene Pflichtfelder, eigene
// Quellenliste. Eine Regelkarte hat bewusst kein goal/setup/steps – damit kann
// die Regelansicht rein strukturell keine Übungsbeschreibung rendern.
export function parseRuleSet(text, file) {
  const { meta, body } = splitDocument(text, file);
  const err = msg => { throw new Error(`${file}: ${msg}`); };
  const sections = parseSections(body);

  if (!ID_RE.test(String(meta.id ?? ''))) err(`"id" fehlt oder ungültig: "${meta.id}"`);
  if (!ID_RE.test(String(meta.sportId ?? ''))) err(`"sportId" fehlt oder ungültig: "${meta.sportId}"`);
  if (meta.contentType !== 'rule_set') err(`"contentType" muss "rule_set" sein: "${meta.contentType}"`);
  if (!AGE_BAND_KEYS.includes(String(meta.ageBand ?? ''))) err(`"ageBand" fehlt oder unbekannt: "${meta.ageBand}"`);
  if (!meta.ageLabel) err('"ageLabel" fehlt');
  if (!meta.name) err('"name" fehlt');
  if (!meta.icon) err('"icon" fehlt');
  if (!JURISDICTIONS.includes(String(meta.jurisdiction ?? ''))) err(`"jurisdiction" fehlt oder unbekannt: "${meta.jurisdiction}"`);
  if (!RULE_STATUS.includes(String(meta.status ?? ''))) err(`"status" fehlt oder unbekannt: "${meta.status}"`);
  if (!meta.season) err('"season" fehlt (Saison oder "unbestätigt")');
  if (!meta.seasonNote) err('"seasonNote" fehlt');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.reviewedAt ?? ''))) err(`"reviewedAt" muss JJJJ-MM-TT sein: "${meta.reviewedAt}"`);

  const sourceIds = (Array.isArray(meta.sourceIds) ? meta.sourceIds : []).map(Number);
  if (!sourceIds.length) err('"sourceIds" fehlt – jede Regelkarte braucht mindestens eine Quelle');
  if (sourceIds.some(n => !Number.isInteger(n) || n < 1)) err('"sourceIds" darf nur positive Ganzzahlen enthalten');

  const order = meta.order ?? 0;
  if (typeof order !== 'number' || order < 0) err('"order" muss eine Zahl ≥ 0 sein');

  const parsed = {};
  for (const s of RULE_SECTIONS) {
    const items = bullets(sections[s.heading]);
    if (!items.length) err(`Abschnitt "## ${s.label}" mit mindestens einem "- " Punkt fehlt`);
    parsed[s.key] = items;
  }

  const sources = parseSources(sections['quellen'], file, err);
  for (const n of sourceIds) {
    if (!sources.some(s => s.ref === n)) err(`sourceIds verweist auf [${n}], das im Abschnitt "## Quellen" fehlt`);
  }

  // Regelkarten ohne belastbare Quelle dürfen keine Zahlen behaupten.
  if (meta.status === 'needs_review') {
    const numeric = RULE_SECTIONS
      .flatMap(s => parsed[s.key])
      .find(line => /\d/.test(line));
    if (numeric) err(`Status "needs_review" erlaubt keine Zahlenangabe im Regeltext: "${numeric}"`);
  }

  return {
    id: meta.id,
    sportId: meta.sportId,
    contentType: 'rule_set',
    ageBand: meta.ageBand,
    ageLabel: meta.ageLabel,
    name: meta.name,
    icon: meta.icon,
    jurisdiction: meta.jurisdiction,
    status: meta.status,
    season: String(meta.season),
    seasonNote: meta.seasonNote,
    reviewedAt: meta.reviewedAt,
    sourceIds,
    // "formats" listet nur Spielformen, die in den Quellen belegt sind.
    formatNames: Array.isArray(meta.formats) ? meta.formats.map(String) : [],
    order,
    ...parsed,
    sources,
  };
}

// "## Quellen"-Bullets der Form: "[3] Titel <https://…>"
function parseSources(lines, file, err) {
  const items = bullets(lines);
  if (!items.length) err('Abschnitt "## Quellen" mit mindestens einem "- " Punkt fehlt');
  return items.map(line => {
    const m = line.match(/^\[(\d+)\]\s+(.+?)\s*<(https?:\/\/[^>\s]+)>$/);
    if (!m) err(`Quellenzeile muss "[n] Titel <https://…>" lauten: "${line}"`);
    return { ref: Number(m[1]), title: m[2].trim(), url: m[3] };
  });
}

// ── Gesamtprüfung über alle geparsten Datensätze ─────────────────────────────
// Nimmt fertige Objekte entgegen (keine Datei-IO), damit Tests sie direkt
// füttern können. Liefert eine Liste von Fehlermeldungen (leer = alles ok).
export function validateCollection({ sports = [], modes = [], exercises = [], ruleSets = [] }) {
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

  // Regelkarten: eigener Namensraum, keine Vermischung mit Übungs-IDs.
  const ruleIds = new Set();
  for (const r of ruleSets) {
    if (ruleIds.has(r.id)) errors.push(`Doppelte Regelkarten-id: "${r.id}"`);
    ruleIds.add(r.id);
    if (exerciseIds.has(r.id)) errors.push(`Regelkarte "${r.id}" kollidiert mit einer Übungs-id`);
    if (!sportIds.has(r.sportId)) errors.push(`Regelkarte "${r.id}" verweist auf unbekannte sportId "${r.sportId}"`);
    const sameBand = ruleSets.filter(o => o.sportId === r.sportId && o.ageBand === r.ageBand);
    if (sameBand.length > 1) errors.push(`Mehrere Regelkarten für "${r.sportId}/${r.ageBand}"`);
  }
  for (const [sportId, bands] of Object.entries(REQUIRED_RULE_BANDS)) {
    for (const band of bands) {
      if (!ruleSets.some(r => r.sportId === sportId && r.ageBand === band)) {
        errors.push(`Sportart "${sportId}" hat keine Regelkarte für Altersklasse "${band}"`);
      }
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

// Fußball ist die erste Sportart mit eigener Regel-/Spielbetriebsdomäne.
// Weitere Sportarten kommen hier dazu, sobald belegte Quellen vorliegen.
export const REQUIRED_RULE_BANDS = {
  football: AGE_BAND_KEYS,
};

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
