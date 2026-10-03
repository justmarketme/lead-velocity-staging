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
import { LINES, fill } from '../../conversation/lines.mjs';
export const H = 3600_000;
const SAST = 2 * H;
const ACTIVE = new Set(['booked', 'confirmed']);
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
export function offerMessage({ booking, lead, broker, brand = {}, slots = [], now_ms, last_inbound_ms, reason = 'lead_reschedule', delegate = null }) {
  const window = Number.isFinite(last_inbound_ms) && now_ms - last_inbound_ms < 24 * H;
  const first = (lead.first_name || '').trim() || 'there';
  const adviser = String(broker.contact_person || '').split(' ')[0];
  if (!slots.length) return { kind: 'no_slots', escalate: 'no_slots', text: null };
  if (brand.booking_ui === 'flow') {
    const prefill = { booking_id: booking.id, current_date: slotLabel(booking.appointment_date).split(',')[0], current_time: slotLabel(booking.appointment_date).split(', ')[1], method: booking.method };
    return window ? { kind: 'flow_session', flow: 'reschedule', flow_id_ref: 'brands.booking_flow_id', prefill, body: leadBody('reschedule', { delegate, lead, booking, broker }) }
      : { kind: 'template', template: 'reschedule_offer_v2', vars: [first, adviser, prefill.current_date, prefill.current_time], prefill };
  }
  if (window) {
    const rows = slots.slice(0, 10).map((s) => ({ id: `slot_${s.start}:resched:${booking.id}`, title: slotLabel(s.start).slice(0, 24) }));
    return { kind: 'list_session', rows, body: leadBody(reason === 'broker_rescheduled' ? 'slots' : 'reschedule', { delegate, lead, booking, broker }) };
  }
  const three = pick3(slots);
  return { kind: 'template', template: 'reschedule_offer', vars: [first, adviser, ...three.map((s) => slotLabel(s.start))], buttons: three.map((s) => `slot_${s.start}:resched:${booking.id}`).concat([`other_times:${booking.id}`]) };
}

/**
 * applyReschedule(booking, newSlot, ctx) -> decision. Pure; the workflow executes it inside one transaction.
 * ctx = { now_ms, free: boolean (getSchedule re-check), next_slots: [...], initiated_by: 'lead'|'broker', after_meeting: bool, idempotency_key, seen_keys: Set }
 */
export function applyReschedule(booking, newSlot, ctx) {
  if (ctx.seen_keys && ctx.seen_keys.has(ctx.idempotency_key)) return { action: 'replay', booking_id: booking.id };
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
  if (input.source === 'W12' && input.outcome === 'rescheduled') return 'broker_rescheduled';
  const d = input.delegate || {};
  if (d.action === 'cancel_confirm') return 'cancel_ask';
  if (d.action === 'change_method') return 'change_method';
  if (d.action === 'no_call') return 'no_call';     // W07 intent: "I don't want a call" / "No thanks" (C1A b)
  if (d.action === 'reschedule' || d.action === 'reschedule_slots') return 'offer';
  const m = input.msg || {};
  const p = String(m.payload || m.list_id || '');
  if (parseSlotPayload(p)) return 'pick';
  const k = p.split(':')[0];
  if (k === 'reschedule' || k === 'other_times') return 'offer';
  if (k === 'cancel') return 'cancel';          // explicit button tap: cancel at once
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
 * input = { lead: {id, verified_at, first_message_at, opted_out_at, conv_state}, booking: {id, brand_id, broker_id, cycle_id,
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
  const base = { lead_id: lead.id, booking_id: booking.id, outcome_id: null, brand_id: booking.brand_id, broker_id: booking.broker_id, cycle_id: booking.cycle_id, at: new Date(now_ms).toISOString(), idempotency_key: `w10:c1a:${booking.id}`, schedule: 'C1A', c1a_mode: mode };
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
    change_method: [L.METHOD_CHANGED]
  }[kind] || [];
  return lines.filter(Boolean).map((l) => fill(l, vars)).join(' ').slice(0, WA_BODY_MAX);
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

/** WhatsApp interactive/text payload from a {type, body, buttons} message. */
export function toWa(to, m) {
  if (!m) return null;
  if (m.type === 'text') return { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.body } };
  return { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: m.body }, action: { buttons: m.buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } } };
}
