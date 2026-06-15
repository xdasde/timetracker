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
├── js/
│   ├── router.js           # Screen-Navigation (CSS-Toggle)
│   ├── storage.js          # localStorage-Wrapper (tt.*)
│   ├── match.js            # Match-Logik: Score, Timer, Perioden
│   ├── timer.js            # Countdown-Klasse
│   ├── stopwatch.js        # Stoppuhr-Klasse mit Lap-Funktion
│   ├── presets.js          # Sport-Preset-Verwaltung
│   ├── rules.js            # Regelwerk-Datenbank
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

- 19 Built-in Presets + Custom Presets aus localStorage
- `getAll()` – Alle aktiven Presets (Built-in + Custom)
- `save()` / `remove()` – CRUD für Custom Presets
- `renderList()` / `renderChips()` – UI-Rendering

### rules.js

- Regelwerk-Datenbank für alle 19 Sportarten
- `getRule(key)` – Regel für eine Sportart
- `getAllRules()` – Alle Regeln als Array

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
