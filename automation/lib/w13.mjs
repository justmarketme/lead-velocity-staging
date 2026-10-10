// automation/lib/w13.mjs  -  W13 no-show & couldn't-reach replacement requests. Lead Generation Services Agreement clause 7 +
// Schedule 3 (deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md). Imported by
// automation/W13.json and automation/tests/W13.test.mjs. Pure, no I/O.
//
// Clause 7 (ux-sprint-1, 2026-10-07; "Couldn't reach them" added 10 Oct 2026): a replacement is GOODWILL, AT LEAD
// VELOCITY'S DISCRETION, never an entitlement and never because the consumer did not buy.
//  * Nothing opens a replacement automatically. A lead no-show (confirmed by W12) only gets ONE rebook offer
//    (missed_you); no 48-h clock, no "second no-show" claim, no dispute window that approves by itself.
//  * The ONLY way in is a broker REQUEST with proof (Schedule 3), sent between booked start + 10 min and start + 30 min.
//    Two kinds of request, one rule:
//      no_show      a photo of the place with the time, or a screenshot of the empty call.
//      unreachable  ("Couldn't reach them") a screenshot of the call log or the WhatsApp chat with the lead showing at
//                   least 2 attempts to reach them across the 30 minutes after the start and no reply, OR showing the
//                   number is wrong or invalid.
//    Late, early or no proof -> nothing is requested and the lead stands as Delivered (S3.4).
//  * At most 3 requests per Calendar Week per broker (Mon 00:00 - Sun 23:59 SAST, by the date of the missed
//    appointment, clause 7.2), the two kinds COMBINED: ONE counter. Every request row counts, decided or not (same rule
//    as smc_request_replacement and the smc_replacements_cap trigger, migration smc_18). No per-cycle cap exists:
//    pricing.replacement_cap_cycle / cycles.replacement_cap stay in the data for history only; nothing here reads them.
//  * The "Couldn't reach them" TAP (W12, outcome unreachable) records the outcome only (clause 8.4: attended / could be
//    contacted) and never calls W13. The broker_outcome_check arrives after the slot ends, i.e. after the 30-minute proof
//    window has closed, so a request for an unreachable lead arrives ONLY through the proof image the broker sends
//    10-30 minutes after the start (W07 routes broker image/document media here). Dispositions, W10 C1A claims and the
//    system "uncontactable" path carry no proof: they are refused and logged (replacement_not_opened, why proof_required).
//  * Lead Velocity decides each request (console op decide: approve | decline) and tells the broker in writing (S3.6).
//  * A replacement never changes Delivered: the missed lead still counts and the Replacement Lead never does (7.4).
//
// Kind inference (requestKind): the broker's caption first, else the booked method (phone / WhatsApp call -> the only
// possible proof is a call log, so unreachable; Teams / Zoom / Meet / in person -> no_show).
//
// ONE writer: public.replacements is written by W13 (WhatsApp proof) and by the portal RPC
// smc_request_replacement (same checks). Requests are serialised per broker-week with an advisory lock.
import { createRequire } from 'node:module';
import { pick3, slotLabel } from './w10.mjs';
import { H, D, MIN, ms, iso, firstAndInitial, firstName, templateMessage, textMessage, timeLabel, nowFrom, touchesLastContact } from './wa.mjs';
export { H, D, iso, nowFrom, touchesLastContact };
const require = createRequire(import.meta.url);
const { shortfallCreditCents } = require('../billing/invoice.js');

export const WEEKLY_MAX = 3; // clause 7.2
export const PROOF_FROM = 10 * MIN; // Schedule 3.2: wait at least 10 minutes past the booked start
export const PROOF_UNTIL = 30 * MIN; // Schedule 3.3: and send proof no later than 30 minutes after it
export const MAX_EXTENSION = 14 * D; // clause 6 rollover period
export const PROOF_MEDIA = new Set(['image', 'document']); // photo (face-to-face) or screenshot (virtual)
export const GOODWILL = "a goodwill gesture, at Lead Velocity's discretion";

// ---- the two kinds of request. replacements.reason is 'no_show' | 'uncontactable' (CHECK allows both); the timeline
// activity and its idempotency key follow the kind, so the portal's 'noshow_proof_sent' rows keep their meaning.
export const KINDS = Object.freeze({
  no_show: Object.freeze({ reason: 'no_show', reason_code: 'schedule3_proof', activity_type: 'noshow_proof_sent', idem_prefix: 'w13:noshow_proof' }),
  unreachable: Object.freeze({ reason: 'uncontactable', reason_code: 'schedule3_proof_unreachable', activity_type: 'unreachable_proof_sent', idem_prefix: 'w13:unreachable_proof' })
});
/** replacements.reason -> request kind (the inserted row says which kind it was). */
export const kindOfReason = (reason) => (reason === 'uncontactable' ? 'unreachable' : 'no_show');
const TRIGGER_OF = { no_show: 'noshow_proof', unreachable: 'unreachable_proof' };

const UNREACHABLE_RX = /unreach|couldn.?t reach|could not reach|no answer|not answer|didn.?t answer|wrong number|invalid number|not (a )?valid|voicemail|call log|not on whatsapp/i;
const NO_SHOW_RX = /no.?show|didn.?t (come|arrive|join|show)|did not (come|arrive|join|show)|empty (room|call|meeting)/i;
export const CALL_METHODS = new Set(['phone', 'whatsapp_call']); // appointments.method values whose only proof is a call log
/**
 * requestKind({ caption, method }) -> 'unreachable' | 'no_show'. The broker's own words on the photo / screenshot decide
 * first (unreachable wording is checked before no-show wording, so a caption that matches both is unreachable); with no
 * telling caption the booked method decides: phone / whatsapp_call -> unreachable, anything else (teams, zoom, meet,
 * in person) -> no_show. Only the reply wording and replacements.reason follow the kind: the window, the proof
 * requirement and the weekly counter are the same, and Lead Velocity looks at every image before deciding.
 */
export function requestKind({ caption, method } = {}) {
  const c = String(caption ?? '');
  if (UNREACHABLE_RX.test(c)) return 'unreachable';
  if (NO_SHOW_RX.test(c)) return 'no_show';
  return CALL_METHODS.has(String(method ?? '').toLowerCase()) ? 'unreachable' : 'no_show';
}

const SAST = 2 * H;
/** Monday 00:00 SAST of the Calendar Week containing t, as an ISO string (same as public.smc_week_start). */
export function weekStart(t) {
  const local = new Date(ms(t) + SAST);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - dow * D;
  return iso(midnight - SAST);
}

/**
 * requestDecision({ start_at, proof_at, has_proof, used_this_week, already_requested })
 *   -> { ok: true } | { ok: false, reason: 'proof_missing'|'too_early'|'too_late'|'weekly_max'|'already_requested' }
 * Same order of checks as smc_request_replacement. Kind-blind on purpose: both kinds share the window and the counter.
 */
export function requestDecision({ start_at, proof_at, has_proof, used_this_week = 0, already_requested = false } = {}) {
  if (!has_proof) return { ok: false, reason: 'proof_missing' };
  const t = ms(proof_at) - ms(start_at);
  if (t < PROOF_FROM) return { ok: false, reason: 'too_early' };
  if (t > PROOF_UNTIL) return { ok: false, reason: 'too_late' };
  if (already_requested) return { ok: false, reason: 'already_requested' };
  if (used_this_week >= WEEKLY_MAX) return { ok: false, reason: 'weekly_max' };
  return { ok: true };
}

/**
 * Does this event open a replacement request? Only a broker's proof can: 'noshow_proof' (a no-show) or
 * 'unreachable_proof' ("Couldn't reach them"), both through requestDecision (clause 7 (Jonathan 10 Oct 2026): the
 * unreachable lead may earn a goodwill request exactly like a no-show). Everything else carries no proof and is refused with why.
 */
export function replacementTrigger(ev = {}) {
  switch (ev.kind) {
    case 'noshow_proof':
    case 'unreachable_proof': {
      const k = KINDS[ev.kind === 'unreachable_proof' ? 'unreachable' : 'no_show'];
      const d = requestDecision(ev);
      return d.ok ? { due: true, reason: k.reason, reason_code: k.reason_code, due_at: iso(ev.proof_at) } : { due: false, why: d.reason };
    }
    case 'no_show': // lead no-show confirmed by W12: one rebook offer only (missed_you), never an automatic replacement
      return { due: false, why: 'clause7_request_only' };
    case 'disposition': // historic dispositions (clause 8.4): none opens anything; an 'unreachable' one has no proof
      return ev.code === 'unreachable' ? { due: false, why: 'proof_required' } : { due: false, why: 'counts_as_delivered' };
    case 'uncontactable': // system / W10 C1A claims: no proof image -> a request needs the broker's proof (Schedule 3)
    case 'c1a':
      return { due: false, why: 'proof_required' };
    case 'broker_no_show':
      return { due: false, why: 'schedule_d_broker_no_show' };
    default:
      return { due: false, why: 'not_a_trigger' };
  }
}

/**
 * In-memory model of W13.json's "Record request" SQL: one request per booking, max 3 per broker per Calendar Week
 * (every row counts, decided or not, whatever its kind: no-shows and unreachables share ONE counter).
 * req.kind = 'no_show' (default) | 'unreachable'. Returns { row } or { row: null, why }.
 */
export function request(rows, req) {
  if (rows.some((r) => r.booking_id === req.booking_id)) return { row: null, why: 'already_requested' };
  const kind = req.kind === 'unreachable' ? 'unreachable' : 'no_show';
  const wk = weekStart(req.missed_start_at);
  const used = rows.filter((r) => r.broker_id === req.broker_id && weekStart(r.missed_start_at) === wk).length;
  const t = replacementTrigger({ kind: TRIGGER_OF[kind], start_at: req.missed_start_at, proof_at: req.proof_sent_at, has_proof: !!req.proof_path, used_this_week: used });
  if (!t.due) return { row: null, why: t.why };
  const row = { ...req, kind, reason: t.reason, reason_code: t.reason_code, status: 'due', cap_position: used + 1, over_cap: false };
  rows.push(row);
  return { row, used: used + 1 };
}

/** Lead Velocity's decision (S3.6): only an undecided request; approve -> 'approved', decline -> 'rejected' (note 'declined'). */
export function decide(row, approve) {
  if (!row || row.status !== 'due') throw new Error(`cannot decide a ${row?.status} request`);
  row.status = approve ? 'approved' : 'rejected';
  if (!approve) row.note = 'declined';
  return row.status;
}

/**
 * Cycle close / rollover / credit (clause 6). Reference only: W19 (billing) applies it; W13 never writes cycles.
 * delivered = clause 5.2 (v_cycle_progress.delivered). Replacements never change it (clause 7.4).
 */
export function cycleState(cyc, { delivered }, now, price) {
  const ends = ms(cyc.ends_at);
  const extendedUntil = ends + MAX_EXTENSION;
  if (now < ends) return { status: 'active', delivered };
  if (delivered >= cyc.committed_leads) return { status: 'closed', delivered, shortfall: 0, credit_zar: 0 };
  if (now < extendedUntil) return { status: 'extended', delivered, extended_until: iso(extendedUntil) };
  const shortfall = cyc.committed_leads - delivered;
  const credit = Math.min(price, shortfallCreditCents({ price_zar: price, committed_leads: cyc.committed_leads }, delivered) / 100);
  return { status: 'closed', delivered, shortfall, credit_zar: credit, credit_as: cyc.renewing ? 'credit_next_cycle' : 'refund' };
}

// ---------------------------------------------------------------------------------------------------------------
// Entries (CONTRACTS.md "Sub-workflow interfaces")
// ---------------------------------------------------------------------------------------------------------------
/**
 * normaliseInput(j) -> { op, ... }
 *  W07     : { source:'W07', route:'W13', msg:{ from, media, media_id, text (caption), at_ms, wamid }, from_broker_id }  -> op 'request'
 *            (the caption travels as `caption`: it picks the request kind, requestKind; it is never stored)
 *  W12     : { op:'no_show', outcome_id, booking_id, lead_id, confirmed_at, idempotency_key }       -> missed_you only
 *  console : { op:'decide', replacement_id, approve:boolean }
 *  legacy  : { op:'claim'|'withdraw', ... } from W10 C1A / W29 / system      -> op 'refuse' (logged, never claimed)
 */
export function normaliseInput(j = {}, now = Date.now()) {
  const at = j.at || iso(now);
  if (j.source === 'W07' || j.op === 'request') {
    const m = j.msg || {};
    return {
      op: 'request', broker_id: j.from_broker_id || j.broker_id || null, broker_phone: m.from || null,
      proof_at: m.at_ms ? iso(m.at_ms) : (j.proof_at || at), media: m.media || j.media || null, media_id: m.media_id || j.media_id || null,
      caption: String(m.text ?? j.caption ?? '').trim().slice(0, 1024),
      wamid: m.wamid || null, proof_path: m.media_id ? `whatsapp-media:${m.media_id}` : (j.proof_path || null), source: j.source || 'W07'
    };
  }
  if (j.d?.w13 && j.o) return { op: 'refuse', lead_id: j.o.lead_id, cycle_id: j.o.cycle_id || null, ev: { kind: 'disposition', code: j.d.w13.reason_code }, source: 'W29', at };
  const base = { op: j.op, lead_id: j.lead_id || null, booking_id: j.booking_id || null, outcome_id: j.outcome_id || null, cycle_id: j.cycle_id || null, idempotency_key: j.idempotency_key || null, replacement_id: j.replacement_id || null, approve: j.approve, source: j.source || null };
  if (j.op === 'no_show') return { ...base, confirmed_at: j.confirmed_at || at };
  if (j.op === 'claim' || j.op === 'withdraw') {
    const ev = j.kind === 'uncontactable' ? { kind: 'uncontactable' } : C1A_CODES.has(j.reason_code) ? { kind: 'c1a' } : { kind: 'disposition', code: j.reason_code || j.code };
    return { ...base, op: 'refuse', ev, source: j.source || (ev.kind === 'c1a' ? 'W10' : null), at };
  }
  return base;
}
const C1A_CODES = new Set(['cancel_no_rebook', 'no_call']);

export function validateInput(n = {}) {
  const missing = [];
  if (!['request', 'no_show', 'decide', 'refuse', 'tick'].includes(n.op)) missing.push('op');
  if (n.op === 'request' && !n.broker_id) missing.push('broker_id');
  if (n.op === 'no_show' && (!n.outcome_id || !n.booking_id)) missing.push('outcome_id, booking_id');
  if (n.op === 'decide' && !n.replacement_id) missing.push('replacement_id');
  if (n.op === 'decide' && typeof n.approve !== 'boolean') missing.push('approve');
  return missing.length ? { ok: false, missing } : { ok: true };
}

/**
 * requestPlan(n, ctx) -> { record, why, kind, reply, write? } for a WhatsApp proof. ctx = W13.json "Request context" row:
 * { booking_id, missed_start_at, method, used_this_week, already_requested, lead_first_name, adviser_name }; n.caption + ctx.method
 * pick the kind (requestKind). `write` = the kind's replacements.reason / reason_code and timeline activity (the SQL takes them
 * as parameters, nothing is hard-coded there). No booking in the window -> no record, and the broker is told how the rule works.
 */
export function requestPlan(n = {}, ctx = {}) {
  if (!ctx.booking_id) return { record: false, why: 'no_booking', kind: null, reply: brokerReply('no_booking', ctx) };
  const kind = requestKind({ caption: n.caption, method: ctx.method });
  const rctx = { ...ctx, request_kind: kind };
  const trig = replacementTrigger({ kind: TRIGGER_OF[kind], start_at: ctx.missed_start_at, proof_at: n.proof_at, has_proof: PROOF_MEDIA.has(n.media) && !!n.media_id, used_this_week: Number(ctx.used_this_week) || 0, already_requested: ctx.already_requested === true });
  if (!trig.due) return { record: false, why: trig.why, kind, reply: brokerReply(trig.why, rctx) };
  const { reason, reason_code, activity_type, idem_prefix } = KINDS[kind];
  return { record: true, why: null, kind, trig, write: { reason, reason_code, activity_type, idem_prefix } };
}

// What the broker has to send, per kind (Schedule 3). Reply texts never promise a replacement: it is goodwill.
const PROOF = {
  no_show: 'a photo of the place showing the time, or a screenshot of the call showing the time and that only you were there',
  unreachable: 'a screenshot of your call log or WhatsApp chat with them showing at least 2 attempts since the start time and no reply, or showing the number is wrong or invalid'
};
const proofFor = (k) => (PROOF[k] || `for a no-show, ${PROOF.no_show}; for a lead you couldn't reach, ${PROOF.unreachable}`);

/** Broker reply text (session message: the broker has just written to us). Wording per clause 7 / Schedule 3. ctx.request_kind = 'no_show' | 'unreachable'. */
export function brokerReply(kind, ctx = {}) {
  const who = firstName(ctx.lead_first_name) || 'the client';
  const at = ctx.missed_start_at ? timeLabel(ctx.missed_start_at) : null;
  const used = Number(ctx.used_after ?? ctx.used_this_week) || 0;
  const rk = ctx.request_kind === 'unreachable' ? 'unreachable' : ctx.request_kind === 'no_show' ? 'no_show' : null;
  const noted = rk === 'unreachable' ? "Noted as a lead you couldn't reach." : 'Noted as a no-show.';
  const rule = `A replacement is ${GOODWILL}, for no-shows and for leads you couldn't reach: up to ${WEEKLY_MAX} requests a week combined, with proof sent between 10 and 30 minutes after the start.`;
  switch (kind) {
    case 'requested': return `Thanks, we have your proof ${rk === 'unreachable' ? `that you couldn't reach ${who}` : `for ${who}`}${at ? ` (${at})` : ''}. Request ${used} of ${WEEKLY_MAX} this week (no-shows and leads you couldn't reach count together). A replacement is ${GOODWILL}; we'll tell you here once we've decided. The lead still counts as delivered.`;
    case 'too_early': return `Please wait until 10 minutes after the start${at ? ` (${at})` : ''}, then send ${proofFor(rk)}. ${rule}`;
    case 'too_late': return `${noted} Proof has to reach us within 30 minutes of the start, so this one is too late for a replacement request and still counts as delivered. ${rule}`;
    case 'weekly_max': return `${noted} You've already sent ${WEEKLY_MAX} replacement requests this week (no-shows and leads you couldn't reach count together), the most we can consider, so this one still counts as delivered.`;
    case 'already_requested': return `We already have a replacement request for ${who}. We'll tell you here once we've decided.`;
    case 'proof_missing': return `To request a replacement, please send ${proofFor(rk)}. ${rule}`;
    case 'approved': return `Good news: we'll send you a replacement lead for ${who}, ${GOODWILL}. It doesn't count toward your committed leads.`;
    case 'declined': return `We've looked at your replacement request for ${who} and won't be sending a replacement this time. The lead counts as delivered.`;
    default: return `We couldn't match this to a meeting that started 10 to 30 minutes ago. ${rule}`;
  }
}

/** Reply as a uniform send item for the shared send chain (broker, session text). */
export function replyItem(row = {}, kind, ctx = {}) {
  if (!row.broker_phone) return { send: null, why: 'no_broker_phone' };
  return { send: { to: 'broker', wa: textMessage(row.broker_phone, brokerReply(kind, ctx)), lead_id: row.lead_id || null, brand_id: row.brand_id || null, broker_id: row.broker_id || null, template: null, category: 'service', key: `w13:reply:${kind}:${row.booking_id || row.wamid || row.replacement_id}`, workflow: 'W13' } };
}

/** missed_you: 1 first_name · 2 adviser_name · 3-5 slot labels; QR Time 1-3 (slot_{ISO}:resched:{booking}) · Other times. */
export function missedYouMessage(booking, lead, broker, slots = []) {
  const three = pick3(slots);
  if (three.length < 3) return { to: 'lead', template: 'missed_you', wa: null, why: 'fewer_than_3_slots' };
  return { to: 'lead', template: 'missed_you', slots: three, wa: templateMessage(lead.phone, 'missed_you', {
    body: [String(lead.first_name || '').trim() || 'there', broker.adviser_name || broker.contact_person, ...three.map((s) => slotLabel(s.start))],
    buttons: [...three.map((s) => ({ quick_reply: `slot_${s.start}:resched:${booking.id}` })), { quick_reply: `other_times:${booking.id}` }]
  }) };
}

/** missed_you as a uniform send item for the shared send chain (key w13:missed_you:{booking_id}). */
export function missedYouItem(row = {}, slots = []) {
  const m = missedYouMessage({ id: row.booking_id }, { first_name: row.first_name, phone: row.phone }, { adviser_name: row.adviser_name, contact_person: row.contact_person }, slots);
  if (!m.wa) return { send: null, why: m.why };
  return { send: { to: 'lead', wa: m.wa, lead_id: row.lead_id, brand_id: row.brand_id, broker_id: row.broker_id, template: 'missed_you', category: 'utility', key: `w13:missed_you:${row.booking_id}`, workflow: 'W13' }, slots: m.slots };
}

/** Console/ops note for a new request (kind: 'no_show' | 'unreachable'). The word is "committed"; a request is goodwill, decided by Lead Velocity. */
export function alertNote({ lead = {}, used, missed_start_at, proof_path, kind = 'no_show' } = {}) {
  const what = kind === 'unreachable' ? "broker couldn't-reach proof (call log or chat, or a wrong number)" : 'broker no-show proof';
  return `esc_kind=replacement_request; ${firstAndInitial(lead)}: ${what} (Schedule 3) for the ${missed_start_at ? timeLabel(missed_start_at) : '?'} meeting, request ${used} of ${WEEKLY_MAX} this Calendar Week (no-shows and couldn't-reach requests share one count). Proof: ${proof_path}. Goodwill, Lead Velocity's discretion: approve or decline in the console; the committed number and Delivered are unchanged.`;
}
