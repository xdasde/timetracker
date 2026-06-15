# Datenformat: Spiele- & Übungsdatenbank

Jede Datei in `content/games/<id>.md` beschreibt **ein** Spiel oder eine Übung.
Aus diesen Dateien wird per `scripts/build-content.mjs` automatisch
`js/content.generated.js` erzeugt, das die App lädt.

Der Dateiname **muss** `<id>.md` heißen (gleiche `id` wie im Frontmatter).

## Aufbau einer Datei

```markdown
---
id: brennball              # Pflicht · nur a-z, 0-9, "-"; == Dateiname
name: Brennball            # Pflicht · voller Anzeigename (Regelwerk)
shortName: Brennball       # optional · kurzer Name für Preset-Chips
icon: 🔥                   # Pflicht · ein Emoji
kind: sport                # Pflicht · sport | spiel | uebung
categories: [lauf, team, ball]   # optional · Teilmenge von: lauf, ball, team
difficulty: einfach        # optional · einfach | mittel | schwer
ageGroup: Klasse 1–6       # optional · frei
material: [Weichball, 4 Male]    # optional · Liste
players: ab 10             # optional · frei
teamA: Team A              # optional · Name Team A (Standard: "Team A")
teamB: Team B              # optional · Name Team B (Standard: "Team B")
colorIndex: 0              # optional · 0–3 (Farbpaar im Scoreboard)
durationMs: 2400000        # optional · Spieldauer in ms (null = kein Limit)
breakMs: 300000            # optional · Pausendauer in ms (null = keine)
periods: 2                 # optional · Anzahl Abschnitte (Standard: 1)
periodLabel: Halbzeit      # optional · Bezeichnung eines Abschnitts
structure: 2 Halbzeiten, meist 20 Min.   # Pflicht · Kurzbeschreibung Aufbau
scoring: Läufer erreicht Brennmal = 1 Punkt   # Pflicht · wie gewertet wird
source: ""                 # optional · Quelle/Attribution
---

## Ablauf
- Erster Punkt der Spielregeln
- Zweiter Punkt …

## Tipp
Ein App-Tipp, z. B. wie Timer/Pause einzustellen sind.
```

## Pflichtfelder

`id`, `name`, `icon`, `kind`, `structure`, `scoring`, Abschnitt **## Ablauf**
(mind. ein `-`-Punkt) und Abschnitt **## Tipp**.

## Werte-Hinweise

- **kind** – `sport` (vollwertige Sportart mit Scoreboard), `spiel` (kleines
  Spiel), `uebung` (Aufwärm-/Bewegungsübung).
- **categories** – steuern das Spiel-Roulette. Nur `lauf`, `ball`, `team`.
- **durationMs / breakMs** – Millisekunden. Beispiele: 20 Min = `1200000`,
  40 Min = `2400000`, 5 Min Pause = `300000`. `null` = kein Limit.
- **colorIndex** – `0` Teal/Coral · `1` Blau/Rot · `2` Lila/Amber · `3` Grau/Grün.

Nach dem Bearbeiten lokal `npm run build:content` ausführen (validiert + baut).
