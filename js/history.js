import * as storage from './storage.js';
import { openModal, closeModal } from './ui.js';
import { fmtMs } from './stopwatch.js';

function relDate(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Gerade eben';
  if (d < 3600000) return `vor ${Math.floor(d / 60000)} Min.`;
  if (d < 86400000) return `vor ${Math.floor(d / 3600000)} Std.`;
  return `vor ${Math.floor(d / 86400000)} Tagen`;
}

function absDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function makeCard(dateTs, title, result, onClick) {
  const el = document.createElement('div');
  el.className = 'history-card';
  el.setAttribute('role', 'listitem');

  const dateEl = document.createElement('div');
  dateEl.className = 'history-card-date';
  dateEl.textContent = `${relDate(dateTs)} · ${absDate(dateTs)}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'history-card-title';
  titleEl.textContent = title;

  const resultEl = document.createElement('div');
  resultEl.className = 'history-card-result';
  resultEl.textContent = result;

  el.append(dateEl, titleEl, resultEl);
  el.addEventListener('click', onClick);
  return el;
}

function emptyState(list, msg) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = msg;
  list.appendChild(p);
}

export function render(tab) {
  const list = document.getElementById('history-list');
  list.replaceChildren();
  if (tab === 'matches') renderMatches(list);
  else if (tab === 'stopwatches') renderStopwatches(list);
  else renderTimers(list);
}

function renderMatches(list) {
  const items = storage.getCollection('matches').slice().reverse();
  if (!items.length) return emptyState(list, 'Noch keine Matches gespeichert.');
  items.forEach(m => {
    let result = `${m.teamA.score} : ${m.teamB.score} · ${fmtDur(m.durationMs)}`;
    if (m.halfTimeScore != null) result += ` · HZ: ${m.halfTimeScore.a}:${m.halfTimeScore.b}`;
    list.appendChild(makeCard(
      m.createdAt,
      `${m.teamA.name} vs. ${m.teamB.name}`,
      result,
      () => openMatchDetail(m)
    ));
  });
}

function openMatchDetail(m) {
  openModal('tmpl-modal-match-detail', () => {
    document.getElementById('md-title').textContent = `${m.teamA.name} vs. ${m.teamB.name}`;
    document.getElementById('md-date').textContent = absDate(m.createdAt);
    document.getElementById('md-score').textContent = `${m.teamA.score} : ${m.teamB.score}`;
    document.getElementById('md-duration').textContent = `Dauer: ${fmtDur(m.durationMs)}`;
    const htEl = document.getElementById('md-halftime');
    if (m.halfTimeScore != null) {
      const htMs  = m.halfTimeMs ?? 0;
      const htMin = Math.floor(htMs / 60000);
      const htSec = Math.floor((htMs % 60000) / 1000);
      htEl.textContent = `Halbzeitstand: ${m.halfTimeScore.a} : ${m.halfTimeScore.b} (${String(htMin).padStart(2,'0')}:${String(htSec).padStart(2,'0')})`;
      htEl.classList.remove('hidden');
    } else {
      htEl.classList.add('hidden');
    }
    document.getElementById('md-note').value = m.note || '';

    document.getElementById('md-save-note').onclick = () => {
      storage.updateInCollection('matches', m.id, { note: document.getElementById('md-note').value });
      closeModal();
    };
    document.getElementById('md-delete').onclick = () => {
      if (!confirm('Match wirklich löschen?')) return;
      storage.removeFromCollection('matches', m.id);
      closeModal();
      render('matches');
    };
  });
}

function renderStopwatches(list) {
  const items = storage.getCollection('stopwatches').slice().reverse();
  if (!items.length) return emptyState(list, 'Noch keine Stoppuhren gespeichert.');
  items.forEach(r => {
    list.appendChild(makeCard(
      r.createdAt,
      r.label,
      `${fmtMs(r.totalMs)} · ${r.laps.length} Runden`,
      () => openSwDetail(r)
    ));
  });
}

function openSwDetail(r) {
  openModal('tmpl-modal-sw-detail', () => {
    document.getElementById('sd-title').textContent = r.label;
    document.getElementById('sd-date').textContent = absDate(r.createdAt);
    document.getElementById('sd-total').textContent = `Gesamt: ${fmtMs(r.totalMs)}`;

    const lapsList = document.getElementById('sd-laps');
    if (r.laps.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Keine Runden';
      li.style.color = 'var(--text-muted)';
      lapsList.appendChild(li);
    } else {
      r.laps.forEach((ms, i) => {
        const li = document.createElement('li');
        li.textContent = `Runde ${i + 1}: ${fmtMs(ms)}`;
        lapsList.appendChild(li);
      });
    }

    document.getElementById('sd-delete').onclick = () => {
      if (!confirm('Stoppuhr-Eintrag löschen?')) return;
      storage.removeFromCollection('stopwatches', r.id);
      closeModal();
      render('stopwatches');
    };
  });
}

function renderTimers(list) {
  const items = storage.getCollection('timers').slice().reverse();
  if (!items.length) return emptyState(list, 'Noch keine Timer-Presets gespeichert.');
  items.forEach(p => {
    const s = Math.floor(p.durationMs / 1000);
    const dur = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    list.appendChild(makeCard(
      p.createdAt, p.label, dur,
      () => {
        if (confirm(`"${p.label}" löschen?`)) {
          storage.removeFromCollection('timers', p.id);
          render('timers');
        }
      }
    ));
  });
}
