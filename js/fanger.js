// ═══════════════════════════════════════════════════════════
// Fänger-Auslosung
//
// Losen aus einer nummerierten Gruppe (1…N) zufällig eine oder
// mehrere Personen als Fänger aus. Damit nicht immer dieselben
// Kinder erwischt werden, merkt sich das Tool, wer schon Fänger
// war, und senkt deren Chance beim nächsten Mal etwas ab
// ("Ausgleich"). Wer noch nie dran war, wird dadurch etwas
// wahrscheinlicher gezogen.
// ═══════════════════════════════════════════════════════════

// Gewichtungsfaktor pro bereits absolvierter Fänger-Runde.
// weight = FACTOR ^ (bisherige Fänger-Einsätze der Person)
//   1.0  → alle gleich wahrscheinlich (kein Ausgleich)
//   0.5  → jede Runde als Fänger halbiert die Chance (sanft)
//   0.2  → schon einmal Fänger = deutlich seltener (stark)
const BIAS_FACTORS = { off: 1, soft: 0.5, strong: 0.2 };

let personCount  = 12;
let catcherCount = 3;
let biasMode     = 'soft';        // 'off' | 'soft' | 'strong'
let history      = new Array(personCount).fill(0); // Fänger-Einsätze je Person
let lastResult   = [];            // zuletzt gezogene Nummern (1-basiert)

export function getPersonCount()  { return personCount; }
export function getCatcherCount() { return catcherCount; }
export function getBiasMode()     { return biasMode; }
export function getLastResult()   { return lastResult.slice(); }

export function setPersonCount(n) {
  personCount = Math.max(2, Math.min(50, n));
  // Historie an neue Gruppengröße anpassen
  if (history.length < personCount) {
    history = history.concat(new Array(personCount - history.length).fill(0));
  } else if (history.length > personCount) {
    history = history.slice(0, personCount);
  }
  if (catcherCount > personCount - 1) catcherCount = personCount - 1;
  if (catcherCount < 1) catcherCount = 1;
}

export function setCatcherCount(n) {
  catcherCount = Math.max(1, Math.min(personCount - 1, n));
}

export function setBiasMode(mode) {
  if (mode in BIAS_FACTORS) biasMode = mode;
}

// Wie oft war Person (1-basiert) bereits Fänger?
export function getHistory() {
  return history.map((count, i) => ({ number: i + 1, count }));
}

export function resetHistory() {
  history = new Array(personCount).fill(0);
  lastResult = [];
}

// Gewichtetes Ziehen ohne Zurücklegen: `catcherCount` verschiedene
// Personen. Personen, die schon oft Fänger waren, haben kleineres
// Gewicht und werden dadurch seltener gezogen.
export function draw() {
  const factor = BIAS_FACTORS[biasMode];
  const pool   = Array.from({ length: personCount }, (_, i) => i);
  const weights = pool.map(i => Math.pow(factor, history[i]));
  const picked = [];

  const take = Math.min(catcherCount, personCount);
  for (let k = 0; k < take; k++) {
    let total = 0;
    for (const i of pool) total += weights[i];
    let r = Math.random() * total;
    let chosenPos = pool.length - 1;
    for (let p = 0; p < pool.length; p++) {
      r -= weights[pool[p]];
      if (r <= 0) { chosenPos = p; break; }
    }
    const chosen = pool.splice(chosenPos, 1)[0];
    picked.push(chosen);
  }

  picked.forEach(i => { history[i]++; });
  lastResult = picked.map(i => i + 1).sort((a, b) => a - b);
  return getLastResult();
}
