// automation/lib/w39.mjs  -  W39 Start page API: GET /start + POST /start/answers (the hidden sortmycover.co.za/start/ page).
// Imported by the Code nodes of automation/W39.json (require('lv-automation').w39, I-46c) and by automation/tests/W39.test.mjs.
// Pure logic: no network, no database. Time is passed in.
//
// Why (Jono, 18 Oct 2026): a branded page replaces the WhatsApp qualifying taps (q_age -> q_budget -> q_bond -> q_method).
// W03 sends ONE call-to-action message with sortmycover.co.za/start/#lt=<lt1 token> (brand flag start_page). The page reads
// GET /start, posts the answers here, then lists and books times with the unchanged W04 GET /slots and W05 POST /book.
//
// Contract (the page codes against this; header X-Lead-Token on every call, CONTRACTS.md "lead_token", lead path only):
//   GET  /start          -> 200 { first_name, adviser: {first_name, name, firm, fsp} | null, methods, answers, booking }
//   POST /start/answers  -> 200 { ok: true, next: 'slots' | 'chat' } | 400 { error: 'invalid' }
//   401 { error: 'try_again' }: no / bad / expired token, a broker JWT, an unknown, opted-out or erased lead (reason logged only).
//   403 { error: 'try_again' }: Origin not in PUBLIC_ALLOWED_ORIGINS (as W04). 503 { error: 'try_again' }: secrets not set.
//
// What an answer does (decideAnswers), mirroring W03 so the chat and the page give one outcome:
//   will   -> product_interest wills, conv_state handoff, a person is asked (escalation, as W03's wills opener), Lindi says so
//   other  -> conv_state unbooked, Lindi asks for a sentence (W07 treats the next message as free text), next 'chat'
//   age outside QUAL_AGE (lt35 / 51plus): OUT_OF_BAND_AGE_BOOKS decides. false = W03 outOfBand (disqualified, deleted in 24 h,
//            the same polite close). true (Jono, 18 Oct: they may book with Mark) = routed like in band, NEVER qualified_at,
//            a timeline note, and conv_state.age_accepted so a later chat turn never closes it (logic.mjs decide).
//   in band -> bands stored; tier A/B = qualified_at + stage qualified, tier C (lt750) = band only (the routing trigger holds
//            it, W03 finishPageBudget semantics); then W01 core routes it WITHOUT the W06 first touch (the page shows the slots).
//   Always: the answers are kept in conv_state.start (no intent / has-cover column), help_with in conv_state (W01 vocabulary),
//   W03's pending stall is cancelled, one lead_activities row per request_id (w39:answers:<lead>:<request_id>).
import { resolveCaller as w04Caller, brokerConfig, iso, ms } from './w04.mjs';
import { QUAL_AGE, QUAL_BUDGET, LOW_BUDGET, HELP_WITH, OUT_OF_BAND_RETENTION_H, H } from './w01.mjs';

export const WORKFLOW = 'W39';
/**
 * Under-35 / over-50 on the page. Jono, 18 Oct 2026: true, they may book with Mark. They are never marked qualified
 * (qualified_at stays null) and get a timeline note. NOTE: counting toward the broker's order is the database's rule
 * (smc_count_lead: attended + email verified), not qualified_at; see CONTRACTS.md "W39 Start page API".
 */
export const OUT_OF_BAND_AGE_BOOKS = true;

export const INTENTS = ['life', 'income', 'illness', 'review', 'will', 'other'];
export const AGE_BANDS = ['lt35', '35_44', '45_50', '51plus'];
export const HAS_COVER = ['yes', 'no', 'unsure'];
export const BUDGET_BANDS = ['lt750', '750_1250', '1250_1499', '1500_plus']; // all in leads_smc_checks
export const WANTS = ['family', 'bond', 'income', 'illness', 'unsure'];
/** page intent -> lib/w01.mjs HELP_WITH (the quiz v2 vocabulary kept in conv_state.help_with); 'other' has none. */
export const HELP_WITH_OF = { life: 'life', income: 'disability_income', illness: 'severe_illness', review: 'review', will: 'wills' };
/** page intent -> leads.reasons, only where it maps cleanly onto leads_capture_v2_checks (severe illness / review: no code). */
export const REASONS_OF = { life: ['life_cover'], income: ['disability'], other: ['other'] };
/** Meeting types the page offers (Jono, 18 Oct 2026): Teams and phone only, and only those the broker supports. */
export const PAGE_METHODS = ['teams', 'phone'];
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/; // same rule as W05 /book
const ROUTE_INTENTS = new Set(['life', 'income', 'illness', 'review']);
for (const k of Object.values(HELP_WITH_OF)) if (!HELP_WITH.has(k)) throw new Error(`w39: ${k} is not in w01 HELP_WITH`);

// Lindi's lines (no "free", no "AI", no operator company). The wills line is W03's (naming Capital Legacy inside WhatsApp is
// allowed); the close is W03 outOfBand word for word.
export const WILLS_TEXT = (first) => `Thanks${first ? ` ${first}` : ''}. Wills are done with a Capital Legacy consultant, so I've asked a person from our team to message you here shortly to set up the call.`;
export const OTHER_TEXT = "No problem, tell me in a sentence what you're after and I'll point you the right way.";
export const OOB_TEXT = 'Thanks for your answers. Based on them, we’re not the right fit for you right now, so we won’t pass your details on. Take care.';

const firstWord = (s) => String(s || '').trim().split(/\s+/)[0].replace(/[^\p{L}' -]/gu, '').slice(0, 30) || null;
const err = (status, error, reason) => ({ ok: false, status, body: { error }, reason });

/**
 * Who is calling: the lead path of lead-token.js (via W04's resolveCaller, so the Origin rule is the same). A broker JWT is
 * refused here (401): this page is the lead's own. Returns { ok, lead_id } | { ok:false, status, body, reason }.
 */
export function resolveCaller(headers = {}, env = {}, nowMs = Date.now()) {
  const c = w04Caller(headers, {}, env, nowMs);
  if (!c.ok) return err(c.status === 403 || c.status === 503 ? c.status : 401, 'try_again', c.reason);
  if (c.mode !== 'lead') return err(401, 'try_again', 'broker_jwt');
  return { ok: true, lead_id: c.lead_id };
}

/** The lead row check that follows every verify (CONTRACTS.md): row exists, not opted out, not erased (W34 removes the number). */
export function leadGate(lead) {
  if (!lead || !lead.id) return err(401, 'try_again', 'unknown_lead');
  if (lead.opted_out_at) return err(401, 'try_again', 'opted_out');
  if (lead.erased === true) return err(401, 'try_again', 'erased');
  return { ok: true };
}

/** POST body -> { ok, answers } | 400. Unknown keys are ignored; known keys must hold a known code. */
export function parseAnswers(body = {}) {
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return err(400, 'invalid', 'body');
  const pick = (k, list) => (b[k] === undefined || b[k] === null || b[k] === '' ? undefined : list.includes(b[k]) ? b[k] : null);
  const a = { intent: pick('intent', INTENTS), age_band: pick('age_band', AGE_BANDS), has_cover: pick('has_cover', HAS_COVER),
    budget_band: pick('budget_band', BUDGET_BANDS), want: pick('want', WANTS) };
  if (!a.intent || Object.values(a).includes(null)) return err(400, 'invalid', 'field');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return err(400, 'invalid', 'request_id');
  // the cover intents are routed on their bands: both are needed (will / other skip them)
  if (ROUTE_INTENTS.has(a.intent) && (!a.age_band || !a.budget_band)) return err(400, 'invalid', 'bands_required');
  const answers = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
  return { ok: true, answers, request_id: b.request_id };
}

/** GET /start body. Times leave as ISO +02:00 (W04). Nothing else about the lead or the broker is returned. */
export function startView({ lead = {}, broker = null, booking = null } = {}) {
  const cs = (lead && lead.conv_state) || {};
  const st = cs.start && typeof cs.start === 'object' ? cs.start : {};
  const answers = {};
  if (INTENTS.includes(st.intent)) answers.intent = st.intent;
  if (AGE_BANDS.includes(lead.age_band)) answers.age_band = lead.age_band;
  if (HAS_COVER.includes(st.has_cover)) answers.has_cover = st.has_cover;
  if (BUDGET_BANDS.includes(lead.budget_band)) answers.budget_band = lead.budget_band;
  if (WANTS.includes(st.want)) answers.want = st.want;
  const b = lead.broker_id && broker ? broker : null;
  const name = (b && (b.adviser_name || b.contact_person)) || null;
  const adviser = b ? { first_name: firstWord(name), name, firm: b.firm_name || b.practice_name || null, fsp: b.fsp_number || null } : null;
  const methods = b ? brokerConfig(b).methods_supported.filter((m) => PAGE_METHODS.includes(m)) : [];
  const bk = booking && booking.appointment_date ? { start: iso(ms(booking.appointment_date)), end: iso(ms(booking.ends_at || booking.appointment_date)), method: booking.method || null,
    held: booking.status === 'pending_verification' } : null;
  return { status: 200, body: { first_name: firstWord(lead.first_name), adviser, methods, answers, booking: bk } };
}

export const answersKey = (leadId, requestId) => `w39:answers:${leadId}:${requestId}`;

/**
 * One answers post -> the plan the workflow executes.
 * x = { lead (row: id, brand_id, broker_id, first_name, phone, stage, conv_state, opted_out_at, erased), answers, request_id,
 *       prior (payload of the activity with this request's key, or null), now, oobAgeBooks }
 * Returns { kind: 'reject', status, body } | { kind: 'replay', path } |
 *         { kind: 'work', path, key, set, activity, notes[], send, escalate, route, thread_stage }
 * set = the leads columns to write (the W39 "Save" statement reads each key; conv_state is MERGED into the row's jsonb).
 */
export function decideAnswers({ lead, answers, request_id, prior = null, now = Date.now(), oobAgeBooks = OUT_OF_BAND_AGE_BOOKS } = {}) {
  const g = leadGate(lead);
  if (!g.ok) return { kind: 'reject', status: g.status, body: g.body, reason: g.reason };
  if (prior && prior.path) return { kind: 'replay', path: prior.path }; // the same request again: same answer, nothing redone
  const at = iso(now);
  const a = answers || {};
  const first = firstWord(lead.first_name);
  const help = HELP_WITH_OF[a.intent] || null;
  const start = { intent: a.intent, ...(a.has_cover ? { has_cover: a.has_cover } : {}), ...(a.want ? { want: a.want } : {}), at, via: 'start_page', request_id };
  const set = { conv_state: { start, ...(help ? { help_with: help } : {}) } };
  if (a.age_band) set.age_band = a.age_band;
  if (a.budget_band) set.budget_band = a.budget_band;
  if (REASONS_OF[a.intent]) set.reasons = REASONS_OF[a.intent];
  const send = (text, tag) => (lead.phone ? { to: lead.phone, kind: 'text', text, lead_id: lead.id, correlation: `w39:${tag}:${lead.id}` } : null);
  const key = answersKey(lead.id, request_id);
  const plan = (path, extra) => ({ kind: 'work', path, key, set, notes: [], send: null, escalate: null, route: false, thread_stage: 'done',
    ...extra, activity: { activity_type: 'start_page_answers', idempotency_key: key, payload: { path, ...a, request_id, via: 'start_page' } } });

  if (a.intent === 'will') {
    set.product_interest = 'wills';
    set.conv_state.state = 'handoff';
    return plan('will', { send: send(WILLS_TEXT(first), 'will'), escalate: { note: 'start page: wills, no wills calendar; a person books the Capital Legacy call' } });
  }
  if (a.intent === 'other') {
    set.conv_state.state = 'unbooked';
    return plan('other', { send: send(OTHER_TEXT, 'other') });
  }
  const ageIn = QUAL_AGE.has(a.age_band);
  if (!ageIn && !oobAgeBooks) {
    // W03 outOfBand(): not handed over, deleted within 24 h, the same polite close
    Object.assign(set, { disqualified_reason: 'age_band', stage: 'disqualified', retention_delete_after: new Date(now + OUT_OF_BAND_RETENTION_H * H).toISOString() });
    set.conv_state.state = 'closed_oob';
    return plan('oob_close', { send: send(OOB_TEXT, 'oob'), thread_stage: 'closed' });
  }
  set.conv_state.state = 'unbooked'; // the state W07 is in after qualifying (offers times, handles chat)
  if (ageIn && QUAL_BUDGET.has(a.budget_band)) Object.assign(set, { qualified_at: at, stage: 'qualified' }); // tier A/B
  // tier C (lt750): the band only; the routing trigger holds it unless the broker has the standing yes (finishPageBudget)
  if (!ageIn) {
    set.conv_state.age_accepted = true;
    return plan('oob_book', { route: true, notes: [{ activity_type: 'start_page_age_out_of_band', idempotency_key: `w39:age_oob:${lead.id}`,
      payload: { age_band: a.age_band, budget_band: a.budget_band || null, books: true, qualified: false, rule: 'OUT_OF_BAND_AGE_BOOKS (Jono, 18 Oct 2026)' } }] });
  }
  return plan(a.budget_band === LOW_BUDGET ? 'route_tier_c' : 'route', { route: true });
}

/** next for the page: a routed path with a broker on the row after routing -> 'slots'; anything else -> 'chat'. */
export function nextOf(path, brokerId) {
  return ['route', 'route_tier_c', 'oob_book'].includes(path) && brokerId ? 'slots' : 'chat';
}

/** The answers response + the side effects to run (only for the request that actually claimed its key). */
export function answer({ plan, broker_id = null, claimed = false } = {}) {
  if (!plan || plan.kind === 'reject') return { status: (plan && plan.status) || 401, body: (plan && plan.body) || { error: 'try_again' }, effects: [] };
  const next = nextOf(plan.path, broker_id);
  const effects = plan.kind === 'work' && claimed ? [plan.send && { kind: 'send', message: plan.send }, plan.escalate && { kind: 'escalate', note: plan.escalate.note }].filter(Boolean) : [];
  return { status: 200, body: { ok: true, next }, effects };
}

/** W01 Lead core input: the same routing as W03's route_and_first_touch, without the W06 first touch. */
export const routeInput = (leadId) => ({ kind: 'route_and_first_touch', lead_id: leadId, first_touch: false, source: 'W39' });

