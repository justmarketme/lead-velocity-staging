// Shared test harness for the 8 core-path acceptance tests (W01 W04 W05 W06 W09 W12 W13 W15).
// Not a test file itself (the leading underscore keeps it out of the node:test glob).
//
// Two modes:
//   offline (default)  - every test runs against the tiny reference implementation inside its own file.
//                         Nothing leaves the machine. This is what CI and `make build` run today.
//   online             - set N8N_PUBLIC_URL (local n8n + tunnel, or the VPS). The same assertions run
//                         against the real webhooks. Force offline with SMC_TEST_OFFLINE=1 or `--offline`.
//
// No dependencies: Node 18+ only (node:test, node:assert, fetch, crypto).

import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

export const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures', 'synthetic-leads.json'), 'utf8'));
export const HOLIDAYS_FILE = JSON.parse(readFileSync(join(REPO, 'data', 'za-public-holidays.json'), 'utf8'));
export const HOLIDAYS = new Set(HOLIDAYS_FILE.holidays.map((h) => h.date));
export const template = (name) =>
  JSON.parse(readFileSync(join(REPO, 'automation', 'templates', `${name}.json`), 'utf8'));

export const MODE =
  process.env.N8N_PUBLIC_URL && process.env.SMC_TEST_OFFLINE !== '1' && !process.argv.includes('--offline')
    ? 'online'
    : 'offline';

// ---------- fixtures ----------
export const lead = (id) => {
  const l = FIX.leads.find((x) => x.fixture_id === id);
  if (!l) throw new Error(`fixture ${id} missing`);
  return l;
};
export const broker = (id = FIX.brokers[0].broker_id) => FIX.brokers.find((b) => b.broker_id === id);
export const cycle = (id = FIX.cycles[0].cycle_id) => FIX.cycles.find((c) => c.cycle_id === id);
export const pricing = (tier) => FIX.pricing.find((p) => p.tier_code === tier);
export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- time (Africa/Johannesburg = UTC+02:00 all year, no DST) ----------
export const MIN = 60_000;
export const H = 60 * MIN;
export const D = 24 * H;
const OFF = 2 * H;
export const ms = (iso) => {
  const v = Date.parse(iso);
  if (Number.isNaN(v)) throw new Error(`bad time ${iso}`);
  return v;
};
/** ms -> "2026-10-15T10:00:00+02:00" */
export const iso = (t) => new Date(t + OFF).toISOString().replace(/\.\d{3}Z$/, '+02:00');
/** SAST calendar parts of an instant */
export const sast = (t) => {
  const d = new Date(t + OFF);
  return {
    date: d.toISOString().slice(0, 10),
    dow: d.getUTCDay(),
    hh: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
};
/** "2026-10-15" + "10:00" -> ms */
export const at = (date, hhmm) => ms(`${date}T${hhmm}:00+02:00`);
export const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Thu 15 Oct" */
export const dateLabel = (t) => {
  const d = new Date(t + OFF);
  return `${DOW[d.getUTCDay()][0].toUpperCase()}${DOW[d.getUTCDay()].slice(1)} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
/** "10:00" */
export const timeLabel = (t) => iso(t).slice(11, 16);
/** "Mon 12 Oct, 11:30" (slot labels in broker_intro_slots / missed_you / reschedule_offer) */
export const slotLabel = (t) => `${dateLabel(t)}, ${timeLabel(t)}`;
/** Monday 00:00 SAST of the week containing t (weeks run Mon-Sun for max_meetings_per_week) */
export const weekKey = (t) => {
  const p = sast(t);
  const back = (p.dow + 6) % 7;
  return iso(at(p.date, '00:00') - back * D).slice(0, 10);
};

// ---------- misc ----------
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Render a template BODY with positional variables, so tests check the real approved text. */
export function renderBody(name, vars) {
  const body = template(name).components.find((c) => c.type === 'BODY').text;
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const v = vars[Number(n) - 1];
    if (v === undefined) throw new Error(`${name}: variable {{${n}}} missing`);
    return v;
  });
}

// ---------- online client (used only when MODE === 'online') ----------
// Contract (staging only; see README "Test hooks"): n8n webhooks live under N8N_WEBHOOK_PREFIX (default /webhook).
// The virtual clock travels in `X-Test-Now`; fixture-only Lookup results in `X-Test-Lookup-Line-Type`.
// Both headers are honoured ONLY when TEST_HOOKS_ENABLED=true on the n8n side AND `X-Test-Token` matches
// TEST_HOOKS_TOKEN AND the payload carries is_synthetic=true. Production ignores them.
const BASE = (process.env.N8N_PUBLIC_URL || '').replace(/\/$/, '') + (process.env.N8N_WEBHOOK_PREFIX ?? '/webhook');

async function call(method, path, { body, now, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', 'x-test-token': process.env.TEST_HOOKS_TOKEN || '', ...headers };
  if (now !== undefined) h['x-test-now'] = typeof now === 'number' ? iso(now) : now;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

export const online = {
  post: (path, body, opts = {}) => call('POST', path, { ...opts, body }),
  get: (path, opts = {}) => call('GET', path, opts),
  /** Full state of one lead: { lead, booking, messages[], scheduled[], capi[], outcome, replacements[], suppression[], broker_notifications[] } */
  state: async (leadId) => (await call('GET', `/test/state?lead_id=${encodeURIComponent(leadId)}`)).body,
  /** Process every scheduled job due at or before `now` (virtual clock) and return what was sent. */
  tick: async (now) => (await call('POST', '/test/tick', { body: { now: iso(now) } })).body,
  /** Deliver a Cloud-API-shaped inbound WhatsApp message to the real WhatsApp trigger webhook (signed). */
  waInbound: async ({ from, text, buttonPayload, listId, now }) => {
    const msg = { from: from.replace('+', ''), id: `wamid.TEST.${Date.now()}.${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor((now ?? Date.now()) / 1000)) };
    if (text !== undefined) Object.assign(msg, { type: 'text', text: { body: text } });
    if (buttonPayload !== undefined) Object.assign(msg, { type: 'button', button: { payload: buttonPayload, text: buttonPayload } });
    if (listId !== undefined) Object.assign(msg, { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: listId, title: listId } } });
    const body = { object: 'whatsapp_business_account', entry: [{ id: 'WABA_TEST', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: process.env.WA_PHONE_NUMBER_ID || 'TEST' }, contacts: [{ wa_id: msg.from }], messages: [msg] } }] }] };
    const raw = JSON.stringify(body);
    const headers = {};
    if (process.env.META_APP_SECRET) headers['x-hub-signature-256'] = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex');
    return call('POST', '/whatsapp', { body, now, headers });
  },
};

/**
 * Online runs: shift every fixture time forward by whole weeks so the fixture's base clock lands in the
 * future while weekday and time of day stay identical (see fixtures/time-shift.md). Skips any shift that
 * would put a fixture booking date on a public holiday.
 */
export function rebaseWeeks(realNow = Date.now()) {
  const base = ms(FIX._meta.base_clock);
  let weeks = Math.max(0, Math.ceil((realNow - base) / (7 * D)) + 1);
  const dates = JSON.stringify(FIX).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+02:00/g) || [];
  for (;;) {
    const clash = dates.some((s) => HOLIDAYS.has(sast(ms(s) + weeks * 7 * D).date));
    if (!clash) break;
    weeks += 1;
  }
  const shift = weeks * 7 * D;
  return { weeks, shift, t: (s) => ms(s) + shift };
}
