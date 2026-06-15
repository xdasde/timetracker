// ═══════════════════════════════════════════════════════════
// VEREINS-DESIGN / THEME-SYSTEM
// ═══════════════════════════════════════════════════════════
// Ermöglicht das Umschalten des App-Designs (Farben + Logo) auf
// das Erscheinungsbild eines Vereins. Auswählbar in den Einstellungen.
//
// Neuen Verein hinzufügen: einen Eintrag in THEMES ergänzen (Farben als
// CSS-Variablen, theme-color für die Statusleiste und logoImg).
// logoImg kann eine URL ODER eine Liste von URLs sein, die der Reihe nach
// probiert werden. So lässt sich das Logo direkt von der Vereinsseite laden
// (immer aktuell). Lädt keine der URLs, wird automatisch der Schriftzug
// (logoText) angezeigt.
// ═══════════════════════════════════════════════════════════
import * as storage from './storage.js';

export const DEFAULT_THEME = 'standard';

export const THEMES = [
  {
    id: 'standard',
    name: 'Sportzähler (Standard)',
    logoText: 'Sportzähler',
    logoImg: null,
    themeColor: '#1f2937',
    vars: {}, // leer => nutzt die Standardwerte aus style.css
  },
  {
    id: 'hagen-wildewiese',
    name: 'SC Hagen-Wildewiese',
    logoText: 'SC Hagen-Wildewiese',
    // Logo wird live von der Vereinsseite geladen (bleibt damit aktuell).
    // Reihenfolge = Fallback-Kette: erst der Favicon-/Site-Icon-Resolver
    // (löst zuverlässig das in der Seite gesetzte Icon auf), dann das
    // direkte Favicon der Domain, zuletzt der Schriftzug.
    // Möchtest du das exakte Header-Logo: die Bild-URL hier vorne eintragen.
    logoImg: [
      'https://www.google.com/s2/favicons?domain=www.sc-hagen-wildewiese.de&sz=128',
      'https://www.sc-hagen-wildewiese.de/favicon.ico',
    ],
    themeColor: '#0d3b66',
    vars: {
      '--color-bg':         '#0a1929',
      '--color-surface':    '#0f2942',
      '--color-border':     '#1d3f63',
      '--color-amber':      '#2f80ed',
      '--color-amber-dark': '#1f5fbf',
      '--color-accent-rgb': '47, 128, 237',
      '--color-text':       '#f3f8ff',
      '--color-muted':      '#9bb3cf',
    },
  },
];

// Alle jemals von einem Theme gesetzten Variablen – zum sauberen Zurücksetzen.
const ALL_VARS = [...new Set(THEMES.flatMap(t => Object.keys(t.vars)))];

export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

export function getSavedThemeId() {
  const cfg = storage.getItem('settings') || {};
  return getTheme(cfg.clubTheme).id;
}

// Wendet ein Theme sofort an (CSS-Variablen, Logo, Statusleisten-Farbe).
export function applyTheme(id) {
  const theme = getTheme(id);
  const root = document.documentElement;

  ALL_VARS.forEach(v => root.style.removeProperty(v));
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));

  updateNavLogo(theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme.themeColor) meta.setAttribute('content', theme.themeColor);

  root.setAttribute('data-club-theme', theme.id);
  return theme;
}

// Wendet ein Theme an UND speichert die Auswahl.
export function setTheme(id) {
  const theme = applyTheme(id);
  const cfg = storage.getItem('settings') || {};
  cfg.clubTheme = theme.id;
  storage.setItem('settings', cfg);
  return theme;
}

// Beim App-Start gespeichertes Theme anwenden.
export function initTheme() {
  return applyTheme(getSavedThemeId());
}

function updateNavLogo(theme) {
  const el = document.querySelector('.nav-logo');
  if (!el) return;
  el.classList.toggle('nav-logo--club', theme.id !== DEFAULT_THEME);

  const sources = [].concat(theme.logoImg || []).filter(Boolean);
  const showText = () => {
    el.replaceChildren();
    el.textContent = theme.logoText || theme.name;
  };

  if (!sources.length) { showText(); return; }

  // Quellen der Reihe nach probieren; klappt keine, Schriftzug anzeigen.
  let i = 0;
  const img = new Image();
  img.className = 'nav-logo-img';
  img.alt = theme.name;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer'; // umgeht manche Hotlink-Sperren
  img.onerror = () => {
    i += 1;
    if (i < sources.length) img.src = sources[i];
    else showText();
  };
  el.replaceChildren(img);
  img.src = sources[0];
}
