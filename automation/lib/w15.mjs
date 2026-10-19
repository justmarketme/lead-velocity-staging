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
// The confirmation (Jono, 19 Oct 2026, mockup frames 17-18) is ONE leaving message: the fixed text below (leavingText, no LLM)
// as a session list "Tell us why" (6 reasons + "I changed my mind"). A list takes no image header on Meta (text header
// only) or Twilio (list-picker takes no media), so with WA_SESSION_BANNERS=on the header-leaving card goes as an image
// message just before it (the lib/wa-banner.cjs rule). A reason tap is stored once (lead_activities stop_reason) and gets
// nothing back; "I changed my mind" cannot re-subscribe without DDL (n8n_app has no DELETE on suppression, smc_05, and
// the row has no "lifted" column), so it is recorded with the inbound message as evidence, opens a console escalation,
// and gets one reply saying a person will start again.
// STOP NEVER cancels a call (Jono, 19 Oct 2026): it stops every WhatsApp message (W09 jobs paused/cancelled, and W09
// skips opted-out / suppressed leads at send time), the appointment and the Outlook event stay, and the broker gets a
// short "still booked" note. Only a CANCEL after STOP cancels: the normal cancel effects plus ONE confirmation line.
import { createHash } from 'node:crypto';
import { prefilter } from '../../conversation/guardrail.mjs';
import banners from './wa-banner.cjs';

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

/** Booking behaviour on STOP: always 'keep' (Jono, 19 Oct 2026, replaces NH-28 b / NH-52). W15_STOP_BOOKING_MODE is
 *  ignored: there is no cancel-on-STOP mode any more; only a CANCEL after STOP cancels (planFollowUp). */
export const bookingMode = () => 'keep';
const LIVE = new Set(['booked', 'confirmed']);
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || 'Your client';
const brokerKey = (b) => b.id ?? b.broker_id;
const realFirst = (s) => { const f = String(s || '').trim().split(/\s+/)[0]; return f && !/^(unknown|lead|client|-)$/i.test(f) ? f : ''; };

// ------------------------------------------------------------------ the leaving message (Jono, 19 Oct 2026)
/** The leaving card: lib/wa-banner.cjs HEADER_BASE + header-leaving.png (upload to /srv/smc-media/whatsapp/headers/ first). */
export const LEAVING_HEADER = `${banners.HEADER_BASE}header-leaving.png`;
export const HELLO_EMAIL = 'hello@sortmycover.co.za';
/** "Tell us why" rows, Jono's order. Stable ids stop_why:<code>; a row title is at most 24 characters (Meta). */
export const STOP_REASONS = [
  { code: 'not_ready', title: "I'm not ready yet" },
  { code: 'already_sorted', title: 'Already sorted my cover', description: "I've already sorted my cover" },
  { code: 'no_call_expected', title: "I didn't expect a call" },
  { code: 'went_wrong', title: 'Something went wrong' },
  { code: 'other', title: 'Another reason' },
  { code: 'too_many', title: 'Too many messages' },
];
export const STOP_UNDO = { id: 'stop_undo:changed_mind', title: 'I changed my mind' };
export const LIST_BUTTON = 'Tell us why';

/** The one leaving text. booking: null | { date, time } (the live call, kept). withAsk: the "tell us why" line (WhatsApp list only). */
export function leavingText(name, booking = null, { withAsk = true } = {}) {
  const f = realFirst(name);
  let t = f ? `Done, ${f}. You won't get any more messages from us.` : "Done. You won't get any more messages from us.";
  if (booking) t += ` Your call on ${booking.date} at ${booking.time} stays booked unless you reply CANCEL.`;
  t += withAsk ? ` If you have a moment, would you tell us why? It helps us do better. If something went wrong, you can also email ${HELLO_EMAIL}.`
    : ` If something went wrong, you can email ${HELLO_EMAIL}.`;
  return t;
}

/** Cloud API session list: the leaving text + "Tell us why" (6 reasons) + "Changed your mind?" (1 row). 7 rows <= 10. */
export function leavingList(to, text) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/^\+/, ''), type: 'interactive',
    interactive: { type: 'list', body: { text: String(text).slice(0, 1024) }, action: { button: LIST_BUTTON, sections: [
      { title: LIST_BUTTON, rows: STOP_REASONS.map((r) => ({ id: `stop_why:${r.code}`, title: r.title, ...(r.description ? { description: r.description } : {}) })) },
      { title: 'Changed your mind?', rows: [{ id: STOP_UNDO.id, title: STOP_UNDO.title }] }] } } };
}

/** The banner image sent just before the list, or null (WA_SESSION_BANNERS off: the list alone is the one message). */
export const leavingBanner = (to, env = {}) => (banners.bannersOn(env)
  ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/^\+/, ''), type: 'image', image: { link: LEAVING_HEADER } } : null);

/** Broker WhatsApp + email notices for one lead. mode 'keep' = STOP (call kept, or no call); 'cancel' = a CANCEL after STOP. */
function brokerNotices(l, br, { mine, mode, now }) {
  const kept = mode === 'keep' ? mine[0] || null : null;
  const cancelled = mode === 'cancel' ? mine[0] || null : null;
  const text = brokerNoticeText(l, { bookingCancelled: cancelled, keptBooking: kept });
  const inWindow = br.last_inbound_at && now - msOf(br.last_inbound_at) < 24 * H;
  // WhatsApp: a session text inside the broker's 24-h window; outside it the approved broker_booking_changed template
  // when a CANCEL removed the booking; the broker_lead_opted_out template when there was no call; a kept call outside the
  // window has no fitting template, so it is held and the email carries the "still booked" note.
  const wa = inWindow ? { mode: 'session' }
    : cancelled ? { mode: 'template', template: 'broker_booking_changed',
      vars: [firstName(br.contact_person || br.adviser_name || br.adviser_first_name), firstName(l.first_name), METHOD_LABEL[cancelled.method] || cancelled.method || 'call', `${dateLabel(cancelled.start)}, ${timeLabel(cancelled.start)}`, 'Cancelled by the client'],
      url_suffix: `calendar?day=${isoSast(cancelled.start).slice(0, 10)}` }
      : !kept ? { mode: 'template', template: 'broker_lead_opted_out', // I-55a / state-machine.md STOP step 1: no booking existed; 2 body vars (never the number) + URL suffix
        vars: [firstName(br.contact_person || br.adviser_name || br.adviser_first_name), firstName(l.first_name)], url_suffix: `leads?lead=${l.id}` }
        : { mode: 'held_no_template' }; // call kept, window closed: the email carries the note
  return [
    { broker_id: l.broker_id, lead_id: l.id, channel: 'whatsapp', to: br.adviser_whatsapp || br.whatsapp_number || null, text, ...wa },
    { broker_id: l.broker_id, lead_id: l.id, channel: 'email', to: br.email || null, subject: kept ? `${firstName(l.first_name)} opted out of WhatsApp: call still booked` : cancelled ? `${firstName(l.first_name)} cancelled their call` : `${firstName(l.first_name)} opted out: do not contact`, text, mode: 'email' },
  ];
}

/** Broker notice wording: first name only, never the number (POPIA minimisation; test "first name only"). */
export function brokerNoticeText(lead, { bookingCancelled = null, keptBooking = null } = {}) {
  const f = firstName(lead.first_name);
  if (keptBooking) return `${f} opted out of WhatsApp messages. The call on ${dateLabel(keptBooking.start)} at ${timeLabel(keptBooking.start)} is still booked.`;
  if (bookingCancelled) return `${f} cancelled the call on ${dateLabel(bookingCancelled.start)} at ${timeLabel(bookingCancelled.start)}. It has been removed from your calendar. They have opted out of messages, so please do not call or message them.`;
  return `${f} has opted out of contact. Please do not call or message them.`;
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
    }
    out.activities.push({ lead_id: l.id, brand_id: l.brand_id ?? null, broker_id: l.broker_id ?? null, activity_type: 'opted_out', actor_type: 'lead', occurred_at: at,
      payload: { channel: input.channel || 'whatsapp', forced: !!input.force, bookings_kept: mine.map((b) => b.id), booking_mode: mode },
      idempotency_key: `w15:optout:${l.id}` });
    if (!l.broker_id) continue; // not routed yet (mid-quiz): nobody to tell
    out.broker_notices.push(...brokerNotices(l, brokers.get(String(l.broker_id)) || {}, { mine: [...mine].sort((a, b) => msOf(a.start) - msOf(b.start)), mode, now }));
  }
  // Exactly one leaving message, on the channel the STOP came in on (a WhatsApp STOP opens the 24-h window).
  if (input.mobile && (input.channel === 'whatsapp' || input.channel === 'sms' || !input.channel)) {
    // the earliest live call is named: it stays booked unless they reply CANCEL
    const kept = [...live].filter((b) => b.start != null).sort((a, b) => msOf(a.start) - msOf(b.start))[0] || null;
    const bk = kept ? { date: dateLabel(kept.start), time: timeLabel(kept.start) } : null;
    const channel = input.channel || 'whatsapp';
    const first = leads.map((l) => l.first_name).find((x) => realFirst(x)) || '';
    const text = leavingText(first, bk, { withAsk: channel === 'whatsapp' });
    out.confirmation = { to: input.mobile, channel, kind: 'opt_out_confirmation', text, lead_id: leads[0]?.id ?? null,
      wa: channel === 'whatsapp' ? leavingList(input.mobile, text) : null };
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
  const e = { mobile: from, text: m.text || '', channel: 'whatsapp', force: item.route === 'W15' && item.reason === 'opt_out_intent', wamid: m.wamid || m.id || null, language: item.lead?.language || null,
    list_id: m.list_id || null, payload: m.payload || null, at_ms: m.at_ms || null };
  return { ...e, followup: e.force ? null : followupOf(e) };
}

// ------------------------------------------------------------------ after STOP: a reason, "I changed my mind", CANCEL
const norm = (t) => String(t || '').toLowerCase().replace(/[\u2019']/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const CANCEL_RX = /^\s*cancel\s*[.!]*\s*$/iu;
/**
 * An inbound message from an opted-out number -> { type: 'why', code } | { type: 'undo' } | { type: 'cancel' } | null.
 * A list row id (stop_why:<code> / stop_undo:*), or the row title typed back (Twilio's text fallback lists the titles).
 * A typed CANCEL counts only as text (the booking Cancel button is W10's, never this).
 */
export function followupOf(e = {}) {
  const id = String(e.list_id || e.payload || '');
  let m = /^stop_why:([a-z_]+)$/.exec(id);
  if (m && STOP_REASONS.some((r) => r.code === m[1])) return { type: 'why', code: m[1] };
  if (/^stop_undo:/.test(id)) return { type: 'undo' };
  if (id) return null;
  const t = norm(e.text);
  if (!t) return null;
  const r = STOP_REASONS.find((x) => norm(x.title) === t || (x.description && norm(x.description) === t));
  if (r) return { type: 'why', code: r.code };
  if (t === norm(STOP_UNDO.title)) return { type: 'undo' };
  if (CANCEL_RX.test(e.text || '')) return { type: 'cancel' };
  return null;
}

/** The one confirmation after a CANCEL that followed a STOP. */
export const cancelText = (b) => `Your call on ${dateLabel(b.start)} at ${timeLabel(b.start)} is cancelled.`;

/** The one reply to "I changed my mind" (no re-subscribe without DDL: a person starts again, see planFollowUp). */
export const undoText = (name) => { const f = realFirst(name); return `${f ? `Thanks, ${f}.` : 'Thanks.'} We've let our team know, and someone will message you here to start again.`; };

/**
 * planFollowUp(input) -> what W15 writes after a STOP. Pure.
 * input = { e (entryFrom output with followup), now, leads, bookings (live), brokers } as W15's load step returns them.
 *  why    -> lead_activities stop_reason (once per lead: key w15:stop_reason:<lead_id>), NO reply ("Something went wrong" too).
 *  undo   -> lead_activities stop_undo_requested (inbound message as evidence; key w15:stop_undo:<lead_id>) + a console
 *            escalation + ONE reply. Not a re-subscribe: suppression has no DELETE for n8n_app and no "lifted" column.
 *  cancel -> the call STOP kept: the normal cancel effects (booking cancelled, W09 cancel_all, Graph delete of the
 *            adviser's event, his cancel notice) and ONE confirmation line (cancelText), nothing else.
 * Only for a lead that IS opted out; anything else -> { handled: false }.
 */
export function planFollowUp(input = {}) {
  const e = input.e || {};
  const f = e.followup;
  if (!f) return { handled: false, reason: 'not_a_followup' };
  const now = input.now ?? Date.now();
  const mh = hashMobile(e.mobile);
  const leads = (input.leads || []).filter((l) => l.opted_out_at && (!e.mobile || !l.phone || hashMobile(l.phone) === mh));
  const l = leads[0];
  if (!l) return { handled: false, reason: 'not_opted_out' };
  const at = isoSast(now);
  const evidence = { wamid: e.wamid || null, text: String(e.text || '').slice(0, 500), list_id: e.list_id || e.payload || null, received_at: e.at_ms ? isoSast(e.at_ms) : at };
  const base = { lead_id: l.id, brand_id: l.brand_id ?? null, broker_id: l.broker_id ?? null, actor_type: 'lead', occurred_at: at };
  const out = { handled: true, kind: f.type, lead_id: l.id, activity: null, escalation: null, booking_cancels: [], w09: [], broker_notices: [], reply: null };
  if (f.type === 'why') {
    const r = STOP_REASONS.find((x) => x.code === f.code);
    out.activity = { ...base, activity_type: 'stop_reason', payload: { code: f.code, reason: r.description || r.title, ...evidence }, idempotency_key: `w15:stop_reason:${l.id}` };
    return out; // stored, nothing sent back
  }
  if (f.type === 'undo') {
    out.activity = { ...base, activity_type: 'stop_undo_requested',
      payload: { ...evidence, consent: 'I changed my mind', resubscribed: false, why_not_automatic: 'suppression: no DELETE grant for n8n_app (smc_05) and no lifted column; an admin re-subscribes' },
      idempotency_key: `w15:stop_undo:${l.id}` };
    out.escalation = { kind: 'other', severity: 'normal', lead_id: l.id, broker_id: l.broker_id ?? null,
      note: 'W15: changed their mind after STOP. To re-subscribe: delete the suppression row (source stop) for this number, clear leads.opted_out_at, then record the new consent (evidence: lead_activities stop_undo_requested). Then message them on WhatsApp.' };
    out.reply = { to: e.mobile || l.phone, channel: 'whatsapp', kind: 'stop_undo_reply', text: undoText(l.first_name), lead_id: l.id };
    return out;
  }
  // cancel: the call(s) the STOP kept
  const mine = (input.bookings || []).filter((b) => LIVE.has(b.status) && b.lead_id === l.id).sort((a, b) => msOf(a.start) - msOf(b.start));
  if (!mine.length) return { ...out, handled: true, noop: true };
  for (const b of mine) {
    out.w09.push({ op: 'cancel_all', booking_id: b.id });
    out.booking_cancels.push({ booking_id: b.id, lead_id: l.id, broker_id: b.broker_id, graph_event_id: b.graph_event_id || null, calendar_provider: b.calendar_provider || null, start: b.start, method: b.method });
  }
  out.activity = { ...base, activity_type: 'stop_booking_cancelled', payload: { ...evidence, bookings_cancelled: mine.map((b) => b.id) }, idempotency_key: `w15:stop_cancel:${l.id}:${mine.map((b) => b.id).sort().join(',')}` };
  if (l.broker_id) {
    const brokers = new Map((input.brokers || []).map((b) => [String(brokerKey(b)), b]));
    out.broker_notices.push(...brokerNotices(l, brokers.get(String(l.broker_id)) || {}, { mine, mode: 'cancel', now }));
  }
  out.reply = { to: e.mobile || l.phone, channel: 'whatsapp', kind: 'stop_cancel_confirmation', text: cancelText(mine[0]), lead_id: l.id };
  return out;
}

/**
 * Fan-out items for W15's "Fan-out kind?" switch, from a STOP plan or a follow-up plan. Pure apart from W05 (graph target).
 * p = { plan, ctx: { brokers } }; env: HOWZIT_MAILBOX, SMC_SHARED_CALENDAR_ID, WA_SESSION_BANNERS. The leaving message is
 * the list; with banners on, the header-leaving image item goes FIRST (same branch, so the sub sends it first).
 */
export function fanOut(p = {}, env = {}, W05 = null) {
  const plan = p.plan || {};
  const out = [];
  for (const w of plan.w09 || []) out.push({ kind: 'w09', ...w });
  const brokers = new Map(((p.ctx && p.ctx.brokers) || []).map((b) => [String(b.id), b]));
  for (const b of plan.booking_cancels || []) {
    if (!W05) break;
    // I-54h (F15): the delete targets the calendar the event was created in (lib/w05.graphEventTarget).
    const t = W05.graphEventTarget({ graph_event_id: b.graph_event_id, calendar_provider: b.calendar_provider }, brokers.get(String(b.broker_id)) || {}, { HOWZIT_MAILBOX: env.HOWZIT_MAILBOX, SMC_SHARED_CALENDAR_ID: env.SMC_SHARED_CALENDAR_ID });
    if (t.route === 'none') continue;
    out.push({ kind: 'graph_delete', broker_id: b.broker_id, op: 'graph_token', graph_event_id: b.graph_event_id, graph_route: t.error ? 'skip' : t.route, url: t.url, graph_error: t.error || null });
  }
  for (const nt of plan.broker_notices || []) {
    if (nt.channel === 'email') { if (nt.to) out.push({ kind: 'broker_email', to: nt.to, subject: nt.subject, text: nt.text, lead_id: nt.lead_id }); continue; }
    if (!nt.to || nt.mode === 'held_no_template') { out.push({ kind: 'broker_held', lead_id: nt.lead_id, broker_id: nt.broker_id }); continue; }
    out.push({ kind: 'broker_wa', lead_id: nt.lead_id, wa: nt.mode === 'session' ? waText(nt.to, nt.text) : brokerTemplate(nt.to, nt) });
  }
  const cf = plan.confirmation;
  if (cf && cf.channel === 'sms') out.push({ kind: 'confirm_sms', lead_id: cf.lead_id, comm_kind: cf.kind, sms: { to: cf.to, text: cf.text }, text: cf.text, to: cf.to });
  else if (cf) {
    const banner = leavingBanner(cf.to, env);
    if (banner) out.push({ kind: 'confirm_wa', part: 'banner', lead_id: cf.lead_id, comm_kind: 'opt_out_banner', wa: banner, text: '[image header-leaving]', to: cf.to });
    out.push({ kind: 'confirm_wa', lead_id: cf.lead_id, comm_kind: cf.kind, wa: cf.wa || waText(cf.to, cf.text), text: cf.text, to: cf.to });
  }
  const rp = plan.reply;
  if (rp) out.push({ kind: 'confirm_wa', part: rp.kind === 'stop_cancel_confirmation' ? 'cancel' : 'undo', lead_id: rp.lead_id, comm_kind: rp.kind, wa: waText(rp.to, rp.text), text: rp.text, to: rp.to });
  return out;
}
