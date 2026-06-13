const screens = new Map();
const TAB_SCREENS = new Set(['screen-match-hub', 'screen-tools', 'screen-history']);
const FULLSCREEN = new Set(['screen-match-live']);
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
    if (TAB_SCREENS.has(current)) {
      document.querySelector(`[data-screen="${current}"]`)?.classList.remove('tab--active');
    }
  }

  if (FULLSCREEN.has(id)) {
    document.body.classList.add('live-active');
  } else {
    document.body.classList.remove('live-active');
  }

  el.classList.add('screen--active');
  current = id;

  if (TAB_SCREENS.has(id)) {
    document.querySelector(`[data-screen="${id}"]`)?.classList.add('tab--active');
  }

  screens.get(id)?.onEnter?.(opts);
}

export function getCurrent() { return current; }
