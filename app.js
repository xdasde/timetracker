import * as router from './js/router.js';
import * as ui from './js/ui.js';
import * as storage from './js/storage.js';
import * as match from './js/match.js';
import * as presets from './js/presets.js';
import { Stopwatch, fmtMs } from './js/stopwatch.js';
import * as timer from './js/timer.js';
import * as historyMod from './js/history.js';
import * as exportMod from './js/export.js';
import { playBeep } from './js/audio.js';
import { acquireWakeLock, releaseWakeLock } from './js/wakelock.js';
import * as teambuilder from './js/teambuilder.js';

// ═══════════════════════════════════════════════════════════
// SCREEN-REGISTRIERUNG
// ═══════════════════════════════════════════════════════════
router.register('screen-home', enterHome);
router.register('screen-presets', enterPresets);
router.register('screen-match-setup', enterSetup);
router.register('screen-match-live', enterLive, leaveLive);
router.register('screen-tools');
router.register('screen-history', () => historyMod.render(currentHistoryTab));
router.register('screen-settings');
router.register('screen-teambuilder', enterTeamBuilder);
router.register('screen-teambuilder-reveal', enterTeamBuilderReveal);
router.register('screen-teambuilder-lineup', enterLineup, leaveLineup);
router.register('screen-tb-match', enterTbMatch, leaveTbMatch);

// ═══════════════════════════════════════════════════════════
// TOP-NAV
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'home')    router.navigateTo('screen-home');
    if (tab === 'tools')   router.navigateTo('screen-tools');
    if (tab === 'history') router.navigateTo('screen-history');
  });
});

document.getElementById('btn-open-settings').addEventListener('click', () =>
  router.navigateTo('screen-settings'));

// ═══════════════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════════════
function enterHome() {
  const count = presets.getAll().length;
  const badge = document.getElementById('home-preset-badge');
  if (badge) badge.textContent = `${count} gespeichert`;
}

document.getElementById('btn-new-match').addEventListener('click', () =>
  router.navigateTo('screen-match-setup'));

document.getElementById('btn-open-presets').addEventListener('click', () =>
  router.navigateTo('screen-presets'));

document.getElementById('btn-goto-tools').addEventListener('click', () =>
  router.navigateTo('screen-tools'));

document.getElementById('btn-open-teambuilder').addEventListener('click', () =>
  router.navigateTo('screen-teambuilder'));

// ═══════════════════════════════════════════════════════════
// TEAMBILDUNG
// ═══════════════════════════════════════════════════════════

// ── Kamera ──────────────────────────────────────────────────
let _tbStream = null;
const _tbVideo  = document.getElementById('tb-camera');
const _tbCanvas = document.getElementById('tb-canvas');

function _tbPhotosEnabled() {
  return (storage.getItem('settings') || {}).tbPhotos !== false;
}

async function _tbStartCamera() {
  if (!_tbPhotosEnabled()) return;
  try {
    _tbStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      audio: false,
    });
    _tbVideo.srcObject = _tbStream;
    await _tbVideo.play();
  } catch {
    _tbStream = null;
  }
}

function _tbStopCamera() {
  if (_tbStream) {
    _tbStream.getTracks().forEach(t => t.stop());
    _tbStream = null;
    _tbVideo.srcObject = null;
  }
}

async function _tbCapturePhoto() {
  if (!_tbStream || !_tbVideo.videoWidth) return null;
  const size = 240;
  _tbCanvas.width  = size;
  _tbCanvas.height = size;
  const ctx  = _tbCanvas.getContext('2d');
  const vw   = _tbVideo.videoWidth;
  const vh   = _tbVideo.videoHeight;
  const side = Math.min(vw, vh);
  const sx   = (vw - side) / 2;
  const sy   = (vh - side) / 2;
  ctx.save();
  ctx.translate(size, 0);
  ctx.scale(-1, 1); // Frontkamera spiegeln
  ctx.drawImage(_tbVideo, sx, sy, side, side, 0, 0, size, size);
  ctx.restore();
  return new Promise(resolve => _tbCanvas.toBlob(resolve, 'image/jpeg', 0.8));
}

function _tbFlash() {
  const el = document.createElement('div');
  el.className = 'tb-flash';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

// ── Zähler & Vorschau ────────────────────────────────────────
function tbUpdateCounterUI() {
  document.getElementById('tb-persons-val').textContent = teambuilder.getPersonCount();
  document.getElementById('tb-teams-val').textContent   = teambuilder.getTeamCount();
  document.getElementById('tb-persons-dec').disabled    = teambuilder.getPersonCount() <= 2;
  document.getElementById('tb-teams-dec').disabled      = teambuilder.getTeamCount() <= 2;
  document.getElementById('tb-persons-inc').disabled    = teambuilder.getPersonCount() >= 50;
  document.getElementById('tb-teams-inc').disabled      = teambuilder.getTeamCount() >= 10;
  tbUpdatePreview();
}

function tbUpdatePreview() {
  const preview = document.getElementById('tb-preview');
  preview.replaceChildren();
  teambuilder.getPreviewDistribution().forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'tb-preview-chip';
    chip.style.background = t.color;
    chip.textContent = `${t.name} – ${t.count}×`;
    preview.appendChild(chip);
  });
}

function enterTeamBuilder() {
  tbUpdateCounterUI();
}

document.getElementById('btn-teambuilder-back').addEventListener('click', () => {
  teambuilder.clearPhotos();
  _tbStopCamera();
  router.navigateTo('screen-home');
});

document.getElementById('tb-persons-inc').addEventListener('click', () => {
  teambuilder.setPersonCount(teambuilder.getPersonCount() + 1);
  tbUpdateCounterUI();
});
document.getElementById('tb-persons-dec').addEventListener('click', () => {
  teambuilder.setPersonCount(teambuilder.getPersonCount() - 1);
  tbUpdateCounterUI();
});
document.getElementById('tb-teams-inc').addEventListener('click', () => {
  teambuilder.setTeamCount(teambuilder.getTeamCount() + 1);
  tbUpdateCounterUI();
});
document.getElementById('tb-teams-dec').addEventListener('click', () => {
  teambuilder.setTeamCount(teambuilder.getTeamCount() - 1);
  tbUpdateCounterUI();
});

document.getElementById('btn-teambuilder-start').addEventListener('click', async () => {
  teambuilder.generateAssignments();
  teambuilder.clearPhotos();
  await _tbStartCamera();
  router.navigateTo('screen-teambuilder-reveal');
});

// ── Reveal ───────────────────────────────────────────────────
function enterTeamBuilderReveal() {
  tbUpdateRevealUI();
}

function tbUpdateRevealUI() {
  const rs        = teambuilder.getRevealState();
  const revealEl  = document.getElementById('tb-reveal');
  const counterEl = document.getElementById('tb-reveal-counter');
  const promptEl  = document.getElementById('tb-reveal-prompt');
  const teamEl    = document.getElementById('tb-reveal-team');

  counterEl.classList.remove('hidden');
  counterEl.textContent = `${rs.current + 1} / ${rs.total}`;

  if (rs.revealed) {
    const color = teambuilder.getTeamColor(rs.teamIdx);
    const name  = teambuilder.getTeamName(rs.teamIdx);
    promptEl.classList.add('hidden');
    teamEl.classList.remove('hidden');
    teamEl.className = 'tb-reveal-team';
    teamEl.innerHTML =
      `<div class="tb-reveal-team-name">${name}</div>` +
      `<div class="tb-reveal-team-sub">Das ist dein Team!</div>`;
    revealEl.style.background = color;
  } else {
    promptEl.classList.remove('hidden');
    teamEl.classList.add('hidden');
    revealEl.style.background = '';
  }
}

document.getElementById('tb-reveal').addEventListener('click', async () => {
  const rs = teambuilder.getRevealState();
  if (rs.done) return;

  if (!rs.revealed) {
    // Foto aufnehmen beim ersten Tippen (TIPPEN! → Team anzeigen)
    _tbFlash();
    const blob = await _tbCapturePhoto();
    if (blob) {
      teambuilder.addPhoto(rs.current, rs.teamIdx, URL.createObjectURL(blob));
    }
    teambuilder.tap();
    tbUpdateRevealUI();
  } else {
    // Zweites Tippen: weiter oder Einteilung abschließen
    teambuilder.tap();
    if (teambuilder.getRevealState().done) {
      _tbStopCamera();
      router.navigateTo('screen-teambuilder-lineup');
    } else {
      tbUpdateRevealUI();
    }
  }
});

document.getElementById('btn-teambuilder-exit').addEventListener('click', e => {
  e.stopPropagation();
  teambuilder.clearPhotos();
  _tbStopCamera();
  router.navigateTo('screen-teambuilder');
});

// ── Lineup ───────────────────────────────────────────────────
function enterLineup() {
  const container = document.getElementById('tb-lineup');
  container.replaceChildren();

  teambuilder.getLineup().forEach(team => {
    const teamEl = document.createElement('div');
    teamEl.className = 'tb-lineup-team';

    const header = document.createElement('div');
    header.className = 'tb-lineup-team-header';
    header.style.background = team.color;
    header.textContent = team.name;
    teamEl.appendChild(header);

    const photosEl = document.createElement('div');
    photosEl.className = 'tb-lineup-photos';

    if (team.photos.length > 0) {
      team.photos.forEach((p, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'tb-lineup-photo-wrap';
        wrap.addEventListener('contextmenu', e => e.preventDefault());

        const photoDiv = document.createElement('div');
        photoDiv.className = 'tb-lineup-photo';

        const cnv = document.createElement('canvas');
        cnv.width  = 120;
        cnv.height = 120;
        cnv.addEventListener('contextmenu', e => e.preventDefault());

        const img = new Image();
        img.onload = () => {
          cnv.getContext('2d').drawImage(img, 0, 0, 120, 120);
        };
        img.src = p.blobUrl;

        photoDiv.appendChild(cnv);
        wrap.appendChild(photoDiv);

        const num = document.createElement('div');
        num.className = 'tb-lineup-person-num';
        num.textContent = `#${idx + 1}`;
        wrap.appendChild(num);
        photosEl.appendChild(wrap);
      });
    } else {
      // Kamera nicht verfügbar / deaktiviert: Platzhalter anzeigen
      for (let i = 0; i < team.memberCount; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'tb-lineup-photo-wrap';
        const ph = document.createElement('div');
        ph.className = 'tb-lineup-no-photo';
        ph.textContent = String(i + 1);
        wrap.appendChild(ph);
        const num = document.createElement('div');
        num.className = 'tb-lineup-person-num';
        num.textContent = `#${i + 1}`;
        wrap.appendChild(num);
        photosEl.appendChild(wrap);
      }
    }

    teamEl.appendChild(photosEl);
    container.appendChild(teamEl);
  });
}

function leaveLineup() {
  // Canvas-Inhalte sofort löschen wenn Screen verlassen wird
  document.getElementById('tb-lineup').replaceChildren();
}

document.getElementById('btn-lineup-done').addEventListener('click', () => {
  teambuilder.clearPhotos();
  router.navigateTo('screen-teambuilder');
});

document.getElementById('btn-lineup-match').addEventListener('click', () => {
  router.navigateTo('screen-tb-match');
});

// ── Teambuilder Match ────────────────────────────────────────
let _tbmScores  = [];
let _tbmRaf     = null;
let _tbmMs      = 0;
let _tbmRunning = false;
let _tbmTick0   = null;

function enterTbMatch() {
  const teams = teambuilder.getLineup();
  _tbmScores  = teams.map(() => 0);
  _tbmMs      = 0;
  _tbmRunning = true;
  _tbmTick0   = Date.now();
  _tbmRenderTeams(teams);
  _tbmRafLoop();
  acquireWakeLock();
  document.getElementById('tbm-timer-pill').classList.add('running');
}

function leaveTbMatch() {
  _tbmRunning = false;
  cancelAnimationFrame(_tbmRaf);
  _tbmRaf = null;
  releaseWakeLock();
}

function _tbmRafLoop() {
  cancelAnimationFrame(_tbmRaf);
  const tick = () => {
    if (_tbmRunning) _tbmMs = Date.now() - _tbmTick0;
    const s = Math.floor(_tbmMs / 1000);
    document.getElementById('tbm-time').textContent =
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    _tbmRaf = requestAnimationFrame(tick);
  };
  _tbmRaf = requestAnimationFrame(tick);
}

document.getElementById('tbm-timer-pill').addEventListener('click', () => {
  _tbmRunning = !_tbmRunning;
  if (_tbmRunning) _tbmTick0 = Date.now() - _tbmMs;
  document.getElementById('tbm-timer-pill').classList.toggle('running', _tbmRunning);
});

function _tbmRenderTeams(teams) {
  const container = document.getElementById('tbm-teams');
  container.replaceChildren();
  teams.forEach((team, ti) => {
    const card = document.createElement('div');
    card.className = 'tbm-team-card';

    // Header: name + score
    const header = document.createElement('div');
    header.className = 'tbm-team-header';
    header.style.background = team.color;
    const nameEl  = document.createElement('div');
    nameEl.className = 'tbm-team-name';
    nameEl.textContent = team.name;
    const scoreEl = document.createElement('div');
    scoreEl.className = 'tbm-score-display';
    scoreEl.id = `tbm-score-${ti}`;
    scoreEl.textContent = '0';
    header.append(nameEl, scoreEl);
    card.appendChild(header);

    // Photos row
    const photosEl = document.createElement('div');
    photosEl.className = 'tbm-team-photos';
    if (team.photos.length > 0) {
      team.photos.forEach(p => {
        const wrap = document.createElement('div');
        wrap.className = 'tbm-photo';
        wrap.addEventListener('contextmenu', e => e.preventDefault());
        const cnv = document.createElement('canvas');
        cnv.width = 92; cnv.height = 92;
        cnv.addEventListener('contextmenu', e => e.preventDefault());
        const img = new Image();
        img.onload = () => cnv.getContext('2d').drawImage(img, 0, 0, 92, 92);
        img.src = p.blobUrl;
        wrap.appendChild(cnv);
        photosEl.appendChild(wrap);
      });
    } else {
      for (let i = 0; i < team.memberCount; i++) {
        const ph = document.createElement('div');
        ph.className = 'tbm-no-photo';
        ph.textContent = String(i + 1);
        photosEl.appendChild(ph);
      }
    }
    card.appendChild(photosEl);

    // Score buttons
    const btns = document.createElement('div');
    btns.className = 'tbm-score-btns';
    const minusBtn = document.createElement('button');
    minusBtn.className = 'tbm-btn-score';
    minusBtn.textContent = '−';
    minusBtn.disabled = true;
    minusBtn.id = `tbm-minus-${ti}`;
    minusBtn.addEventListener('click', () => {
      _tbmScores[ti] = Math.max(0, _tbmScores[ti] - 1);
      _tbmUpdateScore(ti);
    });
    const plusBtn = document.createElement('button');
    plusBtn.className = 'tbm-btn-score';
    plusBtn.textContent = '+1';
    plusBtn.addEventListener('click', () => {
      _tbmScores[ti]++;
      _tbmUpdateScore(ti);
    });
    btns.append(minusBtn, plusBtn);
    card.appendChild(btns);
    container.appendChild(card);
  });
}

function _tbmUpdateScore(ti) {
  const el = document.getElementById(`tbm-score-${ti}`);
  if (el) el.textContent = _tbmScores[ti];
  const m = document.getElementById(`tbm-minus-${ti}`);
  if (m) m.disabled = _tbmScores[ti] === 0;
}

document.getElementById('btn-tbm-end').addEventListener('click', () => {
  _tbmRunning = false;
  cancelAnimationFrame(_tbmRaf);
  _tbmRaf = null;
  releaseWakeLock();
  _tbmShowWinner();
});

function _tbmShowWinner() {
  const teams    = teambuilder.getLineup();
  const maxScore = Math.max(..._tbmScores, 0);
  const winners  = teams.filter((_, i) => _tbmScores[i] === maxScore);

  const overlay = document.getElementById('tbm-winner-overlay');
  overlay.classList.remove('hidden');

  // Winner name(s)
  const nameEl = document.getElementById('tbm-winner-name');
  if (winners.length === 1) {
    nameEl.textContent  = winners[0].name;
    nameEl.style.color  = winners[0].color;
  } else {
    nameEl.textContent  = winners.map(w => w.name).join(' & ');
    nameEl.style.color  = 'white';
  }

  // Winner photos
  const photosEl = document.getElementById('tbm-winner-photos');
  photosEl.replaceChildren();
  winners.forEach(w => {
    if (w.photos.length > 0) {
      w.photos.forEach(p => {
        const wrap = document.createElement('div');
        wrap.className = 'tbm-photo';
        wrap.addEventListener('contextmenu', e => e.preventDefault());
        const cnv = document.createElement('canvas');
        cnv.width = 92; cnv.height = 92;
        cnv.addEventListener('contextmenu', e => e.preventDefault());
        const img = new Image();
        img.onload = () => cnv.getContext('2d').drawImage(img, 0, 0, 92, 92);
        img.src = p.blobUrl;
        wrap.appendChild(cnv);
        photosEl.appendChild(wrap);
      });
    } else {
      for (let i = 0; i < w.memberCount; i++) {
        const ph = document.createElement('div');
        ph.className = 'tbm-no-photo';
        ph.style.background = w.color;
        ph.style.color = 'white';
        ph.textContent = String(i + 1);
        photosEl.appendChild(ph);
      }
    }
  });

  // Konfetti-Animation
  _tbmConfetti(winners.length === 1 ? winners[0].color : '#f59e0b');
}

function _tbmConfetti(teamColor) {
  const canvas = document.getElementById('tbm-confetti');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx    = canvas.getContext('2d');
  const palette = [teamColor, '#FFD700', '#ffffff', '#FF6B6B', '#74C0FC', '#51CF66'];
  const pieces  = Array.from({ length: 180 }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * -canvas.height * 0.6,
    w:    Math.random() * 14 + 5,
    h:    Math.random() * 7  + 3,
    col:  palette[Math.floor(Math.random() * palette.length)],
    vy:   Math.random() * 3.5 + 1.5,
    vx:   (Math.random() - 0.5) * 2.2,
    rot:  Math.random() * 360,
    rotV: (Math.random() - 0.5) * 8,
  }));
  const t0 = Date.now();
  const DURATION = 5000;
  (function tick() {
    const elapsed = Date.now() - t0;
    if (elapsed >= DURATION) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = elapsed > 3500 ? 1 - (elapsed - 3500) / 1500 : 1;
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.rotV;
      if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    requestAnimationFrame(tick);
  })();
}

document.getElementById('btn-tbm-close').addEventListener('click', () => {
  document.getElementById('tbm-winner-overlay').classList.add('hidden');
  document.getElementById('tbm-teams').replaceChildren();
  teambuilder.clearPhotos();
  router.navigateTo('screen-teambuilder');
});

// ═══════════════════════════════════════════════════════════
// PRESETS SCREEN
// ═══════════════════════════════════════════════════════════
function enterPresets() {
  renderPresetList();
}

function renderPresetList() {
  presets.renderList(preset => {
    presets.openModal(
      preset,
      () => { renderPresetList(); enterHome(); },
      () => { renderPresetList(); enterHome(); }
    );
  });
}

document.getElementById('btn-presets-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));

document.getElementById('btn-preset-add').addEventListener('click', () => {
  presets.openModal(
    null,
    () => { renderPresetList(); enterHome(); },
    null
  );
});

// ═══════════════════════════════════════════════════════════
// MATCH SETUP
// ═══════════════════════════════════════════════════════════
function enterSetup() {
  match.initSetup();
  document.getElementById('team-a-name').value = '';
  document.getElementById('team-b-name').value = '';
  const selectColorIdx = buildColorPickers();
  buildPresetChips(selectColorIdx);
}

function buildColorPickers() {
  let selIdx = 0;
  const piA = document.getElementById('color-picker-a');
  const piB = document.getElementById('color-picker-b');
  piA.replaceChildren();
  piB.replaceChildren();

  match.COLORS.forEach((pair, i) => {
    const mkPill = (bg) => {
      const p = document.createElement('div');
      p.className = 'color-pill' + (i === 0 ? ' color-pill--active' : '');
      p.style.background = bg;
      p.dataset.i = i;
      p.setAttribute('role', 'radio');
      p.setAttribute('tabindex', '0');
      p.setAttribute('aria-checked', String(i === 0));
      return p;
    };
    piA.appendChild(mkPill(pair.a));
    piB.appendChild(mkPill(pair.b));
  });

  const selectIdx = idx => {
    selIdx = idx;
    piA.querySelectorAll('.color-pill').forEach((p, i) => {
      p.classList.toggle('color-pill--active', i === idx);
      p.setAttribute('aria-checked', String(i === idx));
    });
    piB.querySelectorAll('.color-pill').forEach((p, i) => {
      p.classList.toggle('color-pill--active', i === idx);
      p.setAttribute('aria-checked', String(i === idx));
    });
    match.setColorIndex(idx);
  };

  [piA, piB].forEach(pi => pi.addEventListener('click', e => {
    const pill = e.target.closest('.color-pill');
    if (pill) selectIdx(+pill.dataset.i);
  }));

  selectIdx(0);
  return selectIdx;
}

function buildPresetChips(selectColorIdx) {
  const strip = document.getElementById('setup-preset-strip');
  presets.renderChips(strip, preset => {
    document.getElementById('team-a-name').value = preset.teamA.name;
    document.getElementById('team-b-name').value = preset.teamB.name;
    match.setTeamName('a', preset.teamA.name);
    match.setTeamName('b', preset.teamB.name);
    selectColorIdx(preset.colorIndex ?? 0);
  });
}

document.getElementById('team-a-name').addEventListener('input', e =>
  match.setTeamName('a', e.target.value));
document.getElementById('team-b-name').addEventListener('input', e =>
  match.setTeamName('b', e.target.value));

document.getElementById('btn-setup-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));

document.getElementById('btn-start-match').addEventListener('click', () => {
  const s = match.getSetup();
  match.startMatch(
    document.getElementById('team-a-name').value.trim(),
    document.getElementById('team-b-name').value.trim(),
    s.colorIndex
  );
  router.navigateTo('screen-match-live');
});

// ═══════════════════════════════════════════════════════════
// MATCH LIVE
// ═══════════════════════════════════════════════════════════
let _matchRaf = null;

function enterLive() {
  const s = match.getLive();
  if (!s) return;
  document.getElementById('card-team-a').style.background = s.teamA.colorHex;
  document.getElementById('card-team-b').style.background = s.teamB.colorHex;
  document.getElementById('live-team-a-name').textContent = s.teamA.name;
  document.getElementById('live-team-b-name').textContent = s.teamB.name;
  updateScores();
  startMatchRaf();
  acquireWakeLock();
}

function leaveLive() {
  cancelAnimationFrame(_matchRaf);
  _matchRaf = null;
  releaseWakeLock();
}

function startMatchRaf() {
  cancelAnimationFrame(_matchRaf);
  const tick = () => {
    const ms = match.getElapsedMs();
    const s = Math.floor(ms / 1000);
    document.getElementById('match-time').textContent =
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    _matchRaf = requestAnimationFrame(tick);
  };
  _matchRaf = requestAnimationFrame(tick);
}

function updateScores() {
  const s = match.getLive();
  if (!s) return;
  const elA = document.getElementById('live-score-a');
  const elB = document.getElementById('live-score-b');
  elA.textContent = s.teamA.score;
  elB.textContent = s.teamB.score;
  elA.classList.toggle('team-score--leading', s.teamA.score > s.teamB.score);
  elB.classList.toggle('team-score--leading', s.teamB.score > s.teamA.score);
  document.getElementById('btn-minus-a').disabled = s.teamA.score === 0;
  document.getElementById('btn-minus-b').disabled = s.teamB.score === 0;
}

const pill = document.getElementById('match-timer-pill');
let _lp = null;
pill.addEventListener('pointerdown', () => {
  _lp = setTimeout(async () => {
    const ok = await ui.confirmAction('Spielzeit auf 00:00 zurücksetzen?');
    if (ok) match.resetTimer();
  }, 700);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  pill.addEventListener(ev, () => clearTimeout(_lp)));
pill.addEventListener('click', () => {
  const running = match.toggleTimer();
  pill.classList.toggle('running', running);
});

document.getElementById('btn-plus-a').addEventListener('click', () => { match.changeScore('a', 1); updateScores(); });
document.getElementById('btn-minus-a').addEventListener('click', () => { match.changeScore('a', -1); updateScores(); });
document.getElementById('btn-plus-b').addEventListener('click', () => { match.changeScore('b', 1); updateScores(); });
document.getElementById('btn-minus-b').addEventListener('click', () => { match.changeScore('b', -1); updateScores(); });

document.getElementById('btn-halftime').addEventListener('click', () => {
  const s = match.getLive();
  if (!s) return;

  const wasRunning = s.running;
  if (wasRunning) {
    match.toggleTimer();
    pill.classList.remove('running');
  }

  match.markHalfTime();
  const elMs  = match.getElapsedMs();
  const elMin = Math.floor(elMs / 60000);
  const elSec = Math.floor((elMs % 60000) / 1000);
  const elStr = `${String(elMin).padStart(2, '0')}:${String(elSec).padStart(2, '0')}`;

  ui.openModal('tmpl-modal-halftime', () => {
    document.getElementById('ht-score').textContent = `${s.teamA.score} : ${s.teamB.score}`;
    document.getElementById('ht-teams').textContent = `${s.teamA.name} vs. ${s.teamB.name}`;
    document.getElementById('ht-time').textContent  = `1. Halbzeit: ${elStr}`;

    document.getElementById('ht-back').onclick = () => {
      if (wasRunning) { match.toggleTimer(); pill.classList.add('running'); }
      ui.closeModal();
    };

    document.getElementById('ht-next').onclick = () => {
      match.resetTimer();
      ui.closeModal();
    };
  });
});

document.getElementById('btn-end-match').addEventListener('click', () => {
  const s = match.getLive();
  ui.openModal('tmpl-modal-match-end', () => {
    document.getElementById('m-score').textContent = `${s.teamA.score} : ${s.teamB.score}`;
    document.getElementById('m-teams').textContent = `${s.teamA.name} vs. ${s.teamB.name}`;

    document.getElementById('m-save').onclick = () => {
      match.saveMatch();
      ui.closeModal();
      currentHistoryTab = 'matches';
      router.navigateTo('screen-history');
      ui.showToast('Match gespeichert!');
    };

    document.getElementById('m-discard').onclick = async () => {
      const s2 = match.getLive();
      const hasContent = s2.teamA.score > 0 || s2.teamB.score > 0 || match.getElapsedMs() > 0;
      if (hasContent) {
        const ok = await ui.confirmAction('Match wirklich verwerfen?');
        if (!ok) return;
      }
      match.discardMatch();
      ui.closeModal();
      router.navigateTo('screen-home');
    };

    document.getElementById('m-cancel').onclick = ui.closeModal;
  });
});

// ═══════════════════════════════════════════════════════════
// STOPPUHREN
// ═══════════════════════════════════════════════════════════
const sw1 = new Stopwatch();
const sw2 = new Stopwatch();

function initSW(sw, containerId) {
  const c        = document.getElementById(containerId);
  const timeEl   = c.querySelector('.sw-time');
  const ssBtn    = c.querySelector('.btn-sw-startstop');
  const lapBtn   = c.querySelector('.btn-sw-lap');
  const saveBtn  = c.querySelector('.btn-sw-save');
  const resetBtn = c.querySelector('.btn-sw-reset');
  const lapList  = c.querySelector('.lap-list');
  const labelEl  = c.querySelector('.sw-label');
  let raf = null;

  const tick = () => {
    timeEl.textContent = fmtMs(sw.getMs());
    if (sw.isRunning()) raf = requestAnimationFrame(tick);
  };

  const sync = () => {
    const running = sw.isRunning();
    ssBtn.textContent = running ? 'Stop' : 'Start';
    ssBtn.classList.toggle('btn-sw--active', running);
    lapBtn.disabled = !running;
    lapList.replaceChildren();
    sw.laps.slice(-5).forEach((ms, i) => {
      const li = document.createElement('li');
      li.textContent = `R${sw.laps.length - sw.laps.slice(-5).length + i + 1}: ${fmtMs(ms)}`;
      lapList.appendChild(li);
    });
  };

  ssBtn.addEventListener('click', () => {
    sw.toggle();
    sync();
    if (sw.isRunning()) {
      acquireWakeLock();
      raf = requestAnimationFrame(tick);
    } else {
      releaseWakeLock();
      cancelAnimationFrame(raf);
    }
  });

  lapBtn.addEventListener('click', () => { sw.lap(); sync(); });

  saveBtn.addEventListener('click', () => {
    const def = `Lauf vom ${new Date().toLocaleDateString('de-DE')}, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    ui.openModal('tmpl-modal-sw-save', () => {
      const input = document.getElementById('sw-save-input');
      input.value = labelEl.value || def;

      document.getElementById('sw-save-ok').onclick = () => {
        const label = input.value.trim() || def;
        storage.addToCollection('stopwatches', {
          id: `sw_${Date.now()}`,
          createdAt: Date.now(),
          label,
          totalMs: sw.getMs(),
          laps: [...sw.laps],
        });
        cancelAnimationFrame(raf);
        releaseWakeLock();
        sw.reset();
        labelEl.value = '';
        timeEl.textContent = fmtMs(0);
        sync();
        ui.closeModal();
        ui.showToast('Stoppuhr gespeichert!');
      };
      document.getElementById('sw-save-cancel').onclick = ui.closeModal;
    });
  });

  resetBtn.addEventListener('click', async () => {
    if (sw.hasContent()) {
      const ok = await ui.confirmAction('Stoppuhr zurücksetzen? Alle Runden gehen verloren.');
      if (!ok) return;
    }
    cancelAnimationFrame(raf);
    releaseWakeLock();
    sw.reset();
    timeEl.textContent = fmtMs(0);
    sync();
  });
}

initSW(sw1, 'stopwatch-1');
initSW(sw2, 'stopwatch-2');

// ═══════════════════════════════════════════════════════════
// COUNTDOWN-TIMER
// ═══════════════════════════════════════════════════════════
const ITEM_H = 60;

function buildWheel(el, count) {
  if (el.childElementCount) return;
  const pad = () => {
    const d = document.createElement('div');
    d.className = 'wheel-item';
    d.style.height = `${ITEM_H}px`;
    return d;
  };
  el.appendChild(pad());
  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'wheel-item';
    item.textContent = String(i).padStart(2, '0');
    item.setAttribute('role', 'option');
    el.appendChild(item);
  }
  el.appendChild(pad());
}

function getWheelVal(el) {
  return Math.min(59, Math.round(el.scrollTop / ITEM_H));
}

const wMin = document.getElementById('wheel-minutes');
const wSec = document.getElementById('wheel-seconds');
buildWheel(wMin, 60);
buildWheel(wSec, 60);
setTimeout(() => { wMin.scrollTop = 0; wSec.scrollTop = 0; }, 80);

function syncTimerUI() {
  const s = timer.getState();
  const picking = s === 'picking';
  const running = s === 'running';
  const paused  = s === 'paused';
  document.getElementById('timer-picker').classList.toggle('hidden', !picking);
  document.getElementById('timer-display').classList.toggle('hidden', picking);
  document.getElementById('btn-timer-start').classList.toggle('hidden', !picking);
  document.getElementById('btn-timer-pause').classList.toggle('hidden', !running);
  document.getElementById('btn-timer-resume').classList.toggle('hidden', !paused);
  document.getElementById('btn-timer-reset').classList.toggle('hidden', picking);
}

function onTimerTick(ms) {
  document.getElementById('timer-countdown').textContent = timer.fmtMs(ms);
  document.getElementById('timer-display').classList.toggle('ending', ms < 10000);
}

function onTimerDone() {
  const cfg = storage.getItem('settings') || {};
  if (cfg.sound !== false) playBeep();
  if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  releaseWakeLock();
  ui.showToast('Timer abgelaufen!', 3000);
  syncTimerUI();
  setTimeout(() => { timer.reset(); syncTimerUI(); }, 3000);
}

document.getElementById('btn-timer-start').addEventListener('click', () => {
  const ms = (getWheelVal(wMin) * 60 + getWheelVal(wSec)) * 1000;
  if (ms === 0) return;
  timer.setDuration(ms);
  timer.start(onTimerTick, onTimerDone);
  acquireWakeLock();
  syncTimerUI();
});

document.getElementById('btn-timer-pause').addEventListener('click', () => {
  timer.pause();
  releaseWakeLock();
  syncTimerUI();
});

document.getElementById('btn-timer-resume').addEventListener('click', () => {
  timer.resume(onTimerTick, onTimerDone);
  acquireWakeLock();
  syncTimerUI();
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
  timer.reset();
  releaseWakeLock();
  syncTimerUI();
});

document.getElementById('btn-timer-save-preset').addEventListener('click', () => {
  const s = timer.getState();
  const ms = s === 'picking'
    ? (getWheelVal(wMin) * 60 + getWheelVal(wSec)) * 1000
    : timer.getTargetMs();
  if (ms === 0) return;

  ui.openModal('tmpl-modal-timer-preset', () => {
    document.getElementById('tp-ok').onclick = () => {
      const label = document.getElementById('timer-preset-input').value.trim() || 'Timer';
      storage.addToCollection('timers', {
        id: `tm_${Date.now()}`,
        createdAt: Date.now(),
        label,
        durationMs: ms,
      });
      ui.closeModal();
      ui.showToast('Preset gespeichert!');
    };
    document.getElementById('tp-cancel').onclick = ui.closeModal;
  });
});

// ═══════════════════════════════════════════════════════════
// VERLAUF / LOG
// ═══════════════════════════════════════════════════════════
let currentHistoryTab = 'matches';

document.querySelectorAll('.history-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.history-tab').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    t.classList.add('active');
    t.setAttribute('aria-selected', 'true');
    currentHistoryTab = t.dataset.tab;
    historyMod.render(currentHistoryTab);
  });
});

document.getElementById('btn-export').addEventListener('click', () => {
  ui.openModal('tmpl-modal-export', () => {
    document.getElementById('exp-matches-csv').onclick = () => { exportMod.exportMatchesCSV(); ui.closeModal(); };
    document.getElementById('exp-sw-csv').onclick = () => { exportMod.exportStopwatchesCSV(); ui.closeModal(); };
    document.getElementById('exp-json').onclick = () => { exportMod.exportAllJSON(); ui.closeModal(); };
  });
});

// ═══════════════════════════════════════════════════════════
// EINSTELLUNGEN
// ═══════════════════════════════════════════════════════════
function initSettings() {
  const cfg = storage.getItem('settings') || { sound: true, vibration: true, tbPhotos: true };
  document.getElementById('toggle-sound').checked     = cfg.sound     !== false;
  document.getElementById('toggle-vibration').checked = cfg.vibration !== false;
  document.getElementById('toggle-tb-photos').checked = cfg.tbPhotos  !== false;

  document.getElementById('toggle-sound').addEventListener('change', e => {
    const c = storage.getItem('settings') || {};
    c.sound = e.target.checked;
    storage.setItem('settings', c);
  });

  document.getElementById('toggle-vibration').addEventListener('change', e => {
    const c = storage.getItem('settings') || {};
    c.vibration = e.target.checked;
    storage.setItem('settings', c);
  });

  document.getElementById('toggle-tb-photos').addEventListener('change', e => {
    const c = storage.getItem('settings') || {};
    c.tbPhotos = e.target.checked;
    storage.setItem('settings', c);
  });

  document.getElementById('btn-restore-presets').addEventListener('click', () => {
    storage.removeItem('hiddenPresets');
    ui.showToast('Standard-Presets wiederhergestellt!');
  });

  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    const ok1 = await ui.confirmAction('Wirklich alle gespeicherten Daten löschen?');
    if (!ok1) return;
    const ok2 = await ui.confirmAction('Nicht rückgängig zu machen. Wirklich fortfahren?');
    if (!ok2) return;
    storage.clearAll();
    ui.showToast('Alle Daten gelöscht.');
    initSettings();
  });
}

document.getElementById('btn-settings-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));

// ═══════════════════════════════════════════════════════════
// MODAL SCHLIESSEN
// ═══════════════════════════════════════════════════════════
document.getElementById('modal-close').addEventListener('click', ui.closeModal);
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target.id === 'modal-backdrop') ui.closeModal();
});

// ═══════════════════════════════════════════════════════════
// SESSION-RECOVERY
// ═══════════════════════════════════════════════════════════
function checkSession() {
  const s = match.checkSession();
  if (!s) return;
  const banner = document.getElementById('session-banner');
  banner.classList.remove('hidden');
  document.getElementById('btn-restore').addEventListener('click', () => {
    banner.classList.add('hidden');
    match.restoreSession(s);
    router.navigateTo('screen-match-live');
  }, { once: true });
  document.getElementById('btn-discard-session').addEventListener('click', () => {
    banner.classList.add('hidden');
    match.discardMatch();
  }, { once: true });
}

// ═══════════════════════════════════════════════════════════
// INSTALL-BANNER
// ═══════════════════════════════════════════════════════════
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  if (!storage.getItem('installDismissed')) {
    document.getElementById('install-banner').classList.remove('hidden');
  }
});

document.getElementById('btn-install').addEventListener('click', async () => {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  await _deferredInstall.userChoice;
  _deferredInstall = null;
  document.getElementById('install-banner').classList.add('hidden');
});

document.getElementById('btn-dismiss-install').addEventListener('click', () => {
  document.getElementById('install-banner').classList.add('hidden');
  storage.setItem('installDismissed', true);
});

// ═══════════════════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
initSettings();
checkSession();
router.navigateTo('screen-home');
