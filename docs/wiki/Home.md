# Sportzähler – Wiki

**Sportzähler** ist eine Progressive Web App (PWA) für Spielstanderfassung, Zeitnahme und Teamverwaltung im Schul- und Jugendsport.

## Features

| Feature | Beschreibung |
|---|---|
| Spielstanderfassung | 19 Sportarten als Presets, anpassbar |
| Spielzeit-Management | Countdown, Stopwatch, Halbzeit/Viertel/Perioden |
| Halbzeit-Logik | Automatische Pausen, Periodenstand, korrekte Terminologie |
| Regelwerk | Kurzregeln für alle Sportarten mit App-Tipps |
| Teambildung | Zufällige Teamzulosung mit Foto-Funktion |
| History | Spielhistorie mit Export (CSV/JSON) |
| Offline-fähig | Service Worker – funktioniert ohne Internet |
| Installierbar | PWA-Install auf iOS, Android, Desktop |
| Sound & Vibration | Pfeife, Tor-Sound, Timer-Ende-Signal |

## Schnellstart

1. App öffnen → **Neues Match** tippen
2. Sport-Preset auswählen (z.B. Fußball)
3. Teamnamen eingeben → **Start**
4. Punkte per + / − Buttons erfassen
5. **Halbzeit** drücken wenn nötig → Pause startet automatisch
6. **Match beenden** → Ergebnis gespeichert

## Navigation

- **Home** – Hauptmenü (Match, Presets, Tools, Teambildung, Verlauf)
- **Tools** – Stoppuhren + Countdowns
- **Verlauf** – Alle gespeicherten Matches und Zeitmessungen
- **Regelwerk** – Kurzregeln für alle Sportarten
- **Einstellungen** – Ton, Vibration, Daten

## Daten & Datenschutz

Alle Daten werden **lokal im Browser** gespeichert (`localStorage`). Kein Server, kein Account, keine Tracker. Export per CSV oder JSON möglich.

---

→ [Sportarten & Regeln](Sports-Rules.md) | [Architektur](Architecture.md) | [Entwicklung](Development.md)
