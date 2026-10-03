// automation/lib/w15.mjs  -  W15 Opt-out ("STOP" anywhere): POPIA 2.1.2, 4.6 item 14, W24 suppression.
// Owner: automation-engineer. Imported by the n8n Code nodes in automation/W15.json and by automation/tests/W15.test.mjs,
// so the workflow and its acceptance test run the same code. Node 18+, zero dependencies, no I/O.
//
// Which of my five: Meta Cloud API docs (a STOP reply opens the 24-h window, so the one confirmation is a free-form
// session message, not a template), Cochrane/BMJ reminder reviews (reminders are the product; an opted-out person gets
// none, so every scheduled touch is cancelled in the same run), and the "never a retry storm" rule (the suppression
// insert is the idempotency claim: a second STOP finds it and does nothing).
//
// Detection uses the shared prefilter (conversation/guardrail.mjs STOP_RX, the same net W07 routes on), plus "stopall".
// The confirmation wording is conversation/lines.mjs STOP_ACK / STOP_ACK_BOOKED / STOP_ACK_CANCELLED (fixed lines, no LLM).
import { createHash } from 'node:crypto';
import { prefilter } from '../../conversation/guardrail.mjs';
import { LINES, fill } from '../../conversation/lines.mjs';

export const WORKFLOW = 'W15';
const H = 3_600_000;
const SAST = 2 * H;
const msOf = (v) => (typeof v === 'number' ? v : Date.parse(v));
export const isoSast = (t) => new Date(msOf(t) + SAST).toISOString().replace(/\.\d{3}Z$/, '+02:00');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (t) => { const d = new Date(msOf(t) + SAST); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const timeLabel = (t) => isoSast(t).slice(11, 16);
const METHOD_LABEL = { teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' };

/** Same rule as public.smc_hash_contact (migration 12, I-38a): SHA-256 hex of the E.164 digits only (no "+"). */
export function hashMobile(e164) {
  const digits = String(e164 ?? '').replace(/\D/g, '');
  return digits ? createHash('sha256').update(digits, 'utf8').digest('hex') : null;
}

const EXTRA = /^\s*stop\s*all\s*[.!]*\s*$/iu; // "STOPALL" written as one word (carrier convention)
/** Text -> is it an opt-out? Button taps are not text: the booking "Cancel" button is W10, never STOP. */
export function isStop(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return EXTRA.test(text) || prefilter(text).stop === true;
}

/** Booking behaviour on STOP (NH-28 b): 'cancel' (acceptance test + compliance-qa, default) or 'keep' (conversation-designer). */
export const bookingMode = (v) => (String(v || '').toLowerCase() === 'keep' ? 'keep' : 'cancel');
const LIVE = new Set(['booked', 'confirmed']);
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || 'Your client';
const brokerKey = (b) => b.id ?? b.broker_id;

/** Broker notice wording: first name only, never the number (POPIA minimisation; test "first name only"). */
export function brokerNoticeText(lead, { bookingCancelled = false, keptBooking = null } = {}) {
  const f = firstName(lead.first_name);
  if (keptBooking) return `${f} has opted out of messages from SortMyCover. Their call on ${dateLabel(keptBooking.start)} at ${timeLabel(keptBooking.start)} stays booked unless they cancel. Do not message them on WhatsApp.`;
  return `${f} has opted out of contact. Please do not call or message them.${bookingCancelled ? ' Their booking has been removed from your calendar.' : ''}`;
}

/**
 * planOptOut(input) -> what W15 writes and sends. Pure.
 * input = { mobile (E.164 or null), text, channel: 'whatsapp'|'sms'|'console'|'email', force (opt-out intent from W07's
 *           model, the console, or a DSR), now, language, leads: [{id, first_name, phone, broker_id, brand_id, opted_out_at}],
 *           bookings: [{id, lead_id, broker_id, status, graph_event_id, calendar_provider, start, method}],
 *           brokers: [{id|broker_id, adviser_whatsapp|whatsapp_number, email, contact_person|adviser_name, last_inbound_at}],
 *           already_suppressed (a 'stop' row exists for this hash), booking_mode: 'cancel'|'keep' }
 */
export function planOptOut(input = {}) {
  const now = input.now ?? Date.now();
  if (!input.force && !isStop(input.text)) return { handled: false };
  const mobile_hash = hashMobile(input.mobile);
  if (input.already_suppressed) return { handled: true, duplicate: true, mobile_hash };
  const at = isoSast(now);
  const mode = bookingMode(input.booking_mode);
  const leads = (input.leads || []).filter((l) => !input.mobile || !l.phone || hashMobile(l.phone) === mobile_hash);
  const live = (input.bookings || []).filter((b) => LIVE.has(b.status) && leads.some((l) => l.id === b.lead_id));
  const brokers = new Map((input.brokers || []).map((b) => [String(brokerKey(b)), b]));
  const out = {
    handled: true, duplicate: false, mobile_hash, opted_out_at: at, booking_mode: mode,
    suppression: mobile_hash ? { mobile_hash, source: 'stop', brand_id: null, lead_id: leads[0]?.id ?? null, note: `W15 ${input.channel || 'whatsapp'}` } : null,
    lead_updates: [], booking_cancels: [], w09: [], cancel_lead_ids: [], broker_notices: [], activities: [], confirmation: null,
  };
  for (const l of leads) {
    if (!l.opted_out_at) out.lead_updates.push({ id: l.id, opted_out_at: at, stage: 'opted_out' });
    out.cancel_lead_ids.push(l.id);
    out.w09.push({ op: 'pause', lead_id: l.id, reason: 'opt_out' }); // CONTRACTS W09 pause: every unsent job for the lead
    const mine = live.filter((b) => b.lead_id === l.id);
    for (const b of mine) {
      out.w09.push({ op: 'cancel_all', booking_id: b.id }); // CONTRACTS W09 cancel_all (idempotent)
      if (mode === 'cancel') out.booking_cancels.push({ booking_id: b.id, lead_id: l.id, broker_id: b.broker_id, graph_event_id: b.graph_event_id || null, calendar_provider: b.calendar_provider || null, start: b.start, method: b.method });
    }
    out.activities.push({ lead_id: l.id, brand_id: l.brand_id ?? null, broker_id: l.broker_id ?? null, activity_type: 'opted_out', actor_type: 'lead', occurred_at: at,
      payload: { channel: input.channel || 'whatsapp', forced: !!input.force, bookings_cancelled: mode === 'cancel' ? mine.map((b) => b.id) : [], booking_mode: mode },
      idempotency_key: `w15:optout:${l.id}` });
    if (!l.broker_id) continue; // not routed yet (mid-quiz): nobody to tell
    const br = brokers.get(String(l.broker_id)) || {};
    const kept = mode === 'keep' ? mine[0] || null : null;
    const text = brokerNoticeText(l, { bookingCancelled: mode === 'cancel' && mine.length > 0, keptBooking: kept });
    const inWindow = br.last_inbound_at && now - msOf(br.last_inbound_at) < 24 * H;
    const cancelled = mode === 'cancel' ? mine[0] : null;
    // WhatsApp: a session text inside the broker's 24-h window; outside it the approved broker_booking_changed template
    // when a booking was removed; otherwise (cancel mode, no booking) the broker_lead_opted_out template; keep mode is held and the email carries it.
    const wa = inWindow ? { mode: 'session' }
      : cancelled ? { mode: 'template', template: 'broker_booking_changed',
        vars: [firstName(br.contact_person || br.adviser_name || br.adviser_first_name), firstName(l.first_name), METHOD_LABEL[cancelled.method] || cancelled.method || 'call', `${dateLabel(cancelled.start)}, ${timeLabel(cancelled.start)}`, 'Cancelled: opted out, do not call'],
        url_suffix: `calendar?day=${isoSast(cancelled.start).slice(0, 10)}` }
        : mode === 'cancel' ? { mode: 'template', template: 'broker_lead_opted_out', // I-55a / state-machine.md STOP step 1: no booking existed; 2 body vars (never the number) + URL suffix
          vars: [firstName(br.contact_person || br.adviser_name || br.adviser_first_name), firstName(l.first_name)], url_suffix: `leads?lead=${l.id}` }
          : { mode: 'held_no_template' }; // keep mode: the call stands, the email carries the notice, nothing from this template
    out.broker_notices.push({ broker_id: l.broker_id, lead_id: l.id, channel: 'whatsapp', to: br.adviser_whatsapp || br.whatsapp_number || null, text, ...wa });
    out.broker_notices.push({ broker_id: l.broker_id, lead_id: l.id, channel: 'email', to: br.email || null, subject: `${firstName(l.first_name)} opted out: do not contact`, text, mode: 'email' });
  }
  // Exactly one confirmation, on the channel the STOP came in on (a WhatsApp STOP opens the 24-h window).
  if (input.mobile && (input.channel === 'whatsapp' || input.channel === 'sms' || !input.channel)) {
    const L = LINES[input.language] || LINES.en;
    const kept = mode === 'keep' ? live[0] : null;
    const br = kept ? brokers.get(String(kept.broker_id)) || {} : {};
    // R6-04 / I-49b: cancel mode with a live booking -> STOP_ACK_CANCELLED (the earliest cancelled booking, its broker)
    // as the one confirmation, so the lead knows the call is off. Keep mode -> STOP_ACK_BOOKED. Nothing live -> STOP_ACK.
    const cx = [...out.booking_cancels].filter((b) => b.start != null).sort((a, b) => msOf(a.start) - msOf(b.start))[0] || null;
    const cbr = cx ? brokers.get(String(cx.broker_id)) || {} : {};
    const text = kept ? fill(L.STOP_ACK_BOOKED, { adviser_first: firstName(br.contact_person || br.adviser_name), date: dateLabel(kept.start), time: timeLabel(kept.start) })
      : cx ? fill(L.STOP_ACK_CANCELLED, { adviser_first: firstName(cbr.contact_person || cbr.adviser_name || cbr.adviser_first_name), date: dateLabel(cx.start), time: timeLabel(cx.start) })
        : L.STOP_ACK;
    out.confirmation = { to: input.mobile, channel: input.channel || 'whatsapp', kind: 'opt_out_confirmation', text, lead_id: leads[0]?.id ?? null };
  }
  return out;
}

/** Cloud API body for a session text (inside the 24-h window). */
export const waText = (to, body) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/^\+/, ''), type: 'text', text: { body: String(body).slice(0, 4096) } });

/** Cloud API body for broker_booking_changed (5 body vars + 1 URL suffix; automation/templates/broker_booking_changed.json). */
export function brokerTemplate(to, n) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/^\+/, ''), type: 'template',
    template: { name: n.template, language: { code: 'en' }, components: [
      { type: 'body', parameters: n.vars.map((t) => ({ type: 'text', text: String(t).replace(/[\r\n\t]+/g, ' ') })) },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: n.url_suffix }] }] } };
}

/** Normalise the three entry shapes into planOptOut's { mobile, text, channel, force }. */
export function entryFrom(item = {}) {
  if (item.source === 'twilio_sms') return { mobile: item.From || item.from || null, text: item.Body ?? item.body ?? '', channel: 'sms', force: false };
  if (item.op === 'opt_out') return { mobile: item.mobile || item.lead?.phone || null, text: item.text || '', channel: item.channel || 'console', force: true, lead_id: item.lead_id || item.lead?.id || null };
  const m = item.msg || {};
  const from = m.from ? (String(m.from).startsWith('+') ? m.from : `+${m.from}`) : item.lead?.phone || null;
  return { mobile: from, text: m.text || '', channel: 'whatsapp', force: item.route === 'W15' && item.reason === 'opt_out_intent', wamid: m.wamid || m.id || null, language: item.lead?.language || null };
}
