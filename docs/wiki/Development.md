# Entwicklung

## Setup

Keine Build-Tools nötig. Nur ein lokaler HTTP-Server:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Live Server Extension verwenden
```

Dann: `http://localhost:8080`

## Wichtige Konzepte

### Screens

Alle Screens sind `<section id="screen-*">` in `index.html`. Navigation über `router.navigateTo(id)`. Aktiver Screen hat `.screen--active`.

### State

Kein globaler State-Store. State lebt in den Modulen:

- Match-State → `js/match.js` (live-Variable)
- UI-State → `app.js` (lokale Variablen pro Screen)
- Persistenz → `js/storage.js` → localStorage

### Presets erweitern

Neue Built-in Presets in `js/presets.js` → `BUILT_IN_PRESETS` Array eintragen:

```js
{
  id: 'builtin-meinSport',
  name: 'Mein Sport',
  icon: '🏅',
  teamA: { name: 'Team A' },
  teamB: { name: 'Team B' },
  colorIndex: 0,      // 0-3
  durationMs: null,   // null = kein Limit
  breakMs: null,
  periods: 2,
  rulesKey: 'meinSport',
  builtIn: true,
}
```

Dazu Regeltext in `js/rules.js` → `RULES` Objekt eintragen.

### Sounds hinzufügen

In `js/audio.js` neue Funktion mit Web Audio API Oscillator exportieren.

### Neue Screen hinzufügen

1. `<section id="screen-neu">` in `index.html`
2. `router.register('screen-neu', enterFn, leaveFn)` in `app.js`
3. Navigation: `router.navigateTo('screen-neu')`

## Service Worker

`service-worker.js` – Cache-Version als `const CACHE = 'sportzaehler-v14'` im Code. Bei Asset-Änderungen Versionsnummer hochzählen:

```js
const CACHE = 'sportzaehler-v15'; // Erhöhen bei Updates
```

Neue JS-Dateien zusätzlich in die `ASSETS`-Liste eintragen (für Offline-Vorabcache).

**Update-Strategie:** Code (HTML/JS/CSS/Manifest, Navigationen) wird *network-first*
ausgeliefert – online also immer die aktuelle Version, offline der Cache-Fallback.
Icons/Bilder laufen *cache-first*. Beim `install` werden die Assets mit
`{ cache: 'reload' }` am HTTP-Cache vorbei geladen, damit der Versions-Bump
garantiert frische Dateien zieht. Registrierung mit `updateViaCache: 'none'`,
plus Auto-Reload bei `controllerchange` in `app.js`.

## PWA

`manifest.webmanifest` enthält App-Metadaten. Icons in `icons/`. App ist installierbar wenn:

- HTTPS (oder localhost)
- manifest.webmanifest vorhanden
- Service Worker registriert

## Bekannte Einschränkungen

- localStorage Limit: ~5MB pro Origin (reicht für viele Jahre Spielhistorie)
- Wake Lock: Nur auf HTTPS und modernen Browsern
- Kamera (Teambildung): Nur auf HTTPS; JPEG, max. 480×480px
- Web Audio: Erfordert User-Interaction vor erstem Ton
