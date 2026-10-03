// automation/lib/w04.mjs  -  W04 Slots API (GET /slots + sub-call ops list / is_free / graph_token).
// Imported by the Code nodes of automation/W04.json (require('lv-automation').w04, I-46c) and by
// automation/tests/W04.test.mjs, W05 (re-check) and tests/_slots.mjs (the shared slot rule lives HERE once).
// Pure logic: no network, no database, no file reads. Time is passed in (now, ms); holidays are passed in
// (the Code node reads data/za-public-holidays.json). Node 18+, zero dependencies besides security/lead-token.js
// and lib/w20-ms.mjs (Microsoft error classification).
//
// Which of my five: Calendly / Cal.com slot logic (hours, 30-min grid, 15-min buffer, 2-h notice, 14-day horizon,
// day/week caps, holidays, spread across days); Chili Piper (the page and the chat book from the same engine);
// Meta Flows (the day view feeds CalendarPicker, <= 20 RadioButtons). HBR: nothing here waits on a person.
//
// Rules (4.6 "Booking rules", "Broker calendar", 0.1, 0.3 #4, CONTRACTS "lead_token", "/slots broker path"):
//  - Africa/Johannesburg (UTC+02:00 all year, no DST). Every time leaves as ISO with +02:00.
//  - Defaults when a broker column is empty (0.3 #12 onboarding defaults): Mon-Fri 09:00-17:00, 30-min slots,
//    15-min buffer, 2-h notice, 14-day horizon, 3 a day, 12 a week, methods Teams + phone.
//  - A slot is free only if [start - buffer, end + buffer) touches nothing busy: Outlook getSchedule blocks AND our
//    own live appointments (the "holds": booked/confirmed rows block their time, count toward the caps, and are
//    seen even before Outlook shows them).
//  - Calendar route: calendar_status 'ok' (and not shared_fallback) -> Graph getSchedule with the broker's token;
//    'blocked_admin_consent' or calendar_mode 'shared_fallback' -> the shared calendar (0.3 #4): hours minus our
//    own bookings, no Graph read; anything else (needs_reconnect, not connected) -> fallback 'whatsapp', no slots.
import { createRequire } from 'node:module';
import { mapError } from './w20-ms.mjs';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');

export const TZ = 'Africa/Johannesburg';
export const MIN = 60_000;
export const H = 60 * MIN;
export const D = 24 * H;
const OFF = 2 * H;
export const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const ACTIVE = new Set(['booked', 'confirmed']);
export const DAY_VIEW_MAX = 20; // Flow RadioButtonsGroup limit (W28)
export const LIST_MAX = 10; // WhatsApp interactive list rows
export const CACHE_MS = 60_000; // CONTRACTS: responses cached 60 s per broker (shared by both paths)
export const CAPACITY_HOLD = 0.8; // 4.6 capacity-aware spend: >= 80% of the next 7 days booked
export const CAPACITY_RELEASE = 0.6;
const WEEKDAY_HOURS = [['09:00', '17:00']];
export const DEFAULTS = Object.freeze({
  meeting_hours: { mon: WEEKDAY_HOURS, tue: WEEKDAY_HOURS, wed: WEEKDAY_HOURS, thu: WEEKDAY_HOURS, fri: WEEKDAY_HOURS, sat: [], sun: [] },
  slot_minutes: 30, buffer_minutes: 15, min_notice_hours: 2, horizon_days: 14,
  max_meetings_per_day: 3, max_meetings_per_week: 12, methods_supported: ['teams', 'phone'],
});

// ---------------------------------------------------------------- time helpers (SAST)
export const ms = (v) => {
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`bad time ${v}`);
  return t;
};
/** ms -> "2026-10-15T10:00:00+02:00" */
export const iso = (t) => new Date(t + OFF).toISOString().replace(/\.\d{3}Z$/, '+02:00');
export const sast = (t) => { const d = new Date(t + OFF); return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), hh: d.getUTCHours(), mi: d.getUTCMinutes() }; };
export const at = (date, hhmm) => ms(`${date}T${hhmm}:00+02:00`);
/** Monday (SAST) of the week containing t: weeks run Mon 00:00 - Sun 24:00 for max_meetings_per_week. */
export const weekKey = (t) => { const p = sast(t); return iso(at(p.date, '00:00') - ((p.dow + 6) % 7) * D).slice(0, 10); };
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
const asHolidaySet = (h) => (h instanceof Set ? h : new Set(Array.isArray(h) ? h.map((x) => (typeof x === 'string' ? x : x.date)) : []));

// ---------------------------------------------------------------- broker row -> engine config
/**
 * Normalise a brokers row (physical names) or a fixture broker into the engine's shape. Empty columns take the
 * 0.3 #12 defaults; an explicit 0 (e.g. buffer 0) is kept.
 */
export function brokerConfig(row = {}) {
  const pick = (k) => (row[k] === null || row[k] === undefined ? DEFAULTS[k] : row[k]);
  const hours = row.meeting_hours && typeof row.meeting_hours === 'object' && Object.keys(row.meeting_hours).length ? row.meeting_hours : DEFAULTS.meeting_hours;
  const methods = Array.isArray(row.methods_supported) && row.methods_supported.length ? row.methods_supported : DEFAULTS.methods_supported;
  const name = row.adviser_name || row.contact_person || '';
  return {
    ...row,
    broker_id: row.broker_id || row.id || null,
    adviser_name: name,
    adviser_first_name: row.adviser_first_name || String(name).split(' ')[0] || '',
    meeting_hours: hours,
    methods_supported: methods,
    slot_minutes: Number(pick('slot_minutes')),
    buffer_minutes: Number(pick('buffer_minutes')),
    min_notice_hours: Number(pick('min_notice_hours')),
    horizon_days: Number(pick('horizon_days')),
    max_meetings_per_day: Number(pick('max_meetings_per_day')),
    max_meetings_per_week: Number(pick('max_meetings_per_week')),
    bookings_paused: row.bookings_paused === true,
    status: row.status ?? null,
  };
}

/** Our appointments rows (or fixture bookings) -> [{id,start,end,status}] */
export function normaliseBookings(rows = []) {
  return (rows || []).map((r) => ({ id: r.id ?? null, start: r.start ?? r.appointment_date, end: r.end ?? r.ends_at, status: r.status ?? 'booked' }))
    .filter((r) => r.start && r.end);
}

// ---------------------------------------------------------------- the slot engine
/**
 * @param b        broker (brokerConfig shape; fixture brokers already are)
 * @param busy     Outlook getSchedule busy blocks [{start,end}], [] for the shared calendar, or null when the
 *                 calendar could not be read (auth error) -> { fallback: 'whatsapp', slots: [] }
 * @param bookings our own appointments for this broker [{start,end,status}] (holds; also counted for the caps)
 * @param now      ms
 * @param holidays Set of 'YYYY-MM-DD' (SA public holidays). Required: no holiday list = fail closed.
 * @param opts     { requireActive = true, excludeBookingId }  (broker portal path passes requireActive false so a
 *                 broker who is still onboarding sees his "next free slot")
 * @returns { fallback?: 'whatsapp', slots: [{start,end}] }
 */
export function generateSlots(b, busy, bookings, now, holidays, opts = {}) {
  if (busy === null || busy === undefined) return { fallback: 'whatsapp', slots: [] };
  if (!holidays) throw new Error('W04: holidays required (data/za-public-holidays.json)');
  const hol = asHolidaySet(holidays);
  const requireActive = opts.requireActive !== false;
  if (b.bookings_paused || (requireActive && b.status !== 'active')) return { slots: [] };
  const slotMs = b.slot_minutes * MIN;
  const buf = b.buffer_minutes * MIN;
  const earliest = now + b.min_notice_hours * H;
  const latest = now + b.horizon_days * D;
  const active = normaliseBookings(bookings).filter((x) => ACTIVE.has(x.status) && (!opts.excludeBookingId || x.id !== opts.excludeBookingId))
    .map((x) => ({ s: ms(x.start), e: ms(x.end) }));
  const blocks = [...busy.map((x) => ({ s: ms(x.start), e: ms(x.end) })), ...active];
  const perDay = new Map();
  const perWeek = new Map();
  for (const x of active) {
    const d = sast(x.s).date;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    const w = weekKey(x.s);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const out = [];
  for (let day = at(sast(now).date, '00:00'); day <= latest; day += D) {
    const p = sast(day);
    if (hol.has(p.date)) continue;
    if ((perDay.get(p.date) ?? 0) >= b.max_meetings_per_day) continue;
    if ((perWeek.get(weekKey(day)) ?? 0) >= b.max_meetings_per_week) continue;
    for (const [open, close] of b.meeting_hours[DOW[p.dow]] ?? []) {
      for (let s = at(p.date, open); s + slotMs <= at(p.date, close); s += slotMs) {
        if (s < earliest || s > latest) continue;
        if (blocks.some((k) => overlaps(s - buf, s + slotMs + buf, k.s, k.e))) continue;
        out.push({ start: iso(s), end: iso(s + slotMs) });
      }
    }
  }
  return { slots: out };
}

/** Offer n slots earliest-first but spread across days: round-robin by day (never stack one day). */
export function offerSlots(slots, n = 3) {
  const byDay = new Map();
  for (const s of slots) {
    const d = s.start.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  }
  const days = [...byDay.keys()].sort();
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const d of days) {
      const s = byDay.get(d)[round];
      if (s && out.length < n) { out.push(s); added = true; }
    }
    if (!added) break;
  }
  return out;
}

/** Flow day screen: that day's free slots, at most 20. */
export const dayView = (slots, date) => slots.filter((s) => s.start.startsWith(date)).slice(0, DAY_VIEW_MAX);

/** Flow CalendarPicker unavailable-dates: working days in range with no free slot (full, blocked, holiday). */
export function unavailableDates(b, slots, now) {
  const free = new Set(slots.map((s) => s.start.slice(0, 10)));
  const out = [];
  for (let day = at(sast(now).date, '00:00'); day <= now + b.horizon_days * D; day += D) {
    const p = sast(day);
    const works = (b.meeting_hours[DOW[p.dow]] ?? []).length > 0;
    if (works && !free.has(p.date)) out.push(p.date);
  }
  return out;
}

/** Landing page picker: every free slot on the first `days` dates that have one (page asks for 5). */
export function nextDays(slots, days = 5) {
  const keep = new Set();
  for (const s of slots) { const d = s.start.slice(0, 10); if (keep.size < days) keep.add(d); }
  return slots.filter((s) => keep.has(s.start.slice(0, 10)));
}

/**
 * 4.6 capacity-aware spend: share of the next 7 days' bookable meetings already taken. Reported to routing / W22
 * (W04 never hides free slots because of it). capacity = per working, non-holiday day min(day cap, grid slots).
 */
export function capacity(b, bookings, now, holidays) {
  const hol = asHolidaySet(holidays);
  const end = now + 7 * D;
  let cap = 0;
  for (let day = at(sast(now).date, '00:00'); day < end; day += D) {
    const p = sast(day);
    if (hol.has(p.date)) continue;
    let grid = 0;
    for (const [o, c] of b.meeting_hours[DOW[p.dow]] ?? []) grid += Math.max(0, Math.floor((at(p.date, c) - at(p.date, o)) / (b.slot_minutes * MIN)));
    cap += Math.min(grid, b.max_meetings_per_day);
  }
  const taken = normaliseBookings(bookings).filter((x) => ACTIVE.has(x.status) && ms(x.start) >= now && ms(x.start) < end).length;
  const fill = cap ? Math.round((taken / cap) * 100) / 100 : 1;
  return { fill_7d: fill, taken_7d: taken, capacity_7d: cap, hold: fill >= CAPACITY_HOLD, release: fill < CAPACITY_RELEASE };
}

// ---------------------------------------------------------------- calendar route (0.3 #4)
/**
 * 'graph'  : calendar_status ok, OAuth mode -> broker token -> getSchedule
 * 'shared' : blocked_admin_consent (pre-mortem #4) or calendar_mode shared_fallback -> hours minus our own bookings
 * 'none'   : needs_reconnect / never connected -> fallback 'whatsapp' (4.6 W04 failure handling)
 */
export function calendarRoute(b = {}) {
  if (b.calendar_status === 'blocked_admin_consent' || b.calendar_mode === 'shared_fallback') return 'shared';
  if (b.calendar_status === 'ok') return 'graph';
  return 'none';
}

// ---------------------------------------------------------------- Microsoft Graph shapes (modelled; ASSUMPTION)
export const GRAPH_SCOPE = 'offline_access User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite';
/**
 * Refresh-token grant form WITHOUT the refresh token and WITHOUT the client secret: the n8n HTTP node takes the
 * refresh token straight from the vault RPC output and the credential "Microsoft Graph broker-connect client
 * secret (W20)" adds client_secret. ASSUMPTION (no web check): v2.0 token endpoint, grant_type=refresh_token,
 * same scope string as W20's authorize request.
 */
export function tokenRefreshForm({ clientId, tenant } = {}) {
  const t = /^[A-Za-z0-9.-]{1,100}$/.test(String(tenant || '')) ? tenant : 'organizations';
  return { url: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, form: { client_id: clientId || '', grant_type: 'refresh_token', scope: GRAPH_SCOPE } };
}

/**
 * Token endpoint result -> public plan. Never returns the refresh token (the vault node reads it from the HTTP
 * node output directly when Microsoft rotates it).
 * @returns { ok:true, access_token, expires_at, rotated } | { ok:false, error:'refresh_failed', reason, status_to?, transient }
 */
export function planToken(res, nowMs = Date.now()) {
  const body = res && res.body && typeof res.body === 'object' ? res.body : (res || {});
  const code = Number((res && res.statusCode) || (body.access_token ? 200 : 0));
  if (code >= 200 && code < 300 && typeof body.access_token === 'string' && body.access_token) {
    const exp = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
    return { ok: true, access_token: body.access_token, expires_at: new Date(nowMs + exp * 1000).toISOString(), rotated: typeof body['refresh_' + 'token'] === 'string' && body['refresh_' + 'token'].length > 0 };
  }
  const transient = code === 0 || code === 429 || code >= 500;
  if (transient) return { ok: false, error: 'refresh_failed', reason: code ? `http_${code}` : 'no_response', transient: true, status_to: null };
  const m = mapError(body);
  // consent -> consent_pending (smc_set_calendar_status maps it to blocked_admin_consent -> shared calendar next time);
  // a dead/revoked grant or bad app credentials -> error (-> needs_reconnect).
  return { ok: false, error: 'refresh_failed', reason: m.reason, codes: m.codes, transient: false, status_to: m.kind === 'consent' ? 'consent_pending' : 'error', alert_app: m.reason === 'app_credentials' };
}

/**
 * getSchedule request. ASSUMPTION (no web check; 4.6 names `calendar/getSchedule`): delegated token ->
 * POST https://graph.microsoft.com/v1.0/me/calendar/getSchedule with this body, and the header
 * Prefer: outlook.timezone="Africa/Johannesburg" so scheduleItems come back in SAST.
 */
export function getScheduleRequest(b, now, { fresh = false } = {}) {
  const mailbox = b.calendar_email || b.email || null;
  const start = at(sast(now).date, '00:00');
  const end = start + (Number(b.horizon_days || 14) + 1) * D;
  return {
    url: 'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
    headers: { Prefer: `outlook.timezone="${TZ}"` },
    body: { schedules: mailbox ? [mailbox] : [], startTime: { dateTime: iso(start).slice(0, 19), timeZone: TZ }, endTime: { dateTime: iso(end).slice(0, 19), timeZone: TZ }, availabilityViewInterval: 30 },
    fresh,
  };
}

const BLOCKING = new Set(['busy', 'tentative', 'oof']); // ASSUMPTION: 'workingElsewhere' and 'free' do not block
const ZONE_OFFSET = { 'africa/johannesburg': '+02:00', 'south africa standard time': '+02:00', utc: 'Z', '': 'Z' };
function graphTime(t) {
  if (!t || !t.dateTime) return null;
  const s = String(t.dateTime).replace(/(\.\d{3})\d*$/, '$1');
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return ms(s);
  const off = ZONE_OFFSET[String(t.timeZone || '').toLowerCase()];
  if (off === undefined) return null; // unknown zone: refuse to guess
  return ms(s + off);
}
/**
 * getSchedule response (n8n fullResponse {statusCode, body} or the body) -> busy blocks, or null on any error
 * (auth, throttling, per-schedule error, unknown time zone). null = fail closed ('whatsapp' fallback / free:false).
 */
export function parseGetSchedule(res) {
  if (!res) return null;
  const body = res.body && typeof res.body === 'object' ? res.body : res;
  const code = Number(res.statusCode || 200);
  if (code < 200 || code >= 300 || body.error || !Array.isArray(body.value) || !body.value.length) return null;
  const busy = [];
  for (const sch of body.value) {
    if (sch.error) return null;
    for (const it of sch.scheduleItems || []) {
      if (!BLOCKING.has(String(it.status || '').toLowerCase())) continue;
      const s = graphTime(it.start);
      const e = graphTime(it.end);
      if (s === null || e === null) return null;
      busy.push({ start: iso(s), end: iso(e) });
    }
  }
  return busy;
}

/** A move must not collide with its own Outlook event: drop the busy block that is exactly that booking. */
export function excludeOwn(busy, booking) {
  if (!busy || !booking || !booking.start) return busy;
  const s = ms(booking.start); const e = ms(booking.end);
  return busy.filter((x) => !(ms(x.start) === s && ms(x.end) === e));
}

// ---------------------------------------------------------------- callers
const UUIDISH = /^[A-Za-z0-9_-]{1,64}$/;
/** GET /slots query -> { limit?, date?, days?, offer? } (broker_id / broker / brk are never read: CONTRACTS I-29). */
export function parseQuery(q = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || '')) ? q.date : null;
  const days = Number.isInteger(Number(q.days)) && Number(q.days) >= 1 ? Math.min(Number(q.days), 14) : null;
  const offer = Number.isInteger(Number(q.offer)) && Number(q.offer) >= 1 ? Math.min(Number(q.offer), 20) : null;
  return { date, days, offer };
}

/**
 * HTTP caller (CONTRACTS "lead_token" + "/slots broker-authenticated path"): wraps lead-token.js resolveSlotsCaller,
 * adds the optional Origin allow-list (PUBLIC_ALLOWED_ORIGINS; Traefik enforces CORS as well).
 * @returns { ok, status?, error?, reason?, mode, lead_id?, user_id?, limit, date, days }
 */
export function resolveCaller(headers = {}, query = {}, env = {}, nowMs = Date.now()) {
  const allowed = String(env.PUBLIC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hk = Object.keys(headers || {}).find((h) => h.toLowerCase() === 'origin');
  const origin = hk ? String(headers[hk]) : '';
  let c;
  try {
    c = LT.resolveSlotsCaller({ headers, query }, { leadSecret: env.LEAD_TOKEN_SECRET, leadPreviousSecret: env.LEAD_TOKEN_SECRET_PREVIOUS, jwtSecret: env.SUPABASE_JWT_SECRET, nowMs });
  } catch (e) {
    return { ok: false, status: 503, error: 'try_again', reason: 'not_configured' };
  }
  if (!c.ok) return { ok: false, status: c.status, error: c.status === 400 ? 'ambiguous_caller' : 'try_again', reason: c.reason };
  if (c.mode === 'lead' && origin && allowed.length && !allowed.includes(origin)) return { ok: false, status: 403, error: 'try_again', reason: 'origin' };
  const q = parseQuery(query);
  return { ...c, limit: c.mode === 'lead' && q.offer ? q.offer : c.limit, date: q.date, days: c.mode === 'lead' ? q.days : null };
}

/**
 * Sub-call input (CONTRACTS "Sub-workflow interfaces") -> one normalised request. Accepts the documented
 * { broker_id, exclude_booking_id?, limit?, day? } / { op:'is_free', ... } / { op:'graph_token', broker_id } and the
 * shapes the existing callers send: W28 token-context rows ({ lead, broker, booking }), W28 list rows
 * ({ lead_id, broker_id, ... }), W07 W04_list ({ source:'W07', route, msg, lead, booking, delegate } -> W28 send_list).
 */
export function subcallInput(j = {}) {
  const broker_id = j.broker_id || j.broker?.broker_id || j.broker?.id || j.lead?.broker_id || null;
  const lead_id = j.lead_id || j.lead?.id || null;
  if (j.source === 'W07' && !j.op) {
    return lead_id ? { op: 'send_list', lead_id, delegate: j.delegate || null, reason: 'see_open_times' } : { op: 'reject', reason: 'lead_id missing', lead_id: null };
  }
  const op = ['list', 'is_free', 'graph_token'].includes(j.op) ? j.op : (j.op ? 'reject' : 'list');
  if (op === 'reject') return { op, reason: `unknown op ${j.op}`, lead_id };
  if (!broker_id) return { op: 'reject', reason: 'broker_id missing', lead_id };
  const exclude = j.exclude_booking_id || (j.booking && j.booking.id) || null;
  const out = { op, broker_id, lead_id, exclude_booking_id: exclude, fresh: op === 'is_free' || j.fresh === true };
  if (op === 'list') {
    out.limit = Number.isInteger(Number(j.limit)) && Number(j.limit) > 0 ? Math.min(Number(j.limit), 200) : null; // omitted -> full list (W28 needs it for CalendarPicker bounds)
    out.day = /^\d{4}-\d{2}-\d{2}$/.test(String(j.day || '')) ? j.day : null;
  }
  if (op === 'is_free') {
    if (!j.start) return { op: 'reject', reason: 'start missing', lead_id };
    out.start = j.start; out.end = j.end || null;
  }
  return out;
}

/**
 * After the database row is loaded: what to do next.
 * row = { lane:'http'|'sub', req (resolveCaller or subcallInput output), lead?:{id,broker_id,opted_out_at}, broker?, bookings? }
 * @returns { next: 'respond' | 'graph' | 'compute', route?, result? }   result = { status, body } (http) | body (sub)
 */
export function planRequest(row = {}) {
  const { lane, req = {} } = row;
  const done = (status, body) => ({ next: 'respond', result: lane === 'http' ? { status, body } : body });
  if (lane === 'http') {
    if (req.mode === 'lead') {
      if (!row.lead || row.lead.opted_out_at) return done(401, { error: 'try_again' });
      if (!row.lead.broker_id || !row.broker) return done(200, { slots: [], fallback: 'whatsapp' });
    } else if (!row.broker) return done(403, { error: 'not_a_broker' });
  } else if (!row.broker) {
    return done(null, req.op === 'is_free' ? { free: false, next_slots: [], error: 'unknown_broker' } : req.op === 'graph_token' ? { error: 'refresh_failed' } : { slots: [], fallback: 'whatsapp' });
  }
  const b = brokerConfig(row.broker);
  const route = calendarRoute(b);
  if (req.op === 'graph_token') {
    if (route === 'graph') return { next: 'graph', route, token_only: true };
    return done(null, { error: route === 'shared' ? 'shared_calendar' : 'refresh_failed', calendar: route });
  }
  if (route === 'graph') return { next: 'graph', route };
  return { next: 'compute', route };
}

/**
 * Build the answer from the engine.
 * x = { lane, req, broker, bookings, busy (array | null), route, now, holidays }
 */
export function respond(x) {
  const { lane, req = {} } = x;
  const b = brokerConfig(x.broker || {});
  const bookings = normaliseBookings(x.bookings || []);
  const busyIn = x.route === 'shared' ? [] : x.busy;
  const ownBooking = req.exclude_booking_id ? bookings.find((k) => k.id === req.exclude_booking_id) : null;
  const busy = ownBooking ? excludeOwn(busyIn, ownBooking) : busyIn;
  const requireActive = !(lane === 'http' && req.mode === 'broker');
  const g = generateSlots(b, busy, bookings, x.now, x.holidays, { requireActive, excludeBookingId: req.exclude_booking_id || null });
  const cal = x.route === 'shared' ? 'shared' : x.route === 'graph' ? 'graph' : 'none';
  if (lane === 'sub') {
    if (req.op === 'is_free') {
      if (g.fallback) return { free: false, next_slots: [], fallback: 'whatsapp' }; // calendar error -> fail closed
      const s0 = ms(req.start);
      const okEnd = !req.end || ms(req.end) - s0 === b.slot_minutes * MIN;
      const free = okEnd && g.slots.some((s) => ms(s.start) === s0);
      return { free, next_slots: free ? [] : offerSlots(g.slots.filter((s) => ms(s.start) !== s0), 3), calendar: cal };
    }
    const base = req.day ? dayView(g.slots, req.day) : req.limit ? offerSlots(g.slots, req.limit) : g.slots;
    const out = { slots: base, calendar: cal, capacity: capacity(b, bookings, x.now, x.holidays) };
    if (g.fallback) out.fallback = g.fallback;
    return out;
  }
  // HTTP
  if (g.fallback) return { status: 200, body: { slots: [], fallback: 'whatsapp' } };
  if (req.mode === 'broker') {
    const limit = Math.min(Math.max(Number(req.limit) || 1, 1), 3);
    const slots = g.slots.slice(0, limit);
    const first = g.slots[0];
    const sameWeek = first ? g.slots.filter((s) => weekKey(ms(s.start)) === weekKey(ms(first.start))).length - 1 : 0;
    return { status: 200, body: { slots, next_free_slot_at: first ? first.start : null, more_this_week: Math.max(0, sameWeek), calendar: cal, capacity: capacity(b, bookings, x.now, x.holidays) } };
  }
  // lead path: never any lead or broker identifiers back; only what the picker needs
  let slots;
  if (req.date) slots = dayView(g.slots, req.date);
  else if (req.days) slots = nextDays(g.slots, req.days);
  else slots = offerSlots(g.slots, Math.min(Math.max(Number(req.limit) || 3, 1), 20));
  const methods = b.methods_supported.filter((m) => m !== 'meet' || b.calendar_provider === 'google');
  return { status: 200, body: { slots, tz: TZ, methods, adviser_first_name: b.adviser_first_name } };
}

// ---------------------------------------------------------------- 60-s cache (per broker, busy blocks only)
/** cache = $getWorkflowStaticData('global').w04_busy ; never holds tokens. */
export function cacheGet(cache, brokerId, nowMs) {
  const c = cache && cache[brokerId];
  return c && nowMs - c.at < CACHE_MS && Array.isArray(c.busy) ? c.busy : null;
}
export function cachePut(cache, brokerId, busy, nowMs) {
  if (!cache || !Array.isArray(busy)) return cache;
  cache[brokerId] = { at: nowMs, busy };
  for (const k of Object.keys(cache)) if (nowMs - cache[k].at > 10 * CACHE_MS) delete cache[k];
  return cache;
}

/** Test-hook clock (fixtures/time-shift.md): honoured only when hooks are on, the token matches and the lead is synthetic. */
export function clockFor(headers = {}, env = {}, isSynthetic = false, wall = Date.now()) {
  const get = (n) => { const k = Object.keys(headers || {}).find((h) => h.toLowerCase() === n); return k ? String(headers[k]) : ''; };
  if (String(env.TEST_HOOKS_ENABLED) !== 'true' || !isSynthetic || !env.TEST_HOOKS_TOKEN || get('x-test-token') !== env.TEST_HOOKS_TOKEN) return wall;
  const t = Date.parse(get('x-test-now'));
  return Number.isFinite(t) ? t : wall;
}

export const isUuidish = (s) => UUIDISH.test(String(s || ''));
