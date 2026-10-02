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
export function offerMessage({ booking, lead, broker, brand = {}, slots = [], now_ms, last_inbound_ms, reason = 'lead_reschedule' }) {
  const window = Number.isFinite(last_inbound_ms) && now_ms - last_inbound_ms < 24 * H;
  const first = (lead.first_name || '').trim() || 'there';
  const adviser = String(broker.contact_person || '').split(' ')[0];
  if (!slots.length) return { kind: 'no_slots', escalate: 'no_slots', text: null };
  if (brand.booking_ui === 'flow') {
    const prefill = { booking_id: booking.id, current_date: slotLabel(booking.appointment_date).split(',')[0], current_time: slotLabel(booking.appointment_date).split(', ')[1], method: booking.method };
    return window ? { kind: 'flow_session', flow: 'reschedule', flow_id_ref: 'brands.booking_flow_id', prefill }
      : { kind: 'template', template: 'reschedule_offer_v2', vars: [first, adviser, prefill.current_date, prefill.current_time], prefill };
  }
  if (window) {
    const rows = slots.slice(0, 10).map((s) => ({ id: `slot_${s.start}:resched:${booking.id}`, title: slotLabel(s.start).slice(0, 24) }));
    return { kind: 'list_session', rows, body: 'No problem, here are some other times.' };
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
    rebook_offer: !offered && !lead.opted_out_at,
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
  if (d.action === 'reschedule' || d.action === 'reschedule_slots') return 'offer';
  const m = input.msg || {};
  const p = String(m.payload || m.list_id || '');
  if (parseSlotPayload(p)) return 'pick';
  const k = p.split(':')[0];
  if (k === 'reschedule' || k === 'other_times') return 'offer';
  if (k === 'cancel') return 'cancel';          // explicit button tap: cancel at once
  if (k === 'cancel_yes') return 'cancel';
  if (k === 'keep_it') return 'keep';
  return 'offer';
}
