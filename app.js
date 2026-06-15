import * as router from './js/router.js';
import * as ui from './js/ui.js';
import * as storage from './js/storage.js';
import * as match from './js/match.js';
import * as presets from './js/presets.js';
import { Stopwatch, fmtMs } from './js/stopwatch.js';
import { Countdown } from './js/timer.js';
import * as historyMod from './js/history.js';
import * as exportMod from './js/export.js';
import { playBeep, playWhistle, playGoal, playMatchEnd, playCountdownTick } from './js/audio.js';
import { acquireWakeLock, releaseWakeLock } from './js/wakelock.js';
import * as teambuilder from './js/teambuilder.js';
import * as rules from './js/rules.js';
import * as customgames from './js/customgames.js';
import * as theme from './js/theme.js';

// Gespeichertes Vereins-Design so früh wie möglich anwenden.
theme.initTheme();

// ═══════════════════════════════════════════════════════════
// SCREEN-REGISTRIERUNG
// ═══════════════════════════════════════════════════════════
router.register('screen-home', enterHome);
router.register('screen-presets', enterPresets);
router.register('screen-match-setup', enterSetup);
router.register('screen-match-live', enterLive, leaveLive);
router.register('screen-tools');
router.register('screen-history', () => historyMod.render(currentHistoryTab));
router.register('screen-settings', () => renderRouletteExclusion());
router.register('screen-teambuilder', enterTeamBuilder);
router.register('screen-teambuilder-reveal', enterTeamBuilderReveal);
router.register('screen-teambuilder-lineup', enterLineup, leaveLineup);
router.register('screen-tb-match', enterTbMatch, leaveTbMatch);
router.register('screen-rules', enterRules);
router.register('screen-roulette', enterRoulette);

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

document.getElementById('btn-goto-log').addEventListener('click', () =>
  router.navigateTo('screen-history'));

document.getElementById('btn-open-rules').addEventListener('click', () =>
  router.navigateTo('screen-rules'));

document.getElementById('btn-open-roulette').addEventListener('click', () =>
  router.navigateTo('screen-roulette'));

// ═══════════════════════════════════════════════════════════
// TEAMBILDUNG
// ═══════════════════════════════════════════════════════════

// ── Kamera ──────────────────────────────────────────────────
let _tbStream = null;
const _tbVideo  = document.getElementById('tb-camera');
const _tbCanvas = document.getElementById('tb-canvas');

function _tbPhotosEnabled() {
  return (storage.getItem('settings') || {}).tbPhotos === true;
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
  return new Promise(resolve => _tbCanvas.toBlob(blob => {
    _tbCanvas.getContext('2d').clearRect(0, 0, _tbCanvas.width, _tbCanvas.height);
    resolve(blob);
  }, 'image/jpeg', 0.8));
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
  document.getElementById('tbm-winner-photos').replaceChildren();
  document.getElementById('tbm-teams').replaceChildren();
  teambuilder.clearPhotos();
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

  // Konfetti-Animation (Standardfarbe folgt dem aktiven Akzent/Vereins-Design)
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-amber').trim() || '#f59e0b';
  _tbmConfetti(winners.length === 1 ? winners[0].color : accent);
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
  document.getElementById('tbm-winner-photos').replaceChildren();
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
  presets.renderList(
    preset => {
      presets.openModal(
        preset,
        () => { renderPresetList(); enterHome(); },
        () => { renderPresetList(); enterHome(); }
      );
    },
    preset => {
      // "?"-Button: direkt zur passenden Regel springen
      router.navigateTo('screen-rules');
      if (preset?.rulesKey) {
        requestAnimationFrame(() => {
          const target = document.querySelector(`.rules-item[data-rules-key="${preset.rulesKey}"] .rules-item-header`);
          if (target && target.getAttribute('aria-expanded') === 'false') target.click();
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  );
}

document.getElementById('btn-presets-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));

document.getElementById('btn-rules-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));

document.getElementById('btn-preset-add').addEventListener('click', () => {
  presets.openModal(
    null,
    () => { renderPresetList(); enterHome(); },
    null
  );
});

// ═══════════════════════════════════════════════════════════
// DATENBANK SCREEN (Spiele / Sportarten / Übungen, durchsuchbar)
// ═══════════════════════════════════════════════════════════
const RULES_KIND_FILTERS = [
  { key: 'all',    label: 'Alle',     icon: '📚' },
  { key: 'sport',  label: 'Sportart', icon: '🏆' },
  { key: 'spiel',  label: 'Spiel',    icon: '🎮' },
  { key: 'uebung', label: 'Übung',    icon: '🤸' },
];
const RULES_DIFF_FILTERS = [
  { key: 'all',     label: 'Alle Stufen' },
  { key: 'einfach', label: 'Einfach' },
  { key: 'mittel',  label: 'Mittel' },
  { key: 'schwer',  label: 'Schwer' },
];
const _rulesFilter = { search: '', kind: 'all', diff: 'all' };
let _rulesWired = false;

function enterRules() {
  // Beim Betreten Filter zurücksetzen (sorgt u. a. dafür, dass der "?"-Sprung
  // aus den Presets jeden Eintrag findet).
  _rulesFilter.search = '';
  _rulesFilter.kind = 'all';
  _rulesFilter.diff = 'all';
  const searchInput = document.getElementById('rules-search');
  if (searchInput) searchInput.value = '';

  if (!_rulesWired) {
    _rulesWired = true;
    searchInput?.addEventListener('input', e => {
      _rulesFilter.search = e.target.value.trim().toLowerCase();
      renderRulesList();
    });
  }
  buildRulesFilterChips();
  renderRulesList();
}

function buildRulesFilterChips() {
  const kindRow = document.getElementById('rules-filter-kind');
  const diffRow = document.getElementById('rules-filter-diff');
  const build = (row, options, stateKey) => {
    if (!row) return;
    row.replaceChildren();
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = _rulesFilter[stateKey] === opt.key;
      btn.className = 'roulette-cat-chip' + (active ? ' roulette-cat-chip--active' : '');
      btn.textContent = opt.icon ? `${opt.icon} ${opt.label}` : opt.label;
      btn.setAttribute('aria-pressed', String(active));
      btn.addEventListener('click', () => {
        _rulesFilter[stateKey] = opt.key;
        buildRulesFilterChips();
        renderRulesList();
      });
      row.appendChild(btn);
    });
  };
  build(kindRow, RULES_KIND_FILTERS, 'kind');
  build(diffRow, RULES_DIFF_FILTERS, 'diff');
}

function rulesMatchesFilter(rule) {
  if (_rulesFilter.kind !== 'all' && rule.kind !== _rulesFilter.kind) return false;
  if (_rulesFilter.diff !== 'all' && rule.difficulty !== _rulesFilter.diff) return false;
  const q = _rulesFilter.search;
  if (!q) return true;
  const hay = [rule.name, rule.scoring, rule.structure, (rule.material || []).join(' '),
    (rule.basics || []).join(' ')].join(' ').toLowerCase();
  return hay.includes(q);
}

const KIND_LABELS = { sport: 'Sportart', spiel: 'Spiel', uebung: 'Übung' };

function renderRulesList() {
  const list = document.getElementById('rules-list');
  if (!list) return;
  list.replaceChildren();

  const matches = rules.getAllRules().filter(rulesMatchesFilter);

  const countEl = document.getElementById('rules-count');
  if (countEl) countEl.textContent =
    `${matches.length} ${matches.length === 1 ? 'Eintrag' : 'Einträge'}`;
  const emptyEl = document.getElementById('rules-empty');
  if (emptyEl) emptyEl.classList.toggle('hidden', matches.length > 0);

  matches.forEach(rule => {
    const item = document.createElement('div');
    item.className = 'rules-item';
    item.setAttribute('role', 'listitem');
    item.dataset.rulesKey = rule.key;

    const header = document.createElement('button');
    header.className = 'rules-item-header';
    header.setAttribute('aria-expanded', 'false');
    header.innerHTML = `<span class="rules-item-icon" aria-hidden="true">${rule.icon}</span><span class="rules-item-name">${rule.name}</span><span class="rules-item-sub">${rule.structure.split('+')[0].trim()}</span><svg class="rules-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

    const body = document.createElement('div');
    body.className = 'rules-item-body';

    // Badge-Zeile: Art, Schwierigkeit, Altersgruppe
    const badges = document.createElement('div');
    badges.className = 'rules-badges';
    const addBadge = (text, cls) => {
      if (!text) return;
      const b = document.createElement('span');
      b.className = 'rules-badge' + (cls ? ` ${cls}` : '');
      b.textContent = text;
      badges.appendChild(b);
    };
    addBadge(KIND_LABELS[rule.kind], 'rules-badge--kind');
    if (rule.difficulty) addBadge(rule.difficulty, `rules-badge--diff-${rule.difficulty}`);
    addBadge(rule.ageGroup);
    if (rule.custom) addBadge('Eigenes', 'rules-badge--custom');

    const scoring = document.createElement('div');
    scoring.className = 'rules-scoring';
    scoring.textContent = `Wertung: ${rule.scoring}`;

    const structure = document.createElement('div');
    structure.className = 'rules-structure';
    structure.textContent = `Aufbau: ${rule.structure}`;

    const ul = document.createElement('ul');
    ul.className = 'rules-basics';
    rule.basics.forEach(b => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });

    body.append(badges, scoring, structure, ul);

    if (rule.material && rule.material.length) {
      const mat = document.createElement('div');
      mat.className = 'rules-material';
      const matLabel = document.createElement('strong');
      matLabel.textContent = 'Material: ';
      mat.append(matLabel, document.createTextNode(rule.material.join(', ')));
      body.appendChild(mat);
    }

    const tipEl = document.createElement('div');
    tipEl.className = 'rules-tip';
    const tipLabel = document.createElement('strong');
    tipLabel.textContent = 'App-Tipp: ';
    tipEl.append(tipLabel, document.createTextNode(rule.tip));
    body.appendChild(tipEl);

    // Aktionen für eigene (lokal angelegte) Einträge
    if (rule.custom) {
      const actions = document.createElement('div');
      actions.className = 'rules-custom-actions';
      const mkBtn = (label, cls, handler) => {
        const btn = document.createElement('button');
        btn.className = cls;
        btn.textContent = label;
        btn.addEventListener('click', e => { e.stopPropagation(); handler(); });
        return btn;
      };
      actions.append(
        mkBtn('Bearbeiten', 'rules-custom-btn', () => openContributeModal(rule.key)),
        mkBtn('Einreichen', 'rules-custom-btn', () => {
          const g = customgames.getById(rule.key);
          if (g) window.open(customgames.prefillUrl(g), '_blank', 'noopener');
        }),
        mkBtn('Löschen', 'rules-custom-btn rules-custom-btn--danger', async () => {
          const ok = await ui.confirmAction(`"${rule.name}" wirklich löschen?`);
          if (!ok) return;
          customgames.remove(rule.key);
          ui.showToast('Eigenes Spiel gelöscht');
          renderRulesList();
        }),
      );
      body.appendChild(actions);
    }

    item.append(header, body);
    list.appendChild(item);

    header.addEventListener('click', () => {
      const isOpen = body.classList.toggle('rules-item-body--open');
      header.setAttribute('aria-expanded', String(isOpen));
      item.classList.toggle('rules-item--open', isOpen);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// EIGENES SPIEL ANLEGEN / BEITRAGEN
// ═══════════════════════════════════════════════════════════
const CG_PAIR_COLORS = [
  { a: '#0F6E56', b: '#FF6B5B' },
  { a: '#2563EB', b: '#DC2626' },
  { a: '#7C3AED', b: '#D97706' },
  { a: '#374151', b: '#059669' },
];
const CG_DURATION_OPTIONS = [
  { label: 'Kein Limit', ms: null }, { label: '5 Min', ms: 300000 },
  { label: '10 Min', ms: 600000 }, { label: '15 Min', ms: 900000 },
  { label: '20 Min', ms: 1200000 }, { label: '30 Min', ms: 1800000 },
  { label: '40 Min', ms: 2400000 }, { label: '45 Min', ms: 2700000 },
];
const CG_BREAK_OPTIONS = [
  { label: 'Keine', ms: null }, { label: '1 Min', ms: 60000 },
  { label: '5 Min', ms: 300000 }, { label: '10 Min', ms: 600000 },
];
const CG_KINDS = [
  { key: 'sport', label: '🏆 Sportart' },
  { key: 'spiel', label: '🎮 Spiel' },
  { key: 'uebung', label: '🤸 Übung' },
];
const CG_DIFFS = [
  { key: 'einfach', label: 'Einfach' },
  { key: 'mittel', label: 'Mittel' },
  { key: 'schwer', label: 'Schwer' },
];

function cgTimeChips(container, options, selected, onPick) {
  container.replaceChildren();
  const norm = v => v || null;
  const btns = [];
  const setActive = ms => btns.forEach(({ b, m }) =>
    b.classList.toggle('duration-chip--active', norm(m) === norm(ms)));
  options.forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'duration-chip';
    b.textContent = opt.label;
    b.addEventListener('click', () => { setActive(opt.ms); onPick(opt.ms); });
    container.appendChild(b);
    btns.push({ b, m: opt.ms });
  });
  setActive(selected);
}

function cgChipGroup(container, options, getVal, setVal, multi = false) {
  container.replaceChildren();
  options.forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    const active = multi ? getVal().includes(opt.key) : getVal() === opt.key;
    b.className = 'roulette-cat-chip' + (active ? ' roulette-cat-chip--active' : '');
    b.textContent = opt.label;
    b.addEventListener('click', () => {
      if (multi) {
        const arr = getVal();
        const i = arr.indexOf(opt.key);
        if (i >= 0) arr.splice(i, 1); else arr.push(opt.key);
        b.classList.toggle('roulette-cat-chip--active');
      } else {
        setVal(opt.key);
        container.querySelectorAll('.roulette-cat-chip').forEach(c =>
          c.classList.remove('roulette-cat-chip--active'));
        b.classList.add('roulette-cat-chip--active');
      }
    });
    container.appendChild(b);
  });
}

function openContributeModal(existingId = null) {
  const existing = existingId ? customgames.getById(existingId) : null;
  const editing = existing ? { ...existing, categories: [...existing.categories], material: [...existing.material] } : {
    id: null, name: '', icon: '🎯', kind: 'spiel', categories: [], difficulty: 'einfach',
    ageGroup: null, material: [], players: null, teamA: 'Team A', teamB: 'Team B',
    colorIndex: 0, durationMs: null, breakMs: null, periods: 1, periodLabel: 'Halbzeit',
    structure: '', scoring: '', basics: [], tip: '', source: null,
  };

  ui.openModal('tmpl-modal-contribute', () => {
    const $ = id => document.getElementById(id);
    $('cg-title').textContent = existing ? 'Spiel bearbeiten' : 'Eigenes Spiel';
    $('cg-name').value = editing.name;
    $('cg-icon').value = editing.icon;
    $('cg-team-a').value = editing.teamA;
    $('cg-team-b').value = editing.teamB;
    $('cg-structure').value = editing.structure;
    $('cg-scoring').value = editing.scoring;
    $('cg-basics').value = editing.basics.join('\n');
    $('cg-tip').value = editing.tip;
    $('cg-material').value = editing.material.join(', ');
    $('cg-age').value = editing.ageGroup || '';
    $('cg-players').value = editing.players || '';
    $('cg-source').value = editing.source || '';

    cgChipGroup($('cg-kind'), CG_KINDS, () => editing.kind, v => { editing.kind = v; });
    cgChipGroup($('cg-diff'), CG_DIFFS, () => editing.difficulty, v => { editing.difficulty = v; });
    cgChipGroup($('cg-cats'), [
      { key: 'lauf', label: '🏃 Laufspiel' }, { key: 'ball', label: '⚽ Ballspiel' },
      { key: 'team', label: '👥 Teamspiel' },
    ], () => editing.categories, null, true);

    const colorRow = $('cg-colors');
    colorRow.replaceChildren();
    CG_PAIR_COLORS.forEach((pair, i) => {
      [pair.a, pair.b].forEach(c => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'color-dot' + (i === editing.colorIndex ? ' color-dot--active' : '');
        dot.style.background = c;
        dot.addEventListener('click', () => {
          editing.colorIndex = i;
          colorRow.querySelectorAll('.color-dot').forEach(d => d.classList.remove('color-dot--active'));
          colorRow.querySelectorAll('.color-dot').forEach((d, di) => {
            if (Math.floor(di / 2) === i) d.classList.add('color-dot--active');
          });
        });
        colorRow.appendChild(dot);
      });
    });

    cgTimeChips($('cg-duration'), CG_DURATION_OPTIONS, editing.durationMs, ms => { editing.durationMs = ms; });
    cgTimeChips($('cg-break'), CG_BREAK_OPTIONS, editing.breakMs, ms => { editing.breakMs = ms; });

    $('cg-cancel').onclick = ui.closeModal;
    $('cg-save').onclick = () => {
      editing.name = $('cg-name').value.trim();
      editing.icon = $('cg-icon').value.trim() || '🎯';
      editing.teamA = $('cg-team-a').value.trim() || 'Team A';
      editing.teamB = $('cg-team-b').value.trim() || 'Team B';
      editing.structure = $('cg-structure').value.trim();
      editing.scoring = $('cg-scoring').value.trim();
      editing.basics = $('cg-basics').value.split('\n').map(s => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean);
      editing.tip = $('cg-tip').value.trim();
      editing.material = $('cg-material').value.split(',').map(s => s.trim()).filter(Boolean);
      editing.ageGroup = $('cg-age').value.trim() || null;
      editing.players = $('cg-players').value.trim() || null;
      editing.source = $('cg-source').value.trim() || null;
      editing.id = editing.id || customgames.uniqueId(editing.name);

      const errors = customgames.validate(editing);
      const errEl = $('cg-error');
      if (errors.length) {
        errEl.textContent = errors.join(' ');
        errEl.classList.remove('hidden');
        errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      errEl.classList.add('hidden');

      const entry = { ...editing, custom: true };
      customgames.save(entry);
      ui.showToast('Eigenes Spiel gespeichert!');

      // Zur Einreichen-Ansicht wechseln
      $('cg-actions').classList.add('hidden');
      $('cg-submit').classList.remove('hidden');
      $('cg-pr').onclick = () => window.open(customgames.prefillUrl(entry), '_blank', 'noopener');
      $('cg-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(customgames.toMarkdown(entry)); ui.showToast('Markdown kopiert'); }
        catch { ui.showToast('Kopieren nicht möglich'); }
      };
      $('cg-download').onclick = () => {
        const blob = new Blob([customgames.toMarkdown(entry)], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${entry.id}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
      $('cg-done').onclick = () => { ui.closeModal(); renderRulesList(); };
    };
  });
}

document.getElementById('btn-rules-add').addEventListener('click', () => openContributeModal());

// ═══════════════════════════════════════════════════════════
// SPIEL-ROULETTE
// ═══════════════════════════════════════════════════════════
let _rouletteCategory = 'all';
let _rouletteResult   = null;   // aktuell ausgelostes Preset
let _rouletteSpinning = false;

function _getRouletteExcluded() {
  return (storage.getItem('settings') || {}).rouletteExcluded || [];
}

function enterRoulette() {
  _rouletteSpinning = false;
  buildRouletteCats();
  resetRouletteDisplay();
}

function buildRouletteCats() {
  const row = document.getElementById('roulette-cats');
  if (!row) return;
  row.replaceChildren();
  presets.ROULETTE_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'roulette-cat-chip' + (cat.key === _rouletteCategory ? ' roulette-cat-chip--active' : '');
    btn.textContent = `${cat.icon} ${cat.label}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(cat.key === _rouletteCategory));
    btn.addEventListener('click', () => {
      if (_rouletteSpinning) return;
      _rouletteCategory = cat.key;
      buildRouletteCats();
      resetRouletteDisplay();
    });
    row.appendChild(btn);
  });
}

function _setRouletteFace(icon, name, meta) {
  document.getElementById('roulette-icon').textContent = icon;
  document.getElementById('roulette-name').textContent = name;
  document.getElementById('roulette-meta').textContent = meta ?? '';
}

function resetRouletteDisplay() {
  _rouletteResult = null;
  const candidates = presets.getRouletteCandidates(_rouletteCategory, _getRouletteExcluded());
  const display = document.getElementById('roulette-display');
  display.classList.remove('roulette-display--win', 'roulette-display--spin');
  document.getElementById('roulette-result-actions').classList.add('hidden');
  const spinBtn = document.getElementById('btn-roulette-spin');
  const empty = document.getElementById('roulette-empty');
  if (candidates.length === 0) {
    empty.classList.remove('hidden');
    spinBtn.disabled = true;
    _setRouletteFace('🎲', 'Keine Spiele', '—');
  } else {
    empty.classList.add('hidden');
    spinBtn.disabled = false;
    _setRouletteFace('🎲', 'Bereit?', `${candidates.length} Spiele im Topf`);
  }
}

function spinRoulette() {
  if (_rouletteSpinning) return;
  const candidates = presets.getRouletteCandidates(_rouletteCategory, _getRouletteExcluded());
  if (candidates.length === 0) return;

  _rouletteSpinning = true;
  _rouletteResult = null;
  const cfg = storage.getItem('settings') || {};
  const display = document.getElementById('roulette-display');
  display.classList.remove('roulette-display--win');
  display.classList.add('roulette-display--spin');
  document.getElementById('roulette-result-actions').classList.add('hidden');
  document.getElementById('btn-roulette-spin').disabled = true;

  const final = candidates[Math.floor(Math.random() * candidates.length)];
  const totalTicks = 16 + Math.floor(Math.random() * Math.max(1, candidates.length));
  let ticks = 0;
  let delay = 55;

  const step = () => {
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    _setRouletteFace(p.icon, p.name, '…');
    if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate(6);
    ticks++;
    if (ticks >= totalTicks) { _finishSpin(final); return; }
    if (ticks > totalTicks - 6) delay += 45; // gegen Ende abbremsen
    setTimeout(step, delay);
  };
  step();
}

function _finishSpin(preset) {
  _rouletteResult = preset;
  _rouletteSpinning = false;
  const display = document.getElementById('roulette-display');
  display.classList.remove('roulette-display--spin');
  display.classList.add('roulette-display--win');
  const meta = [];
  if (preset.durationMs) meta.push(`${Math.floor(preset.durationMs / 60000)} Min.`);
  meta.push(`${preset.teamA.name} vs. ${preset.teamB.name}`);
  _setRouletteFace(preset.icon, preset.name, meta.join(' · '));
  document.getElementById('roulette-result-actions').classList.remove('hidden');
  document.getElementById('btn-roulette-spin').disabled = false;
  const cfg = storage.getItem('settings') || {};
  if (cfg.sound !== false) playBeep();
  if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate([20, 40, 80]);
}

function startMatchFromPreset(preset) {
  match.startMatch(
    preset.teamA.name,
    preset.teamB.name,
    preset.colorIndex ?? 0,
    preset.durationMs ?? null,
    preset.breakMs ?? null,
    preset.periods ?? 2,
  );
  router.navigateTo('screen-match-live');
}

document.getElementById('btn-roulette-back').addEventListener('click', () =>
  router.navigateTo('screen-home'));
document.getElementById('btn-roulette-spin').addEventListener('click', spinRoulette);
document.getElementById('btn-roulette-again').addEventListener('click', spinRoulette);
document.getElementById('btn-roulette-start').addEventListener('click', () => {
  if (_rouletteResult) startMatchFromPreset(_rouletteResult);
});

// ═══════════════════════════════════════════════════════════
// MATCH SETUP
// ═══════════════════════════════════════════════════════════
// Auswahl für Spieldauer (null = kein Limit). Wird in Setup + Preset-Modal genutzt.
const DURATION_OPTIONS = [
  { label: 'Kein Limit', ms: null },
  { label: '10 Min',     ms: 10 * 60000 },
  { label: '15 Min',     ms: 15 * 60000 },
  { label: '20 Min',     ms: 20 * 60000 },
  { label: '30 Min',     ms: 30 * 60000 },
  { label: '40 Min',     ms: 40 * 60000 },
  { label: '45 Min',     ms: 45 * 60000 },
  { label: '60 Min',     ms: 60 * 60000 },
  { label: '90 Min',     ms: 90 * 60000 },
];
// Auswahl für die Pausendauer (Halbzeit). null = keine geführte Pause.
const BREAK_OPTIONS = [
  { label: 'Keine',   ms: null },
  { label: '1 Min',   ms: 1 * 60000 },
  { label: '5 Min',   ms: 5 * 60000 },
  { label: '10 Min',  ms: 10 * 60000 },
  { label: '15 Min',  ms: 15 * 60000 },
];

// Baut eine Chip-Reihe für Zeit-Optionen. onPick(ms) wird beim Tippen aufgerufen.
// Gibt eine setActive(ms)-Funktion zurück, um die Auswahl programmgesteuert zu setzen.
function buildDurationChips(container, options, selectedMs, onPick) {
  container.replaceChildren();
  const chips = [];
  options.forEach(opt => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'duration-chip';
    chip.textContent = opt.label;
    chip.dataset.ms = opt.ms == null ? '' : String(opt.ms);
    chip.addEventListener('click', () => {
      setActive(opt.ms);
      onPick(opt.ms);
    });
    container.appendChild(chip);
    chips.push({ chip, ms: opt.ms });
  });
  function setActive(ms) {
    const norm = ms || null;
    chips.forEach(({ chip, ms: cms }) =>
      chip.classList.toggle('duration-chip--active', (cms || null) === norm));
  }
  setActive(selectedMs || null);
  return setActive;
}

let _setupDurationSetActive = null;

function enterSetup() {
  match.initSetup();
  document.getElementById('team-a-name').value = '';
  document.getElementById('team-b-name').value = '';
  const selectColorIdx = buildColorPickers();
  _setupDurationSetActive = buildDurationChips(
    document.getElementById('setup-duration-chips'),
    DURATION_OPTIONS,
    null,
    ms => match.setDuration(ms)
  );
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
    // Spieldauer + Pausendauer aus dem Preset übernehmen
    match.setDuration(preset.durationMs ?? null);
    match.setBreak(preset.breakMs ?? null);
    match.setPeriods(preset.periods ?? 2);
    _setupDurationSetActive?.(preset.durationMs ?? null);
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
let _matchRaf   = null;
let _matchEnded = false;     // Restzeit auf 0 erreicht (Abpfiff-Signal nur einmal)
let _breakActive = false;    // Halbzeit-Pause läuft
let _breakEndsAt = 0;

// ms → "MM:SS" (negative Werte werden mit Minus dargestellt)
function fmtClock(ms) {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const str = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return neg ? `-${str}` : str;
}

function _getPeriodLabel(period, total) {
  if (total >= 5) return `${period}. Satz`;
  if (total === 4) return `${period}. Viertel`;
  if (total === 3) return `${period}. Drittel`;
  return `${period}. Halbzeit`;
}

// Bezeichnung des Periodenwechsels je nach Sportart
function _periodBreakLabel(total) {
  if (total >= 5) return 'Satzende';
  if (total === 4 || total === 3) return 'Periodenende';
  return 'Halbzeit';
}

function _updatePeriodLabel() {
  const el = document.getElementById('live-period-label');
  const periods = match.getPeriods();
  const current = match.getCurrentPeriod();
  if (el) {
    el.textContent = _getPeriodLabel(current, periods);
    el.classList.toggle('hidden', periods <= 1);
  }
  const htBtn = document.getElementById('btn-halftime');
  if (htBtn) {
    // Bei Einzelperioden (z.B. Laufsport) gibt es keinen Periodenwechsel
    htBtn.classList.toggle('hidden', periods <= 1);
    const lbl = htBtn.querySelector('.btn-halftime-label');
    if (lbl) lbl.textContent = (current >= periods) ? 'Abpfiff' : _periodBreakLabel(periods);
  }
}

function enterLive() {
  const s = match.getLive();
  if (!s) return;
  _matchEnded  = false;
  _breakActive = false;
  document.getElementById('card-team-a').style.background = s.teamA.colorHex;
  document.getElementById('card-team-b').style.background = s.teamB.colorHex;
  document.getElementById('live-team-a-name').textContent = s.teamA.name;
  document.getElementById('live-team-b-name').textContent = s.teamB.name;
  pill.classList.toggle('running', s.running);
  _updatePeriodLabel();
  updateScores();
  updateTimeoutUI();
  startMatchRaf();
  acquireWakeLock();
  const cfg = storage.getItem('settings') || {};
  if (cfg.sound !== false) playWhistle();
}

function leaveLive() {
  cancelAnimationFrame(_matchRaf);
  _matchRaf = null;
  _breakActive = false;
  pill.classList.remove('running', 'ending', 'finished', 'break');
  releaseWakeLock();
}

function startMatchRaf() {
  cancelAnimationFrame(_matchRaf);
  const timeEl = document.getElementById('match-time');
  const tick = () => {
    if (_breakActive) {
      // Halbzeit-Pause: Countdown bis Pausenende
      const rem = _breakEndsAt - Date.now();
      timeEl.textContent = fmtClock(Math.max(0, rem));
      if (rem <= 0) endBreak(true);
    } else {
      const remaining = match.getRemainingMs();
      if (remaining == null) {
        // Kein Limit → klassisch hochzählen
        timeEl.textContent = fmtClock(match.getElapsedMs());
        pill.classList.remove('ending', 'finished');
      } else {
        // Restzeit herunterzählen
        const shown = Math.max(0, remaining);
        timeEl.textContent = fmtClock(shown);
        pill.classList.toggle('ending', shown > 0 && shown <= 10000);
        if (remaining <= 0 && !_matchEnded) {
          _matchEnded = true;
          if (match.getLive()?.running) { match.toggleTimer(); }
          pill.classList.remove('running', 'ending');
          pill.classList.add('finished');
          const cfg = storage.getItem('settings') || {};
          if (cfg.sound !== false) playWhistle();
          if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate([200, 100, 200]);
          ui.showToast('Spielzeit abgelaufen!');
        }
      }
    }
    updateTimeoutUI();
    _matchRaf = requestAnimationFrame(tick);
  };
  _matchRaf = requestAnimationFrame(tick);
}

// Auszeit-Summe + Button-Status aktualisieren
function updateTimeoutUI() {
  const total = match.getTimeoutMs();
  const running = match.isTimeoutRunning();
  const sumEl = document.getElementById('timeout-sum');
  const btn   = document.getElementById('btn-timeout');
  btn.classList.toggle('btn-timeout--active', running);
  btn.querySelector('.btn-timeout-label').textContent = running ? 'Auszeit läuft' : 'Auszeit';
  if (total > 0 || running) {
    sumEl.classList.remove('hidden');
    sumEl.textContent = `Auszeit ${fmtClock(total)}`;
  } else {
    sumEl.classList.add('hidden');
  }
}

// Halbzeit-Pause starten (Countdown auf der Pill)
function startBreak(ms) {
  _breakActive = true;
  _breakEndsAt = Date.now() + ms;
  pill.classList.remove('running', 'ending', 'finished');
  pill.classList.add('break');
}

// Pause beenden (auto = automatisch bei 0 → Signal). Danach 2. Halbzeit ab 00:00.
function endBreak(auto) {
  if (!_breakActive) return;
  _breakActive = false;
  pill.classList.remove('break');
  match.resetTimer();
  _matchEnded = false;
  _updatePeriodLabel();
  if (auto) {
    const cfg = storage.getItem('settings') || {};
    if (cfg.sound !== false) playWhistle();
    if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const periods = match.getPeriods();
    const current = match.getCurrentPeriod();
    ui.showToast(`${_getPeriodLabel(current, periods)} – los!`);
  }
}

document.getElementById('btn-timeout').addEventListener('click', () => {
  if (_breakActive) return;
  match.toggleTimeout();
  pill.classList.toggle('running', !!match.getLive()?.running);
  updateTimeoutUI();
});

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
  if (_breakActive) return;
  _lp = setTimeout(async () => {
    const ok = await ui.confirmAction('Spielzeit auf 00:00 zurücksetzen?');
    if (ok) {
      match.resetTimer();
      _matchEnded = false;
      pill.classList.remove('finished', 'ending');
    }
  }, 700);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  pill.addEventListener(ev, () => clearTimeout(_lp)));
pill.addEventListener('click', () => {
  if (_breakActive) { endBreak(false); return; }   // Pause überspringen → 2. Halbzeit
  if (match.isTimeoutRunning()) return;            // während Auszeit über den Auszeit-Button steuern
  if (_matchEnded) return;                          // abgepfiffen → Reset/2. Halbzeit nötig
  const running = match.toggleTimer();
  pill.classList.toggle('running', running);
});

function _scoreUp(team) {
  match.changeScore(team, 1);
  updateScores();
  const cfg = storage.getItem('settings') || {};
  if (cfg.sound !== false) playGoal();
  if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate(60);
}
document.getElementById('btn-plus-a').addEventListener('click', () => _scoreUp('a'));
document.getElementById('btn-minus-a').addEventListener('click', () => { match.changeScore('a', -1); updateScores(); });
document.getElementById('btn-plus-b').addEventListener('click', () => _scoreUp('b'));
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

  const breakMs = match.getBreakMs();

  ui.openModal('tmpl-modal-halftime', () => {
    document.getElementById('ht-score').textContent = `${s.teamA.score} : ${s.teamB.score}`;
    document.getElementById('ht-teams').textContent = `${s.teamA.name} vs. ${s.teamB.name}`;

    const currentP = match.getCurrentPeriod();
    const totalP = match.getPeriods();
    document.getElementById('ht-time').textContent = `${_getPeriodLabel(currentP, totalP)}: ${elStr}`;

    const toMs = match.getTimeoutMs();
    document.getElementById('ht-timeout').textContent = toMs > 0 ? `Auszeiten: ${fmtClock(toMs)}` : '';

    const breakEl = document.getElementById('ht-break');
    const nextBtn = document.getElementById('ht-next');
    const nextP = currentP + 1;
    if (nextP <= totalP) {
      nextBtn.textContent = breakMs ? 'Pause starten' : _getPeriodLabel(nextP, totalP);
      if (breakMs) {
        breakEl.textContent = `Pause: ${fmtClock(breakMs)}`;
        breakEl.classList.remove('hidden');
      } else {
        breakEl.classList.add('hidden');
      }
    } else {
      nextBtn.textContent = 'Weiter';
      breakEl.classList.add('hidden');
    }

    document.getElementById('ht-back').onclick = () => {
      if (wasRunning) { match.toggleTimer(); pill.classList.add('running'); }
      ui.closeModal();
    };

    nextBtn.onclick = () => {
      ui.closeModal();
      match.nextPeriod();
      _updatePeriodLabel();
      if (breakMs) startBreak(breakMs);   // Countdown läuft, danach nächste Periode ab 00:00
      else { match.resetTimer(); _matchEnded = false; pill.classList.remove('finished', 'ending'); }
    };
  });
});

document.getElementById('btn-end-match').addEventListener('click', () => {
  const s = match.getLive();
  ui.openModal('tmpl-modal-match-end', () => {
    document.getElementById('m-score').textContent = `${s.teamA.score} : ${s.teamB.score}`;
    document.getElementById('m-teams').textContent = `${s.teamA.name} vs. ${s.teamB.name}`;
    document.getElementById('m-time').textContent  = `Spielzeit: ${fmtClock(match.getElapsedMs())}`;
    const toMs = match.getTimeoutMs();
    document.getElementById('m-timeout').textContent = toMs > 0 ? `davon Auszeiten: ${fmtClock(toMs)}` : '';

    document.getElementById('m-save').onclick = () => {
      const cfg2 = storage.getItem('settings') || {};
      if (cfg2.sound !== false) playMatchEnd();
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
// STOPPUHREN (dynamisch via "+" Button, max. 6)
// ═══════════════════════════════════════════════════════════
const swInstances = [];
let swNextId = 1;

function createSWCard(id) {
  const card = document.createElement('div');
  card.className = 'tool-card sw-card';
  card.id = `sw-card-${id}`;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sw-ring');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const bgCircle = document.createElementNS(NS, 'circle');
  bgCircle.setAttribute('class', 'sw-ring-bg');
  bgCircle.setAttribute('cx', '50'); bgCircle.setAttribute('cy', '50'); bgCircle.setAttribute('r', '45');
  bgCircle.setAttribute('fill', 'none'); bgCircle.setAttribute('stroke-width', '3');
  const progCircle = document.createElementNS(NS, 'circle');
  progCircle.setAttribute('class', 'sw-ring-progress');
  progCircle.setAttribute('cx', '50'); progCircle.setAttribute('cy', '50'); progCircle.setAttribute('r', '45');
  progCircle.setAttribute('fill', 'none'); progCircle.setAttribute('stroke-width', '3');
  progCircle.setAttribute('stroke-dasharray', '283');
  progCircle.setAttribute('stroke-dashoffset', '283');
  progCircle.setAttribute('transform', 'rotate(-90 50 50)');
  svg.appendChild(bgCircle);
  svg.appendChild(progCircle);
  card.appendChild(svg);

  const header = document.createElement('div');
  header.className = 'sw-card-header';
  const labelEl = document.createElement('input');
  labelEl.type = 'text'; labelEl.className = 'sw-label';
  labelEl.placeholder = 'Bezeichnung'; labelEl.maxLength = 30;
  labelEl.autocomplete = 'off';
  labelEl.setAttribute('aria-label', `Bezeichnung Stoppuhr ${id}`);
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-sw-remove';
  removeBtn.setAttribute('aria-label', 'Stoppuhr entfernen');
  removeBtn.textContent = '✕';
  header.appendChild(labelEl);
  header.appendChild(removeBtn);
  card.appendChild(header);

  const timeEl = document.createElement('div');
  timeEl.className = 'sw-time';
  timeEl.setAttribute('aria-live', 'polite');
  timeEl.textContent = '00:00.00';
  card.appendChild(timeEl);

  const btnsEl = document.createElement('div');
  btnsEl.className = 'sw-btns';
  [['btn-sw-startstop','Start'],['btn-sw-lap','Runde'],['btn-sw-save','Speichern'],['btn-sw-reset','Reset']].forEach(([cls, lbl]) => {
    const btn = document.createElement('button');
    btn.className = `btn-sw ${cls}`; btn.textContent = lbl;
    if (cls === 'btn-sw-lap') btn.disabled = true;
    btnsEl.appendChild(btn);
  });
  card.appendChild(btnsEl);

  const lapList = document.createElement('ol');
  lapList.className = 'lap-list';
  lapList.setAttribute('aria-label', 'Rundenzeiten');
  card.appendChild(lapList);

  return card;
}

function mountSW(id, cardEl) {
  const sw       = new Stopwatch();
  const timeEl   = cardEl.querySelector('.sw-time');
  const ssBtn    = cardEl.querySelector('.btn-sw-startstop');
  const lapBtn   = cardEl.querySelector('.btn-sw-lap');
  const saveBtn  = cardEl.querySelector('.btn-sw-save');
  const resetBtn = cardEl.querySelector('.btn-sw-reset');
  const removeBtn = cardEl.querySelector('.btn-sw-remove');
  const lapList  = cardEl.querySelector('.lap-list');
  const labelEl  = cardEl.querySelector('.sw-label');
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
    cardEl.classList.toggle('sw-running', running);
    removeBtn.disabled = sw.hasContent();
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

  removeBtn.addEventListener('click', () => {
    if (sw.isRunning()) { cancelAnimationFrame(raf); releaseWakeLock(); }
    const idx = swInstances.findIndex(inst => inst.id === id);
    if (idx !== -1) swInstances.splice(idx, 1);
    cardEl.remove();
    updateAddBtn();
  });

  swInstances.push({ id, sw, cardEl });
  sync();
}

function updateAddBtn() {
  const addBtn = document.getElementById('btn-add-stopwatch');
  if (addBtn) addBtn.disabled = swInstances.length >= 6;
}

function addStopwatch() {
  if (swInstances.length >= 6) return;
  const id = swNextId++;
  const card = createSWCard(id);
  document.getElementById('sw-list').appendChild(card);
  mountSW(id, card);
  updateAddBtn();
}

document.getElementById('btn-add-stopwatch').addEventListener('click', addStopwatch);
addStopwatch();
addStopwatch();

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

// ─── Benachrichtigungen / Notifications ───
function notificationsSupported() {
  return 'Notification' in window;
}

function requestNotificationPermission() {
  if (!notificationsSupported()) return Promise.resolve('denied');
  try {
    return Promise.resolve(Notification.requestPermission());
  } catch (_) {
    return Promise.resolve('denied');
  }
}

function showNotification(title, opts) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification(title, opts);
      } else {
        try { new Notification(title, opts); } catch (_) {}
      }
    }).catch(() => {
      try { new Notification(title, opts); } catch (_) {}
    });
  } else {
    try { new Notification(title, opts); } catch (_) {}
  }
}

// ─── Countdown-Karten (dynamisch via "+" Button, max. 6) ───
const cdInstances = [];
let cdNextId = 1;

function createCDCard(id) {
  const tmpl = document.getElementById('tmpl-cd-card');
  const card = tmpl.content.firstElementChild.cloneNode(true);
  card.id = `cd-card-${id}`;
  return card;
}

function mountCD(id, cardEl) {
  const cd        = new Countdown();
  const wMin      = cardEl.querySelector('.cd-wheel-minutes');
  const wSec      = cardEl.querySelector('.cd-wheel-seconds');
  const pickerEl  = cardEl.querySelector('.cd-picker');
  const displayEl = cardEl.querySelector('.cd-display');
  const countEl   = cardEl.querySelector('.cd-countdown');
  const startBtn  = cardEl.querySelector('.btn-cd-start');
  const pauseBtn  = cardEl.querySelector('.btn-cd-pause');
  const resumeBtn = cardEl.querySelector('.btn-cd-resume');
  const resetBtn  = cardEl.querySelector('.btn-cd-reset');
  const saveBtn   = cardEl.querySelector('.btn-cd-save');
  const removeBtn = cardEl.querySelector('.btn-cd-remove');

  buildWheel(wMin, 60);
  buildWheel(wSec, 60);
  setTimeout(() => { wMin.scrollTop = 0; wSec.scrollTop = 0; }, 80);

  let _lastTickSec = -1;

  const sync = () => {
    const s = cd.getState();
    const picking = s === 'picking';
    const running = s === 'running';
    const paused  = s === 'paused';
    pickerEl.classList.toggle('hidden', !picking);
    displayEl.classList.toggle('hidden', picking);
    startBtn.classList.toggle('hidden', !picking);
    pauseBtn.classList.toggle('hidden', !running);
    resumeBtn.classList.toggle('hidden', !paused);
    resetBtn.classList.toggle('hidden', picking);
    removeBtn.disabled = !picking;
  };

  const onTick = (ms) => {
    countEl.textContent = fmtMs(ms);
    displayEl.classList.toggle('ending', ms < 10000);
    const sec = Math.ceil(ms / 1000);
    if (sec <= 5 && sec > 0 && sec !== _lastTickSec) {
      _lastTickSec = sec;
      const cfg = storage.getItem('settings') || {};
      if (cfg.sound !== false) playCountdownTick(sec === 1);
    }
    if (ms > 5000) _lastTickSec = -1;
  };

  const onDone = () => {
    const cfg = storage.getItem('settings') || {};
    if (cfg.sound !== false) playBeep();
    if (cfg.vibration !== false && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    releaseWakeLock();
    ui.showToast('Timer abgelaufen!', 3000);
    if (cfg.notifications === true && notificationsSupported() && Notification.permission === 'granted') {
      showNotification('Timer abgelaufen!', {
        body: 'Dein Countdown ist beendet.',
        tag: 'timer-done',
        icon: 'icons/icon-192.png',
        vibrate: [200, 100, 200],
        renotify: true,
      });
    }
    sync();
    setTimeout(() => { cd.reset(); sync(); }, 3000);
  };

  startBtn.addEventListener('click', () => {
    const ms = (getWheelVal(wMin) * 60 + getWheelVal(wSec)) * 1000;
    if (ms === 0) return;
    cd.setDuration(ms);
    cd.start(onTick, onDone);
    acquireWakeLock();
    sync();
  });

  pauseBtn.addEventListener('click', () => {
    cd.pause();
    releaseWakeLock();
    sync();
  });

  resumeBtn.addEventListener('click', () => {
    cd.resume(onTick, onDone);
    acquireWakeLock();
    sync();
  });

  resetBtn.addEventListener('click', () => {
    cd.reset();
    releaseWakeLock();
    sync();
  });

  saveBtn.addEventListener('click', () => {
    const s = cd.getState();
    const ms = s === 'picking'
      ? (getWheelVal(wMin) * 60 + getWheelVal(wSec)) * 1000
      : cd.getTargetMs();
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

  removeBtn.addEventListener('click', () => {
    if (cd.getState() === 'running') releaseWakeLock();
    cd.reset();
    const idx = cdInstances.findIndex(inst => inst.id === id);
    if (idx !== -1) cdInstances.splice(idx, 1);
    cardEl.remove();
    updateCdAddBtn();
  });

  cdInstances.push({ id, cd, cardEl });
  sync();
}

function updateCdAddBtn() {
  const addBtn = document.getElementById('btn-add-countdown');
  if (addBtn) addBtn.disabled = cdInstances.length >= 6;
}

function addCountdown() {
  if (cdInstances.length >= 6) return;
  const id = cdNextId++;
  const card = createCDCard(id);
  document.getElementById('cd-list').appendChild(card);
  mountCD(id, card);
  updateCdAddBtn();
}

document.getElementById('btn-add-countdown').addEventListener('click', addCountdown);
addCountdown();

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
// Ausschlussliste fürs Spiel-Roulette: pro Spiel ein Schalter.
function renderRouletteExclusion() {
  const list = document.getElementById('roulette-exclude-list');
  if (!list) return;
  list.replaceChildren();
  const excluded = new Set(_getRouletteExcluded());
  const all = presets.getAll();
  if (all.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-section-hint';
    empty.textContent = 'Keine Spiele vorhanden.';
    list.appendChild(empty);
    return;
  }
  all.forEach(p => {
    const row = document.createElement('label');
    row.className = 'roulette-exclude-item';
    const name = document.createElement('span');
    name.className = 'roulette-exclude-name';
    name.textContent = `${p.icon} ${p.name}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = excluded.has(p.id);
    cb.addEventListener('change', () => {
      const c = storage.getItem('settings') || {};
      const set = new Set(c.rouletteExcluded || []);
      if (cb.checked) set.add(p.id); else set.delete(p.id);
      c.rouletteExcluded = [...set];
      storage.setItem('settings', c);
    });
    row.append(name, cb);
    list.appendChild(row);
  });
}

function initSettings() {
  const cfg = storage.getItem('settings') || { sound: true, vibration: true, tbPhotos: false };
  document.getElementById('toggle-sound').checked     = cfg.sound     !== false;
  document.getElementById('toggle-vibration').checked = cfg.vibration !== false;
  document.getElementById('toggle-tb-photos').checked = cfg.tbPhotos  === true;

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

  // Vereins-Design (Theme)
  const themeSelect = document.getElementById('select-club-theme');
  if (themeSelect) {
    themeSelect.replaceChildren(...theme.THEMES.map(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      return opt;
    }));
    themeSelect.value = theme.getSavedThemeId();
    // onchange (statt addEventListener), damit ein erneutes initSettings()
    // – z. B. nach „Alle Daten löschen" – keine doppelten Handler bindet.
    themeSelect.onchange = e => {
      const t = theme.setTheme(e.target.value);
      ui.showToast(`Design: ${t.name}`);
    };
  }

  const notifToggle = document.getElementById('toggle-notifications');
  if (!notificationsSupported()) {
    // Notification API nicht verfügbar (z. B. ältere iOS-Safari): Zeile ausblenden
    notifToggle.checked = false;
    notifToggle.disabled = true;
    const row = notifToggle.closest('.setting-row');
    if (row) row.classList.add('hidden');
  } else {
    notifToggle.checked = cfg.notifications === true && Notification.permission === 'granted';

    notifToggle.addEventListener('change', e => {
      const c = storage.getItem('settings') || {};
      if (e.target.checked) {
        requestNotificationPermission().then(perm => {
          if (perm === 'granted') {
            c.notifications = true;
            storage.setItem('settings', c);
            ui.showToast('Benachrichtigungen aktiviert');
          } else {
            e.target.checked = false;
            c.notifications = false;
            storage.setItem('settings', c);
            ui.showToast('Im Browser blockiert');
          }
        });
      } else {
        c.notifications = false;
        storage.setItem('settings', c);
      }
    });
  }

  renderRouletteExclusion();

  document.getElementById('btn-restore-presets').addEventListener('click', () => {
    storage.removeItem('hiddenPresets');
    ui.showToast('Standard-Presets wiederhergestellt!');
    renderRouletteExclusion();
  });

  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    const ok1 = await ui.confirmAction('Wirklich alle gespeicherten Daten löschen?');
    if (!ok1) return;
    const ok2 = await ui.confirmAction('Nicht rückgängig zu machen. Wirklich fortfahren?');
    if (!ok2) return;
    storage.clearAll();
    theme.applyTheme(theme.DEFAULT_THEME);
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

function _isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function _isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function _showInstallBanner() {
  if (_isStandalone()) return;
  const banner = document.getElementById('install-banner');
  if (_isIOS()) {
    document.getElementById('install-banner-ios').classList.remove('hidden');
    document.getElementById('install-banner-pwa').classList.add('hidden');
    banner.classList.remove('hidden');
  } else if (_deferredInstall) {
    document.getElementById('install-banner-pwa').classList.remove('hidden');
    document.getElementById('install-banner-ios').classList.add('hidden');
    banner.classList.remove('hidden');
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  _syncInstallSettings();
  if (!storage.getItem('installDismissed')) {
    _showInstallBanner();
  }
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.add('hidden');
  _deferredInstall = null;
  _syncInstallSettings();
});

async function _triggerInstall() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  const { outcome } = await _deferredInstall.userChoice;
  _deferredInstall = null;
  document.getElementById('install-banner').classList.add('hidden');
  if (outcome === 'accepted') storage.setItem('installDismissed', true);
  _syncInstallSettings();
}

document.getElementById('btn-install').addEventListener('click', e => {
  e.stopPropagation();
  _triggerInstall();
});

// Tippen auf das ganze Banner löst die Installation direkt aus
const _bannerPwa = document.getElementById('install-banner-pwa');
_bannerPwa.addEventListener('click', _triggerInstall);
_bannerPwa.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _triggerInstall(); }
});

document.getElementById('btn-dismiss-install').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('install-banner').classList.add('hidden');
  storage.setItem('installDismissed', true);
});

// iOS Banner: nur schließen (kein Prompt möglich)
document.getElementById('btn-dismiss-install-ios').addEventListener('click', () => {
  document.getElementById('install-banner').classList.add('hidden');
  storage.setItem('installDismissed', true);
});

function _syncInstallSettings() {
  const row = document.getElementById('install-settings-row');
  const btn = document.getElementById('btn-settings-install');
  const status = document.getElementById('install-status');
  if (!row) return;
  if (_isStandalone()) {
    row.classList.remove('hidden');
    btn.classList.add('hidden');
    status.classList.remove('hidden');
    status.textContent = '✓ App ist installiert';
  } else if (_deferredInstall) {
    row.classList.remove('hidden');
    btn.classList.remove('hidden');
    status.classList.add('hidden');
  } else if (_isIOS()) {
    row.classList.remove('hidden');
    btn.classList.add('hidden');
    status.classList.remove('hidden');
    status.textContent = 'Teilen → „Zum Home-Bildschirm"';
  } else {
    // Android/Desktop, aber beforeinstallprompt wurde (noch) nicht ausgelöst:
    // manuelle Anleitung zeigen statt die Zeile zu verstecken.
    row.classList.remove('hidden');
    btn.classList.add('hidden');
    status.classList.remove('hidden');
    status.textContent = 'Browser-Menü ⋮ → „App installieren" bzw. „Zum Startbildschirm"';
  }
}

document.getElementById('btn-settings-install').addEventListener('click', async () => {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  const { outcome } = await _deferredInstall.userChoice;
  _deferredInstall = null;
  if (outcome === 'accepted') {
    storage.setItem('installDismissed', true);
    document.getElementById('install-banner').classList.add('hidden');
  }
  _syncInstallSettings();
});

// Direkt beim Start: iOS-Banner anzeigen wenn sinnvoll
if (_isIOS() && !_isStandalone() && !storage.getItem('installDismissed')) {
  document.getElementById('install-banner-ios').classList.remove('hidden');
  document.getElementById('install-banner-pwa').classList.add('hidden');
  document.getElementById('install-banner').classList.remove('hidden');
}
_syncInstallSettings();

// ═══════════════════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  // Beim Aktivieren eines neuen Service Workers automatisch neu laden,
  // damit immer die aktuelle Version läuft (nur bei echtem Update,
  // nicht bei der Erstinstallation).
  const _hadController = !!navigator.serviceWorker.controller;
  let _swReloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Erstübernahme (kein vorheriger Controller) nicht neu laden.
    if (_swReloading || !_hadController) return;
    _swReloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(reg => {
      // Beim Laden sofort auf neue Dateien prüfen …
      reg.update();
      // … und regelmäßig sowie beim Zurückkehren in die App.
      setInterval(() => reg.update(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    }).catch(console.error);
  });
}

// Notfall-Cleanup: Kamera und Fotos beim Verlassen der Seite freigeben
window.addEventListener('pagehide', () => {
  _tbStopCamera();
  teambuilder.clearPhotos();
});

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
initSettings();
checkSession();
router.navigateTo('screen-home');
