// automation/lib/w11.mjs  -  W11 broker reminders (4.6 item 7 + W11 row; 4.11 pre-call brief; 4.12a unmarked rule).
// Imported by automation/W11.json and automation/tests/W11.test.mjs. Node 18+, zero dependencies.
//  - 07:30 SAST daily digest (broker_daily_digest) for each broker with >= 1 live meeting today. No meetings -> no message.
//  - T-15 min pre-call brief (precall_brief): Sonnet writes it from the precall-brief.md input; briefCheck() gates it;
//    if the model fails or the check fails, the deterministic fallback below is sent (a brief is never skipped).
//  - Unmarked-outcome backstop at slot end + 24 h: attended + auto_marked + unconfirmed (4.12a), written with
//    ON CONFLICT (booking_id) DO NOTHING so it can never fight W12, which owns the normal path. If the lead said
//    "No, not yet" on the reach check, the backstop does nothing and queues it (W12 / Schedule D decides).
//  - Brokers see the lead as first name + initial only (compliance-qa 1.7).
import { BRIEF_HEALTH_LINE, briefCheck, sanitiseField } from '../../conversation/guardrail.mjs';

export const MIN = 60_000; export const H = 60 * MIN;
const SAST = 2 * H;
export const DIGEST_AT = '07:30';
export const BRIEF_BEFORE = 15 * MIN;
export const AUTO_ATTEND_AFTER_END = 24 * H;
const LIVE = new Set(['booked', 'confirmed']);
export const METHOD_WORDS = { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone call' };
export const AGE_WORDS = { lt35: 'under 35', '35_44': '35-44', '45_50': '45-50', '51plus': '51+' };
export const BUDGET_WORDS = { lt750: 'under R750 a month', '750_1250': 'R750 to R1,250 a month', '1250plus': 'R1,250+ (before split) a month', '1250_1499': 'R1,250 to R1,499 a month', '1500_plus': 'R1,500+ a month (priority)' };
const LANG_WORDS = { en: 'English', af: 'Afrikaans', zu: 'isiZulu', xh: 'isiXhosa', st: 'Sesotho', tn: 'Setswana' };

export const sastDate = (t) => new Date(t + SAST).toISOString().slice(0, 10);
export const hhmm = (t) => new Date(t + SAST).toISOString().slice(11, 16);
export const whoLabel = (lead) => {
  const f = sanitiseField('first_name', lead.first_name || '').value;
  if (!f) return 'first name withheld (failed check)';
  const i = String(lead.last_name || '').trim().slice(0, 1);
  return i ? `${f} ${i.toUpperCase()}.` : f;
};

/** digest(broker, bookings, now_ms) -> null | { template, vars, idempotency_key } */
export function digest(broker, bookings, now_ms) {
  const day = sastDate(now_ms);
  const today = bookings
    .filter((b) => b.broker_id === broker.id && LIVE.has(b.status) && sastDate(Date.parse(b.appointment_date)) === day)
    .sort((a, b) => Date.parse(a.appointment_date) - Date.parse(b.appointment_date));
  if (!today.length) return null;
  const list = today.map((b) => `${hhmm(Date.parse(b.appointment_date))} ${whoLabel(b.lead)} (${METHOD_WORDS[b.method]})`).join('; ');
  return { template: 'broker_daily_digest', vars: [String(broker.contact_person || '').split(' ')[0], String(today.length), list], idempotency_key: `w11:digest:${broker.id}:${day}` };
}

/** briefDue(booking, now_ms, sent:Set) -> boolean. Late bookings inside 15 min get the brief at once (before start). */
export function briefDue(booking, now_ms, sent = new Set()) {
  if (!LIVE.has(booking.status)) return false;
  const start = Date.parse(booking.appointment_date);
  return now_ms >= start - BRIEF_BEFORE && now_ms < start && !sent.has(briefKey(booking));
}
// epoch seconds, so the SQL guard can build the same key: extract(epoch from appointment_date)::bigint
export const briefKey = (b) => `w11:brief:${b.id}:${Math.floor(Date.parse(b.appointment_date) / 1000)}`;

/** The model input (precall-brief.md "Inputs"). Health detail never leaves Postgres: only health_question=true. */
export function briefInput(lead, booking, themes = [], signals = {}, corpus = []) {
  const health = themes.some((t) => t.theme === 'health');
  const callMethod = ['phone', 'whatsapp_call'].includes(booking.method);
  const callNumber = booking.call_number || lead.call_number || (callMethod ? lead.phone : null);
  const d = new Date(Date.parse(booking.appointment_date) + SAST);
  return {
    lead: { first_name: sanitiseField('first_name', lead.first_name || '').value, last_initial: String(lead.last_name || '').slice(0, 1) || null, age_band: AGE_WORDS[lead.age_band] || null, budget_band: BUDGET_WORDS[lead.budget_band] || null, bond: lead.bond ? 'yes' : 'no', dependants: lead.dependants ? 'yes' : 'no', work_cover: lead.work_cover ? 'yes' : 'no' },
    booking: { time: hhmm(Date.parse(booking.appointment_date)), date: d.toUTCString().slice(0, 11).replace(',', ''), method: booking.method, link: callMethod ? null : booking.join_url || null, rescheduled_count: booking.reschedule_count || 0 },
    contact: { call_number: callMethod ? callNumber : null, call_number_differs: Boolean(callMethod && callNumber && callNumber !== lead.phone), alt_number: lead.alt_number || null, best_time: lead.best_time || null, language: LANG_WORDS[lead.language] || 'English' },
    asked: themes.filter((t) => t.theme !== 'health' && t.theme !== 'distress' && t.words).slice(0, 6).map((t) => ({ topic: t.theme, words: t.words, deferred: Boolean(t.deferred) })),
    signals: { ...signals, health_question: health },
    adviser_corpus: corpus.slice(0, 5)
  };
}

/** Deterministic brief: used when the model fails, times out or briefCheck() blocks. */
export function fallbackBrief(lead, booking, input) {
  const callMethod = ['phone', 'whatsapp_call'].includes(booking.method);
  const asked = input.asked.map((a) => `${a.words}${a.deferred ? ' (deferred to you)' : ''}`.replace(/[\n\t]/g, ' ').replace(/ {5,}/g, ' '));
  if (input.signals.health_question) asked.push(BRIEF_HEALTH_LINE);
  const num = `${input.contact.call_number}${input.contact.call_number_differs ? ' (not the WhatsApp number)' : ''}${callMethod && input.contact.alt_number ? ` (if no answer: ${input.contact.alt_number})` : ''}`;
  const vars = {
    1: whoLabel(lead), 2: input.booking.time, 3: METHOD_WORDS[booking.method], 4: callMethod ? num : booking.method === 'teams' ? 'Teams link in the event' : 'link in the event',
    5: lead.best_time || 'not given', 6: input.lead.age_band || 'not given', 7: input.lead.budget_band || 'not given', 8: (asked.join('; ') || 'nothing yet').slice(0, 200), 9: input.contact.language
  };
  return { template_vars: vars, portal: { who: `${vars[6]}, ${vars[7]}`, asked, mattered: 'Not enough to say yet.', practical: `${vars[3]}, ${vars[4]}, ${vars[5]}, ${vars[9]}`, suggested_opening: '' } };
}

/** chooseBrief(modelJson, fallback, facts) -> { brief, used: 'llm'|'fallback', issues } */
export function chooseBrief(model, fallback, facts = {}) {
  if (model && typeof model === 'object') {
    const c = briefCheck(model, facts);
    if (c.pass) return { brief: model, used: 'llm', issues: [] };
    return { brief: fallback, used: 'fallback', issues: c.issues };
  }
  return { brief: fallback, used: 'fallback', issues: ['model output missing or invalid'] };
}
export const briefVarsArray = (brief) => ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => String(brief.template_vars[k]));

/**
 * unmarkedSweep(booking, ctx, now_ms) -> { action: 'auto_attend'|'queue'|'none', insert?, escalation? }
 * ctx = { outcome_exists, reach: 'yes'|'no'|null }
 */
export function unmarkedSweep(booking, ctx, now_ms) {
  if (ctx.outcome_exists || !LIVE.has(booking.status)) return { action: 'none' };
  const end = Date.parse(booking.ends_at);
  if (now_ms < end + AUTO_ATTEND_AFTER_END) return { action: 'none' };
  if (ctx.reach === 'no') return { action: 'queue', escalation: { kind: 'outcome_unmarked', note: 'esc_kind=outcome_unmarked; lead said the adviser did not call: W12 Schedule D decides' } };
  return {
    action: 'auto_attend',
    insert: { booking_id: booking.id, lead_id: booking.client_id, broker_id: booking.broker_id, cycle_id: booking.cycle_id, brand_id: booking.brand_id, outcome: 'attended', auto_marked: true, unconfirmed: true, marked_via: 'auto', lead_reach_check: ctx.reach || 'none' },
    appointment_status: 'attended',
    escalation: { kind: 'outcome_unmarked', note: 'esc_kind=outcome_unmarked; auto-marked attended at 24 h, unconfirmed' }
  };
}
/** 4.12a: two unconfirmed in a cycle -> Jonathan calls the broker. */
export const unconfirmedCall = (n) => n >= 2;
