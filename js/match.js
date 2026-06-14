import * as storage from './storage.js';

export const COLORS = [
  { a: '#0F6E56', aName: 'teal',   b: '#FF6B5B', bName: 'coral'  },
  { a: '#2563EB', aName: 'blue',   b: '#DC2626', bName: 'red'    },
  { a: '#7C3AED', aName: 'purple', b: '#D97706', bName: 'amber'  },
  { a: '#374151', aName: 'gray',   b: '#059669', bName: 'green'  },
];

let setup = { teamAName: '', teamBName: '', colorIndex: 0 };
let live = null;

export function initSetup() {
  setup = { teamAName: '', teamBName: '', colorIndex: 0 };
}

export function setTeamName(team, name) {
  if (team === 'a') setup.teamAName = name;
  else setup.teamBName = name;
}

export function setColorIndex(i) { setup.colorIndex = i; }

export function getSetup() { return { ...setup }; }

export function startMatch(nameA, nameB, colorIndex) {
  const pair = COLORS[colorIndex] ?? COLORS[0];
  live = {
    id: `m_${Date.now()}`,
    createdAt: Date.now(),
    teamA: { name: nameA || 'Team A', color: pair.aName, colorHex: pair.a, score: 0 },
    teamB: { name: nameB || 'Team B', color: pair.bName, colorHex: pair.b, score: 0 },
    startedAt: null,
    accMs: 0,
    running: false,
    halfTimeScore: null,
    halfTimeMs: null,
  };
  _saveSession();
}

export function markHalfTime() {
  if (!live) return;
  live.halfTimeScore = { a: live.teamA.score, b: live.teamB.score };
  live.halfTimeMs = live.running ? live.accMs + (Date.now() - live.startedAt) : live.accMs;
  _saveSession();
}

export function getLive() {
  if (!live) return null;
  return { ...live, teamA: { ...live.teamA }, teamB: { ...live.teamB } };
}

export function toggleTimer() {
  if (!live) return;
  if (live.running) {
    live.accMs += Date.now() - live.startedAt;
    live.running = false;
  } else {
    live.startedAt = Date.now();
    live.running = true;
  }
  _saveSession();
  return live.running;
}

export function getElapsedMs() {
  if (!live) return 0;
  return live.running ? live.accMs + (Date.now() - live.startedAt) : live.accMs;
}

export function resetTimer() {
  if (!live) return;
  live.accMs = 0;
  live.startedAt = live.running ? Date.now() : null;
  _saveSession();
}

export function changeScore(team, delta) {
  if (!live) return;
  if (team === 'a') live.teamA.score = Math.max(0, live.teamA.score + delta);
  else live.teamB.score = Math.max(0, live.teamB.score + delta);
  _saveSession();
}

export function saveMatch() {
  if (!live) return null;
  const m = {
    id: live.id,
    createdAt: live.createdAt,
    teamA: { name: live.teamA.name, color: live.teamA.color, score: live.teamA.score },
    teamB: { name: live.teamB.name, color: live.teamB.color, score: live.teamB.score },
    durationMs: getElapsedMs(),
    halfTimeScore: live.halfTimeScore || null,
    halfTimeMs: live.halfTimeMs || null,
    note: '',
  };
  storage.addToCollection('matches', m);
  _clearSession();
  live = null;
  return m;
}

export function discardMatch() {
  _clearSession();
  live = null;
}

export function checkSession() {
  const s = storage.getItem('session');
  if (!s) return null;
  if (Date.now() - s.savedAt > 12 * 3600 * 1000) { _clearSession(); return null; }
  return s;
}

export function restoreSession(s) {
  live = s.state;
  if (live.running) {
    live.accMs += Date.now() - s.savedAt;
    live.startedAt = Date.now();
  }
}

function _saveSession() {
  if (!live) return;
  storage.setItem('session', {
    savedAt: Date.now(),
    state: { ...live, teamA: { ...live.teamA }, teamB: { ...live.teamB } },
  });
}

function _clearSession() { storage.removeItem('session'); }
