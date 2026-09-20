// Rendering für den Sportartenumschalter (oben rechts) und die
// sportartspezifische Übungsansicht. Kein Contentwissen in app.js.
import * as sports from './sports.js';
import * as sportmode from './sportmode.js';

const GENERAL = {
  sportId: sports.GENERAL_SPORT_ID,
  name: 'Allgemeinsport',
  shortName: 'Alle',
  icon: '🏅',
  accent: '#ff9a2e',
};

const $ = id => document.getElementById(id);

// Filterzustand der Übungsliste. Bleibt beim Öffnen des Detailbereichs und
// bei Back erhalten – nur ein Sportwechsel setzt ihn zurück.
const _filter = { search: '', category: 'all' };
let _wired = false;
let _navigate = null;
let _popoverOpen = false;

export function init({ navigate }) {
  _navigate = navigate;
  wire();
  sportmode.onChange(() => {
    _filter.search = '';
    _filter.category = 'all';
    const input = $('sport-exercises-search');
    if (input) input.value = '';
    renderSwitcher();
    announceMode();
    // Beim Verlassen eines Sportmodus die Sportansicht nicht offen lassen.
    if (sportmode.isGeneral() && document.getElementById('screen-sport-exercises')?.classList.contains('screen--active')) {
      _navigate?.('screen-home');
    } else if (document.getElementById('screen-sport-exercises')?.classList.contains('screen--active')) {
      renderExercises();
    }
  });
  renderSwitcher();
}

function activeSport() {
  const sport = sportmode.getSelectedSport();
  if (!sport || sportmode.isGeneral()) return GENERAL;
  return sport;
}

// ── Kopfzeile: Pill + Popover ────────────────────────────────────────────────

export function renderSwitcher() {
  const sport = activeSport();
  const isGeneral = sportmode.isGeneral();

  document.documentElement.style.setProperty('--mode-accent', sport.accent);
  document.body.dataset.sportMode = sport.sportId;

  const icon = $('sport-pill-icon');
  const label = $('sport-pill-label');
  const pill = $('btn-sport-switch');
  if (icon) icon.textContent = sport.icon;
  // Pill zeigt den Kurznamen (Platz oben rechts), aria-label immer den vollen.
  if (label) label.textContent = sport.shortName ?? sport.name;
  if (pill) {
    pill.setAttribute('aria-label', `Sportart wählen, aktuell ${sport.name}`);
    pill.classList.toggle('sport-pill--active', !isGeneral);
  }

  // Regeln-Einstieg ausschließlich in echten Sportmodi.
  const rulesBtn = $('btn-open-sport-rules');
  if (rulesBtn) {
    rulesBtn.classList.toggle('hidden', isGeneral);
    const rulesLabel = sportmode.getRulesLabel();
    if (!isGeneral) {
      $('sport-rules-icon').textContent = sport.icon;
      $('sport-rules-title').textContent = rulesLabel;
      $('sport-rules-sub').textContent = `${sport.name} · ${sports.countExercises(sport.sportId)} Übungen`;
      rulesBtn.setAttribute('aria-label', `${rulesLabel} und Übungen für ${sport.name} öffnen`);
    }
  }

  renderPopover();
}

function renderPopover() {
  const pop = $('sport-popover');
  if (!pop) return;
  pop.replaceChildren();
  const activeId = activeSport().sportId;

  for (const sport of [GENERAL, ...sports.getSports().filter(s => s.sportId !== sports.GENERAL_SPORT_ID)]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sport-option' + (sport.sportId === activeId ? ' sport-option--active' : '');
    btn.dataset.sportId = sport.sportId;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(sport.sportId === activeId));
    if (sport.sportId === activeId) btn.setAttribute('aria-current', 'true');

    const ic = document.createElement('span');
    ic.className = 'sport-option-icon';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = sport.icon;

    const name = document.createElement('span');
    name.className = 'sport-option-label';
    name.textContent = sport.name;

    const check = document.createElement('span');
    check.className = 'sport-option-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = sport.sportId === activeId ? '✓' : '';

    btn.style.setProperty('--option-accent', sport.accent);
    btn.append(ic, name, check);
    btn.addEventListener('click', () => {
      sportmode.select(sport.sportId);
      closePopover(true);
    });
    pop.appendChild(btn);
  }
}

function openPopover() {
  const pop = $('sport-popover');
  if (!pop) return;
  pop.classList.remove('hidden');
  // Header anheben, damit das Popover nicht unter dem Install-/Session-Banner
  // liegt (eigener z-index reicht im Stacking-Kontext der Kopfzeile nicht).
  document.querySelector('.top-nav')?.classList.add('top-nav--popover-open');
  $('btn-sport-switch')?.setAttribute('aria-expanded', 'true');
  _popoverOpen = true;
  pop.querySelector('.sport-option--active')?.focus();
}

function closePopover(restoreFocus = false) {
  const pop = $('sport-popover');
  if (!pop) return;
  pop.classList.add('hidden');
  document.querySelector('.top-nav')?.classList.remove('top-nav--popover-open');
  $('btn-sport-switch')?.setAttribute('aria-expanded', 'false');
  _popoverOpen = false;
  if (restoreFocus) $('btn-sport-switch')?.focus();
}

function announceMode() {
  const status = $('sport-live-status');
  if (!status) return;
  status.textContent = sportmode.isGeneral()
    ? 'Allgemeinsport aktiviert'
    : `Sportmodus ${activeSport().name} aktiviert`;
}

function wire() {
  if (_wired) return;
  _wired = true;

  $('btn-sport-switch')?.addEventListener('click', e => {
    e.stopPropagation();
    _popoverOpen ? closePopover() : openPopover();
  });

  document.addEventListener('click', e => {
    if (!_popoverOpen) return;
    if ($('sport-popover')?.contains(e.target) || $('btn-sport-switch')?.contains(e.target)) return;
    closePopover();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _popoverOpen) closePopover(true);
  });

  $('btn-open-sport-rules')?.addEventListener('click', () => _navigate?.('screen-sport-exercises'));
  $('btn-sport-exercises-back')?.addEventListener('click', () => _navigate?.('screen-home'));
  $('sport-exercises-search')?.addEventListener('input', e => {
    _filter.search = e.target.value;
    renderExercises();
  });
  $('btn-sport-exercises-reset')?.addEventListener('click', () => {
    _filter.search = '';
    _filter.category = 'all';
    const input = $('sport-exercises-search');
    if (input) input.value = '';
    renderExercises();
  });
}

// ── Übungsliste ──────────────────────────────────────────────────────────────

export function enterExercises() {
  // Ohne aktiven Sportmodus gibt es hier nichts zu zeigen.
  if (sportmode.isGeneral()) { _navigate?.('screen-home'); return; }
  const sport = activeSport();
  const mode = sportmode.getSelectedMode();
  $('sport-exercises-title').textContent = `${mode?.name ?? 'Übungen'} · ${sport.name}`;
  $('sport-exercises-intro').textContent = mode?.description ?? `Übungen für ${sport.name}.`;
  const input = $('sport-exercises-search');
  if (input) {
    input.placeholder = `${sport.name}-Übung suchen…`;
    input.value = _filter.search;
  }
  renderExercises();
}

function buildCategoryChips() {
  const row = $('sport-exercises-filter');
  if (!row) return;
  row.replaceChildren();
  const options = [{ key: 'all', label: 'Alle Übungen' },
    ...sports.getCategories(activeSport().sportId).map(c => ({ key: c, label: c }))];
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = _filter.category === opt.key;
    btn.className = 'roulette-cat-chip' + (active ? ' roulette-cat-chip--active' : '');
    btn.textContent = opt.label;
    btn.dataset.category = opt.key;
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => {
      _filter.category = opt.key;
      renderExercises();
    });
    row.appendChild(btn);
  }
}

export function renderExercises() {
  const list = $('sport-exercises-list');
  if (!list) return;
  const sport = activeSport();
  buildCategoryChips();
  list.replaceChildren();

  const matches = sports.filterExercises(sport.sportId, {
    search: _filter.search,
    category: _filter.category,
  });

  const countEl = $('sport-exercises-count');
  if (countEl) countEl.textContent = `${matches.length} ${matches.length === 1 ? 'Übung' : 'Übungen'}`;

  const empty = $('sport-exercises-empty');
  if (empty) empty.classList.toggle('hidden', matches.length > 0);
  const emptyText = $('sport-exercises-empty-text');
  if (emptyText) emptyText.textContent = `Keine ${sport.name}-Übungen gefunden. Suche oder Filter anpassen.`;

  for (const ex of matches) list.appendChild(buildExerciseItem(ex, sport));
}

function buildExerciseItem(ex, sport) {
  const item = document.createElement('div');
  item.className = 'rules-item sport-exercise';
  item.setAttribute('role', 'listitem');
  item.dataset.exerciseId = ex.id;
  item.dataset.sportId = ex.sportId;
  item.dataset.modeId = ex.modeId;

  const header = document.createElement('button');
  header.className = 'rules-item-header';
  header.setAttribute('aria-expanded', 'false');

  const icon = document.createElement('span');
  icon.className = 'rules-item-icon sport-exercise-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ex.icon;

  const name = document.createElement('span');
  name.className = 'rules-item-name';
  name.textContent = ex.name;

  const sub = document.createElement('span');
  sub.className = 'rules-item-sub';
  sub.textContent = ex.category;

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.classList.add('rules-chevron');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.2');
  chevron.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', '6 9 12 15 18 9');
  chevron.appendChild(line);
  header.append(icon, name, sub, chevron);

  const body = document.createElement('div');
  body.className = 'rules-item-body';

  const badges = document.createElement('div');
  badges.className = 'rules-badges';
  const badge = document.createElement('span');
  badge.className = 'rules-badge rules-badge--kind';
  badge.textContent = ex.category;
  badges.appendChild(badge);
  const sportBadge = document.createElement('span');
  sportBadge.className = 'rules-badge rules-badge--sport';
  sportBadge.textContent = sport.name;
  badges.appendChild(sportBadge);
  body.appendChild(badges);

  const section = (label, text) => {
    const el = document.createElement('div');
    el.className = 'rules-structure';
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    el.append(strong, document.createTextNode(text));
    return el;
  };
  body.appendChild(section('Ziel', ex.goal));
  body.appendChild(section('Aufbau', ex.setup));

  const stepsLabel = document.createElement('div');
  stepsLabel.className = 'rules-scoring';
  stepsLabel.textContent = sportmode.getRulesLabel() ?? 'Ablauf';
  body.appendChild(stepsLabel);

  const ul = document.createElement('ul');
  ul.className = 'rules-basics';
  for (const step of ex.steps) {
    const li = document.createElement('li');
    li.textContent = step;
    ul.appendChild(li);
  }
  body.appendChild(ul);

  if (ex.variations.length) {
    const varLabel = document.createElement('div');
    varLabel.className = 'rules-scoring';
    varLabel.textContent = 'Variationen';
    body.appendChild(varLabel);
    const vul = document.createElement('ul');
    vul.className = 'rules-basics';
    for (const v of ex.variations) {
      const li = document.createElement('li');
      li.textContent = v;
      vul.appendChild(li);
    }
    body.appendChild(vul);
  }

  const safety = document.createElement('div');
  safety.className = 'rules-material sport-exercise-safety';
  const safetyLabel = document.createElement('strong');
  safetyLabel.textContent = 'Sicherheit: ';
  safety.append(safetyLabel, document.createTextNode(ex.safety));
  body.appendChild(safety);

  const tip = document.createElement('div');
  tip.className = 'rules-tip';
  const tipLabel = document.createElement('strong');
  tipLabel.textContent = 'App-Tipp: ';
  tip.append(tipLabel, document.createTextNode(ex.tip));
  body.appendChild(tip);

  item.append(header, body);
  header.addEventListener('click', () => {
    const isOpen = body.classList.toggle('rules-item-body--open');
    header.setAttribute('aria-expanded', String(isOpen));
    item.classList.toggle('rules-item--open', isOpen);
  });
  return item;
}
