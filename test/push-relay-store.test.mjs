import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EventStore } from '../push-relay/lib/event-store.mjs';

test('EventStore beansprucht eine Event-ID genau einmal und überlebt einen Neustart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sportzaehler-push-'));
  const file = join(dir, 'events.json');
  try {
    const first = new EventStore(file);
    assert.equal(first.claim('community~burgball'), true);
    assert.equal(first.claim('community~burgball'), false);

    const afterRestart = new EventStore(file);
    assert.equal(afterRestart.claim('community~burgball'), false);
    assert.equal(afterRestart.claim('community~laufspiel'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
