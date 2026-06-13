import * as storage from './storage.js';

function dl(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportMatchesCSV() {
  const BOM = '﻿';
  const header = 'Datum;Team A;Punkte A;Team B;Punkte B;Dauer;Notiz';
  const rows = storage.getCollection('matches').map(m => {
    const d = new Date(m.createdAt).toISOString();
    const s = Math.floor(m.durationMs / 1000);
    const dur = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return [d, m.teamA.name, m.teamA.score, m.teamB.name, m.teamB.score, dur, m.note || ''].join(';');
  });
  dl(BOM + [header, ...rows].join('\n'), 'matches.csv', 'text/csv;charset=utf-8;');
}

export function exportStopwatchesCSV() {
  const BOM = '﻿';
  const header = 'Datum;Label;Gesamtzeit;Laps';
  const rows = storage.getCollection('stopwatches').map(r => {
    const d = new Date(r.createdAt).toISOString();
    const s = Math.floor(r.totalMs / 1000);
    const total = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((r.totalMs % 1000) / 10)).padStart(2, '0')}`;
    const laps = r.laps.map(l => (l / 1000).toFixed(3)).join('|');
    return [d, r.label, total, laps].join(';');
  });
  dl(BOM + [header, ...rows].join('\n'), 'stopwatches.csv', 'text/csv;charset=utf-8;');
}

export function exportAllJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    matches: storage.getCollection('matches'),
    stopwatches: storage.getCollection('stopwatches'),
    timers: storage.getCollection('timers'),
  };
  dl(JSON.stringify(data, null, 2), 'sportzaehler-export.json', 'application/json');
}
