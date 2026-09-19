# Mitmachen: Spiele & Übungen beitragen

Die Spiele-, Sportarten- und Übungsdatenbank lebt von Beiträgen. Jeder Eintrag
ist eine einfache **Markdown-Datei** in `content/games/`. Du brauchst dafür
keine Programmierkenntnisse – eine Textdatei genügt.

## Community-Spiele über die App

In der App unter **Datenbank → „＋ Community-Spiel einreichen"** kannst du ein
Spiel über das Formular eintragen. Bei aktivierter Community-Konfiguration wird
es direkt an die Google-Apps-Script-Web-App gesendet und erscheint nach der
bestätigten Antwort sofort als **Community-Spiel** – ohne separate Freigabe und
ohne direkte Bearbeitung des Google Sheets. Das Feld **Autor (optional)** kann
mit einem Namen oder einer Gruppe gefüllt werden. Community-Spiele sind in der
App nicht bearbeitbar oder löschbar und können mit 1–5 Sternen bewertet werden.

Ist `COMMUNITY_ENDPOINT` in `js/config.js` leer, zeigt die App einen Hinweis und
speichert den Entwurf nicht fälschlich als Community-Spiel. Die Einrichtung des
Sheets und des Endpunkts steht in
[`scripts/google-apps-script/README.md`](scripts/google-apps-script/README.md).

### Benachrichtigungen für neue Community-Spiele

Web-Push ist standardmäßig deaktiviert. Für einen echten Betrieb werden ein
konfiguriertes Relay, ein VAPID-Schlüsselpaar und die beiden Apps-Script-
`ScriptProperties` benötigt; private Schlüssel und Publish-Secrets bleiben
außerhalb des Repositories. Die PWA fragt die Berechtigung nur nach einem
ausdrücklichen Schalter-Klick an. Setup, iOS-Hinweise, Live-Testplan und offene
Deployment-/Datenschutzschritte stehen in [`docs/web-push.md`](docs/web-push.md).

## Offizielle Einträge im Repository

Die folgenden Wege beschreiben die direkte Pflege der gebündelten, offiziellen
Datenbank durch Maintainer:innen.

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
