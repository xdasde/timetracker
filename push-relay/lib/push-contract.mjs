const CONTROL_CHARS_RE = `[\\u0000-\\u001F\\u007F]`;
export const COMMUNITY_ID_RE = /^community~[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_ID_RE = /^[a-z0-9~._:-]{1,128}$/;

function cleanText(value, max) {
  return String(value ?? '')
    .replace(new RegExp(CONTROL_CHARS_RE, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function appBase(appOrigin) {
  let base;
  try {
    base = new URL(String(appOrigin || ''));
  } catch {
    throw new Error('App-Origin ist ungültig.');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('App-Origin darf keine Zugangsdaten oder Parameter enthalten.');
  }
  if (base.protocol !== 'https:'
    && !(base.protocol === 'http:' && /^(localhost|127(?:\.\d+){3})$/.test(base.hostname))) {
    throw new Error('App-Origin muss HTTPS verwenden.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}

function normalizeGame(game) {
  if (!game || typeof game !== 'object' || Array.isArray(game)) {
    throw new Error('Community-Spiel fehlt.');
  }
  if (Object.prototype.hasOwnProperty.call(game, 'url')) {
    throw new Error('Deep-Link ist ungültig und wird ausschließlich serverseitig erzeugt.');
  }
  const id = String(game.id || '').trim();
  if (!COMMUNITY_ID_RE.test(id)) throw new Error('Community-ID ist ungültig.');
  const name = cleanText(game.name, 80);
  if (!name) throw new Error('Spielname fehlt.');
  const icon = cleanText(game.icon || '🎯', 8) || '🎯';
  return { id, name, icon };
}

export function buildCommunityGameUrl(appOrigin, gameId) {
  const id = String(gameId || '').trim();
  if (!COMMUNITY_ID_RE.test(id)) throw new Error('Community-ID ist ungültig.');
  const url = appBase(appOrigin);
  url.search = '';
  url.searchParams.set('communityGame', id);
  return url.toString();
}

export function parseCommunityGameEvent(body, appOrigin) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Event-Body fehlt.');
  }
  const game = normalizeGame(body.game);
  const eventId = String(body.eventId || '').trim();
  if (!EVENT_ID_RE.test(eventId) || eventId !== game.id) {
    throw new Error('eventId muss der Community-ID entsprechen.');
  }
  // Resolve now so malformed origins are rejected before an event is claimed.
  buildCommunityGameUrl(appOrigin, game.id);
  return { eventId, game };
}

export function buildPushPayload({ eventId, game, appOrigin }) {
  const event = parseCommunityGameEvent({ eventId, game }, appOrigin);
  const url = buildCommunityGameUrl(appOrigin, event.game.id);
  const icon = new URL('./icons/icon-192.png', appBase(appOrigin)).toString();
  return {
    type: 'community-game-created',
    title: 'Neues Community-Spiel',
    body: `${event.game.icon} ${event.game.name}`,
    icon,
    data: {
      type: 'community-game-created',
      eventId: event.eventId,
      gameId: event.game.id,
      url,
    },
  };
}
