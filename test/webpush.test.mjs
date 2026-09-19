import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeBase64Url,
  classifyWebPushSupport,
  isWebPushConfigured,
  normalizeRelayEndpoint,
  buildRelayUrl,
  enableCommunityPush,
} from '../js/webpush.js';

test('decodeBase64Url decodiert den VAPID-Schlüssel ohne Padding', () => {
  assert.deepEqual([...decodeBase64Url('AQID-_w')], [1, 2, 3, 251, 252]);
});

test('Web-Push wird nur in sicherer, vollständig unterstützter Umgebung angeboten', () => {
  const env = {
    windowObj: {
      isSecureContext: true,
      Notification: { permission: 'default' },
      PushManager: class PushManager {},
      navigator: { serviceWorker: {} },
    },
    navigatorObj: { serviceWorker: {} },
  };
  assert.deepEqual(classifyWebPushSupport(env), { supported: true, reason: null });
  assert.equal(classifyWebPushSupport({
    windowObj: { isSecureContext: false, Notification: {}, PushManager: {}, navigator: { serviceWorker: {} } },
    navigatorObj: { serviceWorker: {} },
  }).reason, 'secure-context');
});

test('iOS ohne Home-Screen-Installation erhält eine verständliche Einschränkung', () => {
  const base = {
    windowObj: {
      isSecureContext: true,
      Notification: {},
      PushManager: {},
      navigator: { serviceWorker: {}, userAgent: 'Mozilla/5.0 (iPhone)' },
      matchMedia: () => ({ matches: false }),
    },
    navigatorObj: { serviceWorker: {}, userAgent: 'Mozilla/5.0 (iPhone)' },
  };
  assert.deepEqual(classifyWebPushSupport(base), { supported: false, reason: 'ios-install-required' });
  base.windowObj.matchMedia = () => ({ matches: true });
  assert.deepEqual(classifyWebPushSupport(base), { supported: true, reason: null });
});

test('Relay-Konfiguration benötigt Endpoint und öffentlichen VAPID-Schlüssel', () => {
  assert.equal(isWebPushConfigured({ endpoint: '', vapidPublicKey: 'AQID' }), false);
  assert.equal(isWebPushConfigured({ endpoint: 'https://relay.example', vapidPublicKey: '' }), false);
  assert.equal(isWebPushConfigured({ endpoint: 'https://relay.example/', vapidPublicKey: 'AQID' }), true);
});

test('Relay-URLs werden normalisiert und auf bekannte Pfade begrenzt', () => {
  assert.equal(normalizeRelayEndpoint(' https://relay.example/// '), 'https://relay.example');
  assert.equal(buildRelayUrl('https://relay.example/', '/subscribe'), 'https://relay.example/subscribe');
  assert.throws(() => buildRelayUrl('not a url', '/subscribe'), /Relay-Endpunkt/);
});

test('Enable-Pfad fragt Permission an und registriert erst danach das Abo beim Relay', async () => {
  let permissionRequests = 0;
  let subscribeCalls = 0;
  const calls = [];
  const subscription = {
    endpoint: 'https://push.example.test/send/123',
    toJSON: () => ({ endpoint: 'https://push.example.test/send/123', keys: { p256dh: 'abcdefgh', auth: 'ijklmnop' } }),
  };
  const registration = {
    pushManager: {
      async getSubscription() { return null; },
      async subscribe(options) {
        subscribeCalls += 1;
        assert.equal(options.userVisibleOnly, true);
        assert.ok(options.applicationServerKey instanceof Uint8Array);
        return subscription;
      },
    },
  };
  const windowObj = {
    isSecureContext: true,
    Notification: {
      async requestPermission() { permissionRequests += 1; return 'granted'; },
    },
    PushManager: class PushManager {},
    navigator: { userAgent: 'Mozilla/5.0', serviceWorker: {} },
  };
  const navigatorObj = { userAgent: 'Mozilla/5.0', serviceWorker: { ready: Promise.resolve(registration) } };
  await enableCommunityPush({
    windowObj,
    navigatorObj,
    endpoint: 'https://relay.example/',
    vapidPublicKey: 'AQID',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 201 };
    },
  });
  assert.equal(permissionRequests, 1);
  assert.equal(subscribeCalls, 1);
  assert.equal(calls[0].url, 'https://relay.example/subscribe');
  assert.equal(JSON.parse(calls[0].options.body).endpoint, subscription.endpoint);
});
