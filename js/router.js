const screens = new Map();

// Maps screen ID → which nav-tab data-tab value to highlight (null = none)
const TAB_MAP = {
  'screen-home':               'home',
  'screen-presets':            'home',
  'screen-match-setup':        'home',
  'screen-match-live':         null,
  'screen-tools':              'tools',
  'screen-history':            'history',
  'screen-settings':           null,
  'screen-roulette':           'home',
  'screen-teambuilder':        'home',
  'screen-teambuilder-reveal': null,
  'screen-teambuilder-lineup': null,
  'screen-tb-match':           null,
};

const FULLSCREEN = new Set(['screen-match-live', 'screen-tb-match']);
let current = null;

export function register(id, onEnter = null, onLeave = null) {
  screens.set(id, { onEnter, onLeave });
}

export function navigateTo(id, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;

  if (current) {
    screens.get(current)?.onLeave?.();
    document.getElementById(current)?.classList.remove('screen--active');
  }

  if (FULLSCREEN.has(id)) {
    document.body.classList.add('live-active');
  } else {
    document.body.classList.remove('live-active');
  }

  el.classList.add('screen--active');
  current = id;

  // Update active nav tab
  const activeTab = TAB_MAP[id] ?? null;
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('nav-tab--active', btn.dataset.tab === activeTab);
  });

  screens.get(id)?.onEnter?.(opts);
}

export function getCurrent() { return current; }
