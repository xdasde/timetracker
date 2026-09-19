import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW_SOURCE = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
const SW_URL = 'https://sport.example/app/service-worker.js';
const APP_ROOT = 'https://sport.example/app/';
const GAME_ID = 'community~abc-123';

function loadServiceWorker({ windows = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    location: new URL(SW_URL),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting() {},
    registration: {
      showNotification: async (title, options) => { shown.push({ title, options }); },
    },
  };
  const clients = {
    matchAll: async () => windows,
    openWindow: async url => { opened.push(url); },
  };
  self.clients = clients;
  const ctx = { self, clients, caches: {}, fetch() {}, URL, Request: class {} };
  vm.createContext(ctx);
  vm.runInContext(SW_SOURCE, ctx);
  return { listeners, shown, opened };
}

function waitable() {
  const pending = [];
  return { pending, waitUntil: p => pending.push(p) };
}

async function push(sw, payload) {
  const e = { ...waitable(), data: { json: () => payload } };
  sw.listeners.push(e);
  await Promise.all(e.pending);
  return sw.shown.at(-1);
}

async function click(sw, data) {
  const e = { ...waitable(), notification: { data, close() {} } };
  sw.listeners.notificationclick(e);
  await Promise.all(e.pending);
}

function payload(url, gameId = GAME_ID) {
  return {
    type: 'community-game-created',
    title: 'Neu',
    body: 'Spiel',
    data: { type: 'community-game-created', eventId: 'evt-1', gameId, url },
  };
}

test('Push: gebundene same-origin Deep-Link-URL mit passender gameId bleibt erhalten', async () => {
  const sw = loadServiceWorker();
  const url = `${APP_ROOT}?communityGame=${encodeURIComponent(GAME_ID)}`;
  const n = await push(sw, payload(url));
  assert.equal(n.options.data.url, url);
  assert.equal(n.options.data.gameId, GAME_ID);
});

test('Push: externe, fremde oder ungültige URLs fallen auf die App-Wurzel zurück', async () => {
  const sw = loadServiceWorker();
  const id = encodeURIComponent(GAME_ID);
  for (const url of [
    `https://evil.example/app/?communityGame=${id}`,
    `https://sport.example/other/?communityGame=${id}`,
    'javascript:alert(1)',
    'http://[invalid',
    `${APP_ROOT}?communityGame=nope`,
    APP_ROOT,
    42,
    undefined,
  ]) {
    const n = await push(sw, payload(url));
    assert.equal(n.options.data.url, APP_ROOT, String(url));
  }
});

test('Push: abweichende oder mehrdeutige communityGame-ID fällt auf die App-Wurzel zurück', async () => {
  const sw = loadServiceWorker();
  const other = encodeURIComponent('community~other-game');
  const own = encodeURIComponent(GAME_ID);
  for (const url of [
    `${APP_ROOT}?communityGame=${other}`,
    `${APP_ROOT}?communityGame=${other}&communityGame=${own}`,
    `${APP_ROOT}?communityGame=${own}&communityGame=${other}`,
  ]) {
    const n = await push(sw, payload(url));
    assert.equal(n.options.data.url, APP_ROOT, url);
  }
});

test('Push: ohne gültige gameId wird keine Benachrichtigung angezeigt', async () => {
  const sw = loadServiceWorker();
  const url = `${APP_ROOT}?communityGame=${encodeURIComponent(GAME_ID)}`;
  assert.equal(await push(sw, payload(url, 'community~BAD id')), undefined);
  const missing = payload(url);
  delete missing.data.gameId;
  assert.equal(await push(sw, missing), undefined);
  assert.equal(sw.shown.length, 0);
});

test('notificationclick öffnet nur die zur gameId gebundene URL', async () => {
  const url = `${APP_ROOT}?communityGame=${encodeURIComponent(GAME_ID)}`;
  const sw = loadServiceWorker();
  await click(sw, { gameId: GAME_ID, url });
  assert.deepEqual(sw.opened, [url]);
});

test('notificationclick: Mismatch, fehlende gameId oder externe URL öffnen die App-Wurzel', async () => {
  const bound = `${APP_ROOT}?communityGame=${encodeURIComponent(GAME_ID)}`;
  const other = `${APP_ROOT}?communityGame=${encodeURIComponent('community~other-game')}`;
  for (const data of [
    { gameId: GAME_ID, url: other },
    { gameId: 'community~other-game', url: bound },
    { url: bound },
    { gameId: 'x', url: bound },
    { gameId: GAME_ID, url: `https://evil.example/app/?communityGame=${encodeURIComponent(GAME_ID)}` },
    undefined,
  ]) {
    const sw = loadServiceWorker();
    await click(sw, data);
    assert.deepEqual(sw.opened, [APP_ROOT], JSON.stringify(data));
  }
});

test('notificationclick navigiert ein offenes App-Fenster bei Mismatch nur zur App-Wurzel', async () => {
  const navigated = [];
  const win = {
    url: `${APP_ROOT}#home`,
    navigate: async url => { navigated.push(url); },
    focus: async () => {},
  };
  const sw = loadServiceWorker({ windows: [win] });
  await click(sw, {
    gameId: GAME_ID,
    url: `${APP_ROOT}?communityGame=${encodeURIComponent('community~other-game')}`,
  });
  assert.deepEqual(navigated, [APP_ROOT]);
  assert.deepEqual(sw.opened, []);
});
