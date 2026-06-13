import * as router from './js/router.js';
import * as ui from './js/ui.js';
import * as storage from './js/storage.js';
import * as match from './js/match.js';
import { Stopwatch, fmtMs } from './js/stopwatch.js';
import * as timer from './js/timer.js';
import * as historyMod from './js/history.js';
import * as exportMod from './js/export.js';
import { playBeep } from './js/audio.js';
import { acquireWakeLock, releaseWakeLock } from './js/wakelock.js';

// ═══════════════════════════════════════════════════════════
// SCREEN-REGISTRIERUNG
// ═══════════════════════════════════════════════════════════
router.register('screen-match-hub');
router.register('screen-match-setup', enterSetup);
router.register('screen-match-live', enterLive, leaveLive);
router.register('screen-tools');
router.register('screen-history', () => historyMod.render(currentHistoryTab));
router.register('screen-settings');

// Tab-Bar
document.querySelectorAll('.tab').forEach(t =>
  t.addEventListener('click', () => router.navigateTo(t.dataset.screen)));

// Zurück / Icon-Buttons
document.getElementById('btn-setup-back').addEventListener('click', () => router.navigateTo('screen-match-hub'));
document.getElementById('btn-open-settings').addEventListener('click', () => router.navigateTo('screen-settings'));
document.getElementById('btn-settings-back').addEventListener('click', () => router.navigateTo('screen-match-hub'));

// Modal schließen
document.getElementById('modal-close').addEventListener('click', ui.closeModal);
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target.id === 'modal-backdrop') ui.closeModal();
});

// ═══════════════════════════════════════════════════════════
// MATCH SETUP
// ═══════════════════════════════════════════════════════════
function enterSetup() {
  match.initSetup();
  document.getElementById('team-a-name').value = '';
  document.getElementById('team-b-name').value = '';
  buildColorPickers();
  buildPresetChips();
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
}

function buildPresetChips() {
  const cont = document.getElementById('preset-chips');
  const presets = storage.getCollection('teamPresets');
  cont.replaceChildren();
  presets.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      const active = document.activeElement;
      const target = active?.id === 'team-b-name'
        ? document.getElementById('team-b-name')
        : document.getElementById('team-a-name');
      target.value = name;
      target.dispatchEvent(new Event('input'));
    });
    cont.appendChild(chip);
  });
}

document.getElementById('team-a-name').addEventListener('input', e => match.setTeamName('a', e.target.value));
document.getElementById('team-b-name').addEventListener('input', e => match.setTeamName('b', e.target.value));

document.getElementById('btn-new-match').addEventListener('click', () => router.navigateTo('screen-match-setup'));

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
  document.getElementById('live-score-a').textContent = s.teamA.score;
  document.getElementById('live-score-b').textContent = s.teamB.score;
  document.getElementById('btn-minus-a').disabled = s.teamA.score === 0;
  document.getElementById('btn-minus-b').disabled = s.teamB.score === 0;
}

// Timer-Pill: Tap = toggle, Long-Press (700ms) = Reset
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
      router.navigateTo('screen-match-hub');
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
// VERLAUF
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
  const cfg = storage.getItem('settings') || { sound: true, vibration: true };
  document.getElementById('toggle-sound').checked = cfg.sound !== false;
  document.getElementById('toggle-vibration').checked = cfg.vibration !== false;

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
router.navigateTo('screen-match-hub');
