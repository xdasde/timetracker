// Logik der eigenständigen Landingpage (landingpage.html).
//
// Bewusst ohne Abhängigkeiten und ohne Import aus der App: die Landingpage darf
// nie ein App-Modul mitladen, damit sie auch dann steht, wenn die PWA gerade
// aktualisiert wird. Alles Testbare ist als reine Funktion exportiert; der
// DOM-Teil läuft erst, wenn wirklich ein `document` vorhanden ist.

// ── Konfiguration ────────────────────────────────────────────────────────────

// Ziel des Feedback-Buttons. Bewusst leer ausgeliefert: es gibt kein
// Formular, kein Backend und keinen Secret-Endpunkt für Landingpage-Feedback.
// Zum Aktivieren hier EINEN vorhandenen, öffentlichen Kanal eintragen, z. B.
//   'mailto:team@example.org'  oder  'https://github.com/<user>/<repo>/issues/new'
// Bleibt der Wert leer, zeigt die Seite stattdessen den vorhandenen
// Mitmach-Weg (CONTRIBUTING.md + Community-Formular in der App) an – es wird
// kein Link erfunden.
export const FEEDBACK_CONFIG = {
  target: '',
  label: 'Feedback geben',
};

// Einstiegspunkt der bestehenden App. Relativ, damit Unterverzeichnis-Deploys
// (GitHub Pages o. Ä.) unverändert funktionieren.
export const APP_ENTRY = 'index.html';

// Wie lange eine Ball-Variante sichtbar bleibt, bevor gewechselt wird.
export const BALL_INTERVAL_MS = 6000;

// ── Ball-Varianten (rein dekorativ) ──────────────────────────────────────────

// Reihenfolge ist Teil der Anforderung: Fußball → Volleyball → Basketball →
// Softball → Fußball. `appSportId: null` heißt: die Variante ist nur Grafik und
// verlinkt nirgendwohin – Softball ist kein Sportmodus der App.
export const BALL_VARIANTS = [
  { id: 'football', label: 'Fußball', appSportId: 'football' },
  { id: 'volleyball', label: 'Volleyball', appSportId: 'volleyball' },
  { id: 'basketball', label: 'Basketball', appSportId: 'basketball' },
  { id: 'softball', label: 'Softball', appSportId: null },
];

export function nextBallIndex(current, length = BALL_VARIANTS.length) {
  if (!Number.isInteger(length) || length <= 0) return 0;
  const i = Number.isInteger(current) ? current : -1;
  return ((i + 1) % length + length) % length;
}

// Vollständige Abfolge ab `start` – für Tests und Debug.
export function ballCycle(steps = BALL_VARIANTS.length, start = 0) {
  const out = [];
  let i = ((start % BALL_VARIANTS.length) + BALL_VARIANTS.length) % BALL_VARIANTS.length;
  for (let n = 0; n < steps; n++) {
    out.push(BALL_VARIANTS[i].id);
    i = nextBallIndex(i);
  }
  return out;
}

export function ballStatusText(variant) {
  return `Ballgrafik: ${variant?.label ?? 'Fußball'}`;
}

// ── Sportkarten → bestehende App ─────────────────────────────────────────────

// Nur Sportarten, die es in js/sports.generated.js wirklich gibt.
export const SPORT_CARDS = [
  { sportId: 'football', name: 'Fußball', hint: 'Übungen & Regeln' },
  { sportId: 'handball', name: 'Handball', hint: 'Übungen & Regeln' },
  { sportId: 'volleyball', name: 'Volleyball', hint: 'Übungen & Regeln' },
  { sportId: 'basketball', name: 'Basketball', hint: 'Übungen & Regeln' },
  { sportId: 'allgemeinsport', name: 'Allgemeinsport', hint: 'Spiele & Bewegung' },
];

// Deep-Link in die App. `sport`/`view` werden von app.js ausgewertet; fehlen
// sie, startet die App exakt wie bisher. Unbekannte Sport-IDs fallen in der App
// über resolveSportId() still auf Allgemeinsport zurück.
export function appUrl({ sport = null, view = null } = {}) {
  const params = [];
  if (sport) params.push(`sport=${encodeURIComponent(sport)}`);
  if (view) params.push(`view=${encodeURIComponent(view)}`);
  return params.length ? `${APP_ENTRY}?${params.join('&')}` : APP_ENTRY;
}

export const CTA_TARGETS = {
  // „Übungen entdecken“ → Übungsbereich der App, bestehende Sportauswahl bleibt.
  exercises: appUrl({ view: 'exercises' }),
  // „Ohne Konto starten“ → normaler App-Start, keinerlei Parameter.
  app: APP_ENTRY,
};

export function sportCardHref(sportId) {
  return appUrl({ sport: sportId, view: 'exercises' });
}

// ── Feedback-Ziel ────────────────────────────────────────────────────────────

const SAFE_FEEDBACK_SCHEMES = ['mailto:', 'https://', 'http://'];

// Liefert entweder ein konfiguriertes Ziel oder den ehrlichen Fallback.
// Es wird bewusst nie ein Link geraten.
export function resolveFeedbackTarget(config = FEEDBACK_CONFIG) {
  const raw = typeof config?.target === 'string' ? config.target.trim() : '';
  const usable = raw && SAFE_FEEDBACK_SCHEMES.some(s => raw.toLowerCase().startsWith(s));
  if (!usable) {
    return {
      configured: false,
      href: null,
      label: config?.label || FEEDBACK_CONFIG.label,
      note: 'Noch kein Feedback-Ziel hinterlegt – bis dahin läuft Feedback über den Mitmach-Weg unten.',
    };
  }
  return {
    configured: true,
    href: raw,
    label: config?.label || FEEDBACK_CONFIG.label,
    note: '',
  };
}

// ── Ball-Rotation ────────────────────────────────────────────────────────────

// Timer sind injizierbar, damit Tests ohne echte Wartezeit laufen.
// `reducedMotion: true` schaltet die automatische Rotation ab – gewechselt wird
// dann nur noch manuell über den Button.
export function createBallRotator({
  variants = BALL_VARIANTS,
  intervalMs = BALL_INTERVAL_MS,
  reducedMotion = false,
  onChange = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  start = 0,
} = {}) {
  let index = ((start % variants.length) + variants.length) % variants.length;
  let handle = null;
  let running = false;

  const emit = () => onChange(variants[index], index);

  function stop() {
    running = false;
    if (handle !== null) { clearTimer(handle); handle = null; }
  }

  function schedule() {
    if (!running) return;
    handle = setTimer(() => { handle = null; advance(); }, intervalMs);
  }

  function advance() {
    index = nextBallIndex(index, variants.length);
    emit();
    schedule();
  }

  function begin() {
    if (reducedMotion || running) return;
    running = true;
    schedule();
  }

  return {
    get index() { return index; },
    get current() { return variants[index]; },
    get running() { return running; },
    get reducedMotion() { return reducedMotion; },
    emit,
    start: begin,
    stop,
    // Manueller Wechsel: startet den Automatik-Takt neu, damit die frisch
    // gewählte Variante die volle Zeit sichtbar bleibt.
    next() {
      const wasRunning = running;
      stop();
      index = nextBallIndex(index, variants.length);
      emit();
      if (wasRunning) begin();
      return variants[index];
    },
  };
}

// ── DOM ──────────────────────────────────────────────────────────────────────

export function initLandingPage(doc, win = doc?.defaultView ?? null) {
  if (!doc) return null;

  const balls = [...doc.querySelectorAll('[data-ball-variant]')];
  const status = doc.getElementById('hero-ball-status');
  const nextBtn = doc.getElementById('btn-ball-next');
  const stage = doc.getElementById('hero-ball');

  const reducedMotion = Boolean(
    win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  );
  if (reducedMotion) doc.documentElement.dataset.reducedMotion = 'true';

  const paint = variant => {
    for (const el of balls) {
      const active = el.dataset.ballVariant === variant.id;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-hidden', 'true');
    }
    if (stage) stage.dataset.variant = variant.id;
    if (status) status.textContent = ballStatusText(variant);
  };

  const rotator = createBallRotator({
    reducedMotion,
    onChange: paint,
    setTimer: (fn, ms) => (win ?? globalThis).setTimeout(fn, ms),
    clearTimer: id => (win ?? globalThis).clearTimeout(id),
  });
  rotator.emit();
  rotator.start();

  nextBtn?.addEventListener('click', () => rotator.next());

  // Bei verstecktem Tab nicht weiterzählen – spart Arbeit und verhindert, dass
  // beim Zurückkehren mehrere Wechsel auf einmal nachgeholt wirken.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') rotator.stop();
    else rotator.start();
  });

  // Feedback-Ziel anwenden.
  const feedback = resolveFeedbackTarget();
  const feedbackLink = doc.getElementById('feedback-link');
  const feedbackNote = doc.getElementById('feedback-note');
  if (feedbackLink) {
    if (feedback.configured) {
      feedbackLink.setAttribute('href', feedback.href);
      feedbackLink.hidden = false;
    } else {
      feedbackLink.hidden = true;
    }
  }
  if (feedbackNote) {
    feedbackNote.hidden = feedback.configured;
    if (!feedback.configured) feedbackNote.textContent = feedback.note;
  }

  return rotator;
}

if (typeof document !== 'undefined') {
  const boot = () => initLandingPage(document, window);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
