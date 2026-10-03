// automation/lib/w12.mjs  -  W12 outcome, disposition & feedback (two-sided). 4.6 W12 row, 4.12a, Schedule C/D, 0.1.
// Imported by automation/W12.json (Code nodes, require('lv-automation').w12) and automation/tests/W12.test.mjs. Pure, no I/O.
//
// Every meeting is closed from BOTH sides:
//  - Broker: broker_outcome_check at slot end + 15 min (Attended / No-show / Rescheduled), ONE nudge 3 h later.
//    Attended -> the one-tap disposition list (session, the tap opened his window; 4.12a codes) -> W29 asks 1-5
//    quality and takes the optional voice note. Unmarked at 24 h -> attended + auto_marked + unconfirmed (flagged).
//  - Lead: reach_check at slot end + 30 min ("Did {adviser} reach you today?"). A broker "No-show" becomes a lead
//    no-show only when the lead stays silent for the 2-h reach window. A lead "No, not yet" waits for the broker: still
//    unmarked at broker_nudge_at -> BROKER no-show (Schedule D: apology, rebooking at our cost, KG alert, never a
//    replacement); any broker mark against it -> console conflict (KG), nothing to the lead (R6-03, lines-r6.md s.3).
// Writes: outcomes (one row per booking), appointments.status, leads.stage, lead_activities timeline. CAPI Attended
// (consent-gated in the callee). W29 `outcome_recorded` (quality index, pulse/facts). W13 `no_show` (missed_you,
// 48-h clock). W10 (rebook after a broker no-show or a broker "Rescheduled").
// Voice notes: only the WhatsApp media reference is stored here (outcomes.voice_note_url = 'whatsapp-media:{id}');
// transcription is a later step, switched on only when the provider is named in the privacy notice (P17, Q22).
import { fill, LINES } from '../../conversation/lines.mjs';
import { MIN, H, D, ms, iso, timeLabel, firstName, firstAndInitial, templateMessage, textMessage, listMessage, nowFrom, touchesLastContact } from './wa.mjs';
export { MIN, H, D, iso, nowFrom, touchesLastContact };

export const OUTCOME_CHECK_AFTER_END = 15 * MIN; // broker
export const REACH_CHECK_AFTER_END = 30 * MIN; // lead (fixtures _meta: anchored on slot end, like the broker's)
export const BROKER_NUDGE_AFTER = 3 * H; // one nudge
export const AUTO_ATTEND_AFTER_END = 24 * H;
export const REACH_WINDOW = 2 * H; // fixtures _meta REACH_CHECK_WINDOW_H
export const FIT_FOLLOWUP_AFTER = 7 * D;
export const STALE_AFTER_END = 48 * H; // the sweep stops looking at a meeting after this
// 4.12a order = broker_disposition.json button order = session list row order.
export const CODES = ['fit_proceeding', 'fit_followup', 'nofit_budget', 'nofit_covered', 'nofit_criteria', 'unreachable'];
export const REPLACEMENT_CODES = new Set(['unreachable', 'nofit_criteria']); // 4.12a: "nothing else does"
// Template button text (<= 25 chars, see templates README) -> code. Same order as broker_disposition.json.
export const BUTTON_TO_CODE = {
  'Good fit – proceeding': 'fit_proceeding',
  'Good fit – follow-up': 'fit_followup',
  'Not a fit – budget': 'nofit_budget',
  'Not a fit – well covered': 'nofit_covered',
  'Not a fit – criteria': 'nofit_criteria',
  'Unreachable/wrong number': 'unreachable'
};
const SECTIONS = [['Good fit', ['fit_proceeding', 'fit_followup']], ['Not a fit', ['nofit_budget', 'nofit_covered', 'nofit_criteria']], ['Could not talk', ['unreachable']]];
const CODE_TO_BUTTON = Object.fromEntries(Object.entries(BUTTON_TO_CODE).map(([k, v]) => [v, k]));

// R6-03 / I-49b: the approved line lives in conversation/lines.mjs (lines-v1.2.0, EN + AF); the lib/w12 draft is gone.
// Session text: the lead's "No, not yet" tap opened the window. W10 follows with the new times (Schedule D, at our cost).
export const BROKER_NO_SHOW_APOLOGY = Object.freeze({ en: LINES.en.BROKER_NO_SHOW_APOLOGY, af: LINES.af.BROKER_NO_SHOW_APOLOGY });

export function postCallPlan(slotEnd) {
  const e = ms(slotEnd);
  return {
    outcome_check_at: iso(e + OUTCOME_CHECK_AFTER_END),
    broker_nudge_at: iso(e + OUTCOME_CHECK_AFTER_END + BROKER_NUDGE_AFTER),
    reach_check_at: iso(e + REACH_CHECK_AFTER_END),
    auto_attend_at: iso(e + AUTO_ATTEND_AFTER_END)
  };
}

/**
 * Resolve the outcome from both sides at time `now`.
 * @param m { slotEnd, brokerMark: 'attended'|'no_show'|'rescheduled'|null, reach: 'yes'|'no'|null, disposition (4.12a code, when known), consentAds, optedOut, leadId }
 */
export function resolveOutcome(m, now) {
  const p = postCallPlan(m.slotEnd);
  const r = { outcome: 'pending', auto_marked: false, unconfirmed: false, lead_reach_check: m.reach ?? 'none', dispute_status: null, lead_message: null, capi: [], alerts: [], next: null };
  const attended = (extra = {}) => {
    Object.assign(r, { outcome: 'attended', ...extra });
    if (!m.optedOut) r.lead_message = 'attended_thanks';
    if (m.consentAds !== false) r.capi.push({ event_name: 'Attended', event_id: `evt_${m.leadId}_attended` });
    r.next = r.next || 'W12_disposition';
    return r;
  };
  // R6-03 / I-49b (lines-r6.md section 3): the lead's "No, not yet" resolves nothing on its own. The broker has until
  // broker_nudge_at to mark; whatever he marks, the lead gets no apology. A mark that contradicts the lead's "No" is a
  // conflict for KG in the console (amber), nothing to the lead until KG decides. "Unreachable/wrong number" is the
  // normal W13 replacement path (W29), so no conflict. Only if he is still unmarked at broker_nudge_at: broker no-show.
  if (m.reach === 'no') {
    if (m.brokerMark === 'rescheduled') return Object.assign(r, { outcome: 'rescheduled', dispute_status: 'open', next: 'console_queue' }); // no W10 offer until KG decides
    if (m.brokerMark === 'attended') {
      if (m.disposition === 'unreachable') { attended(); r.lead_message = null; return r; } // W29 -> W13 replacement
      attended({ dispute_status: 'open', next: 'console_queue' }); r.lead_message = null; return r; // no thank-you either
    }
    if (m.brokerMark === 'no_show') return Object.assign(r, { outcome: 'disputed', dispute_status: 'open', next: 'console_queue' });
    if (now < ms(p.broker_nudge_at)) return r; // pending: the existing sweep wakes at broker_nudge_at, no new timer
    Object.assign(r, { outcome: 'broker_no_show', lead_message: m.optedOut ? null : 'broker_no_show_apology', next: 'rebook_at_our_cost' });
    r.alerts.push('KG');
    return r;
  }
  if (m.brokerMark === 'rescheduled') return Object.assign(r, { outcome: 'rescheduled', next: 'W10' });
  if (m.brokerMark === 'attended') return attended();
  if (m.brokerMark === 'no_show') {
    if (m.reach === 'yes') return Object.assign(r, { outcome: 'disputed', dispute_status: 'open', next: 'console_queue' });
    const confirmAt = ms(p.reach_check_at) + REACH_WINDOW;
    // missed_you is the lead's message on this path; W13 sends it (templates README) and starts the 48-h clock.
    if (now >= confirmAt) return Object.assign(r, { outcome: 'no_show', no_show_confirmed_at: iso(confirmAt), lead_message: m.optedOut ? null : 'missed_you', next: 'W13' });
    return r; // waiting for the lead's side
  }
  if (now >= ms(p.auto_attend_at)) return attended({ auto_marked: true, unconfirmed: true });
  return r;
}

/** Broker's disposition + quality (only after attended). Same rules as lib/w29.mjs applyDisposition / applyQuality. */
export function recordDisposition(outcome, { code, quality, at }) {
  if (outcome.outcome !== 'attended') throw new Error('disposition only after attended');
  if (!CODES.includes(code)) throw new Error(`unknown code ${code}`);
  if (quality !== undefined && quality !== null && !(Number.isInteger(quality) && quality >= 1 && quality <= 5)) throw new Error('quality must be 1-5');
  return {
    disposition_code: code,
    quality_score: quality ?? null,
    counts_as_delivered: true,
    replacement_eligible: REPLACEMENT_CODES.has(code),
    broker_fit_followup_at: code === 'fit_followup' ? iso(ms(at) + FIT_FOLLOWUP_AFTER) : null
  };
}

/** 4.12a friction rule: two unconfirmed in a cycle -> Jonathan calls the broker. */
export const unconfirmedAlert = (outcomesInCycle) => (outcomesInCycle.filter((o) => o.unconfirmed).length >= 2 ? ['Jonathan: call broker'] : []);

// ---------------------------------------------------------------------------------------------------------------
// Entries and taps
// ---------------------------------------------------------------------------------------------------------------
const BROKER_MARK = { attended: 'attended', no_show: 'no_show', rescheduled: 'rescheduled' };

/** parseTap(msg) -> { side: 'broker', mark, booking_id } | { side: 'lead', answer, booking_id } | null */
export function parseTap(msg = {}) {
  const [k, ...rest] = String(msg.payload || msg.list_id || '').split(':');
  const booking_id = rest.join(':') || null;
  if (BROKER_MARK[k]) return { side: 'broker', mark: BROKER_MARK[k], booking_id };
  if (k === 'reach_yes' || k === 'reach_no') return { side: 'lead', answer: k === 'reach_yes' ? 'yes' : 'no', booking_id };
  return null;
}

/** classifyOp(input) -> 'tick'|'auto_attended'|'broker_tap'|'reach'|'voice_note'|'feedback'|'reject' */
export function classifyOp(input = {}) {
  if (input.event === 'auto_attended') return 'auto_attended';
  if (['tick', 'feedback', 'voice_note'].includes(input.op)) return input.op;
  const t = parseTap(input.msg);
  if (t) return t.side === 'broker' ? 'broker_tap' : 'reach';
  if (input.msg?.media === 'audio') return 'voice_note';
  return 'reject';
}

/** CONTRACTS: required fields per entry; missing -> lead_activities subcall_rejected, stop. */
export function validateInput(op, input = {}) {
  const missing = [];
  if (op === 'auto_attended' && !input.outcome_id) missing.push('outcome_id');
  if ((op === 'broker_tap' || op === 'reach') && !parseTap(input.msg)?.booking_id) missing.push('msg.payload booking id');
  if (op === 'feedback' && !input.booking_id) missing.push('booking_id');
  if (op === 'voice_note' && !(input.msg?.media_id || input.media_id)) missing.push('media_id');
  if (op === 'reject') missing.push('op');
  return missing.length ? { ok: false, missing } : { ok: true };
}

/**
 * sweepActions(row, now) -> [{ kind }] for one finished meeting (W12.json 5-minute sweep).
 * row = { slot_end, sent: { outcome_check, reach_check, broker_nudge }, brokerMark, reach, outcome_exists, optedOut }
 * kinds: outcome_check (broker), broker_nudge (broker, once), reach_check (lead), resolve.
 */
export function sweepActions(row, now) {
  const p = postCallPlan(row.slot_end);
  const end = ms(row.slot_end);
  const out = [];
  if (row.outcome_exists || now >= end + STALE_AFTER_END) return out;
  const sent = row.sent || {};
  if (!row.brokerMark && now < ms(p.auto_attend_at)) {
    if (!sent.outcome_check && now >= ms(p.outcome_check_at)) out.push({ kind: 'outcome_check' });
    else if (sent.outcome_check && !sent.broker_nudge && now >= ms(p.broker_nudge_at)) out.push({ kind: 'broker_nudge' });
  }
  if (!sent.reach_check && !row.reach && !row.optedOut && row.brokerMark !== 'rescheduled' && now >= ms(p.reach_check_at) && now < end + AUTO_ATTEND_AFTER_END) out.push({ kind: 'reach_check' });
  const r = resolveOutcome({ slotEnd: row.slot_end, brokerMark: row.brokerMark || null, reach: row.reach || null, disposition: row.disposition || null, consentAds: row.consentAds, optedOut: row.optedOut, leadId: row.lead_id }, now);
  if (r.outcome !== 'pending') out.push({ kind: 'resolve', r });
  return out;
}

/**
 * outcomeRow(r, ctx) -> values for the outcomes upsert, or null when nothing is written (pending / disputed:
 * the console decides, nothing is guessed). marked_at of a lead no-show = the moment it was confirmed.
 */
export function outcomeRow(r, { now, via = 'whatsapp' } = {}) {
  if (!['attended', 'no_show', 'broker_no_show', 'rescheduled'].includes(r.outcome)) return null;
  return {
    outcome: r.outcome,
    lead_reach_check: r.lead_reach_check || 'none',
    auto_marked: Boolean(r.auto_marked),
    unconfirmed: Boolean(r.unconfirmed),
    marked_via: r.auto_marked ? 'auto' : via,
    marked_at: r.no_show_confirmed_at || iso(now),
    dispute_status: r.dispute_status === 'open' ? 'open' : 'none',
    appointment_status: { attended: 'attended', no_show: 'no_show', broker_no_show: 'no_show', rescheduled: 'rescheduled' }[r.outcome],
    lead_stage: { attended: 'attended', no_show: 'no_show', broker_no_show: null, rescheduled: null }[r.outcome]
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Messages (templates in automation/templates; variable counts are checked by the tests)
// ---------------------------------------------------------------------------------------------------------------
const brokerTo = (broker) => broker.adviser_whatsapp || broker.whatsapp_number;

/** broker_outcome_check: 1 adviser first name · 2 time · 3 lead first name + initial; QR Attended · No-show · Rescheduled. */
export function outcomeCheckMessage(booking, lead, broker) {
  const bk = booking.id;
  return { to: 'broker', template: 'broker_outcome_check', wa: templateMessage(brokerTo(broker), 'broker_outcome_check', {
    body: [firstName(broker.adviser_name || broker.contact_person), timeLabel(booking.appointment_date), firstAndInitial(lead)],
    buttons: [{ quick_reply: `attended:${bk}` }, { quick_reply: `no_show:${bk}` }, { quick_reply: `rescheduled:${bk}` }]
  }) };
}

/** reach_check: 1 first_name · 2 adviser_name; QR Yes, we spoke · No, not yet (payloads reach_yes / reach_no). */
export function reachCheckMessage(booking, lead, broker) {
  const bk = booking.id;
  return { to: 'lead', template: 'reach_check', wa: templateMessage(lead.phone, 'reach_check', {
    body: [String(lead.first_name || '').trim() || 'there', broker.adviser_name || broker.contact_person],
    buttons: [{ quick_reply: `reach_yes:${bk}` }, { quick_reply: `reach_no:${bk}` }]
  }) };
}

/** attended_thanks: 1 first_name · 2 adviser_name. Nothing else from us after the call (FAIS: the adviser follows up). */
export function attendedThanksMessage(lead, broker) {
  return { to: 'lead', template: 'attended_thanks', wa: templateMessage(lead.phone, 'attended_thanks', { body: [String(lead.first_name || '').trim() || 'there', broker.adviser_name || broker.contact_person] }) };
}

/** The in-window disposition list (automation/templates/session/broker_disposition_list.json, row ids = 4.12a codes). */
export function dispositionListMessage(lead, broker) {
  return { to: 'broker', template: null, wa: listMessage(brokerTo(broker), {
    body: `Thanks. Which best describes ${firstAndInitial(lead)} after the call? Pick the closest one.`,
    footer: 'SortMyCover by Lead Velocity',
    button: 'Choose one',
    sections: SECTIONS.map(([title, codes]) => ({ title, rows: codes.map((id) => ({ id, title: CODE_TO_BUTTON[id] })) }))
  }) };
}

/** Out-of-window fallback: broker_disposition template (1 lead first name + initial; 6 QR, payload {code}:{booking_id}). */
export function dispositionTemplateMessage(booking, lead, broker) {
  return { to: 'broker', template: 'broker_disposition', wa: templateMessage(brokerTo(broker), 'broker_disposition', { body: [firstAndInitial(lead)], buttons: CODES.map((c) => ({ quick_reply: `${c}:${booking.id}` })) }) };
}

/** Disposition ask after an Attended tap: list inside the broker's 24-h window, template outside it. */
export function dispositionAsk(booking, lead, broker, { broker_last_inbound_ms, now }) {
  const open = Number.isFinite(broker_last_inbound_ms) && now - broker_last_inbound_ms < 24 * H;
  return open ? dispositionListMessage(lead, broker) : dispositionTemplateMessage(booking, lead, broker);
}

/** Schedule D apology (session text; the lead's "No, not yet" opened the window). */
export function brokerNoShowApology(lead, broker) {
  const lang = BROKER_NO_SHOW_APOLOGY[lead.language] ? lead.language : 'en';
  return { to: 'lead', template: null, wa: textMessage(lead.phone, fill(BROKER_NO_SHOW_APOLOGY[lang], { first_name: String(lead.first_name || '').trim() || 'there', adviser_first: firstName(broker.adviser_name || broker.contact_person) })) };
}

/** Voice note: keep only the reference (no audio, no transcript here). */
export function voiceNoteRef(msg = {}) {
  const id = msg.media_id || null;
  if (!id || (msg.media && msg.media !== 'audio')) return null;
  return { voice_note_url: `whatsapp-media:${id}`, media_id: id };
}

/** Sub-call payloads. */
export const capiAttended = (lead, brandId) => ({ event_name: 'Attended', event_id: `evt_${lead.id}_attended`, action_source: 'system_generated', lead_id: lead.id, brand_id: brandId });
export const w13NoShow = (outcomeId, booking, leadId, confirmedAt) => ({ op: 'no_show', outcome_id: outcomeId, booking_id: booking.id, lead_id: leadId, confirmed_at: confirmedAt, idempotency_key: `w12:no_show:${booking.id}` });
export const w10Rebook = (booking, lead, why) => ({ source: 'W12', outcome: 'rescheduled', reason: why, schedule_d: why === 'broker_no_show', booking: { id: booking.id }, lead: { id: lead.id } });

/** Lines the lead may get from W12, by resolveOutcome().lead_message. */
export const LEAD_MESSAGE_OWNER = { attended_thanks: 'W12', broker_no_show_apology: 'W12', missed_you: 'W13' };

// ---------------------------------------------------------------------------------------------------------------
// Row adapters for automation/W12.json (one SQL row per meeting -> uniform items). Tested in W12.test.mjs.
// ---------------------------------------------------------------------------------------------------------------
const partsOf = (r = {}) => ({
  booking: { id: r.booking_id, appointment_date: r.appointment_date },
  lead: { id: r.lead_id, first_name: r.first_name, last_name: r.last_name, phone: r.phone, language: r.language },
  broker: { adviser_name: r.adviser_name, contact_person: r.contact_person, adviser_whatsapp: r.adviser_whatsapp, whatsapp_number: r.whatsapp_number }
});
const sendItem = (r, m, key, extra = {}) => ({ fu: 'send', send: { to: m.to, wa: m.wa, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, template: m.template, category: m.template ? 'utility' : 'service', key, workflow: 'W12', ...extra } });

/** meetingFromRow(row) -> the sweepActions() input for one "Meeting state" row. */
export const meetingFromRow = (r = {}) => ({
  slot_end: r.slot_end, lead_id: r.lead_id,
  sent: { outcome_check: Boolean(r.sent_outcome_check), broker_nudge: Boolean(r.sent_broker_nudge), reach_check: Boolean(r.sent_reach_check) },
  brokerMark: r.broker_mark || null, reach: r.reach || null, disposition: r.disposition_code || null, outcome_exists: Boolean(r.outcome_exists), optedOut: Boolean(r.opted_out_at)
});

/**
 * sweepItems(row, now_ms) -> items for W12.json: { fu: 'send', send } for outcome_check / broker_nudge / reach_check
 * (key w12:{kind}:{booking_id}, claimed before the send), or { fu: 'resolve', r, o } when the meeting resolves.
 */
export function sweepItems(r = {}, now) {
  const { booking, lead, broker } = partsOf(r);
  return sweepActions(meetingFromRow(r), now).map((a) => {
    if (a.kind === 'outcome_check' || a.kind === 'broker_nudge') return sendItem(r, outcomeCheckMessage(booking, lead, broker), `w12:${a.kind}:${r.booking_id}`, { claim: true });
    if (a.kind === 'reach_check') return sendItem(r, reachCheckMessage(booking, lead, broker), `w12:reach_check:${r.booking_id}`, { claim: true });
    return { fu: 'resolve', r: a.r, o: outcomeRow(a.r, { now }), row: r };
  });
}

/**
 * followUps(r, row, outcome_id) -> items after the outcomes row was inserted (first writer only):
 *   send (attended_thanks | broker no-show apology), capi (Attended), w29 (outcome_recorded, every outcome),
 *   w13 (lead no-show: missed_you + 48-h clock), w10 (broker no-show rebook at our cost / broker "Rescheduled"),
 *   alert (KG on a broker no-show).
 */
export function followUps(r, row = {}, outcomeId, brandId = row.brand_id) {
  const { booking, lead, broker } = partsOf(row);
  const out = outcomeId ? [{ fu: 'w29', event: 'outcome_recorded', outcome_id: outcomeId }] : []; // disputed: no row, alert only
  if (r.lead_message === 'attended_thanks') out.push(sendItem(row, attendedThanksMessage(lead, broker), `w12:attended_thanks:${row.booking_id}`));
  if (r.lead_message === 'broker_no_show_apology') out.push(sendItem(row, brokerNoShowApology(lead, broker), `w12:apology:${row.booking_id}`));
  for (const c of r.capi || []) if (c.event_name === 'Attended') out.push({ fu: 'capi', ...capiAttended(lead, brandId) });
  if (r.outcome === 'no_show') out.push({ fu: 'w13', ...w13NoShow(outcomeId, booking, row.lead_id, r.no_show_confirmed_at) });
  if (r.outcome === 'broker_no_show') out.push({ fu: 'w10', ...w10Rebook(booking, lead, 'broker_no_show') });
  if (r.outcome === 'rescheduled' && r.dispute_status !== 'open') out.push({ fu: 'w10', ...w10Rebook(booking, lead, 'broker_rescheduled') });
  for (const a of r.alerts || []) out.push({ fu: 'alert', to: a, kind: 'other', severity: 'urgent', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: brandId, booking_id: row.booking_id, note: `esc_kind=broker_no_show; ${firstAndInitial(lead)}: the lead says ${firstName(broker.adviser_name || broker.contact_person)} did not call (Schedule D: apology sent, rebooking at our cost, no replacement).` });
  if (r.outcome === 'disputed' || r.dispute_status === 'open') out.push({ fu: 'alert', to: 'console', kind: 'outcome_unmarked', severity: 'normal', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: brandId, booking_id: row.booking_id, note: `esc_kind=outcome_disputed; ${firstAndInitial(lead)}: broker marked ${row.broker_mark || 'nothing'}, lead answered ${row.reach || 'nothing'}. KG reviews in the console; nothing goes to the lead until KG decides, and no replacement is opened automatically (an Unreachable/wrong number disposition takes the normal W13 path).` });
  return out;
}

/** Disposition ask item after an Attended tap (the tap opened the broker's window -> list) or a portal `feedback` op. */
export function dispositionItem(row = {}, now, brokerLastInboundMs) {
  const { booking, lead, broker } = partsOf(row);
  const m = dispositionAsk(booking, lead, broker, { broker_last_inbound_ms: brokerLastInboundMs, now });
  return sendItem(row, m, `w12:disposition_ask:${row.booking_id}:${m.template ? 'tpl' : 'list'}`, { claim: true });
}
