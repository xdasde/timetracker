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
    // Fach-/Stift-Icon als Logo (statt Favicon der Vereinsseite).
    logoText: '✏️ Wildewiese',
    logoImg: null,
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
  {
    id: 'kgs-allendorf',
    name: 'KGS Allendorf',
    // Kath. Grundschule Allendorf: Petrol/Teal-Grund + Mauve/Lila-Akzent
    // (angelehnt an die Vereinsseite), Fach-/Stift-Icon als Logo.
    logoText: '✏️ KGS Allendorf',
    logoImg: null,
    themeColor: '#0d3a3d',
    vars: {
      '--color-bg':         '#0d3a3d',
      '--color-surface':    '#12484c',
      '--color-border':     '#1e6065',
      '--color-amber':      '#cf8fbb',
      '--color-amber-dark': '#ac6a97',
      '--color-accent-rgb': '207, 143, 187',
      '--color-text':       '#eef7f6',
      '--color-muted':      '#a7c6c4',
    },
  },
  {
    id: 'ssv-allendorf',
    name: 'SSV 1928 Allendorf',
    // Rotes Design nach dem Vereinsauftritt. Weißer Text auf dem roten Akzent
    // (--color-on-accent), damit Buttons/Chips lesbar bleiben.
    logoText: 'SSV Allendorf',
    logoImg: [
      'https://www.google.com/s2/favicons?domain=www.ssvallendorf.de&sz=128',
      'https://www.ssvallendorf.de/favicon.ico',
    ],
    themeColor: '#160a0a',
    vars: {
      '--color-bg':          '#160a0a',
      '--color-surface':     '#241010',
      '--color-border':      '#3d1a1a',
      '--color-amber':       '#d21f27',
      '--color-amber-dark':  '#a5141b',
      '--color-accent-rgb':  '210, 31, 39',
      '--color-text':        '#fdecec',
      '--color-muted':       '#c99a9a',
      '--color-on-accent':   '#ffffff',
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

// Generations-Token: verhindert, dass ein verspäteter onerror/onload eines
// vorherigen Theme-Logos (z. B. ein langsam fehlschlagendes Favicon) das
// inzwischen umgeschaltete Logo überschreibt.
let _logoGen = 0;

function updateNavLogo(theme) {
  const el = document.querySelector('.nav-logo');
  if (!el) return;
  const gen = ++_logoGen;
  el.classList.toggle('nav-logo--club', theme.id !== DEFAULT_THEME);

  const sources = [].concat(theme.logoImg || []).filter(Boolean);
  const showText = () => {
    if (gen !== _logoGen) return;       // Theme wurde inzwischen gewechselt
    el.replaceChildren();
    el.textContent = theme.logoText || theme.name;
  };

  // Bis ein Bild geladen ist, immer den Schriftzug zeigen (nie leer).
  showText();
  if (!sources.length) return;

  // Quellen der Reihe nach probieren; klappt keine, bleibt der Schriftzug.
  let i = 0;
  const img = new Image();
  img.className = 'nav-logo-img';
  img.alt = theme.name;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer'; // umgeht manche Hotlink-Sperren
  img.onload = () => {
    if (gen !== _logoGen) return;
    el.replaceChildren(img);
  };
  img.onerror = () => {
    if (gen !== _logoGen) return;
    i += 1;
    if (i < sources.length) img.src = sources[i];
    else showText();
  };
  img.src = sources[0];
}
