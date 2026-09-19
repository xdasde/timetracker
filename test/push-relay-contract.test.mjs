import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMUNITY_ID_RE,
  buildCommunityGameUrl,
  buildPushPayload,
  parseCommunityGameEvent,
} from '../push-relay/lib/push-contract.mjs';

const game = { id: 'community~burgball', name: 'Burgball', icon: '🏰' };

test('Community-ID-Vertrag akzeptiert nur kanonische IDs', () => {
  assert.equal(COMMUNITY_ID_RE.test(game.id), true);
  assert.equal(COMMUNITY_ID_RE.test('community~Burgball'), false);
  assert.equal(COMMUNITY_ID_RE.test('https://evil.example/community~burgball'), false);
  assert.equal(COMMUNITY_ID_RE.test('community~'), false);
});

test('Deep-Link bleibt same-origin und enthält exakt die Spiel-ID', () => {
  const url = buildCommunityGameUrl('https://sport.example/timetracker/', game.id);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://sport.example');
  assert.equal(parsed.pathname, '/timetracker/');
  assert.equal(parsed.searchParams.get('communityGame'), game.id);
});

test('Push-Payload enthält sicheren Titel, Icon und Deep-Link', () => {
  const payload = buildPushPayload({ eventId: game.id, game, appOrigin: 'https://sport.example/timetracker/' });
  assert.deepEqual(payload.data, {
    type: 'community-game-created',
    eventId: game.id,
    gameId: game.id,
    url: 'https://sport.example/timetracker/?communityGame=community%7Eburgball',
  });
  assert.equal(payload.title, 'Neues Community-Spiel');
  assert.equal(payload.body, '🏰 Burgball');
  assert.equal(payload.icon, 'https://sport.example/timetracker/icons/icon-192.png');
});

test('Event-Parser verlangt eventId gleich Spiel-ID und verwirft fremde URLs', () => {
  assert.deepEqual(parseCommunityGameEvent({ eventId: game.id, game }, 'https://sport.example/timetracker/'), {
    eventId: game.id,
    game,
  });
  assert.throws(
    () => parseCommunityGameEvent({ eventId: 'community~anderes', game }, 'https://sport.example/timetracker/'),
    /eventId/,
  );
  assert.throws(
    () => parseCommunityGameEvent({ eventId: game.id, game: { ...game, url: 'https://evil.example/' } }, 'https://sport.example/timetracker/'),
    /ungültig|same-origin/i,
  );
});

test('Push-Payload begrenzt fremde Titelzeichen und nutzt Defaults', () => {
  const payload = buildPushPayload({
    eventId: 'community~sicher',
    game: { id: 'community~sicher', name: '<script>Spiel</script>\n', icon: '' },
    appOrigin: 'https://sport.example/timetracker/',
  });
  assert.equal(payload.body.includes('<script>'), true);
  assert.equal(payload.body.includes('\n'), false);
  assert.equal(payload.data.url.includes('communityGame=community%7Esicher'), true);
});
