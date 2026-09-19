# Web-Push für neue Community-Spiele

## Implementierter Ablauf

```text
PWA (expliziter Schalter)
  └─ Notification.requestPermission + PushManager.subscribe
       └─ POST /subscribe → Web-Push-Relay (Subscription-Store)

PWA-Formular ──POST game──► Google Apps Script ──nur bei created:true──► Relay
                                                                       │
                                                                       └─ Web Push
                                                                            │
Service Worker ◄──────────── Push-Payload mit validierter same-origin URL
  └─ Notification anzeigen; Klick fokussiert/navigiert auf ?communityGame=...
```

Die Community-Daten bleiben append-only. `Games`-Retries liefern `created:false`.
Das Relay beansprucht `eventId=community~...` zusätzlich persistent und verhindert
so doppelte Zustellungen bei wiederholten Relay-Requests.

## Konfiguration und Credentials

Die Repository-Datei `js/config.js` ist standardmäßig absichtlich deaktiviert.
Für einen echten Betrieb werden dort nur folgende öffentliche Werte gesetzt:

- `WEB_PUSH_RELAY_ENDPOINT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`

Im Relay-Secret-Store bleiben:

- privater VAPID-Schlüssel
- `RELAY_PUBLISH_SECRET`
- `VAPID_SUBJECT` (je nach Infrastruktur nicht geheim, aber nur im Relay nötig)

Google Apps Script verwendet `ScriptProperties` `PUSH_RELAY_ENDPOINT` und
`PUSH_RELAY_SECRET`; diese Werte werden nicht an den Browser ausgeliefert.
Details stehen in `push-relay/README.md` und
`scripts/google-apps-script/README.md`.

## Browser-/Live-Testplan

1. Relay mit persistentem `DATA_DIR`, gültigen VAPID-Variablen und HTTPS starten;
   `GET /healthz` muss `pushConfigured:true` liefern.
2. PWA auf HTTPS öffnen. Ohne Klick auf den Schalter darf kein
   `Notification.requestPermission`, `PushManager.subscribe` oder `/subscribe`
   ausgelöst werden.
3. Einstellungen öffnen und Benachrichtigungen aktivieren. Browser-Prompt
   bestätigen; `/subscribe` muss genau eine Subscription registrieren. Den
   Schalter aus- und wieder einschalten und die Registrierung im Relay prüfen.
4. Ein neues Community-Spiel einreichen. Die Apps-Script-Antwort muss
   `ok:true`, `created:true` und eine neue Games-Zeile enthalten. Bei geschlossenem
   App-Fenster muss eine sichtbare Push-Meldung mit Name/Icon erscheinen.
5. Meldung antippen. Erwartet wird dieselbe PWA unter
   `?communityGame=community~<id>`; der Datenbank-Eintrag ist geöffnet und
   sichtbar. Mit bereits offenem App-Fenster muss dieses fokussiert/navigiert
   werden, nicht ein fremder Tab.
6. Den identischen POST erneut senden. Apps Script muss `created:false` liefern;
   Relay/Event-Store darf keine zweite Zustellung erzeugen.
7. Browser-Matrix prüfen: Chromium/Android oder Desktop HTTPS, Firefox/Chromium
   mit blockierter Permission, privater Browser-Modus, sowie iOS/iPadOS 16.4+
   einmal im Browser und einmal nach „Zum Home-Bildschirm“. Die App muss für
   nicht unterstützte Fälle einen konkreten Hinweis anzeigen und darf keinen
   Erfolg speichern.
8. App ohne Relay-Konfiguration laden. Der Schalter bleibt deaktiviert und
   zeigt „noch nicht eingerichtet“; keine Credentials oder Erfolgsmeldung werden
   vorgetäuscht.

## Verifikation dieses Handoffs

Lokal ohne externe Credentials ausführbar:

```sh
npm test
node --check app.js
node --check service-worker.js
node --check < scripts/google-apps-script/Code.gs
node --check push-relay/server.mjs
npm run validate:content
(cd push-relay && npm test)
git diff --check
```

Der echte Browser-Push, die Google-Apps-Script-Web-App und die Deployment-/DPA-
Freigabe sind in dieser Arbeitskopie nicht durchgeführt. Vor Veröffentlichung
müssen Hosting, VAPID-Paar, Relay-Secret, Apps-Script-Properties, HTTPS,
Retention/Löschung der pseudonymen Subscriptions und Monitoring ausdrücklich
freigegeben und live getestet werden.
