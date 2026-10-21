// automation/lib/w10.mjs  -  W10 reschedule / cancel (4.6 item 8, W10 row; 4.12a; Schedule C/D; W28 reschedule Flow).
// Imported by automation/W10.json and automation/tests/W10.test.mjs. Node 18+, zero dependencies.
// Slots always come from the W04 slot engine (same rules as /slots); this module never invents a time.
//
// Rules:
//  - Before the meeting, a lead reschedule MOVES the booking (same appointments row, same Graph event id,
//    reschedule_count + 1). Never a second event (zero double-bookings; W09 rebuilds its jobs).
//  - After the meeting, a broker "Rescheduled" tap (W12) makes a NEW booking linked by previous_booking_id, because
//    the old booking already owns its outcomes row (outcomes.booking_id is unique).
//  - Second reschedule -> allowed, flagged (escalations kind 'other', note esc_kind=second_reschedule).
//  - Cancel -> Graph event deleted, status cancelled, W09 jobs cancelled, broker told, ONE rebooking offer.
//  - Replacement rules (0.1, 4.12a, Schedule C/D): a lead's own reschedule or cancel never opens a replacement;
//    a broker-initiated reschedule/cancel is Schedule D (we rebook, no replacement); a rebooking after a no-show
//    inside 48 h stops W13's replacement clock (W13 reads the lead_activities 'rebooked_after_no_show' row).
//  - Booking UI: brands.booking_ui = 'flow' -> reschedule Flow (reschedule-flow.json, current booking pre-filled);
//    otherwise the 10-slot list in-window, or the reschedule_offer template (3 slots) outside the 24-h window.
import { createRequire } from 'node:module';
import { LINES, fill } from '../../conversation/lines.mjs';
import { isSmcLead, smcClientEmail, smcRelayEmail, parseSub as parseW05Sub } from './w05.mjs';
import { rescheduleCardPlan } from './wa-provider.mjs';
export const H = 3600_000;
const SAST = 2 * H;
const ACTIVE = new Set(['booked', 'confirmed']);
// Verify gate (2026-10-11): a HELD slot (email not verified yet, W05) can be moved too. It stays held: no Outlook event to
// patch, no broker notice, no reminders; the deadline keeps the same rule, anchored to when the slot was first held:
// verify_by = min(booked_at + 24 h, new start - 2 h) (moving never buys more time). Under 15 min left -> too_soon_to_verify.
export const HELD = 'pending_verification';
export const heldMoveDeadline = (bookedAtMs, newStartMs) => Math.min(bookedAtMs + 24 * 3600_000, newStartMs - 2 * 3600_000);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const slotLabel = (iso) => { const d = new Date(Date.parse(iso) + SAST); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${d.toISOString().slice(11, 16)}`; };
export const METHOD_LABEL = { teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' };
export const EMAIL_METHODS = new Set(['teams', 'zoom', 'meet']);

/** Spread 3 offers over different days, earliest first (W04's own rule; slots already filtered by W04). */
export function pick3(slots) {
  const out = []; const days = new Set();
  for (const s of slots) { const d = s.start.slice(0, 10); if (!days.has(d)) { out.push(s); days.add(d); } if (out.length === 3) break; }
  for (const s of slots) { if (out.length === 3) break; if (!out.includes(s)) out.push(s); }
  return out;
}

/**
 * offerMessage({ booking, lead, broker, brand, slots, now_ms, last_inbound_ms, reason })
 * reason: 'lead_reschedule' | 'broker_rescheduled' | 'rebook_after_cancel'
 */
export function offerMessage({ booking, lead, broker, brand = {}, slots = [], now_ms, last_inbound_ms, reason = 'lead_reschedule', delegate = null, card = null }) {
  const window = Number.isFinite(last_inbound_ms) && now_ms - last_inbound_ms < 24 * H;
  const first = (lead.first_name || '').trim() || 'there';
  const adviser = String(broker.contact_person || '').split(' ')[0];
  // 17 Oct 2026: a lead's cancel is confirmed in words, with or without times to offer. CANCEL_DONE was never sent, so the
  // client heard nothing after "Yes, cancel" and W07's never-silent fallback ("something went wrong") answered instead.
  const cancelled = reason === 'cancel' || reason === 'rebook_after_cancel'; // W10 passes its op ('cancel', classifyOp)
  // After a cancel the old booking is gone: a pick is a NEW booking (plain slot_ -> W07 routes it to W05). A ":resched:"
  // pick would reach W10's move of a cancelled booking, which rejects it.
  const pickId = (s) => (cancelled ? `slot_${s.start}` : `slot_${s.start}:resched:${booking.id}`);
  // /start/ v4 (Jono, 2026-10-19): outside the 24-h window a start-page brand's lead with a live booking gets the approved
  // reschedule_card template (banner, "Pick a new time" -> /start/#move=1&lt=<token>, Keep my time) instead of
  // reschedule_offer, when lib/wa-provider.mjs rescheduleCardPlan can send it as a template (Twilio + the reschedule_card SID
  // + a lead token). card = { start_page: brands.start_page = 'on', token: lt1 minted like W07's card, env }.
  if (!window && !cancelled && card) {
    const plan = rescheduleCardPlan({ delegate: { action: 'reschedule' }, lead, booking, broker }, { start_page: card.start_page === true, token: card.token || null, env: card.env || {} });
    if (plan.via === 'template') return { kind: 'prebuilt', template: 'reschedule_card', wa: plan.send };
  }
  if (!slots.length) return cancelled && window ? { kind: 'text_session', body: leadBody('cancel_done', { delegate, lead, booking, broker }) } : { kind: 'no_slots', escalate: 'no_slots', text: null };
  if (brand.booking_ui === 'flow') {
    const prefill = { booking_id: booking.id, current_date: slotLabel(booking.appointment_date).split(',')[0], current_time: slotLabel(booking.appointment_date).split(', ')[1], method: booking.method };
    return window ? { kind: 'flow_session', flow: 'reschedule', flow_id_ref: 'brands.booking_flow_id', prefill, body: leadBody(cancelled ? 'cancel_done_times' : 'reschedule', { delegate, lead, booking, broker }) }
      : { kind: 'template', template: 'reschedule_offer_v2', vars: [first, adviser, prefill.current_date, prefill.current_time], prefill };
  }
  if (window) {
    const rows = slots.slice(0, 10).map((s) => ({ id: pickId(s), title: slotLabel(s.start).slice(0, 24) }));
    return { kind: 'list_session', rows, body: leadBody(cancelled ? 'cancel_done_times' : reason === 'broker_rescheduled' ? 'slots' : 'reschedule', { delegate, lead, booking, broker }) };
  }
  const three = pick3(slots);
  return { kind: 'template', template: 'reschedule_offer', vars: [first, adviser, ...three.map((s) => slotLabel(s.start))], buttons: three.map(pickId).concat([`other_times:${booking.id}`]) };
}

/**
 * applyReschedule(booking, newSlot, ctx) -> decision. Pure; the workflow executes it inside one transaction.
 * ctx = { now_ms, free: boolean (getSchedule re-check), next_slots: [...], initiated_by: 'lead'|'broker', after_meeting: bool, idempotency_key, seen_keys: Set }
 */
export function applyReschedule(booking, newSlot, ctx) {
  if (ctx.seen_keys && ctx.seen_keys.has(ctx.idempotency_key)) return { action: 'replay', booking_id: booking.id };
  if (booking.status === HELD) {
    if (!ctx.free) return { action: 'slot_taken', offer: pick3(ctx.next_slots || []) };
    const booked = Date.parse(booking.booked_at || booking.created_at || '') || ctx.now_ms;
    const verifyBy = heldMoveDeadline(booked, Date.parse(newSlot.start));
    if (verifyBy - ctx.now_ms < 15 * 60_000) return { action: 'slot_taken', reason: 'too_soon_to_verify', offer: pick3(ctx.next_slots || []) };
    return { action: 'move_held', update: { appointment_date: newSlot.start, ends_at: newSlot.end, verify_by: new Date(verifyBy).toISOString(), status: HELD },
      graph: null, broker_notice: null, w09: null, lead_message: 'held_moved', replacement: 'none' };
  }
  if (!ctx.after_meeting && !ACTIVE.has(booking.status)) return { action: 'reject', reason: `booking is ${booking.status}` };
  if (!ctx.free) return { action: 'slot_taken', offer: pick3(ctx.next_slots || []) };
  const start = newSlot.start; const end = newSlot.end;
  const flag = (booking.reschedule_count || 0) >= 1;
  const common = {
    w09: 'rebuild', // W09 cancels pending jobs for the old time and plans the new ones (intro media is not repeated)
    lead_message: 'booking_confirmed',
    broker_notice: { what: 'moved', from: booking.appointment_date, to: start },
    flag_second_reschedule: flag,
    replacement: 'none',
    schedule_d: ctx.initiated_by === 'broker'
  };
  if (ctx.after_meeting) {
    return { action: 'new_booking', ...common, old_update: { status: 'rescheduled' }, insert: { previous_booking_id: booking.id, appointment_date: start, ends_at: end, method: booking.method, reschedule_count: (booking.reschedule_count || 0) + 1, booked_via: 'chat', status: 'booked' }, graph: { op: 'create' } };
  }
  return { action: 'move', ...common, update: { appointment_date: start, ends_at: end, reschedule_count: (booking.reschedule_count || 0) + 1, status: 'booked', confirmed_at: null }, graph: { op: 'patch', event_id: booking.graph_event_id } };
}

/** applyCancel(booking, lead, ctx) -> decision. ctx = { now_ms, initiated_by } */
export function applyCancel(booking, lead, ctx) {
  if (!ACTIVE.has(booking.status)) return { action: 'noop', reason: `booking is ${booking.status}` };
  const offered = Boolean(lead.conv_state?.rebook_offered);
  return {
    action: 'cancel',
    update: { status: 'cancelled', cancelled_at: new Date(ctx.now_ms).toISOString() },
    graph: { op: 'delete', event_id: booking.graph_event_id },
    w09: 'cancel_all',
    broker_notice: { what: 'cancelled', at: booking.appointment_date },
    // C1A (b): a lead who has already said plainly "no call" gets no rebooking offer (stop messaging at once).
    rebook_offer: !offered && !lead.opted_out_at && !lead.conv_state?.declined_call,
    conv_state_patch: { rebook_offered: true, state: 'unbooked' },
    lead_stage: 'qualified',
    replacement: 'none',
    schedule_d: ctx.initiated_by === 'broker'
  };
}

/** Typed "cancel" asks first (prompts/reply.md fallback); a Cancel button tap is explicit and cancels at once. */
export const cancelNeedsConfirm = (source) => source === 'text';
/** The reason a classified cancel carries: a reason tap, or the typed "Another reason" ({ code:'other', text, typed }). */
export function cancelReasonOf(input = {}) {
  const d = input.delegate || {};
  if (d.action === 'cancel_reason_text') {
    const text = String((input.msg && input.msg.text) || '').slice(0, 500);
    const t = typedCancelReason(text);
    return { code: t.code === 'keep' ? 'keep' : t.code, text, typed: true };
  }
  const r = parseCancelReason((input.msg && (input.msg.payload || input.msg.list_id)) || '');
  return r ? { code: r.code } : null;
}

/** Change method: only a method the broker supports; Teams/Zoom/Meet need an email (asked via Flow screen 4 / W05). */
export function changeMethod(booking, lead, broker, method) {
  const ok = (broker.methods_supported || []).includes(method);
  if (!ok) return { action: 'reject', reason: 'method not offered by this adviser', offer: broker.methods_supported };
  if (method === booking.method) return { action: 'noop' };
  const needEmail = EMAIL_METHODS.has(method) && !(lead.email && lead.email_status && lead.email_status !== 'bounced');
  return { action: needEmail ? 'ask_email' : 'change', update: { method }, graph: { op: 'patch', event_id: booking.graph_event_id, online: EMAIL_METHODS.has(method) }, broker_notice: { what: 'method', to: METHOD_LABEL[method] } };
}

/** Replacement interplay: what W10 tells W13 for each event (W13 owns the replacements table). */
export function replacementEffect(evt) {
  if (evt === 'lead_reschedule' || evt === 'lead_cancel') return { w13: 'none', reason: 'lead choice is not a contract trigger (0.1, Schedule C)' };
  if (evt === 'broker_reschedule' || evt === 'broker_cancel') return { w13: 'none', reason: 'Schedule D: broker side, we rebook, no replacement' };
  if (evt === 'rebooked_after_no_show') return { w13: 'stop_clock', activity: 'rebooked_after_no_show', reason: 'W13: replacement_due only if no rebook in 48 h' };
  return { w13: 'none' };
}

/** Broker notice text (session message inside his window; otherwise email from howzit@ - see needs_human). First name + initial only. */
export function brokerNotice(n, lead) {
  const who = `${(lead.first_name || '').trim()} ${(lead.last_name || '').trim().slice(0, 1)}${lead.last_name ? '.' : ''}`.trim();
  if (n.what === 'moved') return `${who} moved their call from ${slotLabel(n.from)} to ${slotLabel(n.to)}. Your Outlook event has been updated.`;
  if (n.what === 'cancelled') return `${who} cancelled their call on ${slotLabel(n.at)}. The Outlook event has been removed.`;
  return `${who} changed the call method to ${n.to}.`;
}

/** Parse a reschedule slot payload: slot_{ISO}:resched:{booking_id} */
export function parseSlotPayload(p) {
  const m = String(p || '').match(/^slot_(.+?):resched:(.+)$/u);
  return m ? { start: m[1], booking_id: m[2] } : null;
}

/** classifyOp(input) -> op for the W10 switch. input = { route, msg, delegate, source, outcome } */
export function classifyOp(input) {
  if (input.source === 'W10' && input.move_effects) return 'move_effects'; // smoke #11: W10's own async half of a move
  if (input.source === 'W12' && input.outcome === 'rescheduled') return 'broker_rescheduled';
  const d = input.delegate || {};
  if (d.action === 'cancel_confirm') return 'cancel_ask';     // typed "cancel" -> the cancel card (reasons)
  // a typed reply while the cancel card waits (W07, cancel_reason_pending): matched to the card's rows (smoke #12)
  if (d.action === 'cancel_reason_text') { const t = typedCancelReason((input.msg && input.msg.text) || ''); return t.code === 'keep' ? 'keep' : CANCEL_REASONS[t.code].typed_action; }
  if (d.action === 'change_method') return 'change_method';
  if (d.action === 'no_call') return 'no_call';     // W07 intent: "I don't want a call" / "No thanks" (C1A b)
  if (d.action === 'reschedule' || d.action === 'reschedule_slots') return 'offer';
  const m = input.msg || {};
  const p = String(m.payload || m.list_id || '');
  if (parseSlotPayload(p)) return 'pick';
  const k = p.split(':')[0];
  if (k === 'reschedule' || k === 'other_times') return 'offer';
  if (k === 'cancel') return 'cancel_ask';      // a Cancel tap opens the cancel card too (Jono, 2026-10-19; was: cancel at once)
  if (k === 'cancel_reason') { const r = parseCancelReason(p); return r ? CANCEL_REASONS[r.code].action : 'cancel_ask'; }
  if (k === 'cancel_yes') return 'cancel';
  if (k === 'keep_it') return 'keep';
  if (k === 'change_method') return 'change_method'; // change_method:{method}:{booking_id} (methodMessage reject buttons)
  if (k === 'no_call') return 'no_call';           // C1A (b) button / W07 delegate payload
  return 'offer';
}

// ---------------------------------------------------------------------------------------------------------------
// Schedule C1A - "When the person cancels" (broker-services-agreement.md, Schedule C).
// DEFAULT PENDING NH-42: options (a) AND (b) are both on (the agreement's drafted default). Jonathan picks one of
// 'a' | 'b' | 'a+b' (or 'off'); the workflow passes $env.W10_C1A_MODE, which defaults to 'a+b'. Nothing else changes
// when he picks: the mode only switches which of the two claims below W10 sends to W13.
//   1. They book again            -> nothing is claimed; the new call is judged as usual (C2 row "cancelled and booked again").
//   2. They say plainly "no call" -> stop messaging at once; (b) W13 claim reason 'disqualified', code nofit_criteria,
//                                    reason_code no_call. Under (a) only: stop messaging, no claim.
//   3. They go quiet              -> one rebooking offer (applyCancel) + the full follow-up sequence; not rebooked by the
//                                    end -> (a) W13 claim reason 'uncontactable', code unreachable, reason_code
//                                    cancel_no_rebook. Under (b) only: no claim.
// Only a VERIFIED lead counts (0.1: replied/tapped within 72 h of the first message). A broker-side cancel is
// Schedule D (we rebook, no replacement). Evidence = the message log (communications + lead_activities); the 48-h
// dispute window in C3 is W13's. W10 never writes `replacements` - it calls W13 `claim` (CONTRACTS.md).
// ---------------------------------------------------------------------------------------------------------------
export const C1A_DEFAULT_MODE = 'a+b'; // NH-42 default
// End of "the full follow-up sequence" after a cancel: the rebooking offer at the cancel, then W08's +2 h / +24 h /
// +72 h nudges and its close 24 h after the last nudge (lib/w08.mjs CLOSE_AFTER_LAST ASSUMPTION) = 96 h.
export const C1A_SEQUENCE_MS = 96 * H;
const modeHas = (mode, x) => String(mode || C1A_DEFAULT_MODE).split('+').includes(x);

/** Deterministic backstop for the "plainly does not want a call" test (W07's intent model is the primary reader). */
const NO_CALL_RE = /\b(i\s+)?(do\s*n[o']?t|dont|do not)\s+want\s+(a|the|any)?\s*call\b|\bno\s+call(s)?\b|^\s*no,?\s+thanks?\s*[.!]*\s*$|^\s*no\s+thank\s+you\s*[.!]*\s*$/iu;
export function isNoCall(m = {}) {
  const p = String(m.payload || m.list_id || '').split(':')[0];
  if (p === 'no_call' || p === 'no_thanks') return true;
  return NO_CALL_RE.test(String(m.text || m.content || ''));
}

/** verified = replied/tapped within 72 h of the first message (0.1, 3.3; same test as facts.fact_lead.verified_within_72h). */
export function isVerified(lead) {
  const v = Date.parse(lead.verified_at || ''); const f = Date.parse(lead.first_message_at || '');
  return Number.isFinite(v) && Number.isFinite(f) && v <= f + 72 * H;
}

/**
 * c1aDecision(input) -> { claim: false, why, stop_messaging? } | { claim: true, stop_messaging, w13, activity }
 * input = { lead: {id, verified_at, first_message_at, opted_out_at, conv_state}, booking: {id, brand_id, broker_id,
 *           status, cancelled_at}, cancelled_by: 'lead'|'broker', rebooked: bool, rebook_offered: bool,
 *           inbound_after_cancel: [{text|content, payload}], declined: bool, already_claimed: bool, now_ms, mode }
 */
export function c1aDecision(x) {
  const { lead = {}, booking = {}, now_ms, mode = C1A_DEFAULT_MODE } = x;
  if (mode === 'off') return { claim: false, why: 'c1a_off' };
  if (booking.status !== 'cancelled') return { claim: false, why: 'booking_not_cancelled' };
  if (x.rebooked) return { claim: false, why: 'rebooked_new_call_judged_as_usual' };
  if (x.cancelled_by === 'broker') return { claim: false, why: 'schedule_d_broker_cancel' };
  const declined = Boolean(x.declined || lead.conv_state?.declined_call || lead.conv_state?.declined_nurture || (x.inbound_after_cancel || []).some(isNoCall));
  if (!isVerified(lead)) return { claim: false, why: 'never_verified_never_counted', stop_messaging: declined };
  if (x.already_claimed) return { claim: false, why: 'already_claimed', stop_messaging: declined };
  const base = { lead_id: lead.id, booking_id: booking.id, outcome_id: null, brand_id: booking.brand_id, broker_id: booking.broker_id, at: new Date(now_ms).toISOString(), idempotency_key: `w10:c1a:${booking.id}`, schedule: 'C1A', c1a_mode: mode };
  if (declined) {
    if (!modeHas(mode, 'b')) return { claim: false, why: 'no_call_not_replaced_under_option_a', stop_messaging: true };
    return { claim: true, stop_messaging: true, w13: { op: 'claim', ...base, reason: 'disqualified', code: 'nofit_criteria', reason_code: 'no_call' }, activity: 'c1a_no_call' };
  }
  // STOP is an opt-out from messages, not a statement about the call; C1A does not cover it -> no claim (needs_human NH-42 note).
  if (lead.opted_out_at) return { claim: false, why: 'opted_out_not_covered_by_c1a' };
  const cancelled = Date.parse(booking.cancelled_at || '');
  if (!x.rebook_offered) return { claim: false, why: 'rebook_offer_not_sent_yet' };
  if (!Number.isFinite(cancelled) || now_ms < cancelled + C1A_SEQUENCE_MS) return { claim: false, why: 'sequence_running' };
  if (!modeHas(mode, 'a')) return { claim: false, why: 'cancel_no_rebook_not_replaced_under_option_b' };
  return { claim: true, stop_messaging: false, w13: { op: 'claim', ...base, reason: 'uncontactable', code: 'unreachable', reason_code: 'cancel_no_rebook' }, activity: 'c1a_cancel_no_rebook' };
}

/**
 * applyNoCall(booking, lead) -> what W10 does the moment a lead says plainly they do not want a call (C1A point 2).
 * Messaging stops at once whatever the NH-42 option: W08 stops on declined_nurture / stage unbooked_closed, W09 jobs are
 * cancelled. A still-live booking goes through the normal cancel confirm first (typed "cancel" asks, 4.11), with
 * declined_call already set so the cancel sends no rebooking offer. The number hash goes on the suppression list on
 * both branches (R5-01).
 */
export function applyNoCall(booking, lead) {
  const live = ACTIVE.has(booking?.status);
  return {
    action: live ? 'confirm_cancel_first' : 'stop',
    conv_state_patch: { declined_call: true, declined_nurture: true, state: 'closed_unbooked' },
    lead_stage: live ? null : 'unbooked_closed',
    w09: 'cancel_all',
    send_to_lead: live ? 'cancel_confirm' : null,
    // R5-01: a plain "no call / don't contact me" is a POPIA s11(3)/s69 objection, same as W08's "No thanks"
    // (privacy.html: "No thanks -> we never message you again"). W10.json "Stop messaging (no call)" closes the lead AND
    // inserts smc_hash_contact(phone) into suppression in ONE statement, exactly as W08 "Save tap result" does.
    suppress: { source: 'objection', note: 'no_call_c1a' }
  };
}

/**
 * I-38d rule (CONTRACTS.md): every outbound to the lead updates leads.last_contact_at (W34 12-month clock).
 * leadOutbound(item) -> lead id to touch, or null for broker/ops messages and dry runs.
 */
export function leadOutbound(item = {}, sent_id = '') {
  if (!sent_id || item.to === 'broker') return null;
  if (item.wa && item.br && item.wa.to === item.br.whatsapp_number) return null;
  return item.ld?.id || item.lead_id || null;
}

// ---------------------------------------------------------------------------------------------------------------
// I-39a (w07-alignment.md changes 1-2): ONE message, never two. W07 sends nothing itself on a W10 turn; it hands a
// delegate { to:'W10', action, method, lead_lines, intro_line, body (<= 1,024, fixed lines + intro line), lang }.
// When delegate.body is present it IS the text of W10's interactive message. When absent, W10 builds the body from
// conversation/lines.mjs in the lead's language (RESCHED_INTRO / SLOTS_INTRO + SAME_METHOD, CANCEL_CONFIRM_Q, METHOD_CHANGED).
// ---------------------------------------------------------------------------------------------------------------
export const WA_BODY_MAX = 1024;
export const METHOD_WORDS = { en: { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' }, af: { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp-oproep', phone: 'telefoon' } };
export const langOf = (delegate, lead) => (LINES[delegate?.lang] ? delegate.lang : LINES[lead?.language] ? lead.language : 'en');
const methodWord = (m, lang) => (m ? (METHOD_WORDS[lang] || METHOD_WORDS.en)[m] || m : '');
const hasBody = (d) => Boolean(d && typeof d.body === 'string' && d.body.trim());

/** leadBody(kind, { delegate, lead, booking, broker, method }) -> the single body text. kind: reschedule | slots | cancel_confirm | change_method */
export function leadBody(kind, { delegate = null, lead = {}, booking = {}, broker = {}, method = null } = {}) {
  if (hasBody(delegate)) return delegate.body.trim().slice(0, WA_BODY_MAX);
  const lang = langOf(delegate, lead); const L = LINES[lang];
  const label = booking.appointment_date ? slotLabel(booking.appointment_date) : '';
  const vars = { adviser_first: String(broker.contact_person || '').split(' ')[0], date: label.split(',')[0], time: label.split(', ')[1] || '', method: methodWord(method || booking.method, lang), first_name: lead.first_name || '' };
  const lines = {
    reschedule: [L.RESCHED_INTRO, booking.method ? L.SAME_METHOD : null], // reschedule memory (4.11): the stored method is kept unless they say otherwise
    slots: [L.SLOTS_INTRO],
    cancel_confirm: [L.CANCEL_CONFIRM_Q],
    cancel_done: [L.CANCEL_DONE],
    cancel_done_times: [L.CANCEL_DONE_TIMES],
    change_method: [L.METHOD_CHANGED]
  }[kind] || [];
  return lines.filter(Boolean).map((l) => fill(l, vars)).join(' ').slice(0, WA_BODY_MAX);
}

/**
 * SortMyCover emails on a W10 cancel / move (17 Oct 2026). W10's adviser email went through a howzit@ node whose bearer
 * ($json.howzit_token) was never set, so no adviser ever got one; the client got no email about the change at all.
 * SMC brand -> the adviser notice through smc-email-send and the client email through smc-client-email
 * (booking_cancelled carries the cancelling .ics, booking_updated the moved one). Other brands -> null (howzit@ path).
 */
export const isSmcBrand = (brand) => isSmcLead({ brand_code: brand && brand.code });

/** item = the W10 broker-notice item ({ brand, bk_id, email_kind, email: { to, subject, body } }) -> smc-email-send request or null. */
export function smcBrokerRelay(item = {}, nowMs = 0) {
  if (!isSmcBrand(item.brand) || !item.email || !item.email.to) return null;
  return smcRelayEmail(item.email, `w10:broker:${item.bk_id}:${item.email_kind || 'changed'}:${Math.floor(Number(nowMs) / 60000)}`, 'broker_booking_changed');
}

/** j = the W10 context (bk, ld, br, brand); kind booking_cancelled | booking_updated; slot = the new { start, end } of a move. */
export function smcClientChangeEmail(j = {}, kind = 'booking_cancelled', nowMs = 0, slot = null) {
  const lead = { ...(j.ld || {}), brand_code: j.brand && j.brand.code };
  if (!isSmcLead(lead) || !j.bk) return null;
  const email = lead.email_verified === true && lead.email && lead.email_status !== 'bounced' ? lead.email : null;
  // guest_email (Teams only): lead_activities 'w05:guest:<booking>' via the W10 load; the guest gets the cancel / move too
  const plan = { start: slot ? slot.start : j.bk.appointment_date, end: slot ? slot.end : j.bk.ends_at, method: j.bk.method, email, guest_email: j.bk.guest_email || null };
  return smcClientEmail({ lead, broker: j.br || {} }, plan, { id: j.bk.id, calendar_provider: j.bk.calendar_provider }, {}, kind, { now: nowMs });
}

/**
 * The cancel confirmation when no rebooking is offered (already offered once, or the lead said "no call"): the lead's own
 * "Yes, cancel" always gets an answer. Null when opted out (W15 sends the one STOP confirmation) or outside the 24-h window.
 */
export function cancelDoneWa({ booking = {}, lead = {}, broker = {}, now_ms, last_inbound_ms, delegate = null } = {}) {
  if (lead.opted_out_at || !lead.phone) return null;
  if (!(Number.isFinite(last_inbound_ms) && now_ms - last_inbound_ms < 24 * H)) return null;
  return { messaging_product: 'whatsapp', to: lead.phone, type: 'text', text: { body: leadBody('cancel_done', { delegate, lead, booking, broker }) } };
}

/** The cancel-confirm interactive (typed "cancel" asks first). */
export function cancelConfirmMessage(booking, lead, broker, delegate = null) {
  return { type: 'buttons', body: leadBody('cancel_confirm', { delegate, lead, booking, broker }), buttons: [[`cancel_yes:${booking.id}`, 'Yes, cancel'], [`keep_it:${booking.id}`, 'Keep it']] };
}

/**
 * methodMessage(decision, booking, lead, broker, delegate) -> the lead message for a change_method op, or null when
 * W05/W28 asks for the email (ask_email: the delegate travels on to that step, which sends the one message).
 * change -> text "I'll change it to {method}." (or delegate.body); reject -> the lead_lines + SAME_METHOD with the
 * adviser's methods as buttons (never the delegate body, whose METHOD_CHANGED intro would be untrue).
 */
export function methodMessage(d, booking, lead, broker, delegate = null, method = null) {
  if (d.action === 'ask_email' || d.action === 'noop' && !delegate) return null;
  if (d.action === 'change' || d.action === 'noop') return { type: 'text', body: leadBody('change_method', { delegate, lead, booking, broker, method: method || booking.method }) };
  const lang = langOf(delegate, lead);
  const own = fill(LINES[lang].SAME_METHOD, { method: methodWord(booking.method, lang) });
  const body = [...(delegate?.lead_lines || []), own].map((x) => String(x || '').trim()).filter(Boolean).join(' ').slice(0, WA_BODY_MAX);
  const buttons = (broker.methods_supported || []).filter((m) => m !== booking.method).slice(0, 2).map((m) => [`change_method:${m}:${booking.id}`, methodWord(m, lang).slice(0, 20)]);
  return { type: 'buttons', body, buttons: [[`keep_it:${booking.id}`, (lang === 'af' ? 'Ja, dieselfde' : 'Yes, same')], ...buttons] };
}

/**
 * slotTakenWa({ phone, offer, booking, lead, broker, delegate }) -> the WhatsApp payload for a 'slot_taken' move.
 * With offer slots: the open-times list (as before). Without any (17 Oct, x14: W04's re-check was rejected, so the lead
 * got silence): SLOT_TAKEN_TAP with one "See open times" button (payload see_open_times -> W07 -> W04 list).
 */
export function slotTakenWa({ phone, offer = [], booking = {}, lead = {}, broker = {}, delegate = null } = {}) {
  const rows = (offer || []).map((s) => ({ id: `slot_${s.start}:resched:${booking.id}`, title: slotLabel(s.start).slice(0, 24) }));
  if (rows.length) {
    return { messaging_product: 'whatsapp', to: phone, type: 'interactive', interactive: { type: 'list', body: { text: leadBody('slots', { lead, booking, broker }) }, action: { button: 'See times', sections: [{ title: 'Open times', rows }] } } };
  }
  const lang = langOf(delegate, lead); const L = LINES[lang];
  const body = fill(L.SLOT_TAKEN_TAP, { adviser_first: String(broker.contact_person || '').split(' ')[0] || (lang === 'af' ? 'jou adviseur' : 'your adviser') });
  return toWa(phone, { type: 'buttons', body, buttons: [['see_open_times', L.SEE_TIMES_BTN]] });
}

/**
 * W39 POST /start/move (2026-10-19) runs W10's normal 'pick' with source 'W39'. The page shows the outcome and re-fetches
 * /slots itself, so a lost slot sends the lead NO "slot taken / next times" WhatsApp; everything else in the move is unchanged.
 */
export const pageOwnsSlotTaken = (source) => source === 'W39';

// ---------------------------------------------------------------------------------------------------------------
// The cancel card (Jono, 2026-10-19, mockup frames 15-16). A typed "cancel" (W07 delegate cancel_confirm) or a Cancel tap
// (cancel:<booking>) no longer asks a bare Yes / Keep: it asks WHY, with a list of reasons, because some of them are
// things we can sort out. A WhatsApp list carries ONE action button and no image header, so the card is:
//   1. the banner image header-cancel.png FIRST (lib/wa-banner.cjs, WA_SESSION_BANNERS=on; behind DRY_RUN_SENDS), then
//   2. the list: body CANCEL_CARD, button "Choose a reason", seven rows; "Keep my call" is the last ROW (keep_it:<id>,
//      W10's existing no-change path), not a second button.
// Always a session message: the typed "cancel" or the tap that opens it is itself an inbound, so the 24-h window is open.
// Every reason that cancels runs the SAME cancel path as cancel_yes (applyCancel unchanged: Graph delete, W09 cancel_all,
// broker notice, ONE rebooking offer, C1A sweep from the message log); only the closing line differs (delegate body).
// "I didn't expect a call" is NOT C1A (b) no_call: (b) is a plain refusal of any call ("I don't want a call", isNoCall)
// and makes a W13 claim (nofit_criteria) that gives the broker a replacement; "I didn't expect it" is surprise, not a
// refusal, so it cancels like any other lead cancel (C1A 1 / 3 decide later) and the reason is kept as evidence.
// The reason: lead_activities 'cancel_reason' (key w10:cancel_reason:<booking>, payload { booking_id, reason }, the typed
// text of "Another reason" in notes); there is no cancel_reason column on leads / appointments (no DDL here).
// ---------------------------------------------------------------------------------------------------------------
const requireCjs = createRequire(import.meta.url);
const WB = requireCjs('./wa-banner.cjs');
export const CANCEL_HEADER = 'cancel';
// typed_action (smoke #12): the op for the same reason TYPED in reply to the card. "Another reason" typed is the reason itself
// (cancel with the text), never a second "please type it" ask.
export const CANCEL_REASONS = {
  different_time: { title: 'I need a different time', action: 'offer', typed_action: 'offer' },
  not_ready: { title: "I'm not ready yet", action: 'cancel', typed_action: 'cancel' },
  sorted_cover: { title: "I've sorted my cover", description: "I've already sorted my cover", action: 'cancel', typed_action: 'cancel' },
  not_expected: { title: "I didn't expect a call", action: 'cancel', typed_action: 'cancel' },
  went_wrong: { title: 'Something went wrong', action: 'cancel_problem', typed_action: 'cancel_problem' },
  other: { title: 'Another reason', action: 'cancel_other', typed_action: 'cancel' },
};

/**
 * Smoke #12 (21 Oct 2026): a reason TYPED in reply to the cancel card ("I'm not ready yet", the row's own title) went back to the
 * intent model, came back as "cancel" and re-sent the same card, so a client who types could never cancel. The card now opens
 * the typed-reason wait (conv_state.cancel_reason_pending, 30 min, this booking) and W07 hands the next free text here.
 * Safety first: STOP and distress / a person / a complaint never get here (W07 routes them before the wait), and "keep it" /
 * "don't cancel" is read BEFORE any cancel reason, so a typed "actually keep my call" never cancels. Then a different time
 * (-> the times, not a cancel), "something went wrong" (-> hello@ + Keep / Cancel it), the three plain reasons, else the text
 * itself is the "Another reason" (code other, the text stored as evidence).
 * -> { code: 'keep' | <CANCEL_REASONS key> }
 */
const typedNorm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\u2018\u2019\u02bc`\u00b4]/gu, "'").replace(/\s+/gu, ' ').trim();
export const TYPED_CANCEL_RULES = [
  ['keep', /\bkeep (it|my call|the call|my time|the time|the booking|my booking)\b|\b(do not|don'?t|dont|please don'?t) cancel\b|\bnever ?mind\b|\bno,? (wait|leave it)\b|\bstill (want|keen on) (it|the call)\b/u],
  ['different_time', /\b(different|another|other|new|later|earlier) (time|day|date|slot)\b|\bresched|\bmove (it|my call|the call)\b|\bchange the (time|day|date)\b/u],
  ['went_wrong', /\bsomething went wrong\b|\bwent wrong\b/u],
  ['not_ready', /\bnot ready\b/u],
  ['sorted_cover', /\b(sorted|found|bought|took out) (out )?(my |the |a )?(own )?(cover|policy|insurance)\b|\balready (sorted|covered|insured)\b/u],
  ['not_expected', /\b(didn'?t|did not|wasn'?t|was not) expect/u],
];
export function typedCancelReason(text) {
  const t = typedNorm(text);
  for (const [code, re] of TYPED_CANCEL_RULES) if (re.test(t)) return { code };
  return { code: 'other' };
}
/** Ops that end the typed-reason wait when they arrive while it is open (the client left the card another way). */
export const WAIT_KEEP_OPS = new Set(['cancel_ask', 'cancel_other', 'cancel_problem', 'cancel', 'keep', 'cancel_reason_stale', 'move_effects']);
export const clearsReasonWait = (op, lead = {}) => !!(lead && lead.conv_state && lead.conv_state.cancel_reason_pending) && !WAIT_KEEP_OPS.has(op);
export const SMC_HELLO = 'hello@sortmycover.co.za';
export const CANCEL_COPY = {
  card: 'We understand{first}, plans change. Before I cancel your call on {date} at {time}, can you tell me why? If it\'s something we can sort out, we\'d love to help.',
  not_ready: "No problem{first}. Your call on {date} at {time} is cancelled. Say hi here any time and we'll find a new time.",
  sorted_cover: 'Thanks for letting us know{first}, and well done on sorting your cover. Your call on {date} at {time} is cancelled.',
  not_expected: 'Thanks for telling us{first}. Your call on {date} at {time} is cancelled. If you would like one later, just say hi here.',
  other_done: "Thank you, I've passed that on to the team. Your call on {date} at {time} is cancelled.",
  went_wrong: `I'm sorry to hear that. Please email ${SMC_HELLO} and a person from our team will reply within 48 hours.`,
  other_ask: "Of course. Please type the reason here and I'll pass it on to the team, then cancel your call. Or tap below.",
};
const cvars = (lead = {}, booking = {}) => {
  const label = booking.appointment_date ? slotLabel(booking.appointment_date) : '';
  const first = String(lead.first_name || '').trim().split(/\s+/)[0];
  return { first: first ? `, ${first}` : '', date: label.split(',')[0], time: label.split(', ')[1] || '' };
};
/** One cancel line filled for this lead + booking ({first} is ", Name" or nothing). */
export const cancelLine = (key, lead, booking) => fill(CANCEL_COPY[key], cvars(lead, booking)).slice(0, WA_BODY_MAX);

/** The reason list (Cloud API interactive list): six reasons + "Keep my call" as the last row. */
export function cancelCardList(booking = {}, lead = {}) {
  const id = booking.id;
  const rows = Object.entries(CANCEL_REASONS).map(([code, r]) => ({ id: code === 'different_time' ? `reschedule:${id}` : `cancel_reason:${code}:${id}`, title: r.title, ...(r.description ? { description: r.description } : {}) }));
  rows.push({ id: `keep_it:${id}`, title: 'Keep my call', description: 'No change, it stays booked' });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: lead.phone, type: 'interactive',
    interactive: { type: 'list', body: { text: cancelLine('card', lead, booking) }, action: { button: 'Choose a reason', sections: [{ title: 'Your call', rows }] } } };
}

/**
 * The card as W10 sends it: { wa: the list, banner: the header-cancel image to send FIRST | null }.
 * lib/wa-banner.cjs sessionBanner decides (WA_SESSION_BANNERS switch, list -> image message first). Until 'cancel' is in
 * its HEADERS list the same plan is built from its HEADER_BASE + bannersOn (lists take the image first on both providers).
 */
export function cancelCard(booking = {}, lead = {}, env = {}) {
  const wa = cancelCardList(booking, lead);
  if (WB.HEADERS.includes(CANCEL_HEADER)) return WB.sessionBanner(wa, env, CANCEL_HEADER);
  if (!WB.bannersOn(env)) return { banner: null, wa };
  return { banner: { messaging_product: 'whatsapp', recipient_type: 'individual', to: wa.to, type: 'image', image: { link: `${WB.HEADER_BASE}header-${CANCEL_HEADER}.png` } }, wa };
}

/** cancel_reason:<code>:<booking> -> { code, booking_id } | null (unknown code -> null). */
export function parseCancelReason(p) {
  const m = /^cancel_reason:([a-z_]+):(.+)$/u.exec(String(p || ''));
  return m && CANCEL_REASONS[m[1]] ? { code: m[1], booking_id: m[2] } : null;
}

/** The closing line of a cancel with a reason, as the delegate body Build offer / cancelDoneWa already use. */
export function reasonDelegate(reason, lead, booking, delegate = null) {
  if (!reason || !reason.code) return delegate;
  const key = reason.code === 'other' ? 'other_done' : CANCEL_COPY[reason.code] ? reason.code : null;
  return key ? { ...(delegate || {}), body: cancelLine(key, lead, booking) } : delegate;
}

/** "Something went wrong": the hello@ email line, then Keep my call / Cancel it (cancel_yes, the existing cancel). */
export const cancelProblemWa = (booking = {}, lead = {}) => toWa(lead.phone, { type: 'buttons', body: cancelLine('went_wrong', lead, booking), buttons: [[`keep_it:${booking.id}`, 'Keep my call'], [`cancel_yes:${booking.id}`, 'Cancel it']] });
/** "Another reason": ask them to type it (W07 routes the next text back while cancel_reason_pending is set). */
export const cancelOtherWa = (booking = {}, lead = {}) => toWa(lead.phone, { type: 'buttons', body: cancelLine('other_ask', lead, booking), buttons: [[`cancel_yes:${booking.id}`, 'Just cancel it'], [`keep_it:${booking.id}`, 'Keep my call']] });
/** conv_state while W10 waits for the typed reason: 30 minutes, this booking only. */
export const CANCEL_REASON_WAIT_MS = 30 * 60_000;
export const cancelReasonPending = (booking = {}, nowMs = Date.now()) => ({ booking_id: String(booking.id), until: new Date(nowMs + CANCEL_REASON_WAIT_MS).toISOString() });
/** The typed reason counts only for that booking, while the wait is open. */
export function typedReasonValid(lead = {}, booking = {}, nowMs = Date.now()) {
  const p = lead.conv_state && lead.conv_state.cancel_reason_pending;
  return !!(p && String(p.booking_id) === String(booking.id) && Date.parse(p.until) > nowMs && ACTIVE.has(booking.status));
}
/** The row W10 stores: [code, typed text or ''] for the Save cancel reason / Timeline: cancelled SQL. */
export const reasonParams = (reason) => [reason && reason.code ? String(reason.code) : '', reason && reason.text ? String(reason.text).replace(/\s+/g, ' ').trim().slice(0, 500) : ''];

/** WhatsApp interactive/text payload from a {type, body, buttons} message. */
export function toWa(to, m) {
  if (!m) return null;
  if (m.type === 'text') return { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.body } };
  return { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: m.body }, action: { buttons: m.buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } };
}

// ---------------------------------------------------------------------------------------------------------------
// Sub-workflow requests (v4b21, 20 Oct 2026 live bug): W10 handed W05 / W09 its own item (or a Graph response), which they
// reject (W05 parseSub: "missing slot_start, method, idempotency_key"). Each call now gets the documented shape
// (CONTRACTS "Sub-workflow interfaces"), built here and checked against the callee's own parser where it is importable.
// ---------------------------------------------------------------------------------------------------------------
/**
 * After-meeting rebooking (applyReschedule action new_booking) -> W05 documented book. j = the "Decide move" item.
 * -> { ok:true, req } | { ok:false, reason, req } (reason = W05 parseSub's own rejection, so W10 never sends what W05 rejects).
 */
export function rebookRequest(j = {}) {
  const d = j.d || {}; const ins = d.insert || {};
  if (d.action !== 'new_booking' || !j.bk || !j.ld || !j.ld.id) return { ok: false, reason: 'not a new_booking', req: null };
  const slot = ins.appointment_date || j.new_start;
  const req = { op: 'book', lead_id: String(j.ld.id), slot_start: slot, method: ins.method || j.bk.method, booked_via: 'chat',
    previous_booking_id: ins.previous_booking_id || j.bk.id, idempotency_key: `w10:rebook:${j.bk.id}:${slot}` };
  const chk = parseW05Sub(req);
  return chk.op === 'book' ? { ok: true, req } : { ok: false, reason: chk.reason || chk.op, req };
}
/** W09 rebuild after a move in place (same row, new time): the W09 keys follow the new start. */
export const w09Rebuild = (bk = {}, newStart = '') => ({ op: 'rebuild', booking_id: String(bk.id), idempotency_key: `w09:rebuild:${bk.id}:${newStart}` });
/** W09 cancel_all after a cancel. */
export const w09CancelAll = (bk = {}) => ({ op: 'cancel_all', booking_id: String(bk.id), idempotency_key: `w09:cancel_all:${bk.id}` });
/**
 * W05 update_method after a method change (W05 PATCHes the Outlook event, Teams link, client email). Smoke #3: W05 owns the
 * change. W10 no longer saves the method itself and no longer tells the client first; it hands W05 the one lead message
 * (notifyWa), which W05 sends only after the change is saved.
 */
export function w05UpdateMethod(bk = {}, method = null, notifyWa = null) {
  const req = { op: 'update_method', booking_id: String(bk.id), method, ...(notifyWa && notifyWa.to ? { notify_wa: notifyWa } : {}) };
  const chk = parseW05Sub(req);
  return chk.op === 'update_method' ? { ok: true, req } : { ok: false, reason: chk.reason, req };
}

// ---------------------------------------------------------------------------------------------------------------
// Smoke #11 (21 Oct 2026): a move on /start/ took 7-10 s (W04 is_free, the row, a second token refresh, the Graph PATCH, W09
// re-plan, the adviser notice, the client email), and the page gives up at 10 s, so the client saw "Something went wrong"
// although the call had moved. W39 waits only for what decides the answer: the claim, the W04 re-check and the row moved in
// place. Everything that follows a moved row runs in W10's own second execution (op move_effects, not waited for), which gets
// the decided move and the booking as it was before (old time for the notices) in its input. Same nodes, same order.
// ---------------------------------------------------------------------------------------------------------------
/** j = the "Decide move" item of a moved row -> W10's own sub-call input for the effects. */
export function moveEffectsRequest(j = {}) {
  const bk = j.bk || {};
  return { source: 'W10', move_effects: { origin_source: j.source || null, d: j.d || null, new_start: j.new_start, new_end: j.new_end, rebooked_after_no_show: !!j.rebooked_after_no_show,
    before: { appointment_date: bk.appointment_date, ends_at: bk.ends_at, status: bk.status, reschedule_count: bk.reschedule_count } },
  booking: { id: String(bk.id) }, lead: { id: (j.ld && j.ld.id) || bk.client_id || null }, idempotency_key: `w10:move_effects:${bk.id}:${j.new_start}` };
}
/** In the effects execution: the "Merge context" item (row reloaded, already at the new time) -> the "Decide move" item shape. */
export function moveEffectsItem(m = {}) {
  const e = m.move_effects || {};
  return { ...m, source: e.origin_source || null, bk: { ...(m.bk || {}), ...(e.before || {}) }, d: e.d, new_start: e.new_start, new_end: e.new_end, rebooked_after_no_show: !!e.rebooked_after_no_show };
}
