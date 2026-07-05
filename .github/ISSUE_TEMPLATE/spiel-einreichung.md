---
name: Neues Spiel / Übung einreichen
about: Schlage ein Spiel oder eine Übung für die Datenbank vor (kein Fork nötig)
title: 'Neues Spiel: '
labels: spiel-einreichung
---

<!-- game-submission -->

Am einfachsten geht es direkt in der App: **Datenbank → „Eigenes Spiel anlegen" → „Zur Aufnahme einreichen"**. Dann ist unten schon alles ausgefüllt.

Manuell? Trage den Eintrag in den folgenden Block ein (Format siehe `content/SCHEMA.md`). Der Rest passiert automatisch – ein Bot legt daraus einen Pull-Request an, den ein Maintainer prüft.

```md
---
id: mein-spiel
name: Mein Spiel
icon: 🎯
kind: spiel
structure: Kurzbeschreibung Aufbau
scoring: Wie wird gewertet
---

## Ablauf
- Erster Punkt der Spielregeln
- Zweiter Punkt …

## Tipp
Ein kurzer App-Tipp.
```
