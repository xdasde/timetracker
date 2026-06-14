import * as storage from './storage.js';
import * as ui from './ui.js';

const ICONS = ['⚽', '🏀', '🏐', '🏈', '🎾', '🏓', '🥊', '🏒'];

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
  { label: '2 Min',  ms: 2 * 60000 },
  { label: '3 Min',  ms: 3 * 60000 },
  { label: '5 Min',  ms: 5 * 60000 },
  { label: '10 Min', ms: 10 * 60000 },
  { label: '15 Min', ms: 15 * 60000 },
];
// Anzahl der Spielabschnitte (Halbzeiten/Viertel/Drittel). 1 = durchgehend, kein Wechsel.
const PERIOD_OPTIONS = [
  { label: '1',  ms: 1 },
  { label: '2',  ms: 2 },
  { label: '3',  ms: 3 },
  { label: '4',  ms: 4 },
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
//
// durationMs = Spielzeit pro Abschnitt (Halbzeit/Viertel), nicht die Gesamtzeit.
//   Die Uhr zählt einen Abschnitt herunter; nach der Pause beginnt der nächste
//   Abschnitt wieder bei dieser Dauer (siehe Halbzeit-Ablauf in app.js).
// periods  = Anzahl der Spielabschnitte. breakMs = Pause zwischen den Abschnitten.
// Werte nach offiziellen Verbandsregeln (FIFA, FIBA, FIVB, IHF) – Stand 2025/26.
const BUILT_IN_PRESETS = [
  {
    // FIFA: 2 Halbzeiten à 45 Min., 15 Min. Halbzeitpause.
    id: 'builtin-soccer',
    name: 'Fußball',
    icon: '⚽',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 0,
    periods: 2,
    durationMs: 2700000, // 45 Min. pro Halbzeit
    breakMs: 900000,     // 15 Min. Halbzeitpause
    builtIn: true,
  },
  {
    // FIBA: 4 Viertel à 10 Min., 2 Min. Pause zwischen den Vierteln (15 Min. zur Halbzeit).
    id: 'builtin-basketball',
    name: 'Basketball',
    icon: '🏀',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 1,
    periods: 4,
    durationMs: 600000, // 10 Min. pro Viertel
    breakMs: 120000,    // 2 Min. Viertelpause
    builtIn: true,
  },
  {
    // Handball (IHF): 2 Halbzeiten à 30 Min., 10 Min. Halbzeitpause.
    id: 'builtin-handball',
    name: 'Handball',
    icon: '🤾',
    teamA: { name: 'Heim' },
    teamB: { name: 'Gast' },
    colorIndex: 2,
    periods: 2,
    durationMs: 1800000, // 30 Min. pro Halbzeit
    breakMs: 600000,     // 10 Min. Halbzeitpause
    builtIn: true,
  },
  {
    // FIVB: Satzspiel (Best-of-5 bis 25 Punkte), keine feste Spielzeit. 3 Min. Satzpause.
    id: 'builtin-volleyball',
    name: 'Volleyball',
    icon: '🏐',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 2,
    periods: 1,
    durationMs: null,  // punktebasiert, kein Zeitlimit
    breakMs: 180000,   // 3 Min. Satzpause
    builtIn: true,
  },
  {
    // Völkerball: kein einheitliches Regelwerk – verbreitet als 10-Min.-Runde.
    id: 'builtin-voelkerball',
    name: 'Völkerball',
    icon: '🎯',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 1,
    periods: 1,
    durationMs: 600000, // 10 Min. Runde
    breakMs: null,
    builtIn: true,
  },
  {
    // Laufsport: freie Zeitnahme, kein festes Limit (Uhr zählt hoch).
    id: 'builtin-laufsport',
    name: 'Laufsport',
    icon: '🏃',
    teamA: { name: 'Gruppe A' },
    teamB: { name: 'Gruppe B' },
    colorIndex: 3,
    periods: 1,
    durationMs: null,
    breakMs: null,
    builtIn: true,
  },
  {
    // Schulsport: kein festes Regelwerk, frei konfigurierbar.
    id: 'builtin-schulsport',
    name: 'Schulsport',
    icon: '🏫',
    teamA: { name: 'Team A' },
    teamB: { name: 'Team B' },
    colorIndex: 0,
    periods: 1,
    durationMs: null,
    breakMs: null,
    builtIn: true,
  },
];

export function getAll() {
  const custom = storage.getCollection('presets');
  const hidden = new Set(storage.getItem('hiddenPresets') || []);
  return [...BUILT_IN_PRESETS.filter(p => !hidden.has(p.id)), ...custom];
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

export function renderList(onEdit) {
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
      const periods = preset.periods || 1;
      parts.push(periods > 1 ? `${periods} × ${min} Min.` : `${min} Min.`);
    }
    if (preset.breakMs) {
      parts.push(`${Math.floor(preset.breakMs / 60000)} Min. Pause`);
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
      periods: 1,
      durationMs: null,
      breakMs: null,
      builtIn: false,
    };
    if (!editing.periods) editing.periods = 1;

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

    // Spielabschnitte (Halbzeiten/Viertel) + Spieldauer pro Abschnitt + Pause
    buildTimeChips(document.getElementById('pm-periods'), PERIOD_OPTIONS,
      editing.periods, n => { editing.periods = n || 1; });
    buildTimeChips(document.getElementById('pm-duration'), DURATION_OPTIONS,
      editing.durationMs, ms => { editing.durationMs = ms; });
    buildTimeChips(document.getElementById('pm-break'), BREAK_OPTIONS,
      editing.breakMs, ms => { editing.breakMs = ms; });

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
