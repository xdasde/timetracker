const TEAM_COLORS = [
  '#0F6E56', '#2563EB', '#7C3AED', '#DC2626',
  '#D97706', '#059669', '#FF6B5B', '#374151',
  '#0891B2', '#BE185D',
];

export const TEAM_CRESTS = [
  { id: 'eagle',   name: 'Adler',     asset: 'assets/generated/brand-assets/derived/eagle.png' },
  { id: 'bear',    name: 'Bären',     asset: 'assets/generated/brand-assets/derived/bear.png' },
  { id: 'wolf',    name: 'Wölfe',     asset: 'assets/generated/brand-assets/derived/wolf.png' },
  { id: 'fox',     name: 'Füchse',    asset: 'assets/generated/brand-assets/derived/fox.png' },
  { id: 'tiger',   name: 'Tiger',     asset: 'assets/generated/brand-assets/derived/tiger.png' },
  { id: 'penguin', name: 'Pinguine',  asset: 'assets/generated/brand-assets/derived/penguin.png' },
];

let personCount = 10;
let teamCount   = 2;
let selectedCrestIds = ['eagle', 'bear'];
let assignments = [];
let revealIndex = 0;
let revealed    = false;
let done        = false;

function _crestById(id) {
  return TEAM_CRESTS.find(crest => crest.id === id) || null;
}

export function getPersonCount() { return personCount; }
export function getTeamCount()   { return teamCount; }
export function getSelectedCrestIds() { return [...selectedCrestIds]; }

export function setPersonCount(n) {
  personCount = Math.max(2, Math.min(50, n));
  if (teamCount > personCount) teamCount = personCount;
}

export function setTeamCount(n) {
  teamCount = Math.max(2, Math.min(10, n));
  if (teamCount > personCount) personCount = teamCount;
}

export function toggleTeamCrest(id) {
  if (!_crestById(id)) return false;
  const current = selectedCrestIds.indexOf(id);
  if (current >= 0) {
    selectedCrestIds.splice(current, 1);
    return true;
  }

  const limit = Math.min(teamCount, TEAM_CRESTS.length);
  if (selectedCrestIds.length >= limit) {
    // Ein direkter Tap ersetzt das zuletzt gewählte Wappen – kein Umweg über
    // den Teamzähler nötig, um ein anderes Team auszuwählen.
    selectedCrestIds[selectedCrestIds.length - 1] = id;
  } else {
    selectedCrestIds.push(id);
  }
  return true;
}

export function getTeamColor(idx) {
  return TEAM_COLORS[idx % TEAM_COLORS.length];
}

export function getTeamCrest(idx) {
  const crest = _crestById(selectedCrestIds[idx]);
  return crest ? { ...crest } : null;
}

export function getTeamName(idx) {
  return getTeamCrest(idx)?.name || `Team ${idx + 1}`;
}

export function getPreviewDistribution() {
  const base  = Math.floor(personCount / teamCount);
  const extra = personCount % teamCount;
  return Array.from({ length: teamCount }, (_, i) => ({
    name:  getTeamName(i),
    color: getTeamColor(i),
    crest: getTeamCrest(i),
    count: base + (i < extra ? 1 : 0),
  }));
}

export function generateAssignments() {
  const arr   = [];
  const base  = Math.floor(personCount / teamCount);
  const extra = personCount % teamCount;
  for (let t = 0; t < teamCount; t++) {
    const count = base + (t < extra ? 1 : 0);
    for (let i = 0; i < count; i++) arr.push(t);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  assignments = arr;
  revealIndex = 0;
  revealed    = false;
  done        = false;
}

export function getRevealState() {
  return {
    total:   personCount,
    current: revealIndex,
    revealed,
    done,
    teamIdx: assignments[revealIndex] ?? 0,
  };
}

export function tap() {
  if (done) return;
  if (!revealed) {
    revealed = true;
  } else if (revealIndex < personCount - 1) {
    revealIndex++;
    revealed = false;
  } else {
    done = true;
  }
}

// ── In-memory Fotos (niemals persistiert) ──────────────────
const _photos = []; // { personIdx, teamIdx, blobUrl }

export function addPhoto(personIdx, teamIdx, blobUrl) {
  _photos.push({ personIdx, teamIdx, blobUrl });
}

export function getLineup() {
  const dist = getPreviewDistribution();
  return Array.from({ length: teamCount }, (_, i) => ({
    idx:         i,
    name:        getTeamName(i),
    color:       getTeamColor(i),
    crest:       getTeamCrest(i),
    memberCount: dist[i].count,
    photos:      _photos.filter(p => p.teamIdx === i),
  }));
}

export function clearPhotos() {
  _photos.forEach(p => { try { URL.revokeObjectURL(p.blobUrl); } catch {} });
  _photos.length = 0;
}
