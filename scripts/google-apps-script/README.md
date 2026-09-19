# Google-Sheet-Community für Sportzähler

Diese kleine Google-Apps-Script-Web-App stellt Community-Spiele für die App
bereit und nimmt neue Spiele sowie Bewertungen entgegen. Es gibt bewusst keinen
`pending`-, Prüf- oder Veröffentlichungsstatus: Ein Spiel, das die App
erfolgreich sendet, erscheint unmittelbar als Community-Spiel.

## Einrichten

1. Ein neues Google Sheet anlegen.
2. Im Sheet `Erweiterungen → Apps Script` öffnen und den Inhalt von `Code.gs`
   in das Script-Projekt kopieren. Das Script muss an dieses Sheet gebunden
   bleiben; die Tabs `Games` und `Ratings` werden beim ersten Aufruf automatisch
   angelegt. Alternativ können sie vorher mit genau diesen Namen angelegt
   werden.
3. `Bereitstellen → Neue Bereitstellung → Web-App` wählen. Als Ausführung
   **Ich** und als Zugriff **Jeder** auswählen. Die Web-App-URL mit `/exec`
   kopieren, nicht die `/dev`-URL.
4. Die URL in `js/config.js` als `COMMUNITY_ENDPOINT` eintragen:

   ```js
   export const COMMUNITY_ENDPOINT = 'https://script.google.com/macros/s/.../exec';
   ```

   Die Datei wird an den Browser ausgeliefert. Sie darf deshalb ausschließlich
   die öffentliche Web-App-URL enthalten – keine Passwörter, Tokens oder API-
   Schlüssel.

## Optional: Web-Push-Relay

Die Community-Web-App kann nach einer **tatsächlich neuen** `Games`-Zeile ein
separates Web-Push-Relay informieren. Dafür im Apps-Script-Projekt unter
`Projekteinstellungen → Script Properties` setzen:

- `PUSH_RELAY_ENDPOINT`: Relay-Basis-URL ohne abschließenden Slash
- `PUSH_RELAY_SECRET`: derselbe zufällige Wert wie `RELAY_PUBLISH_SECRET` im
  Relay

Beide Werte bleiben in `PropertiesService` und werden nicht an den Browser
ausgeliefert. Fehlen sie oder ist das Relay nicht erreichbar, bleibt die
bestätigte Games-Einreichung gültig; der Fehler wird ohne Secret protokolliert.
Der Relay-Aufruf erfolgt nur, wenn die Antwort `created:true` ergibt. Ein
identischer Retry liefert `created:false` und informiert den Relay nicht erneut.
Die vollständige Einrichtung, das VAPID-Paar und der Browser-Testplan stehen in
[`docs/web-push.md`](../../docs/web-push.md) und
[`push-relay/README.md`](../../push-relay/README.md).

## Datenmodell

Das Script verwendet zwei getrennte Tabellen:

- `Games`: `id`, Name und Regel-/Setup-Felder eines Spiels sowie `createdAt` und
  den optionalen `author`.
- `Ratings`: append-only Bewertungsverlauf mit `gameId`, `deviceId`, `rating` und
  `updatedAt`. Eine erneute Bewertung desselben Geräts wird als neue Zeile
  angehängt; für Durchschnitt und Anzahl zählt jeweils nur die letzte Bewertung
  dieses Geräts.

Die Spalten werden beim ersten Aufruf erzeugt. Zusätzliche Spalten sind möglich,
die vorhandenen Kopfzeilen dürfen aber nicht umbenannt oder umsortiert werden.
Bewertungsdurchschnitt und Anzahl werden aus `Ratings` berechnet und bei jedem
GET sowie nach einem Rating zurückgegeben; sie werden nicht als Spielstatus in
`Games` gespeichert.

## Schnittstelle

`GET <URL>` liefert JSON der Form `{ "ok": true, "games": [...] }`. Die App
ruft die URL mit `?action=games` auf; der Parameter dient nur der Lesbarkeit und
wird vom Script nicht benötigt.

`POST <URL>` wird als `text/plain` mit einem JSON-Body gesendet. Dadurch ist kein
CORS-Preflight nötig:

```json
{"type":"game","game":{"name":"...","kind":"spiel","structure":"...","scoring":"...","basics":["..."],"tip":"...","author":"..."}}
```

Die Antwort enthält das gespeicherte Spiel unter `game` sowie `created`. Neue
Spiele werden append-only gespeichert und liefern `created:true`. Sendet die
App denselben Spielentwurf mit derselben Community-ID nach einem Timeout erneut,
liefert das Script den bereits gespeicherten identischen Eintrag mit
`created:false` zurück, statt eine zweite Zeile anzulegen. Nur der erste Fall
informiert das optionale Web-Push-Relay.
Ein abweichender Änderungsversuch mit einer bereits vorhandenen Community-ID
wird abgewiesen; vorhandene Spielzeilen werden niemals geändert oder gelöscht.

```json
{"type":"rating","gameId":"community~burgball","rating":5,"deviceId":"..."}
```

Die Antwort enthält `ratingAverage` und `ratingCount` für dieses Spiel.
Auch Bewertungen werden ausschließlich angehängt; bestehende Bewertungszeilen
werden nicht geändert oder gelöscht.

Das Script verwendet zusätzlich `CacheService` für einfache globale und
gerätebezogene Schreiblimits pro Minute. Das ist nur ein Schutz gegen
versehentliche oder einfache automatisierte Überlastung, keine Authentifizierung.
Der Endpunkt bleibt öffentlich erreichbar; wer ihn kennt, kann Requests auch
ohne die App formulieren. Für eine öffentlich betriebene Instanz sollte später
zusätzlich ein stärkerer Abuse-/Moderationsschutz ergänzt werden.

Neue Spiele werden in der App ausschließlich über die Eingabemaske eingetragen;
App-Nutzer:innen brauchen keine Bearbeitungsrechte am Sheet. Die
Sheet-Eigentümer:innen können die Tabellen technisch verwalten, sollten das
Sheet aber nicht öffentlich editierbar teilen. Der öffentliche Endpunkt ist
kein Schutz vor absichtlich falschen Einsendungen oder Bewertungen.

Die App cached die zuletzt geladenen Spiele lokal und verwendet sie offline
weiter. Ist `COMMUNITY_ENDPOINT` leer, wird keine neue Community-Einsendung
lokal vorgetäuscht; die Maske weist auf die fehlende Einrichtung hin. Push-
Benachrichtigungen sind separat config-gated und erfordern eine ausdrückliche
Aktivierung. Es gibt keine Anmeldung; die Relay-Authentifizierung bleibt
serverseitig.
