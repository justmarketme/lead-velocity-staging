// automation/lib/w05.mjs  -  W05 Book (POST /book + sub-calls book / update_method / invite_bounced).
// Imported by the Code nodes of automation/W05.json (require('lv-automation').w05, I-46c) and by
// automation/tests/W05.test.mjs, so the workflow and its acceptance test run the same code. Pure logic: no network,
// no database, no DNS, no file reads. Time is passed in (ms). The slot re-check is W04's engine (lib/w04.mjs
// respond() with op is_free), never a copy.
//
// Which of my five: Calendly / Cal.com slot logic (re-check inside the booking, buffer, notice, caps, next 3 when
// taken); Chili Piper (the page, the 10-slot list, the chat and the Flow all book through this one path, no
// separate site); Meta Cloud API docs (utility templates, per-message cost: the first booking's confirmation is the
// W06 intro card, W05 sends booking_confirmed only for a rebooking); HBR (nothing here waits on a person).
//
// Rules (4.6 W05 row, "Method -> what W05 creates", 0.1 Email, CONTRACTS lead_token / Sub-workflow interfaces / I-38d):
//  - Zero double-bookings: is_free (Outlook getSchedule + our appointments + buffer) BEFORE the insert, then the
//    INSERT itself re-checks overlap + buffer in one statement, and the gist exclusion constraint
//    appointments_smc_no_overlap is the last line of defence. ON CONFLICT DO NOTHING + re-select = replay or taken.
//  - Idempotent: appointments.idempotency_key (unique). Page: request_id -> page:<lead>:<request_id>. Flow:
//    flow_token + slot (hashed, the token is a bearer secret). Chat: the tap's wamid. Graph create carries a
//    transactionId derived from the same key, so a retried POST never makes a second Outlook event.
//  - Email ONLY for Teams / Zoom / Meet (0.1): call methods never read, store or forward an email.
//  - Client NOT an attendee by default (add_client_as_attendee per broker); the invite goes from howzit@.
//  - CAPI Schedule once per booking, never with email (capi/event-spec.md).
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { LINES, fill } from '../../conversation/lines.mjs';
import { brokerConfig, calendarRoute, clockFor, ms, iso, MIN, D, TZ } from './w04.mjs';
export { clockFor };

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');

export const METHODS = ['teams', 'zoom', 'meet', 'whatsapp_call', 'phone'];
export const INVITE_METHODS = new Set(['teams', 'zoom', 'meet']);
export const CALL_METHODS = new Set(['whatsapp_call', 'phone']);
export const FLOW_METHOD = { google_meet: 'meet' }; // W28 Flow ids -> appointments.method
/** Outlook event title label (4.6 "Broker view": Life cover call – {first name} – {method}) */
export const TITLE_LABEL = { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone' };
/** fixtures _meta.method_labels / lib/w06.mjs METHOD_LABEL (broker_new_booking {{5}}) */
export const METHOD_LABEL = { teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' };
/** booking_confirmed {{5}} ("by phone call", template example) */
export const CONFIRM_LABEL = { teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone call' };
export const BAND_LABEL = {
  age_band: { under_35: 'Under 35', '35_44': '35-44', '45_50': '45-50', '51_plus': '51+' },
  budget_band: { under_500: 'Under R500', '500_750': 'R500-R750', '750_1250': 'R750-R1,250', '1250_plus': 'R1,250+' },
};
export const INVITE_FROM = 'howzit@leadvelocity.co.za';
export const PORTAL = 'https://app.leadvelocity.co.za';
export const SITE = 'https://sortmycover.co.za';
export const LIVE = new Set(['booked', 'confirmed']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;
const KEY_RE = /^[A-Za-z0-9:._+-]{1,160}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateLabel = (t) => { const d = new Date(ms(t) + 2 * 3600_000); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const timeLabel = (t) => iso(ms(t)).slice(11, 16);
const clean = (v, fb = '-') => { const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {5,}/g, '    ').trim(); return s || fb; };

// ---------------------------------------------------------------- email layers (4.6 "Contact-data quality")
export const KNOWN_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'webmail.co.za', 'mweb.co.za', 'telkomsa.net', 'vodamail.co.za', 'leadvelocity.co.za'];
export const DISPOSABLE = new Set(['mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com']);
/** Offline MX answer used ONLY when the caller passes no DNS result (tests). The workflow always passes resolveMx's answer. */
export const MX_KNOWN = new Set([...KNOWN_DOMAINS, ...DISPOSABLE]);

export function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export const emailDomain = (raw) => { const m = /@([^@\s]+)$/.exec(String(raw ?? '').trim().toLowerCase()); return m ? m[1] : null; };

/** Syntax -> typo suggestion -> disposable -> MX. Returns {ok,email,status} or {ok:false, reason, suggestion?}. */
export function checkEmail(raw, { acceptTypo = false, hasMx = (d) => MX_KNOWN.has(d) } = {}) {
  const email = String(raw ?? '').trim().toLowerCase();
  const m = /^[^\s@]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/.exec(email);
  if (!m || email.length > 254) return { ok: false, reason: 'syntax' };
  const domain = m[1];
  if (!acceptTypo && !KNOWN_DOMAINS.includes(domain)) {
    const near = KNOWN_DOMAINS.find((k) => lev(domain, k) <= 2);
    if (near) return { ok: false, reason: 'typo', suggestion: email.replace(/@.*/, '@' + near) };
  }
  if (DISPOSABLE.has(domain)) return { ok: false, reason: 'disposable' };
  if (!hasMx(domain)) return { ok: false, reason: 'no_mx' };
  return { ok: true, email, status: 'mx_ok' };
}
/** hasMx from the Code node's DNS answer ({ [domain]: true|false }); unknown domain -> offline set. */
export const mxFrom = (answers = {}) => (d) => (Object.prototype.hasOwnProperty.call(answers, d) ? answers[d] === true : MX_KNOWN.has(d));

// ---------------------------------------------------------------- callers
const normMethod = (m) => { const s = String(m || '').trim().toLowerCase(); return FLOW_METHOD[s] || s || null; };
const isoOk = (s) => ISO_RE.test(String(s || '')) && !Number.isNaN(Date.parse(s));
const keyOk = (k) => typeof k === 'string' && KEY_RE.test(k);

/**
 * POST /book. Caller switch is CONTRACTS "lead_token" + "/slots broker-authenticated path" (same resolveSlotsCaller):
 *   X-Lead-Token -> lead path, the lead id comes from the token (a body lead_id that differs -> 401);
 *   Authorization: Bearer <broker JWT> -> broker path (portal books for one of HIS leads; body.lead_id required).
 * @returns {ok:false,status,body,reason} | {ok:true, lane:'http', mode, user_id?, req}
 */
export function parseHttp(headers = {}, body = {}, env = {}, nowMs = Date.now()) {
  const fail = (status, error, reason) => ({ ok: false, status, body: { error, error_code: error }, reason });
  const allowed = String(env.PUBLIC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hk = Object.keys(headers || {}).find((h) => h.toLowerCase() === 'origin');
  const origin = hk ? String(headers[hk]) : '';
  let c;
  try {
    c = LT.resolveSlotsCaller({ headers, query: {} }, { leadSecret: env.LEAD_TOKEN_SECRET, leadPreviousSecret: env.LEAD_TOKEN_SECRET_PREVIOUS, jwtSecret: env.SUPABASE_JWT_SECRET, nowMs });
  } catch (e) {
    return fail(503, 'try_again', 'not_configured');
  }
  if (!c.ok) return fail(c.status, c.status === 400 ? 'ambiguous_caller' : 'try_again', c.reason);
  if (c.mode === 'lead' && origin && allowed.length && !allowed.includes(origin)) return fail(403, 'try_again', 'origin');
  const b = body && typeof body === 'object' ? body : {};
  const leadId = c.mode === 'lead' ? c.lead_id : String(b.lead_id || '');
  if (c.mode === 'lead' && b.lead_id && String(b.lead_id) !== c.lead_id) return fail(401, 'try_again', 'lead_mismatch');
  if (c.mode === 'broker' && !/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return fail(400, 'lead_required', 'lead_required');
  const slot = b.slot_start || b.slot;
  if (!isoOk(slot)) return fail(400, 'bad_slot', 'bad_slot');
  const method = normMethod(b.method);
  if (!METHODS.includes(method)) return fail(422, 'method_not_supported', 'bad_method');
  const rid = typeof b.request_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.request_id) ? b.request_id : null;
  const idem = keyOk(b.idempotency_key) ? b.idempotency_key : rid ? `page:${leadId}:${rid}` : `book:${leadId}:${iso(ms(slot))}`;
  const ev = b.context && typeof b.context.event_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.context.event_id) ? b.context.event_id : null;
  return {
    ok: true, lane: 'http', mode: c.mode, user_id: c.user_id || null,
    req: {
      op: 'book', lead_id: leadId, slot_start: iso(ms(slot)), method,
      email: INVITE_METHODS.has(method) && b.email ? String(b.email) : null, // 0.1: dropped for call methods, never stored
      email_confirmed: b.email_confirmed === true, booked_via: c.mode === 'broker' ? 'console' : 'page',
      idempotency_key: idem, previous_booking_id: null, context: { event_id: ev },
    },
  };
}

/** "slot_<ISO>" or "slot_<ISO>:m:<method>" (METHOD_NOT_OFFERED buttons). Reschedule picks (":resched:") are W10's. */
export function parseSlotPayload(p) {
  const m = /^slot_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z))(?::m:([a-z_]+))?$/.exec(String(p || ''));
  return m && isoOk(m[1]) ? { start: iso(ms(m[1])), method: m[2] ? normMethod(m[2]) : null } : null;
}

/**
 * Sub-call input (CONTRACTS "Sub-workflow interfaces") -> one request. Accepts:
 *  - documented book  { lead_id, slot_start, method, booked_via, email?, previous_booking_id?, idempotency_key }  (W10, W28)
 *  - { op:'update_method', booking_id, method, email? }  (W10)       - { op:'invite_bounced', recipient, booking_id? } (W17)
 *  - W07 forward { source:'W07', route:'W05', msg, lead, booking }: a slot tap (list row / Time button) or the Flow
 *    completion (msg.payload 'flow_complete', msg.flow_response = nfm_reply.response_json, booking-flow-endpoint.md §2).
 * env carries LEAD_TOKEN_SECRET(_PREVIOUS) for the flow_token check. Returns { op, ... } or { op:'reject', reason }.
 */
export function parseSub(j = {}, env = {}, nowMs = Date.now()) {
  const rej = (reason) => ({ op: 'reject', reason, lead_id: j.lead_id || j.lead?.id || null });
  if (j.op === 'update_method') {
    if (!j.booking_id) return rej('booking_id missing');
    const method = normMethod(j.method);
    if (!METHODS.includes(method)) return rej('method missing or unknown');
    return { op: 'update_method', booking_id: String(j.booking_id), method, email: INVITE_METHODS.has(method) && j.email ? String(j.email) : null, email_confirmed: j.email_confirmed === true, idempotency_key: keyOk(j.idempotency_key) ? j.idempotency_key : `w05:method:${j.booking_id}:${method}` };
  }
  if (j.op === 'invite_bounced') {
    if (!j.recipient && !j.booking_id) return rej('recipient or booking_id missing');
    return { op: 'invite_bounced', recipient: j.recipient ? String(j.recipient).trim().toLowerCase() : null, booking_id: j.booking_id || null, lead_id: j.lead_id || null };
  }
  if (j.source === 'W07' && j.msg) {
    const msg = j.msg;
    const leadId = j.lead?.id || null;
    if (!leadId) return rej('lead missing');
    if (msg.payload === 'flow_complete') return parseFlow(msg, leadId, env, nowMs, rej);
    const pick = parseSlotPayload(msg.list_id || msg.payload);
    if (!pick) return rej('not a slot pick');
    const key = msg.wamid ? `chat:${sha(msg.wamid).slice(0, 32)}` : `chat:${leadId}:${pick.start}`;
    return { op: 'book', lead_id: leadId, slot_start: pick.start, method: pick.method, method_from_lead: !pick.method, email: null, email_confirmed: false, booked_via: msg.list_id ? 'list' : 'chat', idempotency_key: key, previous_booking_id: null, context: {}, delegate: j.delegate || null };
  }
  // documented book
  const miss = ['lead_id', 'slot_start', 'method', 'idempotency_key'].filter((k) => !j[k]);
  if (miss.length) return rej(`missing ${miss.join(', ')}`);
  if (!isoOk(j.slot_start)) return rej('slot_start not ISO');
  const method = normMethod(j.method);
  if (!METHODS.includes(method)) return rej('method unknown');
  if (!keyOk(j.idempotency_key)) return rej('idempotency_key not key-safe');
  const via = ['page', 'flow', 'list', 'chat', 'console'].includes(j.booked_via) ? j.booked_via : 'chat';
  return { op: 'book', lead_id: String(j.lead_id), slot_start: iso(ms(j.slot_start)), method, email: INVITE_METHODS.has(method) && j.email ? String(j.email) : null, email_confirmed: j.email_confirmed === true || via === 'flow', booked_via: via, idempotency_key: j.idempotency_key, previous_booking_id: j.previous_booking_id || null, context: j.context && typeof j.context === 'object' ? j.context : {} };
}

function parseFlow(msg, leadId, env, nowMs, rej) {
  let fr = msg.flow_response;
  if (typeof fr === 'string') { try { fr = JSON.parse(fr); } catch { return rej('flow_response not JSON'); } }
  if (!fr || typeof fr !== 'object') return rej('flow_response missing');
  let tok;
  try { tok = LT.verifyFlowToken(String(fr.flow_token || ''), { secret: env.LEAD_TOKEN_SECRET, previousSecret: env.LEAD_TOKEN_SECRET_PREVIOUS, nowMs }); } catch { return rej('flow token secret not configured'); }
  if (!tok.ok) return { op: 'reject', reason: `flow_token_${tok.reason}`, lead_id: leadId, security: true };
  if (tok.lead_id !== leadId || (fr.lead_id && fr.lead_id !== tok.lead_id)) return { op: 'reject', reason: 'flow_payload_mismatch', lead_id: leadId, security: true };
  if (!isoOk(fr.slot)) return rej('flow slot missing');
  const method = normMethod(fr.method);
  if (!METHODS.includes(method)) return rej('flow method unknown');
  const slot = iso(ms(fr.slot));
  const key = `flow:${sha(fr.flow_token).slice(0, 32)}:${slot}`; // booking-flow-endpoint.md: flow_token + slot
  if (tok.kind === 'reschedule') {
    // A move is W10's (same row, same Graph event): hand it the pick in W10's own payload format.
    return { op: 'to_w10', lead_id: leadId, booking_id: tok.booking_id, w10: { source: 'W05', lead_id: leadId, booking_id: tok.booking_id, msg: { ...msg, payload: null, list_id: `slot_${slot}:resched:${tok.booking_id}` }, method, idempotency_key: key } };
  }
  return { op: 'book', lead_id: leadId, slot_start: slot, method, email: INVITE_METHODS.has(method) && fr.email ? String(fr.email) : null, email_confirmed: true, booked_via: 'flow', idempotency_key: key, previous_booking_id: null, context: {}, flow_token_hash: sha(fr.flow_token).slice(0, 32) };
}

// ---------------------------------------------------------------- decision before the re-check
/** Chat booking without a method on the tap: the lead's stated preference, else the first offered method that needs no email. */
export function chooseMethod(lead = {}, broker = {}) {
  const offered = brokerConfig(broker).methods_supported;
  const pref = normMethod(lead.method_pref);
  if (pref && offered.includes(pref)) return pref;
  return offered.find((m) => CALL_METHODS.has(m)) || offered[0];
}

const leadView = (l = {}) => ({ ...l, phone: l.phone || l.mobile || null });

/**
 * decide(ctx) after the database load.
 * ctx = { lane:'http'|'sub', mode?:'lead'|'broker', req, lead, broker (brokers row), broker_by_user?, existing?
 *         (appointments row with req.idempotency_key), live? (the lead's live appointment), mx?: {domain: bool}, now }
 * @returns
 *   { action:'respond', status, body }                      http errors / replay
 *   { action:'replay', booking }                             idempotent hit (no new sends)
 *   { action:'message', kind, lead, broker, wa }             chat/flow: METHOD_NOT_OFFERED (one message, no booking)
 *   { action:'to_w10', w10 }                                 the lead already has a live booking -> it is a move
 *   { action:'stop', reason }                                opted out / unrouted on a sub-call (logged only)
 *   { action:'check', is_free:{op,broker_id,start,end}, plan }  -> W04 is_free, then afterCheck()
 */
export function decide(ctx = {}) {
  const { lane, req = {}, mode } = ctx;
  const http = lane === 'http';
  const out = (status, body) => ({ action: 'respond', status, body: { ...body, error: body.error_code } });
  if (ctx.existing) return http ? { action: 'respond', status: 201, body: publicBody(ctx.existing) } : { action: 'replay', booking: ctx.existing };
  const lead = ctx.lead ? leadView(ctx.lead) : null;
  if (!lead) return http ? (mode === 'broker' ? out(404, { error_code: 'unknown_lead' }) : { action: 'respond', status: 401, body: { error: 'try_again' } }) : { action: 'stop', reason: 'unknown_lead' };
  if (http && mode === 'broker') {
    if (!ctx.broker_by_user) return { action: 'respond', status: 403, body: { error: 'not_a_broker' } };
    if (String(lead.broker_id) !== String(ctx.broker_by_user.id)) return { action: 'respond', status: 403, body: { error: 'not_your_lead' } };
  }
  if (lead.opted_out_at) return http ? out(409, { error_code: 'opted_out' }) : { action: 'stop', reason: 'opted_out' };
  if (!lead.broker_id || !ctx.broker) return http ? { action: 'respond', status: 200, body: { booked: false, fallback: 'whatsapp' } } : { action: 'stop', reason: 'unrouted' };
  const b = brokerConfig(ctx.broker);
  const start = ms(req.slot_start);
  const live = ctx.live && LIVE.has(ctx.live.status) && ctx.live.id !== req.previous_booking_id ? ctx.live : null;
  if (live) {
    if (ms(live.appointment_date ?? live.start) === start) return http ? { action: 'respond', status: 201, body: publicBody(live) } : { action: 'replay', booking: live };
    if (http) return out(409, { error_code: 'already_booked', booking: { start: iso(ms(live.appointment_date ?? live.start)), method: live.method } });
    return { action: 'to_w10', w10: { source: 'W05', lead_id: lead.id, booking_id: live.id, msg: { list_id: `slot_${iso(start)}:resched:${live.id}`, wamid: req.idempotency_key }, idempotency_key: req.idempotency_key } };
  }
  const method = req.method || chooseMethod(lead, b);
  const adviserFirst = firstName(b.adviser_name || b.contact_person);
  if (!b.methods_supported.includes(method)) {
    if (http) return out(422, { error_code: 'method_not_supported', methods: b.methods_supported });
    return { action: 'message', kind: 'method_not_offered', wa: methodNotOfferedMessage(lead, b, method, req.slot_start) };
  }
  let email = null; let emailStatus = null; let askEmail = false;
  if (INVITE_METHODS.has(method)) {
    const raw = req.email || (!http && lead.email && lead.email_purpose === 'meeting_invite' && lead.email_status !== 'bounced' ? lead.email : null);
    if (!raw) {
      if (http) return out(422, { error_code: 'email_required' });
      askEmail = true; // chat/list: book the time now (speed), ask for the address in chat (W28 ask_email), invite on reply
    } else {
      const chk = checkEmail(raw, { acceptTypo: !!req.email_confirmed, hasMx: mxFrom(ctx.mx) });
      if (!chk.ok) {
        if (http) return out(422, { error_code: `email_${chk.reason}`, ...(chk.suggestion ? { suggestion: chk.suggestion } : {}) });
        askEmail = true;
      } else { email = chk.email; emailStatus = chk.status; }
    }
  }
  const end = start + b.slot_minutes * MIN;
  return {
    action: 'check',
    is_free: { op: 'is_free', broker_id: b.broker_id, start: iso(start), end: iso(end) },
    plan: { lead_id: lead.id, broker_id: b.broker_id, start: iso(start), end: iso(end), method, email, email_status: emailStatus, ask_email: askEmail, booked_via: req.booked_via, idempotency_key: req.idempotency_key, previous_booking_id: req.previous_booking_id || null, context: req.context || {}, adviser_first: adviserFirst, route: calendarRoute(b) },
  };
}

/** The page / portal never gets broker or Graph identifiers back: only what the thank-you state shows. */
export function publicBody(bk = {}) {
  const start = bk.appointment_date ?? bk.start;
  return { booked: true, booking_id: bk.id, start: iso(ms(start)), end: iso(ms(bk.ends_at ?? bk.end)), method: bk.method, join_url: bk.join_url ?? null, ics_url: bk.ics_url ?? icsUrl(bk.id) };
}
export const icsUrl = (id, site = SITE) => (id ? `${site}/c/${id}` : null);

// ---------------------------------------------------------------- after the W04 is_free re-check
/**
 * free = W04 is_free result { free, next_slots, fallback? }. Calendar error -> free:false (fail closed) -> taken.
 * @returns { action:'insert', row } | { action:'taken', status:409, body, wa? }
 */
export function afterCheck(ctx, dec, free = {}) {
  if (free && free.free === true) return { action: 'insert', row: appointmentRow(ctx, dec.plan) };
  return taken(ctx, dec.plan, free && Array.isArray(free.next_slots) ? free.next_slots : []);
}

/** 409 for the page (both keys: tests read `next`, landing/page.js reads `slots`) + the chat message (SLOT_TAKEN + list). */
export function taken(ctx, plan, next = []) {
  const n3 = next.slice(0, 3).map((s) => ({ start: s.start, end: s.end }));
  const res = { action: 'taken', status: 409, body: { error: 'slot_taken', error_code: 'slot_taken', next: n3, slots: n3 } };
  if (ctx.lane !== 'http') res.wa = slotTakenMessage(leadView(ctx.lead), brokerConfig(ctx.broker), n3, plan.method);
  return res;
}

/** INSERT row for public.appointments (physical names; the lead is client_id -> leads.id, there is no appointments.lead_id). */
export function appointmentRow(ctx, p) {
  const lead = leadView(ctx.lead);
  const b = brokerConfig(ctx.broker);
  const route = p.route === 'shared' ? 'shared_lv' : (b.calendar_provider || 'outlook');
  return {
    client_id: lead.id, broker_id: b.broker_id, brand_id: lead.brand_id || b.brand_id || null,
    cycle_id: b.current_cycle_id || lead.cycle_id || null, appointment_date: p.start, ends_at: p.end, method: p.method,
    status: 'booked', calendar_provider: route, booked_via: p.booked_via, booked_at: iso(ctx.now),
    idempotency_key: p.idempotency_key, previous_booking_id: p.previous_booking_id,
    call_number: CALL_METHODS.has(p.method) ? (lead.call_number || lead.phone) : null,
    invite_email_status: INVITE_METHODS.has(p.method) ? null : 'not_needed',
    schedule_event_id: capiSchedule(lead, p)?.event_id ?? null,
  };
}

/**
 * The twin of the INSERT's re-check (W05.json "Insert appointment"): true when a live booking of this broker overlaps
 * [start - buffer, end + buffer). Used by the offline test adapter so the race test exercises the same rule as the SQL.
 */
export function insertBlocked(rows = [], row, bufferMinutes = 15) {
  const s = ms(row.appointment_date) - bufferMinutes * MIN;
  const e = ms(row.ends_at) + bufferMinutes * MIN;
  return rows.some((x) => x.broker_id === row.broker_id && LIVE.has(x.status) && ms(x.appointment_date) < e && s < ms(x.ends_at));
}

// ---------------------------------------------------------------- Microsoft Graph event (modelled; ASSUMPTION)
/**
 * Graph event body. ASSUMPTION (no web check; 4.6 names isOnlineMeeting / onlineMeetingProvider=teamsForBusiness):
 * POST /me/events (broker's delegated token) or /users/{howzit}/calendars/{shared}/events (0.3 #4 shared calendar),
 * `transactionId` makes the create idempotent on Graph's side, `categories` must exist in the mailbox's master list
 * (Outlook creates it on first use, amber colour set once by the broker), start/end as local time + timeZone.
 */
export function graphEvent(ctx, p, opts = {}) {
  const lead = leadView(ctx.lead);
  const b = brokerConfig(ctx.broker);
  const first = firstName(lead.first_name || lead.name);
  const number = lead.call_number || lead.phone;
  const portal = String(opts.portalUrl || PORTAL).replace(/\/$/, '');
  const lines = [
    `${first} · ${lead.phone}`,
    `Age band ${lead.age_band ?? '-'} · budget band ${lead.budget_band ?? '-'}`,
    `Method: ${TITLE_LABEL[p.method]}`,
    p.method === 'phone' ? `Call ${first} on ${number}` : null,
    p.method === 'whatsapp_call' ? `WhatsApp-call ${first} on ${number}` : null,
    p.method === 'zoom' ? 'Zoom: use your Zoom meeting link (Zoom app not connected).' : null,
    `Consent ref: ${lead.id}/${lead.consent_text_version ?? '-'} at ${lead.consent_at ?? '-'}`,
    `Source: ${lead.origin ?? '-'}${lead.ad_id ? ' · ' + lead.ad_id : ''}`,
    `Pre-call brief: ${portal}/l/${lead.id}`,
  ].filter(Boolean);
  const ev = {
    transactionId: txId(p.idempotency_key),
    subject: `Life cover call – ${first} – ${TITLE_LABEL[p.method]}`,
    start: { dateTime: iso(ms(p.start)).slice(0, 19), timeZone: TZ },
    end: { dateTime: iso(ms(p.end)).slice(0, 19), timeZone: TZ },
    categories: ['SortMyCover'],
    showAs: 'busy',
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    isOnlineMeeting: p.method === 'teams',
    attendees: b.add_client_as_attendee === true && p.email ? [{ emailAddress: { address: p.email, name: first }, type: 'required' }] : [],
    body: { contentType: 'text', content: lines.join('\n') },
  };
  if (p.method === 'teams') ev.onlineMeetingProvider = 'teamsForBusiness';
  return ev;
}
/** Graph transactionId: stable per idempotency key, <= 40 chars, no secrets (the key may contain a flow token hash). */
export const txId = (key) => `smc-${sha(key).slice(0, 32)}`;

/** Graph event URL. route 'graph' -> the broker's own calendar (delegated); 'shared' -> howzit@'s shared calendar. */
export function graphEventUrl(route, { howzit = INVITE_FROM, sharedCalendarId = '' } = {}) {
  if (route === 'shared') return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(howzit)}/calendars/${encodeURIComponent(sharedCalendarId)}/events`;
  return 'https://graph.microsoft.com/v1.0/me/events';
}

/**
 * Graph create response (n8n fullResponse) -> what we store. Join URL ASSUMPTION: event.onlineMeeting.joinUrl.
 * Failure -> the booking STAYS (the slot is ours, the lead is confirmed, the broker is told on WhatsApp + email),
 * graph_event_id stays null and W22 gets `calendar_event_create_failed` (red) to add it by hand.
 */
export function afterEvent(res) {
  const body = res && res.body && typeof res.body === 'object' ? res.body : (res || {});
  const code = Number((res && res.statusCode) || (body.id ? 201 : 0));
  if (code >= 200 && code < 300 && typeof body.id === 'string' && body.id) {
    return { ok: true, graph_event_id: body.id, ical_uid: body.iCalUId || null, join_url: (body.onlineMeeting && body.onlineMeeting.joinUrl) || body.onlineMeetingUrl || null };
  }
  return { ok: false, reason: code ? `http_${code}` : 'no_response', code: body.error && body.error.code ? String(body.error.code) : null };
}

// ---------------------------------------------------------------- fan-out after the booking is stored
/** CAPI Schedule (event-spec + CONTRACTS "CAPI Send"): no email ever; CTWA -> business_messaging only. */
export function capiSchedule(lead = {}, p = {}) {
  if (!lead || !lead.id) return null;
  if (lead.origin === 'ctwa') return { event_name: 'Schedule', event_id: `evt_${lead.id}_ctwa_schedule`, action_source: 'business_messaging', lead_id: lead.id, brand_id: lead.brand_id || null, ctwa_clid: lead.ctwa_clid || null };
  if (!lead.consent_ads_at) return null; // consent gate (event-spec)
  const browser = p.booked_via === 'page' && p.context && typeof p.context.event_id === 'string' && p.context.event_id ? p.context.event_id : null;
  return { event_name: 'Schedule', event_id: browser || `evt_${lead.id}_schedule`, action_source: p.booked_via === 'page' ? 'website' : 'system_generated', lead_id: lead.id, brand_id: lead.brand_id || null };
}

/** leads UPDATE after the insert (CONTRACTS: broker_id/cycle_id on the lead; email only for invite methods). */
export function leadUpdate(ctx, p) {
  const b = brokerConfig(ctx.broker);
  const u = { stage: 'booked', broker_id: b.broker_id, cycle_id: b.current_cycle_id || ctx.lead.cycle_id || null };
  if (INVITE_METHODS.has(p.method) && p.email) Object.assign(u, { email: p.email, email_status: p.email_status || 'mx_ok', email_purpose: 'meeting_invite' });
  return u;
}

/** RFC 5545 .ics for the invite (client copy). Times in UTC; no attendees (broker mailbox stays private). */
export function icsFile({ uid, start, end, summary, description = '', url = '' }) {
  const z = (t) => new Date(ms(t)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SortMyCover//W05//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${z(start)}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`, url ? `URL:${url}` : null, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

/**
 * Invite email from howzit@ (Teams / Zoom / Meet only). Graph sendMail body. ASSUMPTION: fileAttachment shape for
 * the .ics. Copy is plain and fixed (conversation-designer to own the words; needs_human I-W05-copy).
 */
export function inviteMail(ctx, p, booking, ev = {}) {
  if (!INVITE_METHODS.has(p.method) || !p.email) return null;
  const lead = leadView(ctx.lead);
  const b = brokerConfig(ctx.broker);
  const adviser = b.adviser_name || b.contact_person || 'your adviser';
  const when = `${dateLabel(p.start)} at ${timeLabel(p.start)} (South African time)`;
  const link = ev.join_url || null;
  const word = METHOD_LABEL[p.method];
  const text = [`Hi ${firstName(lead.first_name)},`, '', `Your 30-minute ${word} call with ${adviser} (${b.practice_name || b.firm_name || 'your adviser'}, FSP ${b.fsp_number || '-'}) is on ${when}.`, link ? `Join here: ${link}` : `${adviser} will send the ${word} link before the call.`, '', 'The calendar file is attached. To change the time, reply on WhatsApp.', '', 'SortMyCover by Lead Velocity'].join('\n');
  const ics = icsFile({ uid: `${booking.id}@sortmycover.co.za`, start: p.start, end: p.end, summary: `Life cover call with ${firstName(adviser)}`, description: link ? `Join: ${link}` : `${word} call`, url: link || '' });
  return {
    to: p.email,
    message: {
      subject: `Your call with ${firstName(adviser)} on ${when}`,
      body: { contentType: 'Text', content: text },
      toRecipients: [{ emailAddress: { address: p.email } }],
      attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'sortmycover-call.ics', contentType: 'text/calendar', contentBytes: Buffer.from(ics, 'utf8').toString('base64') }],
    },
    saveToSentItems: true,
  };
}

/** broker_new_booking (utility template, 7 vars + URL button) + email; first name only, never an email address. */
export function brokerNotice(ctx, p) {
  const lead = leadView(ctx.lead);
  const b = brokerConfig(ctx.broker);
  const adviserFirst = firstName(b.adviser_name || b.contact_person);
  const vars = [adviserFirst, firstName(lead.first_name), dateLabel(p.start), timeLabel(p.start), METHOD_LABEL[p.method], BAND_LABEL.age_band[lead.age_band] || '-', BAND_LABEL.budget_band[lead.budget_band] || '-'].map((v) => clean(v));
  const to = b.adviser_whatsapp || b.whatsapp_number || null;
  return {
    template: 'broker_new_booking', to, vars,
    wa: to ? templateWa(to, 'broker_new_booking', vars, [{ url: `l/${lead.id}` }]) : null,
    email: b.email ? { to: b.email, subject: `New booking: ${vars[1]} on ${vars[2]} at ${vars[3]}`, body: `${vars[1]} booked a ${vars[4]} call with you on ${vars[2]} at ${vars[3]}. Age band ${vars[5]}, budget band ${vars[6]}. It is in your Outlook calendar; the pre-call brief follows 15 minutes before the call.\n\nSortMyCover by Lead Velocity` } : null,
  };
}

/** booking_confirmed (rebooking only: CONTRACTS previous_booking_id; a first booking's confirmation is W06's intro card). */
export function bookingConfirmed(ctx, p, booking) {
  const lead = leadView(ctx.lead);
  const b = brokerConfig(ctx.broker);
  const vars = [firstName(lead.first_name), b.adviser_name || b.contact_person, dateLabel(p.start), timeLabel(p.start), CONFIRM_LABEL[p.method]].map((v) => clean(v));
  return templateWa(lead.phone, 'booking_confirmed', vars, [{ url: booking.id }, { quick_reply: `confirm:${booking.id}` }, { quick_reply: `reschedule:${booking.id}` }, { quick_reply: `cancel:${booking.id}` }], lead.language);
}

function templateWa(to, name, vars, buttons = [], lang = 'en') {
  const comps = [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }];
  buttons.forEach((bt, i) => {
    if (bt.url !== undefined) comps.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: String(bt.url) }] });
    else if (bt.quick_reply !== undefined) comps.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: bt.quick_reply }] });
  });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to || '').replace(/^\+/, ''), type: 'template', template: { name, language: { code: lang === 'af' ? 'af' : 'en' }, components: comps } };
}

const L = (lead) => LINES[lead && lead.language === 'af' ? 'af' : 'en'];
const shortSlot = (s) => `${dateLabel(s)}, ${timeLabel(s)}`;

/** SLOT_TAKEN (conversation/lines.mjs) + the next 3 as list rows (slot_<ISO>[:m:<method>] -> back to W05). */
export function slotTakenMessage(lead, b, next = [], method = null) {
  const adviserFirst = firstName(b.adviser_name || b.contact_person);
  const body = fill(L(lead).SLOT_TAKEN, { adviser_first: adviserFirst }) + ' ' + L(lead).TZ;
  const to = String(lead.phone || '').replace(/^\+/, '');
  if (!next.length) return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: fill(L(lead).SLOT_TAKEN, { adviser_first: adviserFirst }) } };
  const suffix = method ? `:m:${method}` : '';
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive: { type: 'list', body: { text: body.slice(0, 1024) }, footer: { text: L(lead).STOP_HINT }, action: { button: 'See times', sections: [{ title: 'Next free times', rows: next.slice(0, 3).map((s) => ({ id: `slot_${s.start}${suffix}`, title: shortSlot(s.start).slice(0, 24) })) }] } } };
}

/** METHOD_NOT_OFFERED (lines.mjs) + up to 3 buttons, one per offered method, each re-posting the same slot. */
export function methodNotOfferedMessage(lead, b, method, slotStart) {
  const adviserFirst = firstName(b.adviser_name || b.contact_person);
  const keep = b.methods_supported[0];
  const body = fill(L(lead).METHOD_NOT_OFFERED, { adviser_first: adviserFirst, method: METHOD_LABEL[keep] });
  const buttons = b.methods_supported.slice(0, 3).map((m) => ({ type: 'reply', reply: { id: `slot_${slotStart}:m:${m}`, title: METHOD_LABEL[m].replace(/^\w/, (c) => c.toUpperCase()).slice(0, 20) } }));
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(lead.phone || '').replace(/^\+/, ''), type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons } } };
}

/**
 * Everything that follows a stored booking, as one plan the workflow fans out (and the test applies to its state).
 * ev = afterEvent() result. Returns { response (http), lead_update, appointment_update, invite, broker, w06, w09, w07,
 * capi, lead_wa, ask_email, alert }.
 */
export function finish(ctx, p, booking, ev = { ok: false }, opts = {}) {
  const lead = leadView(ctx.lead);
  const bk = { ...booking, join_url: ev.join_url || null, ics_url: icsUrl(booking.id, opts.site) };
  const invite = inviteMail(ctx, p, bk, ev);
  const capi = capiSchedule(lead, p);
  const rebook = !!p.previous_booking_id;
  return {
    response: { status: 201, body: publicBody(bk) },
    appointment_update: { graph_event_id: ev.ok ? ev.graph_event_id : null, ical_uid: ev.ok ? ev.ical_uid : null, join_url: ev.join_url || null, ics_url: bk.ics_url, invite_email_status: INVITE_METHODS.has(p.method) ? (invite ? 'sent' : null) : 'not_needed', schedule_event_id: capi ? capi.event_id : null },
    lead_update: leadUpdate(ctx, p),
    invite,
    broker: brokerNotice(ctx, p),
    // W06 owns the first lead-facing confirmation (I-45f): W05 calls W06 op 'booking' for every first booking (page
    // inside the 45-s hold, page after it, chat, Flow); W06 sends broker_intro_booked if this booking wins its
    // first-touch claim, else booking_confirmed (lib/w06.mjs lateBookingConfirmed). A rebooking gets it from here.
    w06: rebook ? null : { op: 'booking', event: 'booking', lead_id: lead.id, booking_id: booking.id, created_at: booking.booked_at || iso(ctx.now), start: p.start, method: p.method, booked_via: p.booked_via, idempotency_key: `w06:booking:${booking.id}` },
    lead_wa: rebook ? bookingConfirmed(ctx, p, bk) : null,
    w09: { op: rebook ? 'rebuild' : 'schedule', booking_id: booking.id, idempotency_key: `w09:${rebook ? 'rebuild' : 'schedule'}:${booking.id}` },
    w07: CALL_METHODS.has(p.method) ? { source: 'W05', booking: { id: booking.id, method: p.method }, broker: { contact_person: brokerConfig(ctx.broker).adviser_name }, lead: { id: lead.id, phone: lead.phone, brand_id: lead.brand_id || null, language: lead.language || 'en', conv_state: lead.conv_state || {} } } : null,
    ask_email: p.ask_email ? { op: 'ask_email', lead_id: lead.id, method: p.method, booking_id: booking.id, reason: 'book', delegate: ctx.req && ctx.req.delegate ? ctx.req.delegate : null } : null,
    capi,
    alert: ev.ok || p.route === 'none' ? null : { signal_key: 'calendar_event_create_failed', scope: `broker:${booking.broker_id}`, severity: 'red', what: `Outlook event not created for booking ${booking.id} (${ev.reason || 'error'})`, impact: 'The meeting is booked and the broker was told on WhatsApp, but it is not in his calendar', first_action: 'Add the event by hand or reconnect the calendar', source: 'W05' },
  };
}

// ---------------------------------------------------------------- update_method (W10) + invite bounce (W17)
/**
 * W10 change of method on a live booking: same appointments row, same Graph event (PATCH). Invite methods without a
 * usable email -> ask in chat first (W28 ask_email), nothing patched yet.
 * ctx = { req, booking, lead, broker, mx?, now } -> { action:'reject'|'ask_email'|'patch', ... }
 */
export function planUpdateMethod(ctx = {}) {
  const { req = {}, booking } = ctx;
  if (!booking || !LIVE.has(booking.status)) return { action: 'reject', reason: 'booking not live' };
  const b = brokerConfig(ctx.broker || {});
  const lead = leadView(ctx.lead || {});
  if (!b.methods_supported.includes(req.method)) return { action: 'reject', reason: 'method_not_offered' };
  let email = null; let status = null;
  if (INVITE_METHODS.has(req.method)) {
    const raw = req.email || (lead.email && lead.email_purpose === 'meeting_invite' && lead.email_status !== 'bounced' ? lead.email : null);
    const chk = raw ? checkEmail(raw, { acceptTypo: !!req.email_confirmed, hasMx: mxFrom(ctx.mx) }) : { ok: false };
    if (!chk.ok) return { action: 'ask_email', ask_email: { op: 'ask_email', lead_id: lead.id, method: req.method, booking_id: booking.id, reason: 'change_method' } };
    email = chk.email; status = req.email && lead.email_status === 'bounced' ? 'corrected' : chk.status;
  }
  const p = { start: iso(ms(booking.appointment_date)), end: iso(ms(booking.ends_at)), method: req.method, email, email_status: status, idempotency_key: booking.idempotency_key || booking.id, booked_via: booking.booked_via };
  const ev = graphEvent({ ...ctx, lead }, p);
  return {
    action: 'patch',
    graph_patch: { subject: ev.subject, body: ev.body, isOnlineMeeting: ev.isOnlineMeeting, ...(ev.onlineMeetingProvider ? { onlineMeetingProvider: ev.onlineMeetingProvider } : {}) },
    appointment_update: { method: req.method, call_number: CALL_METHODS.has(req.method) ? (lead.call_number || lead.phone) : null, invite_email_status: INVITE_METHODS.has(req.method) ? 'sent' : 'not_needed' },
    lead_update: email ? { email, email_status: status, email_purpose: 'meeting_invite' } : {},
    plan: p,
  };
}

/**
 * NDR on howzit@ for an invite (W17's Graph poll forwards { op:'invite_bounced', recipient, booking_id? }):
 * email_status bounced + ONE WhatsApp ask (I-45i / I-49b, lines-r6.md s.4). Inside the lead's 24-h window the session
 * line lines.mjs EMAIL_BOUNCED; outside it the utility template invite_email_bounced (1 first_name, 2 method label,
 * 3 adviser_name). Both go through the shared sender (smc-whatsapp-send) as `send`; the correlation key makes it
 * "asked once" per address. The booking stands either way; the next typed email goes through capture_contact (MX)
 * and the invite is re-sent. Teams/Zoom/Meet only (0.1 Email rule): a call-method booking never asks.
 * lead = { id, email, phone, first_name, language, method?, adviser_name? }
 */
export function bounceEffect(lead = {}, opts = {}) {
  const email = String(lead.email || '');
  const domain = email.split('@')[1] || '';
  const near = KNOWN_DOMAINS.find((k) => k !== domain && lev(domain, k) <= 2);
  const suggestion = near ? email.replace(/@.*/, '@' + near) : null;
  const method = lead.method || opts.method || null;
  const label = METHOD_LABEL[method] || 'meeting';
  const L = LINES[lead.language] || LINES.en;
  const text = fill(L.EMAIL_BOUNCED, { method: label });
  const inWindow = Number.isFinite(opts.last_inbound_ms) && Number.isFinite(opts.now) && opts.now - opts.last_inbound_ms < D;
  const ask = Boolean(lead.phone) && (!method || INVITE_METHODS.has(method));
  const first = String(lead.first_name || '').trim().split(/\s+/)[0] || 'there';
  const adviser = String(lead.adviser_name || opts.adviser_name || '').trim() || 'your adviser';
  const correlation = `w05:invite_bounced:${lead.id || ''}:${email.toLowerCase()}`;
  const send = !ask ? null : inWindow
    ? { to: lead.phone, kind: 'text', text, lead_id: lead.id || null, correlation }
    : { to: lead.phone, kind: 'template', template: 'invite_email_bounced', variables: [first, label, adviser], lang: 'en', lead_id: lead.id || null, correlation };
  return {
    lead_update: { email_status: 'bounced' },
    appointment_update: { invite_email_status: 'bounced' },
    message: { kind: 'email_bounced_prompt', text, suggestion, mode: send ? (inWindow ? 'session' : 'template') : 'none' },
    send,
    conv_state: { contact_step: 'email_fix', email_suggestion: suggestion },
  };
}

/** I-38d: a lead-facing send Meta accepted touches leads.last_contact_at; broker sends and dry runs never. */
export const touchesLastContact = (to, wamid) => to === 'lead' && typeof wamid === 'string' && wamid.length > 0 && !wamid.startsWith('dry:');

export const isUuid = (s) => UUID_RE.test(String(s || ''));
