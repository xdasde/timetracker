import * as storage from './storage.js';
import * as ui from './ui.js';

const ICONS = ['⚽', '🏀', '🏐', '🏈', '🎾', '🏓', '🥊', '🏒'];

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
    builtIn: true,
  },
];

export function getAll() {
  const custom = storage.getCollection('presets');
  return [...BUILT_IN_PRESETS, ...custom];
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
  // Cannot delete built-ins (only custom)
  if (BUILT_IN_PRESETS.some(p => p.id === id)) return;
  storage.setCollection('presets', storage.getCollection('presets').filter(p => p.id !== id));
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
      builtIn: false,
    };

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

    // Delete button for non-built-in custom presets
    const actions = document.getElementById('pm-actions');
    if (!isNew && !editing.builtIn) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger';
      delBtn.style.flex = '0 0 auto';
      delBtn.textContent = 'Löschen';
      delBtn.addEventListener('click', async () => {
        const ok = await ui.confirmAction(`"${editing.name}" wirklich löschen?`);
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
