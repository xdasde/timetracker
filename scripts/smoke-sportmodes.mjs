#!/usr/bin/env node
// Browser-Smoke für die Sportmodi über das Chrome DevTools Protocol.
// Startet headless Chrome, prüft Umschalter, Persistenz, Filter, Übungs-Label,
// die Crosslinks der Übungsliste sowie den Altersklassenfilter der Regelansicht
// und schreibt Screenshots nach assets/generated/.
//
//   node scripts/smoke-sportmodes.mjs <baseUrl>

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'generated');
const BASE = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const CHROME = process.env.CHROME_BIN
  || '/home/flo/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PORT = 9333;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--user-data-dir=/tmp/tt-smoke-profile',
  'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* noch nicht bereit */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools nicht erreichbar');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null;
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, useSession = true) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (useSession && this.sessionId) payload.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'JS-Fehler');
    return r.result.value;
  }
}

const url = await wsUrl();
const ws = new WebSocket(url);
await new Promise(r => ws.addEventListener('open', r));
const cdp = new CDP(ws);

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false);
cdp.sessionId = sessionId;
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

// Konsolenfehler mitschneiden.
await cdp.eval(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message)));`);

// Sauberer Ausgangszustand: gespeicherte Auswahl aus früheren Läufen verwerfen,
// sonst startet der Smoke nicht im Allgemeinsport.
await cdp.send('Page.navigate', { url: BASE });
await sleep(800);
await cdp.eval(`localStorage.clear()`);

async function setViewport(width, height, mobile = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 3 : 1, mobile,
  });
}

async function goto(u) {
  await cdp.send('Page.navigate', { url: u });
  await sleep(1200);
  await cdp.eval(`window.__errs = window.__errs || []; window.addEventListener('error', e => window.__errs.push(String(e.message)));`);
}

async function shot(name) {
  mkdirSync(OUT_DIR, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(OUT_DIR, name);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  → ${path}`);
  return path;
}

// Aktiver Screen laut Router-Klasse – Grundlage aller Navigationsprüfungen.
const activeScreen = () => cdp.eval(`document.querySelector('.screen--active')?.id ?? null`);

// Aus einer beliebigen Ansicht zurück in die Fußball-Übungsliste.
async function openExerciseList() {
  await cdp.eval(`document.querySelector('.screen--active .btn-back')?.click()`);
  await sleep(300);
  await cdp.eval(`document.getElementById('btn-open-sport-rules').click()`);
  await sleep(400);
}

// ── Desktop ──────────────────────────────────────────────────────────────────
await setViewport(1280, 900);
await goto(BASE);

check('App lädt ohne Skriptfehler', (await cdp.eval('window.__errs.length')) === 0,
  JSON.stringify(await cdp.eval('window.__errs')));
check('Start im Allgemeinsport',
  await cdp.eval(`document.getElementById('btn-sport-switch').getAttribute('aria-label')`) === 'Sportart wählen, aktuell Allgemeinsport');
check('Regeln-Einstieg im Allgemeinsport verborgen',
  await cdp.eval(`document.getElementById('btn-open-sport-rules').classList.contains('hidden')`) === true);
check('Allgemeinsport-Datenbank unverändert erreichbar',
  await cdp.eval(`!!document.getElementById('btn-open-rules') && document.querySelector('#screen-rules .screen-title').textContent === 'Datenbank'`));

await cdp.eval(`document.getElementById('btn-sport-switch').click()`);
await sleep(300);
const optionCount = await cdp.eval(`document.querySelectorAll('#sport-popover .sport-option').length`);
check('Umschalter zeigt fünf Modi', optionCount === 5, `${optionCount}`);
check('Desktop: Popover-Optionen nicht verdeckt',
  await cdp.eval(`[...document.querySelectorAll('#sport-popover .sport-option')].every(o => {
    const b = o.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return hit && o.contains(hit);
  })`));
await shot('sportmodi-desktop-switcher.png');

await cdp.eval(`document.querySelector('#sport-popover .sport-option[data-sport-id="football"]').click()`);
await sleep(400);
check('Fußball aktiviert',
  await cdp.eval(`document.getElementById('btn-sport-switch').getAttribute('aria-label')`) === 'Sportart wählen, aktuell Fußball');
check('Regeln-Einstieg nur im Sportmodus sichtbar',
  await cdp.eval(`!document.getElementById('btn-open-sport-rules').classList.contains('hidden')`));
check('Übungs-Einstieg heißt "Übungen"',
  await cdp.eval(`document.getElementById('sport-rules-title').textContent`) === 'Übungen');
check('aria-label verweist auf die Übungsdatenbank',
  await cdp.eval(`document.getElementById('btn-open-sport-rules').getAttribute('aria-label')`) === 'Übungsdatenbank für Fußball öffnen');
check('Statusmeldung für Screenreader',
  await cdp.eval(`document.getElementById('sport-live-status').textContent`) === 'Sportmodus Fußball aktiviert');
await shot('sportmodi-desktop-home-football.png');

await cdp.eval(`document.getElementById('btn-open-sport-rules').click()`);
await sleep(400);
const fbCount = await cdp.eval(`document.querySelectorAll('#sport-exercises-list .sport-exercise').length`);
check('Fußball zeigt mindestens 30 Übungen', fbCount >= 30, `${fbCount}`);
check('Nur Fußball-Übungen in der Liste',
  await cdp.eval(`[...document.querySelectorAll('#sport-exercises-list .sport-exercise')].every(e => e.dataset.sportId === 'football')`));
await shot('sportmodi-desktop-football-exercises.png');

// Crosslinks der Übungsliste: Regelwerk und Allgemeinsport-Datenbank
await cdp.eval(`document.getElementById('btn-sport-exercises-to-rules').click()`);
await sleep(400);
check('Crosslink öffnet das Sport-Regelwerk', (await activeScreen()) === 'screen-sport-rules');
await cdp.eval(`document.getElementById('btn-sport-rules-back').click()`);
await sleep(400);

await cdp.eval(`document.getElementById('btn-sport-exercises-to-db').click()`);
await sleep(400);
check('Crosslink öffnet die Allgemeinsport-Datenbank', (await activeScreen()) === 'screen-rules');

// Zurück auf den Startscreen – je nach Markup über den Home-Button oder Reload.
const hasHomeBtn = await cdp.eval(`!!document.getElementById('btn-home')`);
if (hasHomeBtn) {
  await cdp.eval(`document.getElementById('btn-home').click()`);
  await sleep(400);
} else {
  await goto(BASE);
}
// Fußballmodus wiederherstellen und zurück in die Übungsliste.
await cdp.eval(`document.getElementById('btn-sport-switch').click()`);
await sleep(200);
await cdp.eval(`document.querySelector('#sport-popover .sport-option[data-sport-id="football"]').click()`);
await sleep(300);
await cdp.eval(`document.getElementById('btn-open-sport-rules').click()`);
await sleep(400);

// Filter + Suche (AND)
const firstCat = await cdp.eval(`document.querySelectorAll('#sport-exercises-filter .roulette-cat-chip')[1].textContent`);
await cdp.eval(`document.querySelectorAll('#sport-exercises-filter .roulette-cat-chip')[1].click()`);
await sleep(250);
const filtered = await cdp.eval(`document.querySelectorAll('#sport-exercises-list .sport-exercise').length`);
check(`Kategoriefilter "${firstCat}" grenzt ein`, filtered > 0 && filtered < fbCount, `${filtered}/${fbCount}`);

await cdp.eval(`(() => { const i = document.getElementById('sport-exercises-search'); i.value='zzzz'; i.dispatchEvent(new Event('input')); })()`);
await sleep(250);
check('Leerer Trefferfall zeigt Reset-Button',
  await cdp.eval(`!document.getElementById('sport-exercises-empty').classList.contains('hidden') && !!document.getElementById('btn-sport-exercises-reset')`));
check('Leertext ist sportbezogen',
  (await cdp.eval(`document.getElementById('sport-exercises-empty-text').textContent`)).includes('Fußball'));
await cdp.eval(`document.getElementById('btn-sport-exercises-reset').click()`);
await sleep(250);
check('Reset stellt vollen Umfang wieder her',
  await cdp.eval(`document.querySelectorAll('#sport-exercises-list .sport-exercise').length`) === fbCount);

// Regelwerk: Altersklassenfilter
await cdp.eval(`document.getElementById('btn-open-sport-rulebook').click()`);
await sleep(400);
const allRuleCount = await cdp.eval(`document.querySelectorAll('#sport-rules-list .sport-rule-card').length`);
const ageChips = await cdp.eval(`document.querySelectorAll('#sport-rules-age .roulette-cat-chip').length`);
check('Regelwerk bietet Altersklassen-Chips', ageChips >= 2, `${ageChips}`);

const ageLabel = (await cdp.eval(`document.querySelectorAll('#sport-rules-age .roulette-cat-chip')[1].textContent`)).trim();
await cdp.eval(`document.querySelectorAll('#sport-rules-age .roulette-cat-chip')[1].click()`);
await sleep(300);
const ruleFiltered = await cdp.eval(`document.querySelectorAll('#sport-rules-list .sport-rule-card').length`);
check(`Altersklasse "${ageLabel}" grenzt Regeln ein`, ruleFiltered <= allRuleCount, `${ruleFiltered}/${allRuleCount}`);
const visibleRuleAgeLabels = await cdp.eval(`[...document.querySelectorAll('#sport-rules-list .sport-rule-card')]
  .filter(c => c.offsetParent !== null)
  .map(c => (c.querySelector('.rules-item-header .rules-item-sub')?.textContent || '').trim())`);
const ageRange = ageLabel.match(/\([^)]*\)/)?.[0] ?? ageLabel;
check(`Nur Regeln der Altersklasse "${ageLabel}"`,
  visibleRuleAgeLabels.length === 1 && visibleRuleAgeLabels[0].includes(ageRange),
  JSON.stringify(visibleRuleAgeLabels));

await cdp.eval(`document.querySelectorAll('#sport-rules-age .roulette-cat-chip')[0].click()`);
await sleep(300);
check('Alle Altersklassen stellen den vollen Umfang wieder her',
  await cdp.eval(`document.querySelectorAll('#sport-rules-list .sport-rule-card').length`) === allRuleCount,
  `${allRuleCount}`);
await shot('football-rules-database-desktop.png');

// Zurück in die Übungsliste für die Detailansicht.
await openExerciseList();

// Detailansicht
await cdp.eval(`document.querySelector('#sport-exercises-list .rules-item-header').click()`);
await sleep(250);
const detail = await cdp.eval(`(() => { const b=document.querySelector('#sport-exercises-list .rules-item-body'); return b.textContent; })()`);
check('Detail enthält Ziel, Aufbau, Variationen und Sicherheit',
  ['Ziel:', 'Aufbau:', 'Variationen', 'Sicherheit:'].every(s => detail.includes(s)));
await shot('sportmodi-desktop-football-detail.png');

// Persistenz über Reload
await goto(BASE);
check('Modus übersteht Reload',
  await cdp.eval(`document.getElementById('btn-sport-switch').getAttribute('aria-label')`) === 'Sportart wählen, aktuell Fußball');

// Andere Sportarten
for (const [sportId, label, min] of [['handball', 'Handball', 15], ['volleyball', 'Volleyball', 15], ['basketball', 'Basketball', 15]]) {
  await cdp.eval(`document.getElementById('btn-sport-switch').click()`);
  await sleep(200);
  await cdp.eval(`document.querySelector('#sport-popover .sport-option[data-sport-id="${sportId}"]').click()`);
  await sleep(300);
  await cdp.eval(`document.getElementById('btn-open-sport-rules').click()`);
  await sleep(300);
  const n = await cdp.eval(`document.querySelectorAll('#sport-exercises-list .sport-exercise').length`);
  const onlyOwn = await cdp.eval(`[...document.querySelectorAll('#sport-exercises-list .sport-exercise')].every(e => e.dataset.sportId === '${sportId}')`);
  check(`${label}: ≥${min} eigene Übungen`, n >= min && onlyOwn, `${n}`);
}

// Zurück auf Allgemeinsport: Regeln-Einstieg verschwindet wieder
await cdp.eval(`document.getElementById('btn-sport-switch').click()`);
await sleep(200);
await cdp.eval(`document.querySelector('#sport-popover .sport-option[data-sport-id="allgemeinsport"]').click()`);
await sleep(400);
check('Zurück im Allgemeinsport ohne Regeln-Label',
  await cdp.eval(`document.getElementById('btn-open-sport-rules').classList.contains('hidden')`) === true);
check('Allgemeinsport-Datenbank listet weiterhin Einträge', await (async () => {
  await cdp.eval(`document.getElementById('btn-open-rules').click()`);
  await sleep(600);
  return (await cdp.eval(`document.querySelectorAll('#rules-list .rules-item').length`)) >= 62;
})());
await shot('sportmodi-desktop-allgemeinsport-db.png');

// ── Mobil 390×844 ────────────────────────────────────────────────────────────
await setViewport(390, 844, true);
await goto(BASE);
check('Mobil: kein horizontaler Überlauf (Start)',
  await cdp.eval(`document.documentElement.scrollWidth <= 390`),
  `scrollWidth=${await cdp.eval('document.documentElement.scrollWidth')}`);
await shot('sportmodi-mobile-390-home.png');

await cdp.eval(`document.getElementById('btn-sport-switch').click()`);
await sleep(300);
check('Mobil: Popover ohne Überlauf',
  await cdp.eval(`document.documentElement.scrollWidth <= 390 && document.getElementById('sport-popover').getBoundingClientRect().right <= 390`));
// elementFromPoint deckt Überdeckungen durch Banner/Overlays auf, die ein
// reiner Geometrietest nicht sieht.
check('Mobil: Popover-Optionen sind anklickbar (nicht verdeckt)',
  await cdp.eval(`[...document.querySelectorAll('#sport-popover .sport-option')].every(o => {
    const b = o.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return hit && o.contains(hit);
  })`));
await shot('sportmodi-mobile-390-switcher.png');

await cdp.eval(`document.querySelector('#sport-popover .sport-option[data-sport-id="football"]').click()`);
await sleep(300);
await cdp.eval(`document.getElementById('btn-open-sport-rules').click()`);
await sleep(400);
check('Mobil: Übungsliste ohne horizontalen Überlauf',
  await cdp.eval(`document.documentElement.scrollWidth <= 390`),
  `scrollWidth=${await cdp.eval('document.documentElement.scrollWidth')}`);
check('Mobil: Touch-Ziele ≥44px',
  await cdp.eval(`[document.getElementById('btn-sport-switch'), document.querySelector('#sport-exercises-list .rules-item-header')].every(el => el.getBoundingClientRect().height >= 44)`));
await shot('sportmodi-mobile-390-football-exercises.png');

await cdp.eval(`document.querySelector('#sport-exercises-list .rules-item-header').click()`);
await sleep(300);
await shot('sportmodi-mobile-390-football-detail.png');

// Mobil: Regelwerk über den Startscreen öffnen (auf der Übungsliste nicht erreichbar).
await goto(BASE);
await cdp.eval(`document.getElementById('btn-open-sport-rulebook').click()`);
await sleep(400);
check('Mobil: Regelwerk ohne horizontalen Überlauf',
  await cdp.eval(`document.documentElement.scrollWidth <= 390`),
  `scrollWidth=${await cdp.eval('document.documentElement.scrollWidth')}`);
await shot('football-rules-mobile.png');

check('Keine Skriptfehler am Ende', (await cdp.eval('window.__errs.length')) === 0,
  JSON.stringify(await cdp.eval('window.__errs')));

ws.close();
chrome.kill();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
process.exit(failed.length ? 1 : 0);
