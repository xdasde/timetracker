import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCommunityGameForDeepLink } from '../js/community-deeplink.js';

test('Deep-Link wartet auf den Community-Refresh, bevor der Treffer geöffnet wird', async () => {
  let loaded = false;
  const calls = [];
  const game = { id: 'community~smoke-test' };

  const found = await loadCommunityGameForDeepLink('community~smoke-test', {
    isCommunityId: id => id.startsWith('community~'),
    load: async options => {
      calls.push(options);
      await new Promise(resolve => setTimeout(resolve, 5));
      loaded = true;
    },
    getById: id => loaded && id === game.id ? game : null,
  });

  assert.equal(found, true);
  assert.deepEqual(calls, [{ force: true }]);
});

test('Ungültige Deep-Links lösen keinen Community-Load aus', async () => {
  let loads = 0;
  const found = await loadCommunityGameForDeepLink('builtin-ball', {
    isCommunityId: () => false,
    load: async () => { loads += 1; },
    getById: () => null,
  });

  assert.equal(found, false);
  assert.equal(loads, 0);
});
