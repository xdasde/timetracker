import * as storage from './storage.js';
import * as ui from './ui.js';

const ICONS = ['⚽', '🏀', '🏐', '🏈', '🎾', '🏓', '🥊', '🏒', '🤾', '🏑', '🏸', '🥏', '🔥', '⚾', '🏅', '🎿'];

const DURATION_OPTIONS = [
  { label: 'Kein Limit', ms: null },
  { label: '10 Min',     ms: 10 * 60000 },
  { label: '15 Min',     ms: 15 * 60000 },
  { label: '20 Min',     ms: 20 * 60000 },
  { label: '30 Min',     ms: 30 * 60000 },
  { label: '40 Min',     ms: 40 * 60000 },
  { label: '45 Min',     ms: 45 * 60000 },
  { label: '60 Min',     ms: 60 * 60000 },
  { label: '90 Min',     ms: 90 * 60000 },
];
const BREAK_OPTIONS = [
  { label: 'Keine',  ms: null },
  { label: '1 Min',  ms: 1 * 60000 },
  { label: '5 Min',  ms: 5 * 60000 },
  { label: '10 Min', ms: 10 * 60000 },
  { label: '15 Min', ms: 15 * 60000 },
];

// Baut eine Auswahl von Zeit-Chips; ruft onPick(ms) beim Tippen auf.
function buildTimeChips(container, options, selectedMs, onPick) {
  container.replaceChildren();
  const chips = [];
  const setActive = ms => {
    const norm = ms || null;
    chips.forEach(({ btn, ms: cms }) =>
      btn.classList.toggle('duration-chip--active', (cms || null) === norm));
  };
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'duration-chip';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => { setActive(opt.ms); onPick(opt.ms); });
    container.appendChild(btn);
    chips.push({ btn, ms: opt.ms });
  });
  setActive(selectedMs || null);
}

// colorIndex maps to COLORS array in match.js: 0=teal/coral, 1=blue/red, 2=purple/amber, 3=gray/green
const BUILT_IN_PRESETS = [
  {
    id: 'builtin-soccer',
    name: 'Fußball',
    icon: '⚽',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 0,
    durationMs: 5400000,
    breakMs: 900000,
    periods: 2,
    rulesKey: 'soccer',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-basketball',
    name: 'Basketball',
    icon: '🏀',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 1,
    durationMs: 2400000,
    breakMs: 600000,
    periods: 4,
    rulesKey: 'basketball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-volleyball',
    name: 'Volleyball',
    icon: '🏐',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 2,
    durationMs: null,
    periods: 5,
    rulesKey: 'volleyball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-voelkerball',
    name: 'Völkerball',
    icon: '🎯',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 1,
    durationMs: 1200000,
    breakMs: 300000,
    periods: 2,
    rulesKey: 'voelkerball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-laufsport',
    name: 'Laufsport',
    icon: '🏃',
    teamA: { name: 'Gruppe A' },
    teamB: { name: 'Gruppe B' },
    colorIndex: 3,
    durationMs: null,
    rulesKey: 'laufsport',
    categories: ['lauf'],
    builtIn: true,
  },
  {
    id: 'builtin-schulsport',
    name: 'Schulsport',
    icon: '🏫',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 0,
    durationMs: null,
    periods: 2,
    rulesKey: 'schulsport',
    categories: ['lauf', 'ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-handball',
    name: 'Handball',
    icon: '🤾',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 1,
    durationMs: 3600000,
    breakMs: 600000,
    periods: 2,
    rulesKey: 'handball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-futsal',
    name: 'Futsal',
    icon: '⚽',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 0,
    durationMs: 2400000,
    breakMs: 900000,
    periods: 2,
    rulesKey: 'futsal',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-hockey',
    name: 'Feldhockey',
    icon: '🏑',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 3,
    durationMs: 3600000,
    breakMs: 600000,
    periods: 4,
    rulesKey: 'hockey',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-floorball',
    name: 'Floorball',
    icon: '🏒',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 2,
    durationMs: 3600000,
    breakMs: 600000,
    periods: 3,
    rulesKey: 'floorball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-badminton',
    name: 'Badminton',
    icon: '🏸',
    teamA: { name: 'Spieler A' },
    teamB: { name: 'Spieler B' },
    colorIndex: 2,
    durationMs: null,
    breakMs: null,
    periods: 3,
    rulesKey: 'badminton',
    categories: ['ball'],
    builtIn: true,
  },
  {
    id: 'builtin-tabletennis',
    name: 'Tischtennis',
    icon: '🏓',
    teamA: { name: 'Spieler A' },
    teamB: { name: 'Spieler B' },
    colorIndex: 0,
    durationMs: null,
    breakMs: null,
    periods: 5,
    rulesKey: 'tabletennis',
    categories: ['ball'],
    builtIn: true,
  },
  {
    id: 'builtin-ultimate',
    name: 'Ultimate Frisbee',
    icon: '🥏',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 3,
    durationMs: null,
    breakMs: null,
    periods: 2,
    rulesKey: 'ultimate',
    categories: ['ball', 'team', 'lauf'],
    builtIn: true,
  },
  {
    id: 'builtin-tchoukball',
    name: 'Tchoukball',
    icon: '🎯',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 2,
    durationMs: 2700000,
    breakMs: 300000,
    periods: 3,
    rulesKey: 'tchoukball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-faustball',
    name: 'Faustball',
    icon: '🏅',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 1,
    durationMs: null,
    breakMs: null,
    periods: 3,
    rulesKey: 'faustball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-brennball',
    name: 'Brennball',
    icon: '🔥',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 0,
    durationMs: 2400000,
    breakMs: 300000,
    periods: 2,
    rulesKey: 'brennball',
    categories: ['lauf', 'team', 'ball'],
    builtIn: true,
  },
  {
    id: 'builtin-prellball',
    name: 'Prellball',
    icon: '🏐',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 3,
    durationMs: null,
    breakMs: null,
    periods: 3,
    rulesKey: 'prellball',
    categories: ['ball', 'team'],
    builtIn: true,
  },
  {
    id: 'builtin-schlagball',
    name: 'Schlagball',
    icon: '⚾',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 2,
    durationMs: 2400000,
    breakMs: 300000,
    periods: 2,
    rulesKey: 'schlagball',
    categories: ['lauf', 'team', 'ball'],
    builtIn: true,
  },
  {
    id: 'builtin-staffellauf',
    name: 'Staffellauf',
    icon: '🎿',
    teamA: { name: 'Gruppe A' },
    teamB: { name: 'Gruppe B' },
    colorIndex: 3,
    durationMs: null,
    breakMs: null,
    periods: 1,
    rulesKey: 'staffellauf',
    categories: ['lauf', 'team'],
    builtIn: true,
  },
];

export { BUILT_IN_PRESETS };

// Kategorien für das Spiel-Roulette. 'all' ist der Standard-Filter.
export const ROULETTE_CATEGORIES = [
  { key: 'all',  label: 'Alle',      icon: '🎲' },
  { key: 'lauf', label: 'Laufspiel', icon: '🏃' },
  { key: 'ball', label: 'Ballspiel', icon: '⚽' },
  { key: 'team', label: 'Teamspiel', icon: '👥' },
];

export function getAll() {
  const custom = storage.getCollection('presets');
  const hidden = new Set(storage.getItem('hiddenPresets') || []);
  return [...BUILT_IN_PRESETS.filter(p => !hidden.has(p.id)), ...custom];
}

// Liefert alle für das Roulette in Frage kommenden Presets:
// gefiltert nach Kategorie (außer 'all') und ohne ausgeschlossene IDs.
// Presets ohne Kategorien (z. B. eigene) erscheinen nur unter 'Alle'.
export function getRouletteCandidates(category = 'all', excludedIds = []) {
  const excluded = new Set(excludedIds);
  return getAll().filter(p => {
    if (excluded.has(p.id)) return false;
    if (category === 'all') return true;
    return Array.isArray(p.categories) && p.categories.includes(category);
  });
}

export function save(data) {
  if (data.builtIn) {
    // Overwrite built-in by saving a custom override with same id
    const customs = storage.getCollection('presets');
    const idx = customs.findIndex(p => p.id === data.id);
    if (idx >= 0) customs[idx] = data;
    else customs.push(data);
    storage.setCollection('presets', customs);
  } else {
    if (!data.id) data.id = `preset_${Date.now()}`;
    const customs = storage.getCollection('presets');
    const idx = customs.findIndex(p => p.id === data.id);
    if (idx >= 0) customs[idx] = data;
    else customs.push(data);
    storage.setCollection('presets', customs);
  }
}

export function remove(id) {
  if (BUILT_IN_PRESETS.some(p => p.id === id)) {
    // Built-ins are hidden (not permanently deleted, restored on data-clear)
    const hidden = storage.getItem('hiddenPresets') || [];
    if (!hidden.includes(id)) { hidden.push(id); storage.setItem('hiddenPresets', hidden); }
  } else {
    storage.setCollection('presets', storage.getCollection('presets').filter(p => p.id !== id));
  }
}

export function renderList(onEdit, onRules) {
  const list = document.getElementById('preset-list');
  if (!list) return;
  list.replaceChildren();

  getAll().forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = 'preset-card-icon';
    icon.textContent = preset.icon;

    const info = document.createElement('div');
    info.className = 'preset-card-info';

    const name = document.createElement('div');
    name.className = 'preset-card-name';
    name.textContent = preset.name;

    const meta = document.createElement('div');
    meta.className = 'preset-card-meta';
    const parts = [];
    if (preset.durationMs) {
      const min = Math.floor(preset.durationMs / 60000);
      parts.push(`${min} Min.`);
    }
    parts.push(`${preset.teamA.name} vs. ${preset.teamB.name}`);
    meta.textContent = parts.join(' · ');

    info.append(name, meta);
    card.append(icon, info);

    if (preset.builtIn) {
      const lock = document.createElement('span');
      lock.className = 'preset-card-lock';
      lock.textContent = 'Standard';
      card.appendChild(lock);
    }

    const rulesBtn = document.createElement('button');
    rulesBtn.className = 'preset-card-rules';
    rulesBtn.textContent = '?';
    rulesBtn.title = 'Regeln anzeigen';
    rulesBtn.setAttribute('aria-label', 'Regeln anzeigen');
    rulesBtn.addEventListener('click', e => { e.stopPropagation(); onRules?.(preset); });
    card.appendChild(rulesBtn);

    card.addEventListener('click', () => onEdit(preset));
    list.appendChild(card);
  });

  // Add new preset button
  const addBtn = document.createElement('button');
  addBtn.className = 'preset-add-btn';
  addBtn.textContent = '+ Neues Preset anlegen';
  addBtn.addEventListener('click', () => onEdit(null));
  list.appendChild(addBtn);
}

export function renderChips(container, onSelect) {
  container.replaceChildren();
  getAll().forEach(preset => {
    const chip = document.createElement('button');
    chip.className = 'setup-preset-chip';
    chip.dataset.presetId = preset.id;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = preset.icon;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = preset.name;
    chip.append(iconSpan, nameSpan);
    chip.addEventListener('click', () => {
      container.querySelectorAll('.setup-preset-chip').forEach(c =>
        c.classList.remove('setup-preset-chip--active'));
      chip.classList.add('setup-preset-chip--active');
      onSelect(preset);
    });
    container.appendChild(chip);
  });
}

export function openModal(preset, onSaved, onDeleted) {
  ui.openModal('tmpl-modal-preset', () => {
    const isNew = !preset;
    const editing = preset ? { ...preset } : {
      id: null,
      name: '',
      icon: ICONS[0],
      teamA: { name: '' },
      teamB: { name: '' },
      colorIndex: 0,
      durationMs: null,
      breakMs: null,
      categories: [],
      builtIn: false,
    };
    editing.categories = Array.isArray(editing.categories) ? [...editing.categories] : [];

    document.getElementById('pm-title').textContent = isNew ? 'Neues Preset' : 'Preset bearbeiten';
    document.getElementById('pm-name').value = editing.name;
    document.getElementById('pm-team-a').value = editing.teamA.name;
    document.getElementById('pm-team-b').value = editing.teamB.name;

    // Icon picker
    const iconContainer = document.getElementById('pm-icons');
    iconContainer.replaceChildren();
    ICONS.forEach(ic => {
      const btn = document.createElement('button');
      btn.className = 'icon-option' + (ic === editing.icon ? ' icon-option--active' : '');
      btn.textContent = ic;
      btn.addEventListener('click', () => {
        iconContainer.querySelectorAll('.icon-option').forEach(b => b.classList.remove('icon-option--active'));
        btn.classList.add('icon-option--active');
        editing.icon = ic;
      });
      iconContainer.appendChild(btn);
    });

    // Color picker
    const PAIR_COLORS = [
      { a: '#0F6E56', b: '#FF6B5B', label: 'Teal/Coral' },
      { a: '#2563EB', b: '#DC2626', label: 'Blau/Rot' },
      { a: '#7C3AED', b: '#D97706', label: 'Lila/Amber' },
      { a: '#374151', b: '#059669', label: 'Grau/Grün' },
    ];
    const colorRow = document.getElementById('pm-colors');
    colorRow.replaceChildren();
    PAIR_COLORS.forEach((pair, i) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot' + (i === editing.colorIndex ? ' color-dot--active' : '');
      dot.style.background = pair.a;
      dot.title = pair.label;
      dot.setAttribute('aria-label', pair.label);
      dot.addEventListener('click', () => {
        colorRow.querySelectorAll('.color-dot').forEach(d => d.classList.remove('color-dot--active'));
        dot.classList.add('color-dot--active');
        editing.colorIndex = i;
      });
      colorRow.appendChild(dot);

      const dot2 = document.createElement('button');
      dot2.className = 'color-dot' + (i === editing.colorIndex ? ' color-dot--active' : '');
      dot2.style.background = pair.b;
      dot2.title = pair.label;
      dot2.setAttribute('aria-label', pair.label);
      dot2.addEventListener('click', () => {
        colorRow.querySelectorAll('.color-dot').forEach(d => d.classList.remove('color-dot--active'));
        dot.classList.add('color-dot--active');
        dot2.classList.add('color-dot--active');
        editing.colorIndex = i;
      });
      colorRow.appendChild(dot2);
    });

    // Spieldauer + Pausendauer
    buildTimeChips(document.getElementById('pm-duration'), DURATION_OPTIONS,
      editing.durationMs, ms => { editing.durationMs = ms; });
    buildTimeChips(document.getElementById('pm-break'), BREAK_OPTIONS,
      editing.breakMs, ms => { editing.breakMs = ms; });

    // Roulette-Kategorien (Mehrfachauswahl; 'all' ist kein wählbarer Wert)
    const catRow = document.getElementById('pm-categories');
    if (catRow) {
      catRow.replaceChildren();
      ROULETTE_CATEGORIES.filter(c => c.key !== 'all').forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const active = editing.categories.includes(cat.key);
        btn.className = 'roulette-cat-chip' + (active ? ' roulette-cat-chip--active' : '');
        btn.textContent = `${cat.icon} ${cat.label}`;
        btn.addEventListener('click', () => {
          const i = editing.categories.indexOf(cat.key);
          if (i >= 0) editing.categories.splice(i, 1);
          else editing.categories.push(cat.key);
          btn.classList.toggle('roulette-cat-chip--active');
        });
        catRow.appendChild(btn);
      });
    }

    const actions = document.getElementById('pm-actions');
    if (!isNew) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger';
      delBtn.style.flex = '0 0 auto';
      delBtn.textContent = 'Löschen';
      delBtn.addEventListener('click', async () => {
        const msg = editing.builtIn
          ? `"${editing.name}" ausblenden? (Kann unter Einstellungen wiederhergestellt werden)`
          : `"${editing.name}" wirklich löschen?`;
        const ok = await ui.confirmAction(msg);
        if (!ok) return;
        remove(editing.id);
        ui.closeModal();
        onDeleted?.();
      });
      actions.insertBefore(delBtn, actions.firstChild);
    }

    document.getElementById('pm-cancel').onclick = ui.closeModal;
    document.getElementById('pm-save').onclick = () => {
      const name = document.getElementById('pm-name').value.trim();
      if (!name) { document.getElementById('pm-name').focus(); return; }
      editing.name = name;
      editing.teamA = { name: document.getElementById('pm-team-a').value.trim() || 'Team A' };
      editing.teamB = { name: document.getElementById('pm-team-b').value.trim() || 'Team B' };
      save(editing);
      ui.closeModal();
      ui.showToast('Preset gespeichert!');
      onSaved?.();
    };
  });
}
