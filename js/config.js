// Öffentliche App-Konfiguration. Diese Datei wird unverändert an den Browser
// ausgeliefert – hier gehören ausschließlich öffentliche Werte hinein.
// KEINE Tokens, Passwörter, API-Keys oder sonstigen Credentials!

// URL der Google-Apps-Script-Web-App, die die Community-Spiele verwaltet.
// Leer = Community-Funktionen sind deaktiviert (die App funktioniert normal weiter).
// Einrichtung siehe scripts/google-apps-script/README.md
export const COMMUNITY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz72LwV6AY9Di8EJPs9FclCLo1kqi3a0svFUw0DbAzv8rRqltSUBmxSPC462jzSBvb-FA/exec';

// Web-Push ist standardmäßig deaktiviert. Für den Betrieb werden hier nur
// der öffentliche Relay-Endpunkt und der öffentliche VAPID-Schlüssel gesetzt.
// Der Relay-Publish-Secret und der private VAPID-Schlüssel bleiben im Relay
// bzw. in Google Apps Script PropertiesService und gehören nie ins Frontend.
export const WEB_PUSH_RELAY_ENDPOINT = '';
export const WEB_PUSH_VAPID_PUBLIC_KEY = '';

// Wie lange ein lokal zwischengespeicherter Stand als „frisch" gilt.
// Danach wird im Hintergrund neu geladen; der Cache bleibt bis dahin sichtbar.
export const COMMUNITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function hasCommunityEndpoint() {
  return typeof COMMUNITY_ENDPOINT === 'string' && COMMUNITY_ENDPOINT.trim().length > 0;
}

export function hasWebPushConfig() {
  return WEB_PUSH_RELAY_ENDPOINT.trim().length > 0
    && WEB_PUSH_VAPID_PUBLIC_KEY.trim().length > 0;
}
