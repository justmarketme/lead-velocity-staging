// automation/lib/w41.mjs  -  W41 SMC broker lead notice (routed, not booked), 24 Oct 2026.
// Imported by the Code nodes of automation/W41.json (require('lv-automation').w41) and by automation/tests/W41.test.mjs.
//
// Why (Jonathan, 24 Oct 2026, Mark's first real lead): a client who consented and was routed to an adviser, but stopped
// before confirming a time, produced nothing for the adviser: broker notices fire at booking (W05 broker_new_booking),
// so the adviser learned nothing until the client booked. The client has already consented to being put in touch, so
// the adviser is told at once: who (first name + initial), when and from where they came in, how far they got, that we
// are nudging them, and where the details are (portal "Waiting to book"). Everything that follows (nudges, a reply, the
// booking) shows in the portal timeline and the booking itself still sends broker_new_booking as before.
//
// Every hour (Jonathan: "it can check every hour"; the VPS n8n runs it, nothing depends on a laptop): SortMyCover leads
// routed at least GRACE minutes ago (so a client who books straight away gets the adviser ONE message, the booking one),
// inside the last 7 days, not synthetic, not opted out, not disqualified, with no
// live booking and no notice yet -> claim (ONE lead_activities row per lead, idempotency_key w41:broker_routed:<lead>,
// ON CONFLICT DO NOTHING RETURNING) -> for the claimed leads only: WhatsApp template broker_lead_routed through
// smc-whatsapp-send (the sub honours DRY_RUN_SENDS, skips when the template has no Content SID yet, raises W22 on a
// failure) + a plain-text email from SortMyCover through smc-email-send (DRY_RUN_SENDS gate inserted by gateSenders).
// A lead is told about once, whatever happens to the sends; a later booking tells the adviser again through W05.
// POPIA data minimisation: the SQL returns the adviser's own number and email (needed to reach him), the client's first
// name, last initial, origin and timestamps. Never the client's number or email, ID numbers or message text.

import { sastText, firstName } from './w38.mjs';
import { smcRelayEmail } from './w05.mjs';

export const SMC_BRAND_ID = '6e532b05-984f-4906-90a0-a5257cde328c';
export const TEMPLATE = 'broker_lead_routed';
export const ACTIVITY = 'broker_notified_routed';
export const KEY_PREFIX = 'w41:broker_routed:';
export const DEFAULT_GRACE_MIN = 10;
export const ROW_LIMIT = 50;
export const PORTAL_BASE = 'https://leadvelocity.co.za';

const ORIGIN = { ctwa: 'a SortMyCover ad on WhatsApp', lead_ad: 'a SortMyCover ad form', instant_form: 'a SortMyCover ad form', page: 'the SortMyCover website' };
const clean = (v) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/** The two switches, read exactly as the other workflows read DRY_RUN_SENDS. */
export const gates = (env = {}) => ({ enabled: env.SMC_BROKER_LEAD_NOTICE_ENABLED === 'true', dryRun: env.DRY_RUN_SENDS === 'true' });

/** Grace in minutes (default 10): a lead routed more recently is not told about yet. */
export function graceMinutes(env = {}) {
  const n = Number(env.SMC_BROKER_LEAD_NOTICE_GRACE_MIN);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? Math.round(n) : DEFAULT_GRACE_MIN;
}

/** Tick start: disabled -> { run: false }; enabled -> the query parameters. */
export function start(env = {}) {
  if (!gates(env).enabled) return { run: false, reason: 'disabled' };
  return { run: true, brand_id: SMC_BRAND_ID, grace_min: graceMinutes(env), limit: ROW_LIMIT };
}

export const keyOf = (leadId) => `${KEY_PREFIX}${leadId}`;

// ---------------------------------------------------------------- route at consent, hourly sweep (Jonathan, 24 Oct 2026)
// His second real lead consented on the ad at 18:06 and never opened the page, so no adviser had him. W03 now routes at
// consent; this sweep catches every consented click-to-WhatsApp lead that is still unrouted (W03 ran before that change, or
// its routing call failed) while the 24-h WhatsApp window is open, so W01 core can name the adviser and hand the lead over.
// W01 core does the work (the same call as W03 / W39: routing pool, capacity, tier rules, the CHAT-DISCLOSE session text +
// adviser_disclosed before routing, idempotent). Separate switch from the notice: SMC_ROUTE_AT_CONSENT ('false' = off).
export const SWEEP_WINDOW_H = 23; // under the 24-h session, so the disclosure text can still be delivered
export const routeAtConsent = (env = {}) => String(env.SMC_ROUTE_AT_CONSENT == null ? '' : env.SMC_ROUTE_AT_CONSENT).trim().toLowerCase() !== 'false';

/** Sweep start: off -> { run: false }; on -> the query parameters. */
export function sweepStart(env = {}) {
  if (!routeAtConsent(env)) return { run: false, reason: 'disabled' };
  return { run: true, brand_id: SMC_BRAND_ID, window_h: SWEEP_WINDOW_H, limit: ROW_LIMIT };
}

/** One W01 Lead core input per unrouted lead (run once per item: W01's disclosure branch reads one lead at a time). */
export const routeInputs = (rows = []) => {
  const seen = new Set();
  return rows.filter((r) => r && r.lead_id && !seen.has(String(r.lead_id)) && seen.add(String(r.lead_id)))
    .map((r) => ({ kind: 'route_and_first_touch', lead_id: String(r.lead_id), first_touch: false, source: 'W41:consent_sweep' }));
};

/** "Lerato M." (first name only, an initial when there is a surname). The surname itself never leaves the row. */
export function personLabel(r = {}) {
  const f = firstName(r.first_name);
  const ini = clean(r.last_initial).replace(/[^\p{L}]/gu, '').slice(0, 1).toUpperCase();
  return ini ? `${f} ${ini}.` : f;
}

/** The ad's own headline from the CTWA referral (kept in the ctwa_consent row), cleaned and short; '' when there is none. */
export const adHeadline = (r = {}) => clean(r.ad_headline).replace(/["“”]/g, "'").slice(0, 80);

/**
 * "on Sat 24 Oct at 08:12 via a SortMyCover ad on WhatsApp ('Book a 30-minute call with Mark')" (SAST; the consent time,
 * else when the lead was created; the ad headline when the referral carried one).
 */
export function cameInText(r = {}) {
  const when = sastText(r.consent_at || r.created_at).replace(/ SAST$/, '').replace(/^(\w+ \d+ \w+) (\d\d:\d\d)$/, 'on $1 at $2');
  const via = ORIGIN[String(r.origin || '').toLowerCase()] || 'SortMyCover';
  const h = adHeadline(r);
  return `${when} via ${via}${h ? ` ('${h}')` : ''}`;
}

/** How far they got, as the template's {{4}} reads it. */
export const howFarText = (r = {}) => (r.opened_page === true ? 'opened your booking page but have not confirmed a time' : 'have not opened your booking page yet');

/**
 * One query row -> the plan for that lead, or null when nobody can be reached (no adviser number AND no email) or the row
 * is test data (defence in depth: the SQL already excludes is_synthetic). The lead's own number is never part of it.
 */
export function planOne(r = {}, env = {}) {
  if (!r || !r.lead_id || !r.broker_id) return null;
  if (r.is_synthetic === true) return null;
  const to = digits(r.broker_whatsapp);
  const email = clean(r.broker_email);
  if (!to && !email) return null;
  const adviser = firstName(r.adviser_first);
  const person = personLabel(r);
  const vars = [adviser, person, cameInText(r), howFarText(r)].map(clean);
  const suffix = `l/${r.lead_id}`;
  const base = String(env.PORTAL_BASE || PORTAL_BASE).replace(/\/+$/, '');
  const wa = to ? {
    kind: 'prebuilt', caller: 'W41', record: true, lead_id: r.lead_id, broker_id: r.broker_id,
    wa: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: TEMPLATE, language: { code: 'en' }, components: [
        { type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: suffix }] },
      ] } },
  } : null;
  const relay = email ? smcRelayEmail({
    to: email,
    subject: `New client for you: ${person} (not booked yet)`,
    body: `Hi ${adviser},\n\nA SortMyCover client, ${person}, has agreed to be put in touch with you. They came in ${vars[2]} and ${vars[3]}, so there is nothing for you to do yet: we are nudging them to pick a time, and you will get the usual booking message the moment they do.\n\nTheir details and the full timeline are in your portal under "Waiting to book": ${base}/broker/leads\n\nSortMyCover by Lead Velocity`,
  }, `${keyOf(r.lead_id)}:email`, TEMPLATE) : null;
  return {
    lead_id: r.lead_id, brand_id: r.brand_id || SMC_BRAND_ID, broker_id: r.broker_id, key: keyOf(r.lead_id),
    payload: { template: TEMPLATE, channels: [to ? 'whatsapp' : null, email ? 'email' : null].filter(Boolean), routed_at: r.routed_at || null, origin: r.origin || null, ad_headline: adHeadline(r) || null, opened_page: r.opened_page === true, nudges: Number(r.nudges) || 0 },
    wa, relay,
  };
}

/** All query rows -> plans (oldest routed first), skipping what cannot be sent. */
export function plan(rows = [], env = {}) {
  const arr = typeof rows === 'string' ? JSON.parse(rows) : rows;
  return (Array.isArray(arr) ? arr : []).map((r) => planOne(r, env)).filter(Boolean);
}

/** The claim's INSERT parameters: one jsonb array for jsonb_to_recordset. */
export const claimRows = (plans = []) => plans.map((p) => ({ lead_id: p.lead_id, brand_id: p.brand_id, broker_id: p.broker_id, key: p.key, payload: p.payload }));

/** Plans whose claim row was inserted this tick (RETURNING lead_id); the others were told about before. */
export function claimed(plans = [], returned = []) {
  const ids = new Set((returned || []).map((x) => String((x && (x.lead_id || (x.json && x.json.lead_id))) || '')));
  return plans.filter((p) => ids.has(String(p.lead_id)));
}

/** One claimed plan -> the send items: the WhatsApp item for smc-whatsapp-send and / or the email relay. */
export function fanOut(p = {}) {
  const out = [];
  if (p.wa) out.push({ ...p.wa, lead_key: p.key });
  if (p.relay) out.push({ kind: 'smc_relay', lead_id: p.lead_id, broker_id: p.broker_id, relay: p.relay });
  return out;
}
