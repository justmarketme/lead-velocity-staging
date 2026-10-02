// conversation/pulse.mjs  -  W35 lead pulse: the ONE follow-up question after an attended call (6B.2, 4.6 W35 row,
// knowledge/faq.md FAQ-25, state-machine.md `attended`). Owner: conversation-designer. Zero dependencies, Node 18+.
// Imported by the Code nodes in automation/W35.json and by automation/tests/W35.test.mjs (same code in both).
//
// What it is: "Was the call worth your time?" Yes, worth it / Not really, + an optional one-line reason. It is never
// about the advice, never shared with the broker by name, aggregated only. No reply -> nothing further (4.6).
// Every lead-facing word comes from conversation/lines.mjs (PULSE_*) or the approved template `lead_pulse`.
//
// ASSUMPTIONS (measured in production, not researched):
//  A1 due = attended mark + 30 min, and never before the reach-check is settled (answered "yes", or 2 h after it
//     went out unanswered). A lead who answered the reach-check "No, not yet" gets no pulse (the call did not happen
//     for them; W12 handles it).
//  A2 quiet hours 20:00-08:00 SAST (same as W08): a pulse due then waits to 08:00.
//  A3 stale after 48 h from the attended mark: skipped, never sent late.
//  A4 the broker report shows the aggregate only from 5 answers (same n as W29 MIN_N), so no single lead is
//     identifiable; the optional lines are never shown to the broker at all.
import { prefilter, redactForStorage, REDACTED_HEALTH, sanitiseField } from './guardrail.mjs';
import { LINES, fill } from './lines.mjs';

export const VERSION = 'pulse-v1.0.0';
const MIN = 60_000;
const H = 60 * MIN;
const SAST = 2 * H;
export const AFTER_ATTENDED = 30 * MIN;
export const REACH_UNANSWERED_WAIT = 2 * H;
export const STALE_AFTER = 48 * H;
export const LINE_WINDOW = 24 * H; // the optional line is accepted for 24 h after the tap (inside the session window)
export const LINE_MAX = 200;
const SOFT_COMPLAINT_RX = /\b(complain\w*|complaint|klagte|kla oor|ombud\w*|fsca|report (him|her|them))\b/iu;
export const QUIET = { from: 20, to: 8 };
export const MAX_LEAD_MESSAGES = 12; // 4.6 cost design, same cap as W08/W09
export const REPORT_MIN_N = 5;
export const TEMPLATE = 'lead_pulse';
export const BUTTONS = { up: ['pulse_yes', 'Yes, worth it'], down: ['pulse_no', 'Not really'] };
export const BUTTONS_AF = { up: ['pulse_yes', 'Ja, die moeite werd'], down: ['pulse_no', 'Nie regtig nie'] };

const ms = (x) => (x == null ? NaN : typeof x === 'number' ? x : Date.parse(x));
const sastHour = (t) => new Date(t + SAST).getUTCHours();
export function outOfQuiet(t) {
  const h = sastHour(t);
  if (h >= QUIET.to && h < QUIET.from) return t;
  const d = new Date(t + SAST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (h >= QUIET.from ? 1 : 0), QUIET.to, 0) - SAST;
}

/** Why this lead must not get a pulse (null = may). */
export function skipReason(c) {
  const l = c.lead || {};
  const o = c.outcome || {};
  if (l.opted_out_at) return 'opted_out';
  if (c.suppressed) return 'suppressed';
  if (c.already_sent) return 'already_sent';
  if (o.outcome !== 'attended') return `outcome_${o.outcome || 'none'}`;
  if (o.lead_reach_check === 'no') return 'lead_said_not_reached';
  if (l.conv_state?.state === 'handoff') return 'handoff';
  if ((c.outbound_count || 0) >= MAX_LEAD_MESSAGES) return 'message_cap';
  return null;
}

/** Earliest send time (before quiet-hours shift), or null while the reach-check is still open. */
export function dueAt(c) {
  const att = ms(c.outcome?.marked_at);
  if (!Number.isFinite(att)) return null;
  let due = att + AFTER_ATTENDED;
  const r = c.reach || {};
  if (c.outcome?.lead_reach_check === 'yes' && Number.isFinite(ms(r.answered_at))) due = Math.max(due, ms(r.answered_at));
  else if (Number.isFinite(ms(r.sent_at))) due = Math.max(due, ms(r.sent_at) + REACH_UNANSWERED_WAIT);
  return outOfQuiet(due);
}

const adviserFirst = (b = {}) => String(b.contact_person || b.adviser_name || '').trim().split(/\s+/u)[0] || '';
const firstName = (l = {}) => sanitiseField('first_name', l.first_name || '').value || '';

/**
 * pulseDue(c, now_ms) -> { action: 'send'|'wait'|'skip', reason?, due_ms?, channel?, template?, vars?, body?, buttons?, idempotency_key? }
 * c = { lead:{id, first_name, language, opted_out_at, conv_state}, outcome:{outcome, marked_at, lead_reach_check},
 *       booking:{id}, reach:{sent_at, answered_at}, broker:{contact_person}, suppressed, already_sent,
 *       last_inbound_at, outbound_count }
 */
export function pulseDue(c, now_ms) {
  const why = skipReason(c);
  if (why) return { action: 'skip', reason: why };
  const due = dueAt(c);
  if (due === null) return { action: 'skip', reason: 'no_attended_time' };
  if (now_ms >= ms(c.outcome.marked_at) + STALE_AFTER) return { action: 'skip', reason: 'stale' };
  if (now_ms < due) return { action: 'wait', due_ms: due };
  if (sastHour(now_ms) >= QUIET.from || sastHour(now_ms) < QUIET.to) return { action: 'wait', reason: 'quiet_hours', due_ms: outOfQuiet(now_ms) };
  return { action: 'send', ...pulseMessage(c, now_ms), idempotency_key: `w35:${c.lead.id}:${c.booking?.id || 'none'}` };
}

/**
 * Template vs session (Meta 24-h customer-service window, same rule as W08):
 *  - inside the window (last inbound < 24 h ago, e.g. the reach-check tap): session interactive buttons, the same words
 *    as the template (LINES.PULSE_ASK + STOP_HINT, the W08 convention), in the lead's language. No template fee.
 *  - outside it: the approved utility template `lead_pulse` (English only until `lead_pulse` af is approved).
 */
export function pulseMessage(c, now_ms) {
  const lang = c.lead?.language === 'af' ? 'af' : 'en';
  const vars = { first_name: firstName(c.lead), adviser_first: adviserFirst(c.broker) };
  const inWindow = Number.isFinite(ms(c.last_inbound_at)) && now_ms - ms(c.last_inbound_at) < 24 * H;
  const suffix = `:${c.booking?.id || ''}`;
  if (inWindow) {
    const b = lang === 'af' ? BUTTONS_AF : BUTTONS;
    let body = fill(LINES[lang].PULSE_ASK, vars) + ' ' + LINES[lang].STOP_HINT; // = template words (en)
    if (!vars.first_name) body = body.replace(lang === 'af' ? 'Hallo , ' : 'Hi , ', lang === 'af' ? 'Hallo, ' : 'Hi, ');
    return { channel: 'session', lang, body, buttons: [[b.up[0] + suffix, b.up[1]], [b.down[0] + suffix, b.down[1]]] };
  }
  return { channel: 'template', lang: 'en', template: TEMPLATE, vars: [vars.first_name || 'there', vars.adviser_first], buttons: [[BUTTONS.up[0] + suffix, BUTTONS.up[1]], [BUTTONS.down[0] + suffix, BUTTONS.down[1]]] };
}

/**
 * onPulseTap(payload, c, now_ms) -> { update, conv_state, reply, fact }
 * The latest tap wins (a lead may change their mind). The optional-line invitation is sent once per pulse.
 */
export function onPulseTap(payload, c, now_ms) {
  const [key, booking_id] = String(payload || '').split(':');
  if (key !== 'pulse_yes' && key !== 'pulse_no') return { error: 'not a pulse tap' };
  const thumbs = key === 'pulse_yes' ? 'up' : 'down';
  const lang = c.lead?.language === 'af' ? 'af' : 'en';
  const cs = { ...(c.lead?.conv_state || {}) };
  const firstTap = !cs.pulse_line_invited;
  const conv_state = { ...cs, pulse_line_invited: true, pulse_booking_id: booking_id || c.booking?.id || null, pulse_line_open_until: firstTap ? new Date(now_ms + LINE_WINDOW).toISOString() : cs.pulse_line_open_until || null };
  return {
    update: { thumbs, answered_at: new Date(now_ms).toISOString() },
    booking_id: booking_id || c.booking?.id || null,
    conv_state,
    reply: firstTap ? LINES[lang][thumbs === 'up' ? 'PULSE_LINE_ASK_UP' : 'PULSE_LINE_ASK_DOWN'] : null,
    fact: { activity_type: 'lead_pulse', payload: { thumbs, version: VERSION } }
  };
}

/**
 * isPulseLine(text, conv_state, now_ms) -> boolean. W07 routeInbound calls this BEFORE the NLU path: free text inside
 * the open line window is the optional reason, unless it is something Thandi must act on (STOP, a person, a
 * complaint, a claim problem, distress, an injection, or an advice question) - those go the normal W07 way
 * (DEFER_AFTER_CALL, handoff, W15) and are never stored as pulse feedback.
 */
export function isPulseLine(text, conv_state = {}, now_ms) {
  const t = String(text || '').trim();
  if (!t || !conv_state.pulse_line_open_until || conv_state.pulse_line_done) return false;
  if (now_ms >= ms(conv_state.pulse_line_open_until)) return false;
  const p = prefilter(t);
  if (p.stop || p.person || p.complaint || p.claim_problem || p.distress || p.injection || p.impersonation) return false;
  if (p.advice) return false; // an advice question after the call is a question for the adviser, not feedback
  // prefilter's COMPLAINT_RX is deliberately narrow (formal complaints); any complaint wording in a pulse line goes to
  // W07 so the intent model can open the complaint path (HANDOFF_COMPLAINT, 48-h reply) instead of filing it as feedback
  if (SOFT_COMPLAINT_RX.test(t)) return false;
  return true;
}

/** onPulseLine(text, c) -> { update, conv_state, reply, fact } (health detail: stored as the redaction marker only). */
export function onPulseLine(text, c) {
  const lang = c.lead?.language === 'af' ? 'af' : 'en';
  const p = prefilter(text);
  let line = p.health ? REDACTED_HEALTH : redactForStorage(String(text).replace(/\s+/gu, ' ').trim());
  // feedback is aggregate-only: phone numbers and emails have no place in it (0.3 #10 log redaction)
  line = line.replace(/\+?\d[\d ()-]{7,}\d/gu, '[number removed]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/gu, '[email removed]');
  if (line.length > LINE_MAX) line = line.slice(0, LINE_MAX - 1).trimEnd() + '…';
  const conv_state = { ...(c.lead?.conv_state || {}), pulse_line_done: true, pulse_line_open_until: null };
  return { update: { line }, conv_state, reply: LINES[lang].PULSE_LINE_THANKS, fact: { activity_type: 'lead_pulse_line', payload: { health_removed: p.health, length: line.length } } };
}

/**
 * brokerLine(rows) -> the aggregate sentence for W14 broker report / portal Reports tab, or null below REPORT_MIN_N.
 * rows = lead_pulse rows for this broker and cycle. Never names, never lines.
 */
export function brokerLine(rows = []) {
  const ans = rows.filter((r) => r.thumbs === 'up' || r.thumbs === 'down');
  if (ans.length < REPORT_MIN_N) return null;
  const up = ans.filter((r) => r.thumbs === 'up').length;
  return { n: ans.length, up, rate: Math.round((up / ans.length) * 1000) / 1000, text: `${up} of ${ans.length} people said the call was worth their time.` };
}

/**
 * judgeHints(rows) -> rows the W33 judge must include in tomorrow's WhatsApp sample (on top of its random 20):
 * every 'down' answer (with the redacted line as `lead_said`), so a poor experience is always looked at.
 * The judge grades OUR conversation (tone, FAIS, one question per message), never the adviser.
 */
export function judgeHints(rows = []) {
  return rows.filter((r) => r.thumbs === 'down').map((r) => ({ lead_id: r.lead_id, booking_id: r.booking_id || null, reason: 'lead_pulse_down', lead_said: r.line || null, priority: r.line ? 1 : 2 }));
}
