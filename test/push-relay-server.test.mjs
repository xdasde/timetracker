import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createServer } from '../push-relay/server.mjs';

const subscription = {
  endpoint: 'https://push.example.test/send/123',
  keys: { p256dh: 'abcdefgh', auth: 'ijklmnop' },
};

async function listen(server) {
  await new Promise(resolve => server.listen(0, resolve));
  return server.address().port;
}

test('Relay registriert Subscriptions und dedupliziert Community-Events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sportzaehler-relay-'));
  const sent = [];
  const pushSender = {
    setVapidDetails() {},
    async sendNotification(target, payload) {
      sent.push({ target, payload: JSON.parse(payload) });
    },
  };
  const instance = createServer({
    pushSender,
    env: {
      APP_ORIGIN: 'https://sport.example/timetracker/',
      CORS_ORIGINS: 'https://sport.example',
      RELAY_PUBLISH_SECRET: 'test-secret',
      VAPID_SUBJECT: 'mailto:test@example.test',
      VAPID_PUBLIC_KEY: 'public',
      VAPID_PRIVATE_KEY: 'private',
      DATA_DIR: dir,
    },
  });
  const port = await listen(instance.server);
  const base = `http://127.0.0.1:${port}`;
  try {
    const subscribe = await fetch(`${base}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://sport.example' },
      body: JSON.stringify(subscription),
    });
    assert.equal(subscribe.status, 201);

    const event = {
      eventId: 'community~burgball',
      game: { id: 'community~burgball', name: 'Burgball', icon: '🏰' },
    };
    const first = await fetch(`${base}/events/community-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-secret': 'test-secret' },
      body: JSON.stringify(event),
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      ok: true,
      duplicate: false,
      eventId: 'community~burgball',
      sent: 1,
      failed: 0,
      removed: 0,
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.data.gameId, 'community~burgball');
    assert.equal(new URL(sent[0].payload.data.url).origin, 'https://sport.example');

    const retry = await fetch(`${base}/events/community-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-secret': 'test-secret' },
      body: JSON.stringify(event),
    });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), {
      ok: true,
      duplicate: true,
      eventId: 'community~burgball',
      sent: 0,
    });
    assert.equal(sent.length, 1, 'Retry derselben ID darf nicht erneut senden');
  } finally {
    await new Promise(resolve => instance.server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
