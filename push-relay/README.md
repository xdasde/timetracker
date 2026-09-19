# Sportzähler Web-Push-Relay

Dieses Verzeichnis enthält ein kleines standards-basiertes Relay für Web Push.
Es speichert Push-Subscriptions und bereits beanspruchte Event-IDs lokal als
JSON-Dateien. Die Dateien liegen im konfigurierten `DATA_DIR` und sind durch
`.gitignore` vom Repository ausgeschlossen.

## Lokaler Start

```sh
cp .env.example .env
npm install
npm start
```

Ohne VAPID- und Publish-Credentials startet `/healthz` trotzdem. Das Relay
meldet dann `pushConfigured: false` und nimmt keine Push-Events als Erfolg an.
Es wird kein Erfolg vorgetäuscht.

Für einen echten Betrieb werden ausschließlich Laufzeitvariablen gesetzt:

- `APP_ORIGIN`: vollständige App-Basis-URL, z. B.
  `https://sport.example/timetracker/`. Aus ihr baut das Relay den Deep-Link.
- `RELAY_PUBLISH_SECRET`: zufälliges Secret für den Apps-Script-Aufruf.
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: VAPID-Daten.
- `CORS_ORIGINS`: komma-getrennte Origins ohne Pfad, die `/subscribe`
  aufrufen dürfen.
- `DATA_DIR`: persistenter, nicht öffentlich ausgelieferter Datenordner.

VAPID-Daten können mit `npx web-push generate-vapid-keys` erzeugt werden.
Private Schlüssel und das Publish-Secret gehören ausschließlich in den Secret
Store des Relay-Hosts. Für Produktion sind HTTPS, ein persistent geschütztes
Volume, Backups/Löschfristen sowie eine Datenschutzprüfung für pseudonyme
Push-Endpunkte erforderlich.

## HTTP-Schnittstelle

- `GET /healthz` liefert Betriebsstatus und die Anzahl gespeicherter
  Subscriptions, aber keine Endpoints.
- `POST /subscribe` registriert eine Browser-Subscription. Der Browser ruft
  den Endpunkt nur nach ausdrücklicher Permission-Aktion auf.
- `DELETE /subscribe` entfernt `{ "endpoint": "..." }`.
- `POST /events/community-game` erwartet den Header `X-Relay-Secret` und
  `{ "eventId": "community~...", "game": { "id", "name", "icon" } }`.

`eventId` muss exakt der kanonischen Community-ID entsprechen. Das Relay
konstruiert selbst `?communityGame=<id>` aus `APP_ORIGIN`; beliebige URLs aus
der Anfrage werden nicht übernommen. Eine Event-ID wird vor der Zustellung
persistiert beansprucht. Wiederholungen antworten mit `duplicate: true` und
senden nicht noch einmal.

Wenn ein Push-Service 404/410 für eine Subscription meldet, wird sie aus dem
lokalen Store entfernt. Andere Zustellungen laufen unabhängig weiter.

## Apps Script und Frontend verbinden

1. Relay mit persistenter Datenablage und den obigen Variablen betreiben.
2. In den Google-Apps-Script-`ScriptProperties` setzen:
   - `PUSH_RELAY_ENDPOINT` = Relay-Basis-URL ohne abschließenden Slash
   - `PUSH_RELAY_SECRET` = exakt `RELAY_PUBLISH_SECRET`
3. In `js/config.js` nur die öffentliche Relay-URL und den öffentlichen
   VAPID-Schlüssel eintragen. Niemals `RELAY_PUBLISH_SECRET` oder den privaten
   VAPID-Schlüssel dort eintragen.
4. Die PWA auf HTTPS ausliefern und den Service Worker aktualisieren.

Apps Script ruft das Relay erst nach einem tatsächlichen neuen Append in
`Games` auf. Ein identischer Retry derselben Community-ID liefert
`created:false` und löst keinen zweiten Relay-Aufruf aus. Fällt der Relay-Aufruf
nach dem Append aus, bleibt das Spiel gespeichert; dieser direkte Aufruf hat
noch keine langlebige Outbox. Der Ausfall muss überwacht und bei Bedarf über
einen separaten, noch zu genehmigenden Retry-Prozess behoben werden.
