// automation/lib/w29.mjs  -  W29 feedback loop (4.12a; 3.4 kill/scale; W13 replacements; W14/W19 lines).
// Imported by automation/W29.json and automation/tests/W29.test.mjs. Node 18+, zero dependencies.
//  1. Broker picks a row on session/broker_disposition_list.json (row id = 4.12a code) -> outcomes.disposition_code.
//  2. broker_quality (1-5) -> outcomes.quality_score.  3. Optional voice note (<= 60 s) -> transcript (redacted) +
//     2-line summary on the outcome; never sent to the lead.  4. broker_feedback_thanks with a true "what changed" line.
//  Feeds: W13 (unreachable / nofit_criteria open the 48-h dispute window; nothing else does), ad_metrics
//  quality_index / quality_n / nofit_rate per ad (n >= 5 before the index is shown or acted on), kill/scale signal
//  rows in insights (3.4: index < 2.5 or not-a-fit > 40% -> pause signal; index >= 4 -> scale candidate; the
//  media rules apply them, W29 never touches spend), qualification tuning (nofit_budget > 15%; nofit_covered
//  concentrated in one angle), "what mattered" corpus for pre-call briefs, fit_followup nudge at +7 d.
import { redactForStorage, prefilter } from '../../conversation/guardrail.mjs';

export const CODES = ['fit_proceeding', 'fit_followup', 'nofit_budget', 'nofit_covered', 'nofit_criteria', 'unreachable'];
export const REPLACEMENT = { unreachable: 'uncontactable', nofit_criteria: 'disqualified' }; // code -> replacements.reason
export const GOOD_FIT = new Set(['fit_proceeding', 'fit_followup']);
export const NOFIT = new Set(['nofit_budget', 'nofit_covered', 'nofit_criteria']);
export const MIN_N = 5;
export const KILL_INDEX = 2.5; export const KILL_NOFIT = 0.4; export const SCALE_INDEX = 4;
export const BUDGET_DRIFT = 0.15;
export const FOLLOWUP_AFTER = 7 * 24 * 3600_000;
export const VOICE_MAX_S = 60;
export const VOICE_WINDOW = 60 * 60_000; // ASSUMPTION: a voice note within 60 min of the quality tap belongs to that outcome

/** parseBrokerReply(msg) -> { kind: 'disposition'|'quality'|'voice'|'followup'|'unknown', value } */
export function parseBrokerReply(msg) {
  if (msg.list_id && CODES.includes(msg.list_id)) return { kind: 'disposition', value: msg.list_id };
  const p = String(msg.payload || '');
  const [k, a, b] = p.split(':');
  // broker_fit_followup taps first: their payload starts with a code (fit_followup:{lead_id}:done|open)
  if (k === 'fit_followup_done' || (k === 'fit_followup' && b === 'done')) return { kind: 'followup', value: 'done', lead_id: a };
  if (k === 'fit_followup_open' || (k === 'fit_followup' && b === 'open')) return { kind: 'followup', value: 'open', lead_id: a };
  if (k === 'disposition' && CODES.includes(a)) return { kind: 'disposition', value: a, booking_id: b || null };
  if (CODES.includes(k)) return { kind: 'disposition', value: k, booking_id: a || null }; // template quick-reply payload
  if (k === 'quality' && /^[1-5]$/.test(a)) return { kind: 'quality', value: Number(a), booking_id: b || null };
  if (/^[1-5]$/.test(k) || /^[1-5]$/.test(String(msg.text || '').trim())) return { kind: 'quality', value: Number(/^[1-5]$/.test(k) ? k : msg.text.trim()), booking_id: a || null };
  if (msg.media === 'audio') return { kind: 'voice', value: msg.media_id };
  return { kind: 'unknown' };
}

/**
 * applyDisposition(outcome, code) -> { update, next, w13, followup_due_ms, error? }
 * Only an attended outcome takes a disposition; corrections are allowed (the latest tap wins) and tell W13.
 */
export function applyDisposition(outcome, code, now_ms) {
  if (!CODES.includes(code)) return { error: 'unknown disposition code' };
  if (outcome.outcome !== 'attended') return { error: `outcome is ${outcome.outcome}: no disposition` };
  const prev = outcome.disposition_code || null;
  const w13 = REPLACEMENT[code] ? { op: 'claim', reason: REPLACEMENT[code], reason_code: code }
    : prev && REPLACEMENT[prev] ? { op: 'withdraw', reason_code: prev } : null;
  return {
    update: { disposition_code: code, marked_via: 'whatsapp', unconfirmed: false, marked_at: new Date(now_ms).toISOString() },
    lead_stage: 'dispositioned',
    next: outcome.quality_score ? 'thanks' : 'ask_quality',
    w13,
    followup_due_ms: code === 'fit_followup' ? now_ms + FOLLOWUP_AFTER : null
  };
}

export function applyQuality(outcome, q) {
  if (!(Number.isInteger(q) && q >= 1 && q <= 5)) return { error: 'quality must be 1-5' };
  if (outcome.outcome !== 'attended') return { error: `outcome is ${outcome.outcome}` };
  return { update: { quality_score: q }, next: 'thanks' };
}

/** Voice note: duration cap, transcript redacted (2.1.7), summary from the model is checked again. */
export function voiceNote({ duration_s, transcript, summary }) {
  if (duration_s > VOICE_MAX_S + 5) return { error: 'over 60 s', reply: 'Thanks. Please keep voice notes under a minute.' };
  const t = redactForStorage(String(transcript || '').trim());
  let s = redactForStorage(String(summary || '').replace(/\s+/g, ' ').trim()).split(/(?<=[.!?])\s+/u).slice(0, 2).join(' ');
  if (prefilter(s).health) s = '[health detail removed]';
  return { update: { transcript: t || null, summary: s || null }, insight: s && s !== '[health detail removed]' ? { source: 'voice_note', kind: 'what_mattered', text: s } : null };
}

/**
 * adQuality(rows) -> { quality_index, quality_n, nofit_rate, signal }   rows = outcomes of leads from ONE ad
 * signal: 'pause' | 'scale_candidate' | null (n < 5 -> null; 3.4 rules; CPL condition is checked by the media rules)
 */
export function adQuality(rows) {
  const rated = rows.filter((r) => Number.isInteger(r.quality_score));
  const disp = rows.filter((r) => r.disposition_code);
  const n = rated.length;
  const idx = n ? Math.round((rated.reduce((a, r) => a + r.quality_score, 0) / n) * 100) / 100 : null;
  const nofit = disp.length ? Math.round((disp.filter((r) => NOFIT.has(r.disposition_code)).length / disp.length) * 10000) / 10000 : null;
  let signal = null;
  if (n >= MIN_N && (idx < KILL_INDEX || (disp.length >= MIN_N && nofit > KILL_NOFIT))) signal = 'pause';
  else if (n >= MIN_N && idx >= SCALE_INDEX) signal = 'scale_candidate';
  return { quality_index: n >= MIN_N ? idx : null, quality_n: n, nofit_rate: nofit, raw_index: idx, signal };
}

/** Qualification tuning over one cycle's dispositions (+ ad angle per row). */
export function tuning(rows) {
  const disp = rows.filter((r) => r.disposition_code);
  const out = [];
  const budget = disp.filter((r) => r.disposition_code === 'nofit_budget').length;
  if (disp.length >= MIN_N && budget / disp.length > BUDGET_DRIFT) out.push({ kind: 'budget_drift', text: `Not a fit - budget is ${Math.round((budget / disp.length) * 100)}% of ${disp.length} calls: review the budget question wording and bands.`, n: disp.length });
  const covered = disp.filter((r) => r.disposition_code === 'nofit_covered');
  if (covered.length >= 3) {
    const by = {};
    for (const r of covered) by[r.angle || 'unknown'] = (by[r.angle || 'unknown'] || 0) + 1;
    const [angle, c] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (c / covered.length >= 0.5 && angle !== 'unknown') out.push({ kind: 'already_covered', angle, text: `Already well covered clusters on angle ${angle} (${c} of ${covered.length}): add a line that pre-filters the already covered.`, n: covered.length });
  }
  return out;
}

/** The "what changed" line for broker_feedback_thanks ({{1}}). Only true statements; no promise of spend. */
export function thanksLine(q) {
  if (q.quality_index !== null && q.quality_n >= MIN_N) return `That ad is now rated ${q.quality_index.toFixed(1)} from ${q.quality_n} of your calls.`;
  return `So far ${q.quality_n} of your calls from this ad have a rating.`;
}

/** fit_followup reminder due? (+7 d after the disposition; once) */
export const followupDue = (outcome, now_ms, sent) => outcome.disposition_code === 'fit_followup' && now_ms >= Date.parse(outcome.marked_at) + FOLLOWUP_AFTER && !sent;
