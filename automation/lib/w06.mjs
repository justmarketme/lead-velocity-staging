// automation/lib/w06.mjs  -  W06 First touch (< 60 s): the disclosure card every routed lead gets first.
// Owner: automation-engineer. Imported by the n8n Code nodes in automation/W06.json and by automation/tests/W06.test.mjs,
// so the workflow and its acceptance test run the same code. Node 18+, zero dependencies, no I/O. Slots are never
// invented here: they come from the W04 slot engine (sub-workflow "W04 Slots API", op list) and are passed in.
//
// Which of my five: HBR (the first touch is automated and timed: 60 s from the moment routing is written),
// Meta Cloud API docs (utility template with image header = intro card; reaches outside the 24-h window; per-message
// cost, so ONE intro card per lead, never two), Chili Piper (the card itself books: 3 slot buttons or the Flow button).
//
// Rules (fixtures/_meta.assumptions; 4.6 "Disclosure WhatsApp"; 2.1.2 disclosure):
//  - Page leads: wait up to HOLD_S (45 s) for the in-page booking. A booking inside the hold -> broker_intro_booked;
//    "I'll pick on WhatsApp" (skip) or the hold expiring -> broker_intro_slots. Whichever event comes first wins,
//    enforced by ONE idempotency claim per lead (lead_activities 'w06:first:{lead_id}').
//  - Lead-ad and CTWA leads: no page booking step, so the card goes as soon as routing is written.
//  - booking_ui = flow -> broker_intro_slots_v2 (Flow button, flow_token per CONTRACTS.md "W28 flow_token").
//  - A booking that arrives after the slots card got the card -> W06 sends booking_confirmed only (never a 2nd card;
//    I-45f: W05 calls W06 op 'booking' for every first booking, W06 chooses broker_intro_booked vs booking_confirmed).
//  - Never for: unrouted, out-of-band, duplicate, suppressed or opted-out leads.
//  - Message id + delivery are the disclosure evidence; a failed WhatsApp falls back to SMS with the same words.
//  - No quiet hours on the first touch: the lead just asked (HBR speed beats a quiet-hours delay).
import * as W05 from './w05.mjs';

export const HOLD_S = 45;
export const DEADLINE_S = 60;
export const MIN = 60_000;
export const H = 60 * MIN;
const SAST = 2 * H;
export const isoSast = (t) => new Date(t + SAST).toISOString().replace(/\.\d{3}Z$/, '+02:00');
const msOf = (v) => (typeof v === 'number' ? v : Date.parse(v));

export const METHOD_LABEL = { teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Thu 15 Oct" (SAST) */
export const dateLabel = (t) => { const d = new Date(msOf(t) + SAST); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
/** "10:00" (SAST) */
export const timeLabel = (t) => isoSast(msOf(t)).slice(11, 16);
/** "Mon 12 Oct, 11:30" */
export const slotLabel = (t) => `${dateLabel(t)}, ${timeLabel(t)}`;

// The approved BODY text of the three submitted templates (automation/templates/*.json). W06.test.mjs checks these
// are byte-identical to the template files, so a template edit without a code edit fails the test.
export const TEMPLATE_BODY = {
  broker_intro_booked: 'Hi {{1}}, thanks for your insurance and financial planning enquiry. Your details have been passed to *{{2}} (FSP {{3}})*, an authorised financial services provider. *{{4}}* will be your adviser for your {{5}} call on *{{6}} at {{7}}*. Our WhatsApp assistant uses AI. Reply STOP to opt out.',
  broker_intro_slots: 'Hi {{1}}, thanks for your insurance and financial planning enquiry. Your details have been passed to *{{2}} (FSP {{3}})*, an authorised financial services provider. *{{4}}* can do a 30-minute call. Pick a time below.\n1. {{5}}\n2. {{6}}\n3. {{7}}\nOur WhatsApp assistant uses AI. Reply STOP to opt out.',
  broker_intro_slots_v2: 'Hi {{1}}, thanks for your insurance and financial planning enquiry. Your details have been passed to *{{2}} (FSP {{3}})*, an authorised financial services provider. *{{4}}* can do a 30-minute call. Pick a time below. Our WhatsApp assistant uses AI. Reply STOP to opt out.',
};
export const VAR_COUNT = { broker_intro_booked: 7, broker_intro_slots: 7, broker_intro_slots_v2: 4 };
export const DISCLOSURE_TEMPLATES = new Set(Object.keys(TEMPLATE_BODY));

export function renderBody(name, vars) {
  return TEMPLATE_BODY[name].replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const v = vars[Number(n) - 1];
    if (v === undefined) throw new Error(`${name}: variable {{${n}}} missing`);
    return v;
  });
}
/** Meta rejects template variables with a newline, a tab or 4+ consecutive spaces. */
export const cleanVar = (v) => String(v ?? '').replace(/[\n\t\r]+/g, ' ').replace(/ {4,}/g, ' ').trim();

export const claimKey = (leadId) => `w06:first:${leadId}`;

/** null when the lead may be messaged, else the reason (logged, nothing sent). */
export function blockReason(l) {
  if (!l) return 'no_lead';
  if (!l.broker_id) return 'unrouted';
  if (l.opted_out_at) return 'opted_out';
  if (l.suppressed || l.stage === 'suppressed') return 'suppressed';
  if (l.duplicate_of) return 'duplicate';
  // The workflow passes disqualified_reason (leads.qualified is a generated column = verified); qualified === false is
  // the explicit out-of-band marker callers may pass.
  if (l.disqualified_reason || l.qualified === false) return 'out_of_band';
  return null;
}

/**
 * Which event sends the card, and when. clock = routed_at (the 60 s run from when routing is written, which equals
 * lead creation for page / lead-ad leads). ctx = { booking?: {created_at}, skipAt? }
 */
export function firstTouchTrigger(l, ctx = {}) {
  const clock = msOf(l.routed_at);
  let reason; let trigger;
  if (l.origin === 'page') {
    const cands = [['hold', clock + HOLD_S * 1000], ctx.skipAt ? ['skip', msOf(ctx.skipAt)] : null, ctx.booking ? ['booking', msOf(ctx.booking.created_at)] : null]
      .filter(Boolean).sort((x, y) => x[1] - y[1]);
    [reason, trigger] = cands[0];
  } else {
    [reason, trigger] = ['routed', clock];
  }
  return { reason, clock_ms: clock, send_ms: Math.max(trigger, clock) };
}

/** 3 offers, earliest first, one per day before a second on any day (W04 "spread across days"). */
export function pickOffers(slots = [], n = 3) {
  const byDay = new Map();
  for (const s of slots) { const d = isoSast(msOf(s.start)).slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(s); }
  const days = [...byDay.keys()].sort();
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const d of days) { const s = byDay.get(d)[round]; if (s && out.length < n) { out.push(s); added = true; } }
    if (!added) break;
  }
  return out;
}

/**
 * planFirstTouch(lead, broker, ctx) -> null (must not message) or the plan
 *   { template, trigger, send_at, clock_start, header_image, variables, buttons }
 * ctx = { booking?: {id, created_at, start, method}, skipAt?, bookingUi?: 'list'|'flow', slots?: W04 list output }
 * slots are needed only for the list card; W06.json asks W04 for them at send time.
 */
export function planFirstTouch(l, b, ctx = {}) {
  if (blockReason(l)) return null;
  const t = firstTouchTrigger(l, ctx);
  const base = { trigger: t.reason, send_at: isoSast(t.send_ms), clock_start: isoSast(t.clock_ms), header_image: b.intro_card_url || null };
  const common = [l.first_name, b.practice_name || b.firm_name, b.fsp_number, b.adviser_name || b.contact_person].map(cleanVar);
  if (t.reason === 'booking') {
    const st = msOf(ctx.booking.start);
    return {
      template: 'broker_intro_booked', ...base,
      variables: [...common, METHOD_LABEL[ctx.booking.method] || ctx.booking.method, dateLabel(st), timeLabel(st)].map(cleanVar),
      buttons: [{ type: 'url', param: ctx.booking.id }, { type: 'quick_reply', payload: `reschedule:${ctx.booking.id}` }, { type: 'quick_reply', payload: `cancel:${ctx.booking.id}` }],
    };
  }
  if ((ctx.bookingUi ?? 'list') === 'flow') {
    return { template: 'broker_intro_slots_v2', ...base, variables: common, buttons: [{ type: 'flow', action: 'INIT' }] };
  }
  const offers = pickOffers(ctx.slots || [], 3);
  if (offers.length < 3) return { template: null, ...base, variables: common, buttons: [], blocked: 'not_enough_slots', fallback: ctx.slotsFallback || 'alert' };
  return {
    template: 'broker_intro_slots', ...base,
    variables: [...common, ...offers.map((s) => slotLabel(s.start))].map(cleanVar),
    // Payload "slot_<ISO>": W07's router sends /^slot_/ taps to W05 (lib/w07.mjs routeCore). "other_times" -> W07.
    buttons: [...offers.map((s) => ({ type: 'quick_reply', payload: `slot_${s.start}` })), { type: 'quick_reply', payload: 'other_times' }],
  };
}

/** A page lead who books AFTER the slots card went out gets a short confirmation (W05 sends it), never a second intro card. */
export const afterLateBooking = (firstTemplate) => (firstTemplate === 'broker_intro_booked' ? [] : ['booking_confirmed']);

/** HBR SLO: send_at - clock_start <= 60 s. */
export const within60 = (p) => !!p && msOf(p.send_at) - msOf(p.clock_start) <= DEADLINE_S * 1000;

/**
 * Cloud API template message for a plan. opts = { to (E.164), flow_token?, lang='en' }.
 * Header = the broker's intro card image (4.10). Buttons are filled by index at send time (templates README).
 */
export function toCloudApi(plan, { to, flow_token = null, lang = 'en' } = {}) {
  if (!plan || !plan.template) return null;
  if (plan.variables.length !== VAR_COUNT[plan.template]) throw new Error(`${plan.template}: ${plan.variables.length} variables, template has ${VAR_COUNT[plan.template]}`);
  const comps = [];
  if (plan.header_image) comps.push({ type: 'header', parameters: [{ type: 'image', image: { link: plan.header_image } }] });
  comps.push({ type: 'body', parameters: plan.variables.map((text) => ({ type: 'text', text })) });
  plan.buttons.forEach((bt, i) => {
    if (bt.type === 'url') comps.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: String(bt.param) }] });
    else if (bt.type === 'quick_reply') comps.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: bt.payload }] });
    else if (bt.type === 'flow') comps.push({ type: 'button', sub_type: 'flow', index: String(i), parameters: [{ type: 'action', action: { flow_token: flow_token || 'unused', flow_action_data: { action: bt.action } } }] });
  });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/^\+/, ''), type: 'template', template: { name: plan.template, language: { code: lang }, components: comps } };
}

/** SMS fallback text: the same disclosure words, WhatsApp bold markers removed. */
export const smsText = (template, variables) => renderBody(template, variables).replace(/\*/g, '');

/**
 * Delivery status of a sent message -> effects (pure). msg = { wamid, template, variables, is_disclosure }.
 * delivered/read -> disclosure evidence on the lead; failed -> SMS fallback carrying the same disclosure.
 * A failed WhatsApp is NOT disclosure evidence.
 */
export function statusEffect(msg, status) {
  const out = { lead_update: null, sms: null };
  if (!msg || !msg.is_disclosure) return out;
  if (status.status === 'delivered' || status.status === 'read') out.lead_update = { wa_delivered_at: status.at, disclosure_delivered_at: status.at, disclosure_msg_id: msg.wamid };
  if (status.status === 'failed' && DISCLOSURE_TEMPLATES.has(msg.template)) out.sms = { channel: 'sms', provider: 'twilio', text: smsText(msg.template, msg.variables), is_disclosure: true };
  return out;
}

/** Same as statusEffect, applied to an in-memory lead + message log (the shape the acceptance test uses). */
export function applyStatus(l, log, status) {
  const msg = log.find((m) => m.wamid === status.id);
  msg.status = status.status;
  msg[`${status.status}_at`] = status.at;
  const e = statusEffect(msg, status);
  if (e.lead_update && !l.disclosure_delivered_at) Object.assign(l, e.lead_update);
  if (e.sms) log.push({ ...e.sms, to: l.mobile ?? l.phone, at: status.at });
  return e;
}

/**
 * I-54j: "sent at" on the SAME clock as plan.clock_start / send_at (the lead's routed_at). Production: the n8n wall clock IS
 * that clock, so it is returned unchanged (real lateness still counts against the 60 s SLO). Under the test clock
 * (x-test-now stamps routed_at in the past or future) the two clocks differ by far more than any real hold or retry, so
 * the card's send time is send_at plus the real elapsed time of the send step; latency can never go negative.
 * plannedAtMs = wall time when the plan was made, sentAtMs = wall time when Meta answered.
 */
export function sentAtOnLeadClock(plan, plannedAtMs, sentAtMs) {
  const sendAt = msOf(plan.send_at);
  if (!Number.isFinite(plannedAtMs) || Math.abs(plannedAtMs - sendAt) <= SKEW_MS) return sentAtMs;
  return sendAt + Math.max(0, sentAtMs - plannedAtMs);
}
const SKEW_MS = 10 * 60 * 1000;

/** The lead row update after Meta accepted the card (wamid back): first_message_at starts W08's clocks and the 72-h window. */
export function sentUpdate(lead, plan, wamid, sentAtMs) {
  return {
    first_message_at: isoSast(sentAtMs), disclosure_msg_id: wamid, last_contact_at: isoSast(sentAtMs),
    stage: !lead.stage || lead.stage === 'new' ? 'disclosed' : lead.stage, // never move a verified/qualified/booked lead backwards
    latency_ms: sentAtMs - msOf(plan.clock_start), within_60s: sentAtMs - msOf(plan.clock_start) <= DEADLINE_S * 1000,
  };
}

// ---------------------------------------------------------------------------------------------- workflow glue (pure)
/**
 * The W06 entry events -> the ctx planFirstTouch() reads. W06.json has three entries (CONTRACTS.md "W06 First touch"):
 *   op 'routed'  (W01 core / W02 / W03 after routing is written): lead-ad and CTWA leads send at once; page leads wait
 *                HOLD_S in the workflow, then run op 'hold';
 *   op 'booking' (W05, page booking inside the hold) -> broker_intro_booked;
 *   op 'skip'    (POST /lead/skip, the page's "I'll pick on WhatsApp") -> broker_intro_slots at once.
 * Whichever event claims 'w06:first:{lead_id}' first sends the one card; the others find the claim taken and stop.
 */
/**
 * I-45f: W05 sends { event: 'booking', lead_id, booking_id, created_at, start, method } (flat). Accept that shape as
 * op 'booking' with a booking object; every other caller already sends `op`. Nothing is guessed: no op and no known
 * event -> op stays undefined and the workflow logs subcall_rejected.
 */
export function normaliseEvent(input = {}) {
  const op = input.op || (input.event === 'booking' ? 'booking' : undefined);
  const booking = input.booking || (op === 'booking' && input.booking_id ? { id: input.booking_id, created_at: input.created_at, start: input.start, method: input.method } : undefined);
  return { ...input, op, booking_id: input.booking_id || (booking && booking.id) || null, ...(booking ? { booking } : {}) };
}

/**
 * A booking event whose first-touch claim was already taken (slots card sent first, or a chat booking) -> the short
 * booking_confirmed (W05's builder, same template + buttons), never a second intro card. l = the W06 load row
 * (first_name, phone, language, adviser_name), booking = { id, start, method }.
 */
export function lateBookingConfirmed(l, booking) {
  if (!booking || !booking.id || !booking.start) return null;
  const wa = W05.bookingConfirmed({ lead: { ...l, mobile: l.phone }, broker: { adviser_name: l.adviser_name, contact_person: l.adviser_name } }, { start: booking.start, method: booking.method }, { id: booking.id });
  return { template: 'booking_confirmed', wa };
}

export function ctxFromEvent(input = {}, now = Date.now()) {
  const ctx = { bookingUi: input.booking_ui === 'flow' ? 'flow' : 'list', slots: input.slots || [] };
  if (input.op === 'booking' && input.booking) ctx.booking = { id: input.booking.id, created_at: input.booking.created_at || now, start: input.booking.start, method: input.booking.method };
  if (input.op === 'skip') ctx.skipAt = now;
  return ctx;
}

/** Page leads wait for the in-page booking; everyone else is sent at once (seconds the workflow's Wait node holds). */
export const holdSeconds = (lead, op) => (op === 'routed' && lead && lead.origin === 'page' ? HOLD_S : 0);

/** public.communications row for the card (disclosure evidence: wamid in external_id, latency in latency_ms). */
export function communicationRow(plan, lead, broker, wamid, sentAtMs, channel = 'whatsapp') {
  return {
    brand_id: lead.brand_id ?? null, channel, direction: 'outbound', sender_type: 'system', recipient_type: 'client',
    recipient_contact: lead.phone ?? lead.mobile ?? null, content: renderBody(plan.template, plan.variables), status: 'sent',
    external_id: wamid || null, lead_id: lead.id, broker_id: broker.id ?? broker.broker_id ?? null, author: 'system', workflow: 'W06',
    template_name: channel === 'whatsapp' ? plan.template : null, template_category: channel === 'whatsapp' ? 'UTILITY' : null,
    latency_ms: sentAtMs - msOf(plan.clock_start),
    metadata: { is_disclosure: true, trigger: plan.trigger, within_60s: sentAtMs - msOf(plan.clock_start) <= DEADLINE_S * 1000, variables: plan.variables },
  };
}

/** Cloud API send result -> wamid or null (a rejected send is not disclosure evidence and goes to SMS at once). */
export const wamidOf = (resp) => (resp && Array.isArray(resp.messages) && resp.messages[0] && resp.messages[0].id) || null;
