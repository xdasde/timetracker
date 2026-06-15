# Technische Architektur

## Stack

| Komponente | Technologie |
|---|---|
| Framework | Vanilla JavaScript (ES Modules) |
| Build Tool | Keins – direkt ausgeliefert |
| CSS | Custom Design System mit CSS Variables |
| Offline | Service Worker (Cache-First) |
| Storage | localStorage (tt.* Präfix) |
| PWA | manifest.webmanifest |

## Dateistruktur

```
timetracker/
├── index.html              # Single-Page App, alle Screens als <section>
├── app.js                  # Haupt-Controller, Event-Handler
├── style.css               # Design System, alle Layouts
├── service-worker.js       # Offline-Caching (Code: network-first, Assets: cache-first)
├── manifest.webmanifest    # PWA-Metadaten
├── content/
│   ├── games/*.md          # Quelle der Spiele-/Übungsdatenbank (je 1 Datei)
│   └── SCHEMA.md           # Feldreferenz der Markdown-Einträge
├── scripts/
│   └── build-content.mjs   # kompiliert content/games/*.md → js/content.generated.js
├── js/
│   ├── router.js           # Screen-Navigation (CSS-Toggle)
│   ├── storage.js          # localStorage-Wrapper (tt.*)
│   ├── match.js            # Match-Logik: Score, Timer, Perioden
│   ├── timer.js            # Countdown-Klasse
│   ├── stopwatch.js        # Stoppuhr-Klasse mit Lap-Funktion
│   ├── content.generated.js # AUTO-GENERIERT aus content/games/*.md
│   ├── presets.js          # Preset-Verwaltung (leitet Built-ins aus content ab)
│   ├── rules.js            # Regelwerk-API (leitet RULES aus content ab)
│   ├── ui.js               # Modal, Toast, Bestätigungsdialog
│   ├── history.js          # Spielhistorie-Anzeige
│   ├── export.js           # CSV/JSON-Export
│   ├── audio.js            # Web Audio API Sounds
│   ├── wakelock.js         # Screen Wake Lock
│   └── teambuilder.js      # Team-Zulosung mit Kamera
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    └── wiki/               # Diese Dokumentation
```

## Datenmodell

### Match (gespeichertes Spiel)

```json
{
  "id": "m_1717930000",
  "createdAt": 1717930000000,
  "teamA": { "name": "7a", "color": "teal", "score": 12 },
  "teamB": { "name": "7b", "color": "coral", "score": 9 },
  "durationMs": 754000,
  "plannedMs": 5400000,
  "timeoutMs": 120000,
  "halfTimeScore": { "a": 6, "b": 4 },
  "halfTimeMs": 2700000
}
```

### Session Recovery (laufendes Spiel)

```json
{
  "savedAt": 1717930000000,
  "state": {
    "periods": 2,
    "currentPeriod": 1,
    "running": true,
    "accMs": 1200000,
    "..."
  }
}
```

### Presets

- 19 Built-in Presets (können versteckt, nicht gelöscht werden)
- Custom Presets: beliebig erstell- und löschbar
- Felder: `id`, `name`, `icon`, `teamA`, `teamB`, `colorIndex`, `durationMs`, `breakMs`, `periods`, `rulesKey`

## Module

### match.js

Verwaltet den Live-Match-Zustand. Alle State-Mutationen gehen durch dieses Modul.

- `startMatch()` – Initialisiert neues Spiel
- `toggleTimer()` – Start/Pause Spieluhr
- `changeScore(team, delta)` – +/− Punkte
- `markHalfTime()` – Halbzeitstand festhalten
- `nextPeriod()` – Weiter zur nächsten Periode
- `getPeriods()` / `getCurrentPeriod()` – Perioden-Info
- `checkSession()` / `restoreSession()` – 12h Recovery-Fenster

### presets.js

- Built-in Presets werden aus `content.generated.js` abgeleitet (+ Custom Presets aus localStorage)
- `getAll()` – Alle aktiven Presets (Built-in + Custom)
- `save()` / `remove()` – CRUD für Custom Presets
- `renderList()` / `renderChips()` – UI-Rendering

### rules.js

- Regelwerk-API, abgeleitet aus `content.generated.js`
- `getRule(key)` – Regel/Eintrag per id
- `getAllRules()` – Alle Einträge als Array (inkl. `kind`, `difficulty`, `material`, …)

## Spiele-/Übungsdatenbank (Content-Pipeline)

Die Datenbank ist Markdown-basiert und für offene Beiträge ausgelegt:

```
content/games/*.md  ──(scripts/build-content.mjs)──►  js/content.generated.js
                                                          │
                                       ┌──────────────────┴──────────────────┐
                                  rules.js (RULES)                   presets.js (BUILT_IN_PRESETS)
```

- **Quelle der Wahrheit:** je eine `.md`-Datei pro Eintrag mit YAML-Frontmatter
  (strukturierte Felder) und Body (`## Ablauf` → `basics[]`, `## Tipp` → `tip`).
  Format siehe `content/SCHEMA.md`, Anleitung in `CONTRIBUTING.md`.
- **Build:** `scripts/build-content.mjs` (zero-dependency, eigener Mini-YAML-Parser)
  validiert alle Einträge und schreibt `js/content.generated.js`
  (`export const CONTENT = [...]`). Befehle: `npm run build:content`,
  `npm run validate:content`.
- **CI:** `.github/workflows/content.yml` validiert MD bei Pull-Requests
  (`--validate`) und regeneriert das Bundle nach Merge auf `main` automatisch.
- **Runtime bleibt build-frei:** Die App importiert nur das fertige
  `content.generated.js` (im Service-Worker-Cache, daher offline-tauglich).
- Die Datenbank-Ansicht (Screen „Datenbank") bietet Suche + Filter nach Art
  (`kind`) und Schwierigkeit (`difficulty`).

### timer.js / stopwatch.js

- `Countdown` – States: picking → running → paused → done
- `Stopwatch` – States: idle → running → paused; Lap-Funktion

### audio.js

Web Audio API Sounds (keine Audiodateien):

- `playWhistle()` – Spielstart / Halbzeit
- `playGoal()` – Tor/Punkt
- `playMatchEnd()` – Spielende
- `playBeep()` – Timer-Ende
- `playCountdownTick()` – Countdown-Tick

## Router

Keine URL-basierte Navigation. Screens sind `<section>`-Elemente, aktiver Screen bekommt `.screen--active`. `router.register(id, enter, leave)` registriert Callbacks.

## Offline-Strategie

Service Worker verwendet **Cache-First**: Assets werden beim ersten Laden gecacht, danach aus dem Cache geliefert. Update erfolgt beim nächsten App-Start.

## localStorage-Keys

| Key | Inhalt |
|---|---|
| `tt.matches` | Array aller gespeicherten Spiele |
| `tt.stopwatches` | Array aller gespeicherten Stoppuhr-Läufe |
| `tt.timers` | Array aller gespeicherten Countdown-Presets |
| `tt.presets` | Array aller Custom-Presets |
| `tt.hiddenPresets` | Array versteckter Built-in-Preset-IDs |
| `tt.session` | Laufendes Match (Recovery) |
| `tt.settings` | Einstellungen (sound, vibration, tbPhotos) |
