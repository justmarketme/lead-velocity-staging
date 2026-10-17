// I-32b: first-party visit beacon receiver. Pure functions; automation/SUB-visit-beacon.json writes.
// Code node form: const L = require('lv-automation').subVisitBeacon;
// POST <api_base>/beacon  (navigator.sendBeacon, text/plain JSON, no cookies): { v: 1, sid, a: <angle slug>, e: 'view'|'step', s?: 1..8 }
// Privacy (POPIA, first-party only): NO IP, user agent, referrer or session id is written anywhere. The session id only
// keys an in-memory rate-limit window (n8n static data) that is pruned after RATE_WINDOW_MS. The database gets daily counters
// in ops.page_day (visits, quiz_starts, quiz_steps.sN.views). DNT / Sec-GPC requests are dropped before anything is counted.
export const RATE_WINDOW_MS = 60_000;
export const RATE_PER_SESSION = 20;   // events per session per minute (a real visit sends <= 9)
export const RATE_GLOBAL = 1200;      // events per minute across all sessions (a flood costs counters, never rows)
export const MAX_SESSIONS_TRACKED = 5000;
export const MAX_STEP = 8;
const SID = /^[A-Za-z0-9-]{8,64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SAST_MS = 2 * 3600e3; // Africa/Johannesburg, no DST
export const sastDay = (ms) => new Date(ms + SAST_MS).toISOString().slice(0, 10);

/** Beacon body: text/plain JSON string (sendBeacon with a string), or an already-parsed object. */
export function parseBody(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try { return JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '')); } catch { return null; }
}

/** Validate one beacon. headers are lower-cased request headers; env.BEACON_ANGLE_SLUGS (comma list) is optional; env.PUBLIC_ALLOWED_ORIGINS as W01. */
export function normalise({ body, headers = {}, env = {} } = {}) {
  const h = headers || {};
  if (String(h.dnt || '') === '1' || String(h['sec-gpc'] || '') === '1') return { ok: false, reason: 'dnt' };
  const allowed = String(env.PUBLIC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && h.origin && !allowed.includes(h.origin)) return { ok: false, reason: 'origin' };
  const b = parseBody(body);
  if (!b || b.v !== 1) return { ok: false, reason: 'shape' };
  if (typeof b.sid !== 'string' || !SID.test(b.sid)) return { ok: false, reason: 'sid' };
  if (typeof b.a !== 'string' || !SLUG.test(b.a)) return { ok: false, reason: 'angle' };
  const list = String(env.BEACON_ANGLE_SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length && !list.includes(b.a)) return { ok: false, reason: 'angle' };
  if (b.e !== 'view' && b.e !== 'step') return { ok: false, reason: 'event' };
  let step = null;
  if (b.e === 'step') { step = Number(b.s); if (!Number.isInteger(step) || step < 1 || step > MAX_STEP) return { ok: false, reason: 'step' }; }
  return { ok: true, event: b.e, slug: b.a, step, sid: b.sid };
}

/** In-memory fixed window. state = { start, global, s: { sid: n } } (n8n workflow static data). Returns { allowed, state }. */
export function rateLimit(state, sid, nowMs) {
  let st = state && typeof state === 'object' ? state : {};
  if (!st.start || nowMs - st.start >= RATE_WINDOW_MS || nowMs < st.start) st = { start: nowMs, global: 0, s: {} };
  if (st.global >= RATE_GLOBAL) return { allowed: false, reason: 'rate_global', state: st };
  const n = st.s[sid] || 0;
  if (n >= RATE_PER_SESSION) return { allowed: false, reason: 'rate_session', state: st };
  if (!(sid in st.s) && Object.keys(st.s).length >= MAX_SESSIONS_TRACKED) return { allowed: false, reason: 'rate_global', state: st };
  st.global += 1; st.s[sid] = n + 1;
  return { allowed: true, state: st };
}

/** The counter increment for one accepted beacon. No session id, no raw event. */
export function increment(ev, nowMs, brandId) {
  return {
    day: sastDay(nowMs), brand_id: brandId, page_path: `/${ev.slug}/`,
    visits: ev.event === 'view' ? 1 : 0,
    quiz_starts: ev.event === 'step' && ev.step === 1 ? 1 : 0,
    step_key: ev.event === 'step' ? `s${ev.step}` : '',
  };
}

/** Plain-JS twin of the SQL upsert (tests the arithmetic the SQL does). rows: Map "day|brand|path" -> row. */
export function applyIncrement(rows, inc) {
  const k = `${inc.day}|${inc.brand_id}|${inc.page_path}`;
  const r = rows.get(k) || { day: inc.day, brand_id: inc.brand_id, page_path: inc.page_path, visits: 0, quiz_starts: null, quiz_steps: null };
  r.visits += inc.visits;
  if (inc.quiz_starts || r.quiz_starts !== null) r.quiz_starts = (r.quiz_starts || 0) + inc.quiz_starts;
  if (inc.step_key) { const qs = r.quiz_steps || {}; const cur = qs[inc.step_key] || { views: 0, abandons: 0 }; qs[inc.step_key] = { views: cur.views + 1, abandons: cur.abandons }; r.quiz_steps = qs; }
  rows.set(k, r);
  return rows;
}
