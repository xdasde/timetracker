import {
  WEB_PUSH_RELAY_ENDPOINT,
  WEB_PUSH_VAPID_PUBLIC_KEY,
} from './config.js';

const RELAY_PATHS = new Set(['/subscribe']);

export function decodeBase64Url(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Öffentlicher VAPID-Schlüssel fehlt.');
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new Error('Öffentlicher VAPID-Schlüssel ist ungültig.');
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function normalizeRelayEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Relay-Endpunkt fehlt.');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Relay-Endpunkt ist ungültig.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^localhost$|^127(?:\.\d+){3}$/.test(url.hostname))) {
    throw new Error('Relay-Endpunkt muss HTTPS verwenden.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Relay-Endpunkt darf keine Zugangsdaten oder Parameter enthalten.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function buildRelayUrl(endpoint, path) {
  if (!RELAY_PATHS.has(path)) throw new Error('Unbekannter Relay-Pfad.');
  return `${normalizeRelayEndpoint(endpoint)}${path}`;
}

export function isWebPushConfigured({
  endpoint = WEB_PUSH_RELAY_ENDPOINT,
  vapidPublicKey = WEB_PUSH_VAPID_PUBLIC_KEY,
} = {}) {
  if (typeof vapidPublicKey !== 'string' || !vapidPublicKey.trim()) return false;
  try {
    normalizeRelayEndpoint(endpoint);
    decodeBase64Url(vapidPublicKey);
    return true;
  } catch {
    return false;
  }
}

function isIOS(windowObj, navigatorObj) {
  const userAgent = String(navigatorObj?.userAgent || windowObj?.navigator?.userAgent || '');
  const platform = String(navigatorObj?.platform || windowObj?.navigator?.platform || '');
  return /iPad|iPhone|iPod/.test(userAgent)
    || (platform === 'MacIntel' && Number(navigatorObj?.maxTouchPoints || windowObj?.navigator?.maxTouchPoints) > 1);
}

function isStandalone(windowObj, navigatorObj) {
  return windowObj?.matchMedia?.('(display-mode: standalone)')?.matches === true
    || navigatorObj?.standalone === true
    || windowObj?.navigator?.standalone === true;
}

export function classifyWebPushSupport({
  windowObj = globalThis,
  navigatorObj = windowObj?.navigator || globalThis.navigator,
} = {}) {
  if (windowObj?.isSecureContext !== true) return { supported: false, reason: 'secure-context' };
  if (!windowObj || !('Notification' in windowObj)) return { supported: false, reason: 'notification-api' };
  if (!navigatorObj?.serviceWorker) return { supported: false, reason: 'service-worker' };
  if (!windowObj.PushManager) return { supported: false, reason: 'push-api' };
  if (isIOS(windowObj, navigatorObj) && !isStandalone(windowObj, navigatorObj)) {
    return { supported: false, reason: 'ios-install-required' };
  }
  return { supported: true, reason: null };
}

export function webPushStatusMessage(reason) {
  return {
    'secure-context': 'Benachrichtigungen funktionieren nur über HTTPS oder localhost.',
    'notification-api': 'Dieser Browser unterstützt keine Benachrichtigungen.',
    'service-worker': 'Dieser Browser unterstützt keine Hintergrund-Benachrichtigungen.',
    'push-api': 'Dieser Browser unterstützt keinen Web-Push.',
    'ios-install-required': 'Auf iPhone/iPad zuerst „Zum Home-Bildschirm“ installieren.',
  }[reason] || 'Benachrichtigungen sind derzeit nicht verfügbar.';
}

function subscriptionJson(subscription) {
  if (!subscription) throw new Error('Push-Abo fehlt.');
  const value = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  if (!value || typeof value.endpoint !== 'string' || !value.endpoint) {
    throw new Error('Push-Abo ist ungültig.');
  }
  return value;
}

async function relayRequest(fetchImpl, endpoint, method, body) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch ist nicht verfügbar.');
  const response = await fetchImpl(buildRelayUrl(endpoint, '/subscribe'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response?.ok) throw new Error(`Push-Relay nicht erreichbar (HTTP ${response?.status ?? 0}).`);
  return response;
}

export async function enableCommunityPush({
  windowObj = globalThis,
  navigatorObj = windowObj?.navigator || globalThis.navigator,
  fetchImpl = globalThis.fetch,
  endpoint = WEB_PUSH_RELAY_ENDPOINT,
  vapidPublicKey = WEB_PUSH_VAPID_PUBLIC_KEY,
} = {}) {
  const support = classifyWebPushSupport({ windowObj, navigatorObj });
  if (!support.supported) throw new Error(webPushStatusMessage(support.reason));
  if (!isWebPushConfigured({ endpoint, vapidPublicKey })) throw new Error('Push-Relay ist noch nicht eingerichtet.');

  const permission = await windowObj.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungsberechtigung wurde nicht erteilt.');

  const registration = await navigatorObj.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(vapidPublicKey),
    });
  }
  await relayRequest(fetchImpl, endpoint, 'POST', subscriptionJson(subscription));
  return { registration, subscription };
}

export async function disableCommunityPush({
  windowObj = globalThis,
  navigatorObj = windowObj?.navigator || globalThis.navigator,
  fetchImpl = globalThis.fetch,
  endpoint = WEB_PUSH_RELAY_ENDPOINT,
} = {}) {
  const registration = await navigatorObj?.serviceWorker?.ready;
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return false;
  const serialized = subscriptionJson(subscription);
  try {
    if (typeof endpoint === 'string' && endpoint.trim()) {
      await relayRequest(fetchImpl, endpoint, 'DELETE', { endpoint: serialized.endpoint });
    }
  } finally {
    await subscription.unsubscribe();
  }
  return true;
}
