# Mitmachen: Spiele & Übungen beitragen

Die Spiele-, Sportarten- und Übungsdatenbank lebt von Beiträgen. Jeder Eintrag
ist eine einfache **Markdown-Datei** in `content/games/`. Du brauchst dafür
keine Programmierkenntnisse – eine Textdatei genügt.

## Neuen Eintrag anlegen (über GitHub, ohne lokales Setup)

1. Gehe im Repository in den Ordner [`content/games/`](content/games).
2. Klicke auf **Add file → Create new file**.
3. Nenne die Datei `<id>.md` (Kleinbuchstaben, Ziffern, Bindestriche), z. B.
   `tunnelball.md`. Die `id` im Inhalt muss exakt gleich heißen.
4. Kopiere die Vorlage unten hinein und passe sie an.
5. Unten **Propose new file** → **Create pull request**.

Die automatische Prüfung (GitHub Action) validiert deinen Eintrag. Ist alles
grün, kann er gemerged werden. Nach dem Merge baut die Action das kompilierte
Bundle (`js/content.generated.js`) selbst – darum musst du dich nicht kümmern.

## Vorlage

```markdown
---
id: mein-spiel
name: Mein Spiel
icon: 🎯
kind: spiel
categories: [lauf, team]
difficulty: einfach
ageGroup: ab Klasse 1
material: [Softball, Hütchen]
players: 10–25
teamA: Team A
teamB: Team B
colorIndex: 0
durationMs: null
breakMs: null
periods: 1
periodLabel: Runde
structure: Kurzbeschreibung des Aufbaus.
scoring: Wie wird gewertet bzw. gewonnen?
---

## Ablauf
- Erster Regelpunkt
- Zweiter Regelpunkt
- …

## Tipp
Ein App-Tipp, z. B. wie Timer oder Pause einzustellen sind.
```

Die vollständige Feldreferenz steht in [`content/SCHEMA.md`](content/SCHEMA.md).

## Lokal bauen (optional, für Entwickler)

```bash
npm run build:content     # erzeugt js/content.generated.js aus den .md-Dateien
npm run validate:content  # prüft, ob alle .md gültig und das Bundle aktuell ist
```

## Worauf wir achten

- **Eigene Formulierungen** – bitte keine Texte 1:1 aus anderen Quellen kopieren.
  Wenn du eine Quelle als Inspiration angeben möchtest, nutze das Feld `source`.
- **Schulsport-tauglich** – sicher, mit gängigem Material umsetzbar.
- **Verständlich** – kurze, klare Stichpunkte im Abschnitt `## Ablauf`.
