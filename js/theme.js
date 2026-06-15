// ═══════════════════════════════════════════════════════════
// VEREINS-DESIGN / THEME-SYSTEM
// ═══════════════════════════════════════════════════════════
// Ermöglicht das Umschalten des App-Designs (Farben + Logo) auf
// das Erscheinungsbild eines Vereins. Auswählbar in den Einstellungen.
//
// Neuen Verein hinzufügen:
//   1. Logo (PNG/SVG) nach /icons legen.
//   2. Unten einen Eintrag in THEMES ergänzen (Farben als CSS-Variablen,
//      Pfad zum Logo, theme-color für die Statusleiste).
// Fehlt die Logodatei, wird automatisch der Schriftzug (logoText) angezeigt.
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
    // Logo der App im Vereins-Modus. Datei nach /icons legen.
    logoImg: 'icons/club-hagen-wildewiese.png',
    // HINWEIS: Platzhalter-Farben des Vereins – bitte mit den echten
    // Vereinsfarben (von www.sc-hagen-wildewiese.de) abgleichen.
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
  el.replaceChildren();

  if (theme.logoImg) {
    const img = new Image();
    img.className = 'nav-logo-img';
    img.alt = theme.name;
    img.decoding = 'async';
    // Fällt auf den Schriftzug zurück, falls die Logodatei (noch) fehlt.
    img.onerror = () => {
      el.replaceChildren();
      el.textContent = theme.logoText || theme.name;
    };
    img.src = theme.logoImg;
    el.appendChild(img);
  } else {
    el.textContent = theme.logoText || theme.name;
  }
}
