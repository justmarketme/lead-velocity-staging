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
import { QUAL_BUDGET } from './w01.mjs';
import { GOOD_FIT } from './w29.mjs';
export { MIN, H, D, iso, nowFrom, touchesLastContact };

export const OUTCOME_CHECK_AFTER_END = 15 * MIN; // broker
export const REACH_CHECK_AFTER_END = 30 * MIN; // lead (fixtures _meta: anchored on slot end, like the broker's)
export const BROKER_NUDGE_AFTER = 3 * H; // one nudge
export const AUTO_ATTEND_AFTER_END = 24 * H;
export const REACH_WINDOW = 2 * H; // fixtures _meta REACH_CHECK_WINDOW_H
export const FIT_FOLLOWUP_AFTER = 7 * D;
export const STALE_AFTER_END = 48 * H; // the sweep stops looking at a meeting after this
// I-51b (b): CAPI Attended cannot be recalled once sent, so it goes only when the lead has had her say. Meta takes an
// event up to 7 days old (ASSUMPTION, CONTRACTS "CAPI Attended hold"); a held event is dropped 12 h before that edge.
export const CAPI_META_WINDOW = 7 * D;
export const CAPI_HOLD_MAX = CAPI_META_WINDOW - 12 * H;

/**
 * capiAttendedGate(m, now) -> { action: 'send'|'hold'|'drop', reason }  (I-51b a, b, c). Pure; the ONE place that decides.
 * m = { slotEnd, reach: 'yes'|'no'|null, disposition, kgDecision: 'attended'|'not_attended'|null, consentAds }
 *  drop  unreachable_disposition (c) | kg_not_attended (a) | no_ads_consent | meta_window_expired (held too long)
 *  send  kg_attended (a, same event_id: Meta dedupes) | lead_confirmed | lead_window_closed (b: end + 30 min + 2 h)
 *  hold  conflict_pending_kg (broker Attended vs lead "No") | awaiting_lead (b)
 */
export function capiAttendedGate(m, now) {
  const end = ms(m.slotEnd);
  if (m.disposition === 'unreachable') return { action: 'drop', reason: 'unreachable_disposition' };
  if (m.kgDecision === 'not_attended') return { action: 'drop', reason: 'kg_not_attended' };
  if (m.consentAds === false) return { action: 'drop', reason: 'no_ads_consent' };
  if (now >= end + CAPI_HOLD_MAX) return { action: 'drop', reason: 'meta_window_expired' };
  if (m.kgDecision === 'attended') return { action: 'send', reason: 'kg_attended' };
  if (m.reach === 'no') return { action: 'hold', reason: 'conflict_pending_kg' };
  if (m.reach === 'yes') return { action: 'send', reason: 'lead_confirmed' };
  if (now >= end + REACH_CHECK_AFTER_END + REACH_WINDOW) return { action: 'send', reason: 'lead_window_closed' };
  return { action: 'hold', reason: 'awaiting_lead' };
}
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
    // I-51b: CAPI Attended goes through capiAttendedGate (hold until the lead answered or her window closed; never on
    // unreachable; never against a lead "No" until KG decides). Held/dropped events are logged by followUps().
    const g = capiAttendedGate({ slotEnd: m.slotEnd, reach: m.reach ?? null, disposition: m.disposition ?? null, kgDecision: m.kgDecision ?? null, consentAds: m.consentAds }, now);
    r.capi_gate = g;
    if (g.action === 'send') r.capi.push({ event_name: 'Attended', event_id: `evt_${m.leadId}_attended` });
    else if (g.action === 'hold') r.capi_held = ['Attended'];
    else r.capi_dropped = g.reason;
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
      if (m.disposition === 'unreachable') { attended(); r.lead_message = null; return r; } // W29 -> W13 replacement; gate drops CAPI (c)
      attended({ dispute_status: 'open', next: 'console_queue' }); r.lead_message = null; // no thank-you either
      // I-50f / I-51b (a): the gate HOLDS Attended (reach 'no') while KG decides; releaseHeld() sends it (same event_id)
      // on KG "attended" or drops it with a logged reason on "not_attended" (op kg_decision).
      return r;
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

/** 4.12a friction rule: two unconfirmed outcomes for one broker within 30 days -> Jonathan calls the broker. */
export const unconfirmedAlert = (recentOutcomes) => (recentOutcomes.filter((o) => o.unconfirmed).length >= 2 ? ['Jonathan: call broker'] : []);

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
  if (['tick', 'feedback', 'voice_note', 'kg_decision'].includes(input.op)) return input.op;
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
  if (op === 'kg_decision') { if (!input.booking_id) missing.push('booking_id'); if (!KG_DECISIONS.includes(input.decision)) missing.push('decision (attended|not_attended)'); }
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

/**
 * v4b16 (19 Oct 2026): the lead's "Yes, we spoke" tap gets a short reply at once (session text: the tap opened her
 * 24-h window). It is her thank-you: attended_thanks is not sent again once this went (followUps reads
 * sent_reach_thanks). No price wording, nothing about how the adviser is paid.
 */
export function reachThanksMessage(lead, broker) {
  const adv = firstName(broker.adviser_name || broker.contact_person) || 'Your adviser';
  const first = String(lead.first_name || '').trim();
  return { to: 'lead', template: null, wa: textMessage(lead.phone, `Thanks${first ? ', ' + first : ''}. Glad you and ${adv} could talk. ${adv} will follow up with you directly.`) };
}
export const REACH_THANKS_WINDOW = 23 * H; // a tap older than this is outside her 24-h window: no session reply

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
export const capiAttended = (lead, brandId, eventTime) => ({ event_name: 'Attended', event_id: `evt_${lead.id}_attended`, action_source: 'system_generated', lead_id: lead.id, brand_id: brandId, ...(eventTime ? { event_time: eventTime } : {}) });

// ---------------------------------------------------------------------------------------------------------------
// CAPI quality events (19 Oct 2026): Qualified and GoodFit give Meta the lead-quality signal the media plan steers by
// (campaign-spec 11.1: cost per qualified lead <= R250, cost per good-fit meeting <= R1,300). Both are read from the
// database on the 5-min tick, not sent by each writer: qualified_at is written by W03 (taps, Instant Form band, web band),
// W39 (/start/) and the capture Flow, and a disposition by W29 (WhatsApp) or the broker portal (outcomes, direct), so
// one sweep covers every path. Dedupe is capi_log (unique event_id + event_name), the callee's own rule.
// Qualified follows Lead / Schedule: a lead with a ctwa_clid sends the click reference only (business_messaging, Jono
// 18 Oct; the callee names it QualifiedLead for Meta, the qualifying taps happen in the chat); any other lead is offline
// (system_generated) behind the ads-consent gate inside the callee. GoodFit follows Attended: always offline. A meeting
// outcome is not a chat event and Meta's business-messaging list has no name for it (lib/sub-capi-send.mjs).
// ---------------------------------------------------------------------------------------------------------------
/** Budget bands (DB codes) that make a lead Qualified for Meta: tiers A/B, the same set qualified_at follows on W39 / Instant Form. */
export const CAPI_QUALIFIED_BANDS = [...QUAL_BUDGET];
/** Good-fit dispositions (4.12a "Good fit" section; W29 GOOD_FIT). */
export const CAPI_GOOD_FIT_CODES = [...GOOD_FIT];
/** GoodFit carries the broker's 1-5 rating as value; on WhatsApp the rating comes after the disposition, so wait this long for it. */
export const GOODFIT_VALUE_WAIT = 2 * H;
/** The sweep looks back as far as a held Attended may wait (Meta's 7-day edge minus 12 h). */
export const QUALITY_SWEEP_LOOKBACK_H = CAPI_HOLD_MAX / H;

export const capiQualified = (row) => ({ event_name: 'Qualified', event_id: `evt_${row.lead_id}_qualified`,
  ...(row.ctwa_clid ? { action_source: 'business_messaging', ctwa_clid: row.ctwa_clid } : { action_source: 'system_generated' }),
  lead_id: row.lead_id, brand_id: row.brand_id, ...(row.event_time ? { event_time: row.event_time } : {}) });
export const capiGoodFit = (row) => ({ event_name: 'GoodFit', event_id: `evt_${row.lead_id}_goodfit`, action_source: 'system_generated', lead_id: row.lead_id, brand_id: row.brand_id,
  ...(Number.isInteger(row.quality_score) ? { value: row.quality_score } : {}), ...(row.event_time ? { event_time: row.event_time } : {}) });

/**
 * qualityEventItems(rows, now) -> Follow-up items { fu: 'capi', ...CAPI Send input }.
 * rows = "Quality events due" SQL rows { event_name: 'Qualified'|'GoodFit', lead_id, brand_id, ctwa_clid, event_time, quality_score }.
 * The SQL already applies the bands, codes, look-back, consent pre-filter and the capi_log dedupe; this guards the same
 * edges again (so a hand-run query cannot send a stale or wrong event) and holds an unrated GoodFit for GOODFIT_VALUE_WAIT.
 */
export function qualityEventItems(rows = [], now) {
  const out = [];
  for (const r of rows) {
    if (!r || !r.lead_id) continue;
    const at = ms(r.event_time);
    if (!Number.isFinite(at) || at > now || now - at >= CAPI_HOLD_MAX) continue;
    if (r.event_name === 'Qualified') out.push({ fu: 'capi', ...capiQualified(r) });
    else if (r.event_name === 'GoodFit') {
      const q = r.quality_score == null ? null : Number(r.quality_score);
      if (q === null && now - at < GOODFIT_VALUE_WAIT) continue; // rating may still come (W29 asks it after the disposition)
      out.push({ fu: 'capi', ...capiGoodFit({ ...r, quality_score: q }) });
    }
  }
  return out;
}
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
/** Why a message had nobody to go to (19 Oct 2026: a broker row with no WhatsApp number crashed "Store outbound"). */
export const NO_RECIPIENT = Object.freeze({ broker: 'no_broker_whatsapp', lead: 'no_lead_phone' });
const hasNumber = (to) => String(to ?? '').replace(/\D/g, '').length >= 9;
/**
 * sendItem -> { fu: 'send', send } or, with no number to send to, { fu: 'send_skipped', skip } (never a send with a NULL
 * recipient). A claimed message (outcome_check / broker_nudge / reach_check / disposition_ask) is claimed with the skip
 * under its own key, so the sweep moves on exactly as after a send (the nudge still comes at + 3 h, the 24-h auto-attend
 * still runs); any other message logs under send_skipped:{key}, so it never looks sent (w12:apology is read by the late
 * mark check). A broker with no number also raises ONE console escalation per booking: nobody can ask him how it went.
 */
const sendItem = (r, m, key, extra = {}) => {
  if (!hasNumber(m.wa && m.wa.to)) {
    const reason = NO_RECIPIENT[m.to] || 'no_recipient';
    const skip = { to: m.to, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, booking_id: r.booking_id || null, template: m.template || null, key: extra.claim ? key : `send_skipped:${key}`, reason, workflow: 'W12' };
    const out = { fu: 'send_skipped', skip };
    if (m.to === 'broker') {
      const { lead, broker } = partsOf(r);
      const who = firstName(broker.adviser_name || broker.contact_person) || 'The adviser';
      out.alert = { fu: 'alert', to: 'console', kind: 'other', severity: 'normal', lead_id: r.lead_id, broker_id: r.broker_id, brand_id: r.brand_id, booking_id: r.booking_id,
        note: `esc_kind=broker_no_whatsapp; ${firstAndInitial(lead)}: ${who} has no WhatsApp number on the broker record (adviser_whatsapp / whatsapp_number), so W12 could not send ${m.template || 'the disposition list'}. Add the number or mark the outcome in the portal; unmarked at 24 h it counts as attended (unconfirmed).` };
    }
    return out;
  }
  return { fu: 'send', send: { to: m.to, wa: m.wa, lead_id: r.lead_id, brand_id: r.brand_id, broker_id: r.broker_id, template: m.template, category: m.template ? 'utility' : 'service', key, workflow: 'W12', ...extra } };
};

/** meetingFromRow(row) -> the sweepActions() input for one "Meeting state" row. */
export const meetingFromRow = (r = {}) => ({
  slot_end: r.slot_end, lead_id: r.lead_id,
  sent: { outcome_check: Boolean(r.sent_outcome_check), broker_nudge: Boolean(r.sent_broker_nudge), reach_check: Boolean(r.sent_reach_check), reach_thanks: Boolean(r.sent_reach_thanks) },
  brokerMark: r.broker_mark || null, reach: r.reach || null, disposition: r.disposition_code || null, outcome_exists: Boolean(r.outcome_exists), optedOut: Boolean(r.opted_out_at)
});

/**
 * sweepItems(row, now_ms) -> items for W12.json: { fu: 'send', send } for outcome_check / broker_nudge / reach_check
 * (key w12:{kind}:{booking_id}, claimed before the send), or { fu: 'resolve', r, o } when the meeting resolves.
 */
export function sweepItems(r = {}, now) {
  const { booking, lead, broker } = partsOf(r);
  const actions = sweepActions(meetingFromRow(r), now);
  const items = actions.map((a) => {
    if (a.kind === 'outcome_check' || a.kind === 'broker_nudge') return sendItem(r, outcomeCheckMessage(booking, lead, broker), `w12:${a.kind}:${r.booking_id}`, { claim: true });
    if (a.kind === 'reach_check') return sendItem(r, reachCheckMessage(booking, lead, broker), `w12:reach_check:${r.booking_id}`, { claim: true });
    return { fu: 'resolve', r: a.r, o: outcomeRow(a.r, { now }), row: r };
  });
  // v4b16: "Yes, we spoke" while the outcome is still open -> reply once (claimed key). When this pass resolves the
  // meeting (or disputes it), attended_thanks / the console takes over instead.
  if (r.reach === 'yes' && !r.sent_reach_thanks && !r.opted_out_at && !actions.some((a) => a.kind === 'resolve')
      && !(r.reach_at && now - ms(r.reach_at) > REACH_THANKS_WINDOW)) {
    items.push(sendItem(r, reachThanksMessage(lead, broker), `w12:reach_thanks:${r.booking_id}`, { claim: true }));
  }
  return items;
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
  if (r.lead_message === 'attended_thanks' && !row.sent_reach_thanks) out.push(sendItem(row, attendedThanksMessage(lead, broker), `w12:attended_thanks:${row.booking_id}`));
  if (r.lead_message === 'broker_no_show_apology') out.push(sendItem(row, brokerNoShowApology(lead, broker), `w12:apology:${row.booking_id}`));
  for (const c of r.capi || []) if (c.event_name === 'Attended') out.push({ fu: 'capi', ...capiAttended(lead, brandId, row.slot_end) });
  // I-51b: a held Attended is parked (w12:capi_hold row = the release queue); a dropped one is logged with its reason.
  const capiKeys = { lead_id: row.lead_id, brand_id: brandId, broker_id: row.broker_id, booking_id: row.booking_id, event_id: `evt_${row.lead_id}_attended`, event_time: row.slot_end || null };
  if ((r.capi_held || []).length) out.push({ fu: 'capi_hold', ...capiKeys, reason: r.capi_gate?.reason || 'awaiting_lead' });
  if (r.capi_dropped) out.push({ fu: 'capi_release', ...capiKeys, decision: 'drop', reason: r.capi_dropped });
  if (r.outcome === 'no_show') out.push({ fu: 'w13', ...w13NoShow(outcomeId, booking, row.lead_id, r.no_show_confirmed_at) });
  if (r.outcome === 'broker_no_show') out.push({ fu: 'w10', ...w10Rebook(booking, lead, 'broker_no_show') });
  if (r.outcome === 'rescheduled' && r.dispute_status !== 'open') out.push({ fu: 'w10', ...w10Rebook(booking, lead, 'broker_rescheduled') });
  for (const a of r.alerts || []) out.push({ fu: 'alert', to: a, kind: 'other', severity: 'urgent', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: brandId, booking_id: row.booking_id, note: `esc_kind=broker_no_show; ${firstAndInitial(lead)}: the lead says ${firstName(broker.adviser_name || broker.contact_person)} did not call (Schedule D: apology sent, rebooking at our cost, no replacement).` });
  if (r.outcome === 'disputed' || r.dispute_status === 'open') out.push({ fu: 'alert', to: 'console', kind: 'outcome_unmarked', severity: 'normal', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: brandId, booking_id: row.booking_id, note: `esc_kind=outcome_disputed; ${firstAndInitial(lead)}: broker marked ${row.broker_mark || 'nothing'}, lead answered ${row.reach || 'nothing'}. KG reviews in the console; nothing goes to the lead until KG decides, and no replacement is opened automatically (an Unreachable/wrong number disposition takes the normal W13 path).${(r.capi_held || []).length ? ` CAPI ${r.capi_held.join(', ')} held until KG decides (not sent).` : ''}` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Follow-up claim (19 Oct 2026). `w12:outcome:{booking_id}` (activity outcome_recorded) means "W12 ran the follow-ups
// for this booking". The sweep's insert writes it with the outcomes row; every other writer of `outcomes` goes through
// the claim below, so the follow-ups (thank-you, CAPI Attended gate, W29, W13, W10, alerts) run exactly once per booking
// whoever wrote the row first.
//  - Portal: the broker portal (src/pages/portal/Leads.tsx MarkOne.save) writes outcomes directly (marked_via 'portal')
//    and only logs smc_portal_event 'outcome.marked', so the sweep (which skips a meeting with an outcomes row) never saw
//    it. The tick reads those rows and resolves them with the same two-sided rules: the portal mark is the broker's mark.
//  - auto_attended (W11's 24-h backstop row): claimed too, so a later portal confirmation of that row sends nothing twice.
// ---------------------------------------------------------------------------------------------------------------
export const PORTAL_MARKS = new Set(['attended', 'no_show', 'rescheduled']); // the portal's three buttons

/**
 * portalResolution(row, now) -> null | claim item. row = one "Portal-marked outcomes" SQL row (meeting, lead and
 * broker columns + outcome_id, outcome, disposition_code, reach). null while the lead's side is still open (a No-show
 * inside the reach window: the next tick looks again) or once the meeting is older than the sweep window.
 * Lead "No" against any portal mark -> dispute (console, nothing to the lead), as for a WhatsApp tap (R6-03).
 */
export function portalResolution(row = {}, now) {
  if (!row.outcome_id || !PORTAL_MARKS.has(row.outcome)) return null;
  const end = ms(row.slot_end);
  if (!Number.isFinite(end) || now < end || now >= end + STALE_AFTER_END) return null;
  const r = resolveOutcome({ slotEnd: row.slot_end, brokerMark: row.outcome, reach: row.reach || null, disposition: row.disposition_code || null, optedOut: Boolean(row.opted_out_at), leadId: row.lead_id }, now);
  if (r.outcome === 'pending') return null;
  const o = outcomeRow(r, { now, via: 'portal' }); // null when disputed: the portal row stays, KG decides
  return claimItem(r, { ...row, broker_mark: `${row.outcome} (portal)` }, row.outcome_id, 'portal', {
    dispute_open: r.dispute_status === 'open',
    appointment_status: o ? o.appointment_status : null,
    // the portal asks the disposition with the mark (W29 sets 'dispositioned' for a WhatsApp disposition)
    lead_stage: o ? (r.outcome === 'attended' && row.disposition_code ? 'dispositioned' : o.lead_stage) : null
  });
}

/** autoAttendedResolution(row) -> claim item for W11's auto-attended row (op auto_attended: the attended path at 24 h). */
export function autoAttendedResolution(row = {}) {
  if (!row.outcome_id) return null;
  const r = resolveOutcome({ slotEnd: row.slot_end, brokerMark: null, reach: row.reach === 'yes' ? 'yes' : null, optedOut: Boolean(row.opted_out_at), leadId: row.lead_id }, ms(row.slot_end) + AUTO_ATTEND_AFTER_END);
  return claimItem(r, row, row.outcome_id, 'auto', { dispute_open: false, appointment_status: null, lead_stage: null });
}

const claimItem = (r, row, outcomeId, via, writes) => ({ fu: 'claim', via, r, row, outcome_id: outcomeId, ...writes });

/** The claim query's parameters (one row per booking, `w12:outcome:{booking_id}`, ON CONFLICT DO NOTHING). */
export const claimParams = (c) => [c.row.lead_id, c.row.brand_id, c.row.broker_id, c.row.booking_id, c.row.outcome || c.r.outcome, c.via, c.r.outcome, c.r.lead_reach_check || 'none', Boolean(c.dispute_open), c.appointment_status || null, c.lead_stage || null];

/** After a won claim: the same follow-ups the sweep runs for a row it inserted. */
export const claimedFollowUps = (c) => followUps(c.r, c.row, c.outcome_id);

/**
 * I-50f: a broker mark (any of Attended / No-show / Rescheduled) that arrives after the Schedule D apology went out
 * (outcome broker_no_show, w12:apology claimed) is a conflict for KG: one escalation (same kind and table as the
 * console dispute), nothing to the lead, no CAPI, no W10/W13 call. row = the "Late broker mark?" query row.
 */
export function lateMarkConflict(row = {}) {
  if (row.outcome !== 'broker_no_show' || !row.apology_sent || !row.mark) return [];
  const { lead, broker } = partsOf(row);
  return [{ fu: 'alert', to: 'KG', kind: 'outcome_unmarked', severity: 'normal', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: row.brand_id, booking_id: row.booking_id,
    note: `esc_kind=late_broker_mark; ${firstAndInitial(lead)}: ${firstName(broker.adviser_name || broker.contact_person)} marked ${row.mark} after the Schedule D apology went out (lead said the adviser did not call). KG decides; nothing more goes to the lead, no CAPI event, no replacement.` }];
}

/** Disposition ask item after an Attended tap (the tap opened the broker's window -> list) or a portal `feedback` op. */
export function dispositionItem(row = {}, now, brokerLastInboundMs) {
  const { booking, lead, broker } = partsOf(row);
  const m = dispositionAsk(booking, lead, broker, { broker_last_inbound_ms: brokerLastInboundMs, now });
  return sendItem(row, m, `w12:disposition_ask:${row.booking_id}:${m.template ? 'tpl' : 'list'}`, { claim: true });
}

/**
 * I-51b (a)(b)(c): release queue for held CAPI Attended. row = one "w12:capi_hold" activity joined to its meeting:
 * { booking_id, lead_id, brand_id, broker_id, slot_end, event_id, reach, disposition_code, kg_decision,
 *   broker_mark, outcome_outcome }. Re-evaluated every tick and straight after a kg_decision. Returns [] while it still
 * holds, one { fu: 'capi_release', decision: 'send'|'drop', reason, ... } when decided (claimed once per booking in
 * the workflow), and the KG escalation when a lead "No" arrived after the outcome row was written and none is open.
 */
export function releaseHeld(row = {}, now) {
  // NH-62: KG "not_attended" wins whatever the outcome row says now (it is flipped to no_show by the same op)
  if (row.kg_decision === 'not_attended') return [{ fu: 'capi_release', ...heldKeys(row), decision: 'drop', reason: 'kg_not_attended' }];
  if (row.outcome_outcome && row.outcome_outcome !== 'attended') return [{ fu: 'capi_release', ...heldKeys(row), decision: 'drop', reason: 'outcome_not_attended' }];
  const g = capiAttendedGate({ slotEnd: row.slot_end, reach: row.reach || null, disposition: row.disposition_code || null, kgDecision: row.kg_decision || null, consentAds: row.consent_ads === false ? false : undefined }, now);
  if (g.action === 'hold') {
    if (g.reason !== 'conflict_pending_kg') return [];
    const { lead, broker } = partsOf(row);
    return [{ fu: 'alert', to: 'console', kind: 'outcome_unmarked', severity: 'normal', lead_id: row.lead_id, broker_id: row.broker_id, brand_id: row.brand_id, booking_id: row.booking_id,
      note: `esc_kind=outcome_disputed; ${firstAndInitial(lead)}: broker marked attended, lead answered no. KG decides in the console (op kg_decision attended | not_attended); CAPI Attended held until then (not sent), dropped if still undecided 12 h before Meta's 7-day window closes.` }];
  }
  return [{ fu: 'capi_release', ...heldKeys(row), decision: g.action, reason: g.reason }];
}
const heldKeys = (row) => ({ lead_id: row.lead_id, brand_id: row.brand_id, broker_id: row.broker_id, booking_id: row.booking_id, event_id: row.event_id || `evt_${row.lead_id}_attended`, event_time: row.slot_end || null });

/** The release item -> the CAPI Send input (same event_id as the held event, so Meta dedupes a retry). */
export const releaseCapi = (item) => ({ fu: 'capi', ...capiAttended({ id: item.lead_id }, item.brand_id, item.event_time) });

export const KG_DECISIONS = ['attended', 'not_attended'];
