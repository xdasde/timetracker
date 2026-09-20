// Fußball-Kontext für den Match-Einstieg.
//
// Altersklassen und Spielzeit-Phasen stammen ausschließlich aus den bereits
// vorhandenen Regelkarten (content/sports/football/rules/*.md). Hier wird
// nichts erfunden: Enthält eine Regelkarte keine belegte Spielzeit, liefert
// dieses Modul auch keine Phase – nur den Originaltext und den Hinweis, dass
// die verbindliche Angabe aus der Ordnung des Verbands kommt.
//
// Bewusst DOM-frei, damit `node --test` die Ableitung direkt prüfen kann.

export const FOOTBALL_SPORT_ID = 'football';

// Steht sichtbar über der Altersklassen-/Phasenauswahl.
export const REGIONAL_VARIATION_NOTE =
  'Spielzeiten und Spielformen unterscheiden sich je Verband, Kreis und Saison. '
  + 'Die Vorschläge stammen aus den hinterlegten Regelkarten und sind keine verbindliche Ordnung.';

// Altersklasse ohne Regelkarte: bewusst ohne Zeitvorschlag.
export const SENIOR_AGE_KEY = 'SENIOREN';
export const SENIOR_LABEL = 'Senioren / Erwachsene';
export const SENIOR_NOTE =
  'Für Senioren liegt in der App keine geprüfte Regelkarte vor. Spielzeit bitte unten frei wählen '
  + 'und mit der Ordnung des zuständigen Verbands abgleichen.';

// Sichtbarer Hinweis, wenn der Fußball-Modus nicht aus dem Content geladen
// werden kann. Der CTA bleibt bedienbar und bleibt beim Fußball-Kontext –
// ein stiller Wechsel zu Allgemeinsport findet nicht statt.
export const FALLBACK_NOTICE =
  'Fußball-Preset unvollständig geladen – es gilt der geprüfte Fußball-Standard.';

const WORD_NUMBERS = {
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
};

function toCount(token) {
  if (token == null) return null;
  const raw = String(token).trim().toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return WORD_NUMBERS[raw] ?? null;
}

function minutesLabel(periods, min, max) {
  const span = max && max !== min ? `${min}–${max}` : `${min}`;
  return `${periods} × ${span} Min.`;
}

// Liest die Spielzeit-Zeilen einer Regelkarte und leitet daraus Phasen ab.
// Erkannt werden zwei Schreibweisen aus dem vorhandenen Content:
//   „7 x 10 Minuten“ / „6 x 10–12 Minuten“   → Perioden × Minuten
//   „bis zu sieben Runden; … maximal 7 Minuten“ → Runden × Maximalminuten
// Alles andere bleibt unverändert als Quelltext stehen.
export function parsePlayingTimeOptions(lines = []) {
  const options = [];
  const seen = new Set();

  const push = option => {
    const key = `${option.label}|${option.variant ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.push(option);
  };

  for (const raw of lines) {
    const line = String(raw ?? '');
    if (!line.trim()) continue;
    const leadVariant = /^\s*(\d+\s*gegen\s*\d+)\s*:/i.exec(line)?.[1]?.replace(/\s+/g, ' ') ?? null;
    const breakMatch = /(\d+)\s*Minuten\s*Pause/i.exec(line);
    const breakMs = breakMatch ? Number(breakMatch[1]) * 60000 : null;

    let matched = false;
    for (const m of line.matchAll(/(\d+)\s*[x×]\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*Minuten/gi)) {
      const periods = Number(m[1]);
      const min = Number(m[2]);
      const max = m[3] ? Number(m[3]) : null;
      if (!periods || !min) continue;
      matched = true;
      push({
        variant: leadVariant,
        label: minutesLabel(periods, min, max),
        periods,
        minutesPerPeriod: min,
        maxMinutesPerPeriod: max,
        durationMs: periods * min * 60000,
        breakMs,
        source: line,
      });
    }
    if (matched) continue;

    // Rundenform: Anzahl der Runden steht einmal in der Zeile, die Minuten je
    // Spielform dahinter („2 gegen 2 maximal 5 Minuten“).
    const rounds = toCount(/bis zu\s+([\wäöü]+)\s+(?:Runden|Durchgänge|Spiele)/i.exec(line)?.[1]);
    if (!rounds) continue;
    for (const m of line.matchAll(/(?:(\d+\s*gegen\s*\d+)\s+)?(?:à\s*)?maximal\s*(\d+)\s*Minuten/gi)) {
      const variant = (m[1] ?? leadVariant)?.replace(/\s+/g, ' ') ?? null;
      const min = Number(m[2]);
      if (!min) continue;
      push({
        variant,
        label: minutesLabel(rounds, min, null),
        periods: rounds,
        minutesPerPeriod: min,
        maxMinutesPerPeriod: null,
        durationMs: rounds * min * 60000,
        breakMs,
        source: line,
      });
    }
  }

  return options;
}

// Baut die Altersklassen-Auswahl für das Match-Setup aus den Regelkarten einer
// Sportart. Reihenfolge und Beschriftung kommen aus dem Content; die
// Senioren-Option hängt bewusst ohne Zeitvorschlag hinten an.
export function buildAgeGroups(ruleSets = [], { includeSenior = true } = {}) {
  const groups = ruleSets.map(rule => {
    const phases = parsePlayingTimeOptions(rule.playingTime ?? []);
    return {
      key: rule.ageBand,
      label: rule.ageLabel ?? rule.ageBand,
      ruleSetId: rule.id,
      status: rule.status ?? null,
      season: rule.season ?? null,
      phases,
      sourceLines: [...(rule.playingTime ?? [])],
      hasPhases: phases.length > 0,
    };
  });

  if (includeSenior) {
    groups.push({
      key: SENIOR_AGE_KEY,
      label: SENIOR_LABEL,
      ruleSetId: null,
      status: null,
      season: null,
      phases: [],
      sourceLines: [SENIOR_NOTE],
      hasPhases: false,
    });
  }
  return groups;
}

// Kurzbeschriftung für die Chips („G/Bambini“, „F“, „Senioren“ …).
export function ageChipLabel(group) {
  if (group.key === SENIOR_AGE_KEY) return 'Senioren';
  const short = /^([A-G])[-_ ]/.exec(group.label)?.[1] ?? group.key.split('_')[0];
  const ages = /\((U\d+\/U\d+)\)/.exec(group.label)?.[1];
  const bambini = /Bambini/i.test(group.label) ? '/Bambini' : '';
  return ages ? `${short}${bambini} (${ages})` : group.label;
}

// Beschriftung eines Phasen-Chips. Spielformen („3 gegen 3") stehen vorn,
// damit zwei Phasen derselben Altersklasse unterscheidbar bleiben.
export function phaseChipLabel(phase) {
  if (!phase) return '';
  return phase.variant ? `${phase.variant} · ${phase.label}` : phase.label;
}

// Übersetzt eine Phase in die Felder der Match-Einrichtung.
//
// Wichtig: `durationMs` der App ist die geplante Zeit *einer* Periode – die
// Uhr wird beim Periodenwechsel zurückgesetzt. `phase.durationMs` ist dagegen
// die Gesamtspielzeit. Bei Spannen („6 × 10–12 Min.") gilt der untere Wert:
// nachspielen lassen ist harmloser als zu früh abpfeifen.
export function matchSetupFromPhase(phase) {
  if (!phase?.periods || !phase.minutesPerPeriod) return null;
  return {
    durationMs: phase.minutesPerPeriod * 60000,
    breakMs: phase.breakMs ?? null,
    periods: phase.periods,
    totalMs: phase.durationMs,
  };
}

// Match-Kontext für den Fußball-CTA. Der Sportkontext bleibt immer Fußball;
// fehlt der Modus (defekter/alter Content), wird sichtbar auf den geprüften
// Fußball-Default zurückgefallen – nie still auf Allgemeinsport.
export function resolveFootballContext(selection, defaultModeId = null) {
  const modeId = selection?.sportId === FOOTBALL_SPORT_ID && selection?.modeId
    ? selection.modeId
    : defaultModeId;
  return {
    sportId: FOOTBALL_SPORT_ID,
    modeId: modeId ?? null,
    fallback: modeId !== selection?.modeId || selection?.sportId !== FOOTBALL_SPORT_ID,
    notice: modeId ? null : FALLBACK_NOTICE,
  };
}
