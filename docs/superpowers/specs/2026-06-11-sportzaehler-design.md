# Sportzähler — Design-Spec

**Datum:** 2026-06-11
**Status:** Entwurf zur Freigabe
**Ziel:** Einseitige, mobil-optimierte PWA für Schulsport, Jugendspiele und Mannschaftsspiele mit Punktezählung, Stoppuhren und Countdown-Timer.

---

## 1. Überblick

Eine einzelne installierbare Web-App (PWA), die offline funktioniert und folgende Werkzeuge in einer durchgehenden mobilen Oberfläche kombiniert:

- **Match-Modus:** Zwei Team-Counter + Spielzeit gekoppelt, Ergebnis am Ende speicherbar.
- **Werkzeuge:** Zwei parallel laufende Stoppuhren (mit Lap-Funktion) + ein Countdown-Timer.
- **Verlauf:** Alle gespeicherten Matches, Stoppuhren-Läufe und Timer-Presets durchsuchbar, exportierbar (CSV/JSON).

Zielgerät ist primär das Handy. Die App muss am Sportplatz und in der Halle bedienbar sein: große Tap-Targets, hoher Kontrast trotz freundlichem Look, keine Internetverbindung nötig nach Erstinstallation, Display bleibt während laufender Zeitnahme an.

## 2. Designentscheidungen (aus Brainstorming)

| # | Entscheidung | Gewählt |
|---|---|---|
| 1 | Beziehung Counter/Timer | **Hybrid** — gekoppelter Match-Modus UND freie Einzelwerkzeuge |
| 2 | Stoppuhr-Modell | **2 parallele Stoppuhren + Lap-Funktion pro Stoppuhr** |
| 3 | Speicherung & Distribution | **Lokal + CSV/JSON-Export + als PWA installierbar** |
| 4 | Team-Konfiguration | **Voreinstellungen (Quick-Pick) + freie Eingabe** |
| 5 | Countdown-Zeit setzen | **Drehrad-Picker** (iOS-Wecker-Stil, Min:Sek) |
| – | Visuelle Richtung | **Playful** — runde Karten, teal/coral, freundliche Pills |

## 3. Tech-Stack

Bewusst klein gehalten — kein Framework, kein Build-Schritt.

- `index.html` — eine Datei, alle Screens als Sections, Toggle via CSS-Klassen
- `style.css` — flaches Design-System, CSS-Variablen für Farben, mobile-first Layout
- `app.js` — Vanilla-JS, modular in Funktionsbereichen organisiert (router, match, stopwatch, timer, storage, history, export, sw-register, audio, wakelock)
- `manifest.webmanifest` — PWA-Manifest mit Icons
- `service-worker.js` — Cache-First für Offline
- `icons/` — SVG-basierte App-Icons in 192px und 512px PNG-Varianten

Begründung: Der Funktionsumfang rechtfertigt kein Framework. Vanilla bleibt wartbar, klein im Bundle, schnell ladbar, und macht den Service-Worker trivial. Build-Tooling würde Setup-Aufwand schaffen ohne Mehrwert.

## 4. Datenmodell (localStorage)

Vier Sammlungen, alle als JSON.

### `tt.matches` — Array
```json
{
  "id": "m_1717930000",
  "createdAt": 1717930000000,
  "teamA": { "name": "7a", "color": "teal", "score": 12 },
  "teamB": { "name": "7b", "color": "coral", "score": 9 },
  "durationMs": 754000,
  "note": ""
}
```

### `tt.stopwatches` — Array
```json
{
  "id": "sw_1717930000",
  "createdAt": 1717930000000,
  "label": "Lauf Marie",
  "totalMs": 45230,
  "laps": [12100, 11800, 10900, 10430]
}
```

### `tt.timers` — Array (gespeicherte Countdown-Presets)
```json
{
  "id": "tm_1717930000",
  "createdAt": 1717930000000,
  "label": "Pause",
  "durationMs": 180000
}
```

### `tt.teamPresets` — Array von Strings
```json
["7a", "7b", "Rote Hütchen", "Blaue Hütchen", "Mädchen", "Jungs"]
```
Wird automatisch erweitert beim Speichern eines Matches mit neuem Team-Namen. Einträge per Wisch-Geste löschbar.

### `tt.session` — Objekt (Live-State Recovery)
Wird bei jedem Tick beschrieben (Counter-Änderung, Sekunden-Tick) und beim Speichern/Verwerfen geleert. Enthält den aktiven Match-State, Stoppuhren-Stände und Timer-Zustand. Beim Laden der App: existiert dieser Key → Banner „Match wiederherstellen?" anbieten.

### `tt.settings` — Objekt
```json
{ "sound": true, "vibration": true }
```

## 5. Screens

### Screen 1 — Match-Setup
Öffnet sich beim Tap auf „Neues Match" im Match-Tab.
- Eingabefelder für beide Team-Namen
- Chip-Reihe darunter mit `teamPresets`, Tap übernimmt
- Farb-Picker pro Team: 4–6 Farbpaare (teal/coral, blue/red, purple/amber, gray/green) als runde Pills
- Großer „Start"-Button unten

### Screen 2 — Match-Live
- Karte oben: Team A (Farbe A), Name, Score (groß, 46px), Buttons − und +1
- Mitte: Spielzeit-Pill (amber-Farbschema), Mono-Font, Tap = Start/Pause, Long-Press = Reset (mit Bestätigung)
- Karte unten: Team B analog
- Floating-Action-Button unten rechts: „Match beenden" → Bestätigungsmodal mit Optionen Speichern / Verwerfen / Abbrechen
- Bei Score-Änderung oder Sekunden-Tick: `tt.session` aktualisieren

### Screen 3 — Werkzeuge
Drei Bereiche untereinander, scrollbar.

**Stoppuhr 1 & 2** (identisch, unabhängiger State):
- Label-Eingabefeld
- Mono-Zeit (groß)
- Buttons: Start/Stop (toggelt), Lap, Save, Reset
- Lap-Liste unter Buttons, letzte 5 sichtbar, Tap auf Liste öffnet Modal mit allen Laps
- Save öffnet Label-Bestätigungs-Modal → speichert in `tt.stopwatches`

**Countdown-Timer:**
- Vor Start: Drehrad-Picker Minuten:Sekunden (CSS-Scroll-Snap, Touch-Steuerung, Wertebereich 0–59 je Spalte)
- Während Lauf: großer Countdown ersetzt Drehrad, Buttons Pause/Reset
- Bei 0: Vibration (`navigator.vibrate([200, 100, 200])`) + 1-Sekunden-Beep (Web Audio API, Oszillator) + Toast „Timer abgelaufen", Drehrad-Ansicht zurück
- Optional „Als Preset speichern"-Button → Label-Modal → `tt.timers`

### Screen 4 — Verlauf
- Tabs oben: Matches / Stoppuhren / Timer
- Liste mit Karten, jeweils: Datum (relativ + absolut), Titel, Ergebnis/Dauer
- Tap auf Karte → Detail-Modal: vollständige Daten, Notiz editieren (nur Matches), Lap-Liste (nur Stoppuhren), Löschen-Button
- Export-Icon oben rechts → Auswahl CSV / JSON → Browser-Download via Blob-URL

### Screen 5 — Einstellungen
Erreichbar über Zahnrad-Icon oben rechts.
- Sound an/aus
- Vibration an/aus
- „Alle Daten löschen" — zweistufige Bestätigung

### Globale Komponenten
- **Bottom-Tab-Bar:** 3 Icons (Match / Werkzeuge / Verlauf), sticky am unteren Rand
- **Toast:** rechts unten, 2 Sekunden Auto-Dismiss
- **Modal:** zentriert, Backdrop, Schließen via Backdrop-Tap oder X
- **Wake Lock:** während Match-Live, laufender Stoppuhr oder Timer → Display bleibt an

## 6. Verhalten & Lebenszyklen

### Match-Lebenszyklus
1. Setup-Screen → Eingaben → Start
2. Match-Live: Counter + Spielzeit, kontinuierliches Auto-Save in `tt.session`
3. „Match beenden" → Modal
   - **Speichern:** Match in `tt.matches`, neue Team-Namen werden in `tt.teamPresets` ergänzt (wenn nicht schon vorhanden), `tt.session` geleert, Wechsel zu Verlauf-Tab mit Bestätigungs-Toast
   - **Verwerfen:** `tt.session` geleert, zurück zu Setup
   - **Abbrechen:** Modal schließen, Match läuft weiter

### Stoppuhr-Lebenszyklus
Jede der beiden Stoppuhren hat einen unabhängigen State (`idle | running | paused`). Tap auf große Zeitanzeige toggelt Start/Pause. Lap-Button erscheint nur im `running`-State. Reset setzt zurück und löscht Lap-Liste (mit Bestätigung, falls Laps existieren). Save schreibt aktuellen Stand in `tt.stopwatches` und setzt zurück.

### Timer-Lebenszyklus
States: `picking | running | paused | done`. Drehrad nur in `picking`. Bei `running` läuft RequestAnimationFrame-Loop, Countdown wird sekundengenau angezeigt. Bei 0: Übergang zu `done`, Effekte abspielen, automatischer Rückwechsel zu `picking` nach 3 Sekunden oder Tap.

### Reload-Verhalten
Beim Laden der App: prüfe `tt.session`. Wenn vorhanden und nicht älter als 12 Stunden → Banner „Letztes Match wiederherstellen?" mit Optionen Wiederherstellen / Verwerfen. Älter als 12 Stunden: automatisch verwerfen.

## 7. Export

**CSV-Format (Matches):** Semikolon-getrennt, UTF-8 mit BOM für Excel-Kompatibilität.
```
Datum;Team A;Punkte A;Team B;Punkte B;Dauer;Notiz
2026-06-11T14:30:00;7a;12;7b;9;12:34;
```

**CSV-Format (Stoppuhren):**
```
Datum;Label;Gesamtzeit;Laps
2026-06-11T14:30:00;Lauf Marie;00:45.230;12.100|11.800|10.900|10.430
```

**JSON-Format:** 1:1 das interne Datenmodell, inkl. `id` und `createdAt`.

Erzeugung: `Blob` mit korrektem MIME-Type → `URL.createObjectURL` → unsichtbarer `<a download>` → programmatischer Klick → URL-Revoke.

## 8. PWA

### `manifest.webmanifest`
```json
{
  "name": "Sportzähler",
  "short_name": "Sportzähler",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0F6E56",
  "orientation": "portrait",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `service-worker.js`
- Cache-First-Strategie für alle App-Assets
- Versionsstring im Cache-Namen (z. B. `sportzaehler-v1`); bei Update alten Cache löschen
- Installation: alle statischen Dateien beim `install`-Event vorab cachen
- `fetch`-Event: erst Cache, dann Netzwerk, bei Netzwerk-Fehler Fallback auf `index.html`

### Installations-Hinweis
Beim ersten Aufruf in einem unterstützten Browser: `beforeinstallprompt` abfangen, kleines Banner unten („App installieren") anbieten, einmalig dismissbar (Flag in `localStorage`).

## 9. Edge-Cases & Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| `localStorage` voll oder blockiert | Toast „Speicherung nicht möglich", App läuft mit RAM-State weiter |
| Score < 0 angefordert | Minus-Button deaktiviert bei Score = 0 |
| Timer-Drehrad auf 00:00 + Start | Start-Button deaktiviert |
| Stoppuhr ohne Label speichern | Default-Label „Lauf vom 11.06., 14:30" |
| Match-Verwerfen ohne Punkte/Zeit | Direkt verwerfen ohne Bestätigung |
| Reload während Match | Session-Recovery-Banner (siehe §6) |
| Browser ohne Web-Audio | Sound-Effekte still ignorieren, Vibration trotzdem |
| Browser ohne Vibration-API | Vibration still ignorieren |
| Wake-Lock-API nicht verfügbar | Kein Wake-Lock, normaler Screen-Timeout |

## 10. Nicht im Scope (YAGNI)

Folgende Features sind bewusst ausgelassen und können in v2 ergänzt werden, ohne die Kern-Architektur zu refactoren:

- Mehr als 2 Teams pro Match
- Sport-spezifische Vorlagen (Fußball-Halbzeiten, Basketball-Viertel, Volleyball-Sätze)
- Cloud-Sync zwischen mehreren Geräten
- Verlauf-Statistiken & Charts
- Authentifizierung / Multi-User
- Mehrsprachigkeit (UI fix Deutsch in v1)
- Native Notifications für Timer-Ablauf bei minimierter App
- Spielprotokoll (Liste aller Punkteereignisse mit Zeitstempel)
