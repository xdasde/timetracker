import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

import { EventStore } from './lib/event-store.mjs';
import { SubscriptionStore } from './lib/subscription-store.mjs';
import { buildPushPayload, parseCommunityGameEvent } from './lib/push-contract.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function loadConfig(env = process.env) {
  const appOrigin = String(env.APP_ORIGIN || 'http://localhost:4173/').trim();
  const dataDir = resolve(String(env.DATA_DIR || './data'));
  const corsOrigins = String(env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!corsOrigins.length) {
    try { corsOrigins.push(new URL(appOrigin).origin); } catch { /* route validation reports the invalid origin */ }
  }
  return {
    appOrigin,
    port: Number(env.RELAY_PORT || 8787),
    dataDir,
    corsOrigins: new Set(corsOrigins),
    publishSecret: String(env.RELAY_PUBLISH_SECRET || '').trim(),
    vapidSubject: String(env.VAPID_SUBJECT || '').trim(),
    vapidPublicKey: String(env.VAPID_PUBLIC_KEY || '').trim(),
    vapidPrivateKey: String(env.VAPID_PRIVATE_KEY || '').trim(),
  };
}

function json(res, status, value, origin = null) {
  const headers = { ...JSON_HEADERS };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
}

function errorResponse(error) {
  const status = Number(error?.statusCode) || 400;
  return { status, body: { ok: false, error: String(error?.message || 'Ungültige Anfrage').slice(0, 240) } };
}

function requestOrigin(req, config) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  return origin && config.corsOrigins.has(origin) ? origin : null;
}

function requireAllowedOrigin(req, config) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && !config.corsOrigins.has(origin)) {
    const error = new Error('Origin ist nicht freigegeben.');
    error.statusCode = 403;
    throw error;
  }
  return origin || null;
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let data = '';
    let settled = false;
    const fail = error => {
      if (!settled) { settled = true; reject(error); }
    };
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Anfrage ist zu groß.');
        error.statusCode = 413;
        fail(error);
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('error', fail);
    req.on('end', () => {
      if (settled) return;
      try {
        settled = true;
        resolveBody(JSON.parse(data || '{}'));
      } catch {
        const error = new Error('JSON-Body ist ungültig.');
        error.statusCode = 400;
        fail(error);
      }
    });
  });
}

function constantTimeEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && nodeTimingSafeEqual(a, b);
}

function readSubscription(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Push-Abo fehlt.');
  const endpoint = String(body.endpoint || '').trim();
  if (endpoint.length < 10 || endpoint.length > 2048) throw new Error('Push-Endpunkt ist ungültig.');
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch { throw new Error('Push-Endpunkt ist ungültig.'); }
  if (endpointUrl.protocol !== 'https:'
    && !(endpointUrl.protocol === 'http:' && /^(localhost|127(?:\.\d+){3})$/.test(endpointUrl.hostname))) {
    throw new Error('Push-Endpunkt muss HTTPS verwenden.');
  }
  const keys = body.keys;
  if (!keys || typeof keys !== 'object' || !/^[A-Za-z0-9_-]{8,256}$/.test(String(keys.p256dh || ''))
    || !/^[A-Za-z0-9_-]{8,256}$/.test(String(keys.auth || ''))) {
    throw new Error('Push-Schlüssel sind ungültig.');
  }
  return {
    endpoint,
    expirationTime: body.expirationTime ?? null,
    keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
  };
}

function isPushConfigured(config, pushSender) {
  if (!config.publishSecret || !config.vapidSubject || !config.vapidPublicKey || !config.vapidPrivateKey) return false;
  if (typeof pushSender?.setVapidDetails !== 'function') return false;
  try {
    pushSender.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    return true;
  } catch {
    return false;
  }
}

function providedPublishSecret(req) {
  const header = req.headers['x-relay-secret'];
  if (typeof header === 'string') return header;
  const authorization = req.headers.authorization;
  return typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
}

async function sendToSubscriptions({ payload, store, pushSender }) {
  let sent = 0;
  let failed = 0;
  let removed = 0;
  const subscriptions = store.list();
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await pushSender.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 24 * 60 * 60,
        urgency: 'normal',
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404 || statusCode === 410) {
        if (store.remove(subscription.endpoint)) removed += 1;
      }
    }
  }));
  return { sent, failed, removed };
}

export function createServer({
  env = process.env,
  pushSender = webpush,
  subscriptionStore = null,
  eventStore = null,
} = {}) {
  const config = loadConfig(env);
  const subscriptions = subscriptionStore || new SubscriptionStore(resolve(config.dataDir, 'subscriptions.json'));
  const events = eventStore || new EventStore(resolve(config.dataDir, 'events.json'));
  const pushConfigured = isPushConfigured(config, pushSender);

  const server = createHttpServer(async (req, res) => {
    try {
      const path = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
      if (req.method === 'OPTIONS') {
        const origin = requireAllowedOrigin(req, config);
        const headers = {
          ...JSON_HEADERS,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        };
        if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers.Vary = 'Origin'; }
        res.writeHead(204, headers);
        res.end();
        return;
      }

      if (req.method === 'GET' && path === '/healthz') {
        json(res, 200, { ok: true, pushConfigured, subscriptions: subscriptions.size }, requestOrigin(req, config));
        return;
      }

      if ((req.method === 'POST' || req.method === 'DELETE') && path === '/subscribe') {
        const origin = requireAllowedOrigin(req, config);
        if (!pushConfigured) {
          const error = new Error('Push-Relay ist noch nicht konfiguriert.');
          error.statusCode = 503;
          throw error;
        }
        const body = await readJson(req);
        if (req.method === 'POST') {
          subscriptions.upsert(readSubscription(body));
          json(res, 201, { ok: true }, origin);
        } else {
          const endpoint = String(body?.endpoint || '').trim();
          if (!endpoint) throw new Error('Push-Endpunkt fehlt.');
          const removed = subscriptions.remove(endpoint);
          json(res, 200, { ok: true, removed }, origin);
        }
        return;
      }

      if (req.method === 'POST' && path === '/events/community-game') {
        if (!constantTimeEqual(providedPublishSecret(req), config.publishSecret)) {
          const error = new Error('Publish-Authentifizierung fehlgeschlagen.');
          error.statusCode = 401;
          throw error;
        }
        if (!pushConfigured) {
          const error = new Error('Push-Relay ist noch nicht konfiguriert.');
          error.statusCode = 503;
          throw error;
        }
        const body = await readJson(req);
        const event = parseCommunityGameEvent(body, config.appOrigin);
        if (!events.claim(event.eventId)) {
          json(res, 200, { ok: true, duplicate: true, eventId: event.eventId, sent: 0 });
          return;
        }
        const payload = buildPushPayload({ ...event, appOrigin: config.appOrigin });
        const delivery = await sendToSubscriptions({ payload, store: subscriptions, pushSender });
        json(res, 200, { ok: true, duplicate: false, eventId: event.eventId, ...delivery });
        return;
      }

      json(res, 404, { ok: false, error: 'Nicht gefunden.' });
    } catch (error) {
      const failure = errorResponse(error);
      json(res, failure.status, failure.body);
    }
  });

  return { server, config, subscriptions, events, pushConfigured };
}

export function start(options = {}) {
  const instance = createServer(options);
  const port = instance.config.port;
  instance.server.listen(port, () => {
    console.log(`Sportzähler Push-Relay läuft auf Port ${port}; Push konfiguriert: ${instance.pushConfigured ? 'ja' : 'nein'}`);
  });
  return instance;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
