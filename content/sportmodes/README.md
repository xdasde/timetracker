# Sportmodus-Content (Entwurf)

`exercises.draft.json` ist ein eigenständiger, noch nicht veröffentlichter Content-Entwurf für die sportartspezifischen Übungsmodi.

## Umfang

- Fußball: 31 Übungen
- Handball: 15 Übungen
- Volleyball: 15 Übungen
- Basketball: 15 Übungen

Jeder Datensatz enthält `sportId`, `modeId`, Titel, Kategorie, Ziel, Aufbau, Ablauf (`steps`), Variationen und Sicherheitshinweis. Die IDs sind stabil und für eine spätere Filter-/Detailansicht geeignet.

## Abgrenzung

Die bestehende Allgemeinsport-Datenbank unter `content/games/*.md` wird nicht ersetzt oder verändert. Dieses Artefakt ist bewusst getrennt, bis die Architekturentscheidung für Sportmodi und die Implementierung vorliegen.

## Einbindungsvorschlag

Beim Implementieren die Datei als statischen Content importieren oder in das vereinbarte externe Sportmodus-Modul überführen. `sportId` und `modeId` nicht aus dem sichtbaren Namen ableiten. `category` ist fachlicher Filtertext und unabhängig von den bestehenden Roulette-Kategorien `lauf`, `ball`, `team`.

## Quellenstatus

Die Texte sind ein redaktioneller Entwurf aus allgemeinem Trainingswissen und keine zitierte Fachquelle. Es werden keine Quellen oder Verbandsregeln als belegt behauptet. Vor produktiver Veröffentlichung sollten sportartspezifische Sicherheits- und Altersangaben durch die zuständige Fachperson geprüft werden.
