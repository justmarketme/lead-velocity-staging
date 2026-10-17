// automation/lib/w37-cal.mjs - W37 Cal.com booking intake (17 Oct 2026, sites/sortmycover/docs/CALCOM-BOOKING-FLOW.md).
// Desktop visitors book in Cal.com; Cal.com POSTs BOOKING_CREATED / BOOKING_RESCHEDULED / BOOKING_CANCELLED to
// n8n /webhook/cal. W37 verifies the signature, stores the lead + appointment + consent in the Lead Velocity CRM and sends the
// UTILITY template booking_confirm_chat ("Yes, let's chat" -> W07 contact confirm). Pure functions; the W37 Code nodes call them
// through require('lv-automation').w37, and automation/tests/W37.test.mjs runs the same code.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { toE164 } from './w07.mjs';

export const EVENTS = ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'];
export const CAL_CONSENT_VERSION = 'CONSENT-CALCOM-v1';
export const TEMPLATE = 'booking_confirm_chat';
// appointments_smc_checks: booked_via in (page, flow, list, chat, console). The Cal.com dialog is on the site page, so 'page';
// the Cal.com origin is kept in idempotency_key / consent_ref ('calcom:<uid>') and in leads.consent_source. A distinct
// 'calcom' value needs a DDL change (Jono's OK).
export const BOOKED_VIA = 'page';
const SAST = 2 * 3600_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** x-cal-signature-256 = hex HMAC-SHA256 of the raw body with the webhook secret. Timing-safe. */
export function verifyCalSignature(raw, header, secret) {
  if (!secret) return { ok: false, reason: 'no_secret' };
  const got = String(header || '').trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return { ok: false, reason: 'no_signature' };
  const want = createHmac('sha256', secret).update(Buffer.isBuffer(raw) ? raw : String(raw ?? '')).digest('hex');
  return timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

/** Cal.com location -> appointments.method (teams | zoom | meet | whatsapp_call | phone). Online default: Teams. */
export function methodOf(location) {
  const l = String(location || '').toLowerCase();
  if (/whatsapp/.test(l)) return 'whatsapp_call';
  if (/zoom/.test(l)) return 'zoom';
  if (/google|meet/.test(l)) return 'meet';
  if (/phone|tel:|\+\d{6,}/.test(l)) return 'phone';
  return 'teams';
}

/** "w-cover via ig/cycle1/reel" -> { page_ref, via: { source, campaign, content } } (the site's calSrc ref). */
export function parseRef(ref) {
  const m = /^\s*([a-z0-9-]{2,40})(?:\s+via\s+([a-z0-9_\/-]{1,120}))?\s*$/i.exec(String(ref || ''));
  if (!m) return { page_ref: null, via: null };
  const [s, c, t] = String(m[2] || '').toLowerCase().split('/');
  return { page_ref: m[1].toLowerCase(), via: s ? { source: s.slice(0, 24), campaign: c ? c.slice(0, 64) : null, content: t ? t.slice(0, 64) : null } : null };
}

const val = (r) => (r && typeof r === 'object' && 'value' in r ? r.value : r);
/** The consent checkbox: env CAL_CONSENT_FIELD (default 'whatsapp_consent'), else any boolean answer whose label is the consent. */
function consentOf(responses = {}, field = 'whatsapp_consent') {
  const pick = (k, r) => ({ field: k, given: val(r) === true || val(r) === 'true' || val(r) === 'on', text: String((r && r.label) || '').trim() || null });
  if (responses[field] !== undefined) return pick(field, responses[field]);
  for (const [k, r] of Object.entries(responses)) if (/^I agree that SortMyCover may message me on WhatsApp/i.test(String((r && r.label) || ''))) return pick(k, r);
  return { field: null, given: false, text: null };
}

/** Webhook body -> one normalised event, or { ok:false, reason }. */
export function normaliseCal(body, { consentField } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const event = String(b.triggerEvent || '');
  if (!EVENTS.includes(event)) return { ok: false, reason: event === 'PING' ? 'ping' : 'event' };
  const p = b.payload || {};
  const uid = String(p.uid || '');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(uid)) return { ok: false, reason: 'uid' };
  const r = p.responses || {};
  const att = (Array.isArray(p.attendees) && p.attendees[0]) || {};
  const org = p.organizer || {};
  const nameV = val(r.name);
  const name = String((nameV && typeof nameV === 'object' ? [nameV.firstName, nameV.lastName].filter(Boolean).join(' ') : nameV) || att.name || '').trim().slice(0, 120);
  const phone = toE164(String(val(r.attendeePhoneNumber) || att.phoneNumber || ''));
  const email = String(val(r.email) || att.email || '').trim().toLowerCase().slice(0, 254) || null;
  const ref = parseRef(val(r.ref));
  const consent = consentOf(r, consentField || 'whatsapp_consent');
  const start = p.startTime ? new Date(p.startTime) : null;
  const end = p.endTime ? new Date(p.endTime) : null;
  const loc = typeof p.location === 'string' ? p.location : (val(r.location) && (val(r.location).value || val(r.location).optionValue)) || '';
  return {
    ok: true, event, uid,
    reschedule_uid: String(p.rescheduleUid || p.fromReschedule || '') || null,
    start: start && !isNaN(start) ? start.toISOString() : null, end: end && !isNaN(end) ? end.toISOString() : null,
    name, first_name: name.split(/\s+/)[0] || null, email, phone,
    organizer_email: String(org.email || '').trim().toLowerCase() || null, organizer_name: String(org.name || '').trim() || null,
    method: methodOf(loc), ref, consent,
    cancellation_reason: p.cancellationReason ? String(p.cancellationReason).slice(0, 300) : null,
    created_at: String(b.createdAt || p.createdAt || '') || null,
  };
}

/** "Tue 21 Oct at 10:00" in South African time. */
export function whenText(iso) {
  const d = new Date(Date.parse(iso) + SAST);
  if (isNaN(d)) return '';
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} at ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * What W37 does with one event, given the CRM context (Load context row: broker, lead, appointment, prev_appointment, suppressed).
 * Returns { action: 'book' | 'reschedule' | 'cancel' | 'escalate' | 'ignore', reason, lead?, appointment?, optin?, send?, activity? }.
 */
export function planCal(ev, ctx = {}, { now = new Date().toISOString(), brandId = null } = {}) {
  const broker = ctx.broker || null;
  const esc = (reason) => ({ action: 'escalate', reason, note: `Cal.com ${ev.event} ${ev.uid}: ${reason}` });
  if (ev.event === 'BOOKING_CANCELLED') {
    if (!ctx.appointment) return { action: 'ignore', reason: 'unknown booking' };
    return { action: 'cancel', reason: 'cancelled in Cal.com', appointment_id: ctx.appointment.id, lead_id: ctx.appointment.client_id, activity: { type: 'calcom_cancelled', payload: { uid: ev.uid, reason: ev.cancellation_reason } } };
  }
  if (!ev.start || !ev.end) return esc('no start/end time');
  if (!broker) return esc(`no SortMyCover broker with calendar email ${ev.organizer_email || '(none)'}`);
  if (!ev.phone) return esc('no valid WhatsApp number');
  if (!ev.consent.given) return esc('WhatsApp consent box not ticked');
  const page = ev.ref.page_ref;
  const via = ev.ref.via;
  const provenance = { door: 'calcom', page_ref: page, via, referral: null, consent_version: CAL_CONSENT_VERSION, opener_text: null, inbound_sid: null, booking_uid: ev.uid, received_at: ev.created_at || now };
  const lead = {
    id: ctx.lead ? ctx.lead.id : null, existing: !!ctx.lead, brand_id: brandId, broker_id: broker.id, phone: ev.phone, email: ev.email,
    first_name: ev.first_name, last_name: ev.name.split(/\s+/).slice(1).join(' ') || null,
    origin: 'page', source: /^[ab]\d{2}$/.test(page || '') ? 'campaign' : 'website_form', ref: page,
    utm_source: via ? via.source : null, utm_campaign: via ? via.campaign : null, utm_content: via ? via.content : null,
    consent_text: ev.consent.text || 'Cal.com WhatsApp consent box (label not sent)', consent_text_version: CAL_CONSENT_VERSION,
    consent_mode: 'generic', consent_source: 'calcom', consent_at: ev.created_at || now, provenance,
  };
  const appointment = {
    broker_id: broker.id, starts_at: ev.start, ends_at: ev.end, method: ev.method, status: 'booked', booked_via: BOOKED_VIA,
    idempotency_key: `calcom:${ev.uid}`, consent_ref: `calcom:${ev.uid}`, ical_uid: ev.uid, calendar_provider: 'outlook', calendar_email: ev.organizer_email,
  };
  const optin = { ref_code: page, via_source: via ? via.source : null, via_campaign: via ? via.campaign : null, via_content: via ? via.content : null,
    referral_source_type: null, referral_source_id: null, referral_source_url: null, referral_headline: null, ctwa_clid: null,
    consent_version: CAL_CONSENT_VERSION, consent_text: lead.consent_text, opener_text: null, message_sid: `calcom:${ev.uid}`, received_at: lead.consent_at, recorded_by: 'W37' };
  const adviser = String(broker.contact_person || broker.adviser_name || '').split(/\s+/)[0] || 'your adviser';
  const send = ctx.suppressed ? null : { template: TEMPLATE, variables: [ev.first_name || 'there', adviser, whenText(ev.start)], quick_reply_prefix: 'booking_chat_yes' };
  if (ev.event === 'BOOKING_RESCHEDULED') {
    return { action: 'reschedule', reason: 'rescheduled in Cal.com', lead, appointment: { ...appointment, previous_booking_id: ctx.prev_appointment ? ctx.prev_appointment.id : null, reschedule_count: ((ctx.prev_appointment && ctx.prev_appointment.reschedule_count) || 0) + 1 },
      prev_uid: ev.reschedule_uid, optin, send: null, activity: { type: 'calcom_rescheduled', payload: { uid: ev.uid, from_uid: ev.reschedule_uid, starts_at: ev.start } } };
  }
  return { action: 'book', reason: 'booked in Cal.com', lead, appointment, optin, send, activity: { type: 'calcom_booked', payload: { uid: ev.uid, starts_at: ev.start, method: ev.method, provenance } } };
}

/** smc-whatsapp-send input for the confirm template; the quick reply carries the appointment id for W07. */
export function confirmSend(plan, appointmentId, leadId) {
  if (!plan.send || !appointmentId) return null;
  return { to: plan.lead.phone, kind: 'template', template: plan.send.template, variables: plan.send.variables,
    buttons: [{ quick_reply: `${plan.send.quick_reply_prefix}:${appointmentId}` }], lead_id: leadId, broker_id: plan.appointment.broker_id,
    correlation: `W37:confirm:${plan.appointment.idempotency_key}`, caller: 'W37' };
}
