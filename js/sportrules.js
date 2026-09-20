// View-Modelle für die Regel-/Spielbetriebsansicht und den Feedbackweg.
// Bewusst DOM-frei: Die Funktionen liefern reine Datenstrukturen, die
// js/sports-ui.js rendert und die `node --test` direkt prüfen kann.
//
// Wichtig: Eine Regelkarte enthält strukturell keine Übungsfelder
// (goal/setup/steps/variations/tip). Die Regelansicht kann deshalb gar keine
// Übungsbeschreibung anzeigen.
// Abschnitte einer Regelkarte in Anzeigereihenfolge. Spiegelbild von
// RULE_SECTIONS in scripts/sportcontent.mjs (dort ist es die Pflichtliste des
// Parsers); ein Test hält beide Listen synchron.
export const RULE_SECTION_LABELS = [
  { key: 'formats', label: 'Spielformen' },
  { key: 'field', label: 'Feld und Tore' },
  { key: 'playingTime', label: 'Spielzeit' },
  { key: 'specifics', label: 'Regelbesonderheiten' },
  { key: 'variants', label: 'Varianten und Widersprüche' },
  { key: 'openPoints', label: 'Offene Punkte' },
];

// Hinweis, der auf jeder Regelkarte steht – unabhängig vom Geltungsstatus.
export const SEASON_HINT = 'Stand/Saison – Verband prüfen';

export const STATUS_LABELS = {
  binding_national: 'Bundesweit verbindlich',
  binding_regional: 'Regional verbindlich',
  recommendation: 'Empfehlung',
  local_practice: 'Lokale Praxis',
  needs_review: 'Ungeprüft – redaktionell offen',
};

export const JURISDICTION_LABELS = {
  DFB: 'DFB',
  WDFV: 'WDFV (Regionalverband West)',
  FLVW: 'FLVW (Westfalen)',
  LOCAL_ASSOCIATION: 'Kreis/Staffel – zuständiger Verband',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function jurisdictionLabel(j) {
  return JURISDICTION_LABELS[j] ?? j;
}

// Ungeprüfte Karten werden nicht versteckt, aber klar markiert: Lücken sollen
// sichtbar bleiben statt durch erfundene Zahlen gefüllt zu werden.
export function isUnverified(ruleSet) {
  return ruleSet.status === 'needs_review';
}

// Baut das Anzeigemodell einer Regelkarte.
export function buildRuleCard(ruleSet) {
  const sections = RULE_SECTION_LABELS
    .map(s => ({ key: s.key, label: s.label, items: ruleSet[s.key] ?? [] }))
    .filter(s => s.items.length);

  return {
    id: ruleSet.id,
    icon: ruleSet.icon,
    title: ruleSet.name,
    ageBand: ruleSet.ageBand,
    ageLabel: ruleSet.ageLabel,
    unverified: isUnverified(ruleSet),
    badges: [
      { key: 'status', label: statusLabel(ruleSet.status) },
      { key: 'jurisdiction', label: jurisdictionLabel(ruleSet.jurisdiction) },
      { key: 'season', label: `Saison ${ruleSet.season}` },
    ],
    formats: ruleSet.formatNames ?? [],
    seasonNote: ruleSet.seasonNote,
    seasonHint: SEASON_HINT,
    reviewedAt: ruleSet.reviewedAt,
    reviewedLabel: `Letzte redaktionelle Prüfung: ${formatDate(ruleSet.reviewedAt)}`,
    sections,
    sources: (ruleSet.sources ?? []).map(s => ({ ...s })),
  };
}

export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso ?? '');
}

// ── Feedback ─────────────────────────────────────────────────────────────────
// Datensparsam: Es werden ausschließlich die Felder unten erfasst. Keine
// Namen, keine E-Mail-Adressen, keine Spieler:innendaten, keine IDs von
// Nutzer:innen, kein automatischer Versand.
export const FEEDBACK_TOPICS = [
  { key: 'rule_unclear', label: 'Regel unklar/veraltet', target: 'rule_set' },
  { key: 'exercise_missing', label: 'Übung fehlt', target: 'exercise' },
  { key: 'exercise_improve', label: 'Übung verbessern', target: 'exercise' },
];

// Redaktioneller Weg einer Meldung. Nutzer:innen überschreiben nie direkt.
export const MODERATION_STAGES = [
  'received', 'triaged', 'source_check', 'editorial_review', 'published/rejected',
];

export const MODERATION_NOTICE =
  'Meldungen gehen in die redaktionelle Moderation (eingegangen → gesichtet → Quellenprüfung → '
  + 'redaktionelle Freigabe → veröffentlicht oder abgelehnt). Nichts wird direkt überschrieben; '
  + 'regionale Abweichungen bleiben als lokal markiert.';

export const COMMUNITY_NOTICE =
  'Mitmachen, Fehler melden, Quellen ergänzen – redaktionell geprüft, kostenlos für den Breitensport.';

export const PRIVACY_NOTICE =
  'Datensparsam: Es werden nur Kategorie, Altersklasse, optional Verband/Kreis, ein Quellenhinweis '
  + 'und dein Freitext übernommen. Name, E-Mail oder Spieler:innendaten werden nicht abgefragt und '
  + 'nicht gespeichert. Der Text wird erst auf deinen Klick hin weitergegeben.';

const MAX_TEXT = 1200;

// Erzeugt aus den Formularfeldern einen minimierten, prüfbaren Report.
// Unbekannte Felder werden verworfen – so kann die UI nie versehentlich mehr
// Daten weiterreichen als hier definiert.
export function buildFeedbackReport(input = {}) {
  const topic = FEEDBACK_TOPICS.find(t => t.key === input.topic);
  const errors = [];
  if (!topic) errors.push('Bitte eine Kategorie wählen.');
  const message = String(input.message ?? '').trim();
  if (!message) errors.push('Bitte kurz beschreiben, worum es geht.');
  if (message.length > MAX_TEXT) errors.push(`Bitte auf ${MAX_TEXT} Zeichen kürzen.`);

  const report = {
    topic: topic?.key ?? null,
    topicLabel: topic?.label ?? null,
    target: topic?.target ?? null,
    sportId: input.sportId ? String(input.sportId) : null,
    ageBand: input.ageBand && input.ageBand !== 'all' ? String(input.ageBand) : null,
    association: String(input.association ?? '').trim().slice(0, 80) || null,
    sourceHint: String(input.sourceHint ?? '').trim().slice(0, 300) || null,
    message,
    stage: MODERATION_STAGES[0],
  };
  return { valid: errors.length === 0, errors, report };
}

// Klartextfassung der Meldung – das ist alles, was die App weitergibt.
export function formatFeedbackReport(report, { ageLabel = null } = {}) {
  const lines = [
    `Kategorie: ${report.topicLabel ?? '—'}`,
    `Sportart: ${report.sportId ?? '—'}`,
    `Altersklasse: ${ageLabel ?? report.ageBand ?? '—'}`,
  ];
  if (report.association) lines.push(`Verband/Kreis: ${report.association}`);
  if (report.sourceHint) lines.push(`Quellenhinweis: ${report.sourceHint}`);
  lines.push('', report.message, '', `Status: ${report.stage} (redaktionelle Moderation)`);
  return lines.join('\n');
}
