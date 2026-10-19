// automation/lib/w39.mjs  -  W39 Start page API: GET /start + POST /start/answers (the hidden sortmycover.co.za/start/ page).
// Imported by the Code nodes of automation/W39.json (require('lv-automation').w39, I-46c) and by automation/tests/W39.test.mjs.
// Pure logic: no network, no database. Time is passed in.
//
// Why (Jono, 18 Oct 2026): a branded page replaces the WhatsApp qualifying taps (q_age -> q_budget -> q_bond -> q_method).
// W03 sends ONE call-to-action message with sortmycover.co.za/start/#lt=<lt1 token> (brand flag start_page). The page reads
// GET /start, posts the answers here, then lists and books times with the unchanged W04 GET /slots and W05 POST /book.
//
// Contract v4 (Jono approved mockup v4.2, 19 Oct 2026; header X-Lead-Token on every call, CONTRACTS.md "lead_token", lead path only):
//   GET  /start          -> 200 { first_name, phone_pretty, adviser: {id, first_name, name, firm, fsp, bio, photo_url} | null, methods,
//                                 answers: {age_band?, income_band?, topics?}, contact: {call_number?, alt_number?}, booking }
//   POST /start/adviser  -> 200 { ok: true, next: 'adviser', adviser } (no confirm_adviser: nothing routed) | { ok: true, next: 'slots' }
//                           (confirm_adviser = that id: adviser_disclosed, then W01 routes, no first touch) | { ok: true, next: 'chat' }
//   POST /start/contact  -> 200 { ok: true } | 400 { error: 'invalid', field }   (phone calls, before W05 /book)
//   POST /start/answers  -> v4 { age_band, income_band, topics[] } after booking: 200 { ok: true, next: 'done' } (never routes)
//                           v3 (pages opened before the deploy): { intent, age_band?, has_cover?, budget_band?, want? } as before:
//                           200 { ok: true, next: 'adviser', adviser } (phase a) | { ok: true, next: 'slots' | 'chat' } (phase b; will / other)
//   POST /start/move     -> moves the live booking through W10's own move (moveRequest / moveAnswer below)
//   401 { error: 'try_again' }: no / bad / expired token, a broker JWT, an unknown, opted-out or erased lead (reason logged only).
//   403 { error: 'try_again' }: Origin not in PUBLIC_ALLOWED_ORIGINS (as W04). 503 { error: 'try_again' }: secrets not set.
//
// What an answer does (decideAnswers), mirroring W03 so the chat and the page give one outcome:
//   will   -> product_interest wills, conv_state handoff, a person is asked (escalation, as W03's wills opener), Lindi says so
//   other  -> conv_state unbooked, Lindi asks for a sentence (W07 treats the next message as free text), next 'chat'
//   any age (Jono, 18 Oct 2026: every age books and counts; OUT_OF_BAND_AGE_BOOKS true): exactly like 35-50. With the switch
//            false an under-35 / over-50 would get the old close (disqualified, deleted in 24 h).
//   cover   -> bands stored; tier A/B = qualified_at + stage qualified, tier C (lt750) = band only (the routing trigger holds
//            it, W03 finishPageBudget semantics). Disclosure before routing: the adviser W01 WOULD pick is shown first (next
//            'adviser'); only the confirm call routes, after an 'adviser_disclosed' row, WITHOUT the W06 first touch.
//   Always: the answers are kept in conv_state.start (no intent / has-cover column), help_with in conv_state (W01 vocabulary),
//   W03's pending stall is cancelled, one lead_activities row per call (w39:answers:<lead>:<request_id>[:confirm]).
import { resolveCaller as w04Caller, brokerConfig, iso, ms } from './w04.mjs';
import { QUAL_AGE, QUAL_BUDGET, LOW_BUDGET, HELP_WITH, OUT_OF_BAND_RETENTION_H, H, routingFor, tierOf, OUT_OF_BAND_AGE_BOOKS, OOB_AGE_RULE, hasCoverCode, workCoverOf, HAS_COVER_CODES, toE164, QUALIFYING_STATES } from './w01.mjs';

export const WORKFLOW = 'W39';
/**
 * Under-35 / over-50 on the page. Jono, 18 Oct 2026: true, they may book with Mark. They are never marked qualified
 * (qualified_at stays null) and get a timeline note. NOTE: counting toward the broker's order is the database's rule
 * (smc_count_lead: attended + email verified), not qualified_at; see CONTRACTS.md "W39 Start page API".
 * One switch, owned by lib/w01.mjs since the instant form v2 (18 Oct 2026) follows the same rule; re-exported here.
 */
export { OUT_OF_BAND_AGE_BOOKS };

export const INTENTS = ['life', 'income', 'illness', 'review', 'will', 'other'];
export const AGE_BANDS = ['lt35', '35_44', '45_50', '51plus'];
/** The cover answer the page sends (four options, 18 Oct 2026) + the legacy ones; stored via w01.hasCoverCode (yes, not_sure -> unsure). */
export const HAS_COVER = ['yes_work', 'yes_own', 'no', 'unsure', 'yes', 'not_sure'];
export const BUDGET_BANDS = ['lt750', '750_1250', '1250_1499', '1500_plus']; // all in leads_smc_checks
export const WANTS = ['family', 'bond', 'income', 'illness', 'unsure'];
/** page intent -> lib/w01.mjs HELP_WITH (the quiz v2 vocabulary kept in conv_state.help_with); 'other' has none. */
export const HELP_WITH_OF = { life: 'life', income: 'disability_income', illness: 'severe_illness', review: 'review', will: 'wills' };
/** page intent -> leads.reasons, only where it maps cleanly onto leads_capture_v2_checks (severe illness / review: no code). */
export const REASONS_OF = { life: ['life_cover'], income: ['disability'], other: ['other'] };
/** Meeting types the page offers (Jono, 18 Oct 2026): Teams and phone only, and only those the broker supports. */
export const PAGE_METHODS = ['teams', 'phone'];
// ---- v4 (19 Oct 2026): the income bracket (leads.income_band CHECK, no DDL) and the multi-select topics
/** The original leads_capture_v2_checks codes (still accepted: rows written before, and pages opened during the deploy). */
export const INCOME_BANDS_DB = ['lt20k', '20k_40k', '40k_60k', '60k_100k', '100kplus', 'prefer_not'];
/**
 * Jono's brackets (19 Oct 2026, final): Up to R15,000 / R15,000 to R30,000 / R30,000 to R50,000 / R50,000 to R80,000 /
 * R80,000 or more / Prefer not to say. Needs migration 20261019200000_smc_income_bands_v4.sql (widens the CHECK, keeps the
 * old codes): apply it BEFORE importing W39. With the switch off, only INCOME_BANDS_DB is accepted.
 */
export const INCOME_DRAFT_BANDS = ['lt15k', '15k_30k', '30k_50k', '50k_80k', '80kplus', 'prefer_not'];
export const INCOME_DRAFT_BANDS_ON = true;
export const INCOME_LABELS = { lt15k: 'Up to R15,000', '15k_30k': 'R15,000 to R30,000', '30k_50k': 'R30,000 to R50,000', '50k_80k': 'R50,000 to R80,000', '80kplus': 'R80,000 or more', prefer_not: 'Prefer not to say' };
/** Accepted on POST /start/answers: the new codes, plus the old ones for compatibility. */
export const INCOME_BANDS = INCOME_DRAFT_BANDS_ON ? [...new Set([...INCOME_DRAFT_BANDS, ...INCOME_BANDS_DB])] : INCOME_BANDS_DB;
/**
 * Qualified (qualified_at + the Meta Qualified event), Jono 19 Oct 2026 FINAL: income R15k or more AND age 35-44 or 45-50.
 * Under R15k, prefer not to say, under 35 and over 50 are not Qualified. Every age still books and is routed: this only sets
 * qualified_at and the Meta signal. Old codes: 20k and up count as R15k+ (lt20k does not: it may be under R15k).
 */
export const QUALIFIED_INCOME = ['15k_30k', '30k_50k', '50k_80k', '80kplus', '20k_40k', '40k_60k', '60k_100k', '100kplus'];
export const QUALIFIED_AGE = ['35_44', '45_50'];
export const isQualifiedV4 = (age, income) => QUALIFIED_AGE.includes(age) && QUALIFIED_INCOME.includes(income);
/**
 * Internal low-income flag (the old "tier C" idea; Jono 19 Oct: internal only, never a hold or a reject). Under R15k (old lt20k)
 * -> conv_state.income_flag = 'low' + a timeline note. budget_band is never set on the v4 path, so the routing trigger
 * (smc_leads_route_check, tier C = budget_band lt750) never holds a /start/ lead; leads.lead_tier is left alone (the trigger
 * clears a 'C' that has no lt750 band).
 */
export const LOW_INCOME = ['lt15k', 'lt20k'];
export const TOPICS = ['life', 'disability_income', 'severe_illness', 'review', 'new_bond', 'will'];
/** topic -> lib/w01.mjs HELP_WITH (conv_state.help_with). A new bond is life cover for the bond. */
export const TOPIC_HELP_WITH = { life: 'life', disability_income: 'disability_income', severe_illness: 'severe_illness', review: 'review', new_bond: 'life', will: 'wills' };
/** topic -> leads.reasons, only where it maps onto leads_capture_v2_checks (life_cover, disability). */
export const TOPIC_REASONS = { life: 'life_cover', disability_income: 'disability' };
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/; // same rule as W05 /book
const BROKER_ID = /^[A-Za-z0-9_-]{1,64}$/; // brokers.id (uuid) as phase (a) returned it
/** The disclosure the page shows before routing (adviser card: name, practice, FSP number). Versioned like the consent texts. */
export const DISCLOSURE_VERSION = 'START-DISCLOSE-v1';
const ROUTE_INTENTS = new Set(['life', 'income', 'illness', 'review']);
for (const k of [...Object.values(HELP_WITH_OF), ...Object.values(TOPIC_HELP_WITH)]) if (!HELP_WITH.has(k)) throw new Error(`w39: ${k} is not in w01 HELP_WITH`);

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
  if (isV4Answers(b)) return parseV4Answers(b);
  const pick = (k, list) => (b[k] === undefined || b[k] === null || b[k] === '' ? undefined : list.includes(b[k]) ? b[k] : null);
  const a = { intent: pick('intent', INTENTS), age_band: pick('age_band', AGE_BANDS), has_cover: pick('has_cover', HAS_COVER),
    budget_band: pick('budget_band', BUDGET_BANDS), want: pick('want', WANTS) };
  if (!a.intent || Object.values(a).includes(null)) return err(400, 'invalid', 'field');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return err(400, 'invalid', 'request_id');
  // the cover intents are routed on their bands: both are needed (will / other skip them)
  if (ROUTE_INTENTS.has(a.intent) && (!a.age_band || !a.budget_band)) return err(400, 'invalid', 'bands_required');
  const c = b.confirm_adviser;
  if (c !== undefined && c !== null && c !== '' && (typeof c !== 'string' || !BROKER_ID.test(c))) return err(400, 'invalid', 'confirm_adviser');
  if (a.has_cover) a.has_cover = hasCoverCode(a.has_cover); // one stored vocabulary (legacy not_sure -> unsure)
  const answers = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
  return { ok: true, answers, request_id: b.request_id, confirm_adviser: typeof c === 'string' && c ? c : null };
}

/** v4 body (topics / income_band present, no intent). The old v3 body (intent ...) keeps its own parser above. */
export const isV4Answers = (b) => !!b && b.intent === undefined && (b.topics !== undefined || b.income_band !== undefined);
function parseV4Answers(b) {
  if (!AGE_BANDS.includes(b.age_band)) return err(400, 'invalid', 'age_band');
  if (!INCOME_BANDS.includes(b.income_band)) return err(400, 'invalid', 'income_band');
  if (!Array.isArray(b.topics) || !b.topics.length || b.topics.length > TOPICS.length * 2 || b.topics.some((t) => !TOPICS.includes(t))) return err(400, 'invalid', 'topics');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return err(400, 'invalid', 'request_id');
  return { ok: true, v: 4, answers: { age_band: b.age_band, income_band: b.income_band, topics: [...new Set(b.topics)] }, request_id: b.request_id, confirm_adviser: null };
}

const asBody = (b) => {
  let x = b;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) { x = null; } }
  return x && typeof x === 'object' && !Array.isArray(x) ? x : null;
};

/** POST /start/adviser body: { confirm_adviser?, request_id }. No answers (v4: the adviser card comes first). */
export function parseAdviser(body = {}) {
  const b = asBody(body);
  if (!b) return err(400, 'invalid', 'body');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return err(400, 'invalid', 'request_id');
  const c = b.confirm_adviser;
  if (c !== undefined && c !== null && c !== '' && (typeof c !== 'string' || !BROKER_ID.test(c))) return err(400, 'invalid', 'confirm_adviser');
  return { ok: true, request_id: b.request_id, confirm_adviser: typeof c === 'string' && c ? c : null };
}

const fieldErr = (field) => ({ ok: false, status: 400, body: { error: 'invalid', field }, reason: field });
/** POST /start/contact body: { call_number?, alt_number?, request_id }. SA numbers only (W01 toE164), stored as +27. */
export function parseContact(body = {}) {
  const b = asBody(body);
  if (!b) return fieldErr('body');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return fieldErr('request_id');
  const num = (k) => {
    const v = b[k];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return { ok: true, value: null };
    const e = typeof v === 'string' && v.length <= 32 ? toE164(v) : null;
    return e ? { ok: true, value: e } : { ok: false };
  };
  const call = num('call_number'); if (!call.ok) return fieldErr('call_number');
  const alt = num('alt_number'); if (!alt.ok) return fieldErr('alt_number');
  return { ok: true, request_id: b.request_id, call_number: call.value, alt_number: alt.value };
}

/** +27821234567 -> '082 123 4567' (what the page shows: "Call my WhatsApp number 082 123 4567"). */
export function prettyPhone(e164) {
  const m = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(String(e164 || ''));
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : null;
}

/**
 * The adviser's own approved bio (brokers.bio_short): only when the Lead Velocity bio review (onboarding_progress.bio_review,
 * migration 20261013160000) is accepted, or there is none. An open review ('changes_suggested') or a declined one -> null.
 */
export function approvedBio(b = {}) {
  const bio = typeof b.bio_short === 'string' ? b.bio_short.trim() : '';
  if (!bio) return null;
  const r = b.bio_review;
  if (r && typeof r === 'object' && !Array.isArray(r) && r.status !== 'accepted') return null;
  return bio;
}
/**
 * The adviser's approved picture: his current APPROVED headshot take (broker_media kind 'headshot', state 'approved'), else his
 * intro card image once he approved it in the portal (brokers.intro_card_url + onboarding_progress.card.approved_at, written only by
 * broker_approve_intro_card). brokers.headshot_url (the raw portal upload) is never sent. https only. None -> null (initials).
 */
export function approvedPhoto(b = {}) {
  const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
  return https(b.headshot_approved_url) || (b.card_approved_at ? https(b.intro_card_url) : null);
}

/** GET /start body. Times leave as ISO +02:00 (W04). Nothing else about the lead or the broker is returned. */
export function startView({ lead = {}, broker = null, brokers = null, booking = null } = {}) {
  const cs = (lead && lead.conv_state) || {};
  const st = cs.start && typeof cs.start === 'object' ? cs.start : {};
  const answers = {};
  if (AGE_BANDS.includes(lead.age_band)) answers.age_band = lead.age_band;
  if (INCOME_BANDS.includes(lead.income_band)) answers.income_band = lead.income_band;
  if (Array.isArray(st.topics)) { const t = st.topics.filter((x) => TOPICS.includes(x)); if (t.length) answers.topics = t; }
  // v3 answers stay readable for a page opened before the v4 deploy
  if (INTENTS.includes(st.intent)) answers.intent = st.intent;
  if (HAS_COVER_CODES.includes(st.has_cover)) answers.has_cover = st.has_cover; // as stored
  if (BUDGET_BANDS.includes(lead.budget_band)) answers.budget_band = lead.budget_band;
  if (WANTS.includes(st.want)) answers.want = st.want;
  // the routed broker, else the preview pick (the adviser W01 would choose: v4 shows the card before anything is asked)
  let b = lead.broker_id && broker ? broker : null;
  if (!b && !lead.broker_id && Array.isArray(brokers)) {
    const p = pickAdviser(lead, brokers);
    b = p.adviser ? brokers.find((x) => String(x.id || x.broker_id) === p.adviser.id) || null : null;
  }
  const adviser = b ? adviserCard(b) : null;
  const methods = b ? brokerConfig(b).methods_supported.filter((m) => PAGE_METHODS.includes(m)) : [];
  const bk = booking && booking.appointment_date ? { start: iso(ms(booking.appointment_date)), end: iso(ms(booking.ends_at || booking.appointment_date)), method: booking.method || null,
    held: booking.status === 'pending_verification' } : null;
  const contact = {};
  if (lead.call_number) contact.call_number = prettyPhone(lead.call_number) || lead.call_number;
  if (lead.alt_number) contact.alt_number = prettyPhone(lead.alt_number) || lead.alt_number;
  return { status: 200, body: { first_name: firstWord(lead.first_name), phone_pretty: prettyPhone(lead.phone), adviser, methods, answers, contact, booking: bk } };
}

/** One key per call: phase (a) and the confirm (b) of the same request_id are separate calls, each idempotent. */
export const answersKey = (leadId, requestId, confirm = false) => `w39:answers:${leadId}:${requestId}${confirm ? ':confirm' : ''}`;

/**
 * One answers post -> the plan the workflow executes.
 * x = { lead (row: id, brand_id, broker_id, first_name, phone, stage, conv_state, opted_out_at, erased), answers, request_id,
 *       prior (payload of the activity with this request's key, or null), now, oobAgeBooks }
 * Returns { kind: 'reject', status, body } | { kind: 'replay', path } |
 *         { kind: 'work', path, key, set, activity, notes[], send, escalate, route, thread_stage }
 * set = the leads columns to write (the W39 "Save" statement reads each key; conv_state is MERGED into the row's jsonb).
 */
export function decideAnswers({ lead, answers, request_id, confirm_adviser = null, prior = null, now = Date.now(), oobAgeBooks = OUT_OF_BAND_AGE_BOOKS } = {}) {
  const g = leadGate(lead);
  if (!g.ok) return { kind: 'reject', status: g.status, body: g.body, reason: g.reason };
  // the same call again: nothing is written twice; a cover path still recomputes the adviser (two phases, below)
  if (prior && prior.path) return { kind: 'replay', path: prior.path, cover: COVER_PATHS.has(prior.path), confirm_adviser };
  const at = iso(now);
  const a = answers || {};
  if (Array.isArray(a.topics)) return decideV4Answers({ lead, answers: a, request_id, at });
  const first = firstWord(lead.first_name);
  const help = HELP_WITH_OF[a.intent] || null;
  const start = { intent: a.intent, ...(a.has_cover ? { has_cover: a.has_cover } : {}), ...(a.want ? { want: a.want } : {}), at, via: 'start_page', request_id };
  const set = { conv_state: { start, ...(help ? { help_with: help } : {}) } };
  if (a.age_band) set.age_band = a.age_band;
  if (a.budget_band) set.budget_band = a.budget_band;
  if (a.has_cover && workCoverOf(a.has_cover) !== null) set.work_cover = workCoverOf(a.has_cover); // the pre-call brief's "cover through work"
  if (REASONS_OF[a.intent]) set.reasons = REASONS_OF[a.intent];
  // A web lead (/start/ page, W01 origin 'page') has never messaged us: no 24-h WhatsApp session, so no session text is ever
  // planned for it. Its will / other answer goes to a person (escalation) instead; templates (W01 held notice, W06 intro
  // card after booking) are unaffected. A WhatsApp lead (origin ctwa / comment / dm) wrote to us, so Lindi's line is a session text.
  const session = lead.origin !== 'page';
  const send = (text, tag) => (session && lead.phone ? { to: lead.phone, kind: 'text', text, lead_id: lead.id, correlation: `w39:${tag}:${lead.id}` } : null);
  const key = answersKey(lead.id, request_id, !!confirm_adviser);
  const plan = (path, extra) => ({ kind: 'work', path, key, set, notes: [], send: null, escalate: null, cover: false, confirm_adviser, thread_stage: 'done',
    ...extra, activity: { activity_type: 'start_page_answers', idempotency_key: key, payload: { path, ...a, request_id, via: 'start_page', ...(confirm_adviser ? { confirm_adviser } : {}) } } });

  if (a.intent === 'will') {
    set.product_interest = 'wills';
    set.conv_state.state = 'handoff';
    return plan('will', { send: send(WILLS_TEXT(first), 'will'), escalate: { note: 'start page: wills, no wills calendar; a person books the Capital Legacy call' } });
  }
  if (a.intent === 'other') {
    set.conv_state.state = 'unbooked';
    return plan('other', { send: send(OTHER_TEXT, 'other'), ...(session ? {} : { escalate: { note: 'start page web lead: "something else", no WhatsApp session; a person follows up' } }) });
  }
  const ageIn = QUAL_AGE.has(a.age_band);
  if (!ageIn && !oobAgeBooks) {
    // W03 outOfBand(): not handed over, deleted within 24 h, the same polite close
    Object.assign(set, { disqualified_reason: 'age_band', stage: 'disqualified', retention_delete_after: new Date(now + OUT_OF_BAND_RETENTION_H * H).toISOString() });
    set.conv_state.state = 'closed_oob';
    return plan('oob_close', { send: send(OOB_TEXT, 'oob'), thread_stage: 'closed' });
  }
  set.conv_state.state = 'unbooked'; // the state W07 is in after qualifying (offers times, handles chat)
  // every age books and counts (Jono, 18 Oct 2026): qualified follows the budget band alone (tier A/B), as in the chat and the lead ad
  if (QUAL_BUDGET.has(a.budget_band)) Object.assign(set, { qualified_at: at, stage: 'qualified' });
  // tier C (lt750): the band only; the routing trigger holds it unless the broker has the standing yes (finishPageBudget)
  return plan(a.budget_band === LOW_BUDGET ? 'route_tier_c' : 'route', { cover: true });
}

const COVER_PATHS = new Set(['route', 'route_tier_c', 'oob_book', 'adviser']);

/**
 * v4 answers (after booking; never routes): leads.age_band + income_band, conv_state.start = { topics, at, via, request_id },
 * help_with from the first topic that is not a will (a will alone -> wills), leads.reasons where they map (life -> life_cover,
 * disability_income -> disability), qualified_at + stage qualified only when isQualifiedV4 (income R15k+ and age 35-50; the
 * stage only moves forward from the pre-booking stages, so a booked lead stays booked; counting never reads qualified_at). 'will' -> a timeline note + a console escalation for a person:
 * wills are a separate project, nothing is routed and product_interest is NOT set (it would hold a routed lead, migration 03).
 */
function decideV4Answers({ lead, answers: a, request_id, at }) {
  const key = answersKey(lead.id, request_id);
  const firstCover = a.topics.find((t) => t !== 'will') || a.topics[0];
  const reasons = [...new Set(a.topics.map((t) => TOPIC_REASONS[t]).filter(Boolean))];
  const set = { age_band: a.age_band, income_band: a.income_band,
    conv_state: { start: { topics: a.topics, at, via: 'start_page', request_id }, help_with: TOPIC_HELP_WITH[firstCover], via: 'start_page' } };
  if (isQualifiedV4(a.age_band, a.income_band)) Object.assign(set, { qualified_at: at, stage: 'qualified' });
  const low = LOW_INCOME.includes(a.income_band);
  if (low) set.conv_state.income_flag = 'low';
  if (reasons.length) set.reasons = reasons;
  const will = a.topics.includes('will');
  const notes = [];
  if (will) notes.push({ activity_type: 'start_page_will_requested', idempotency_key: `w39:will:${lead.id}`,
    payload: { topics: a.topics, via: 'start_page', note: 'wills are a separate project: a person follows up; nothing routed' } });
  if (low) notes.push({ activity_type: 'start_page_low_income', idempotency_key: `w39:low_income:${lead.id}`, payload: { income_band: a.income_band, via: 'start_page', note: 'internal flag only: never held or rejected' } });
  return { kind: 'work', path: 'answers_v4', key, set, notes, send: null, cover: false, confirm_adviser: null, thread_stage: 'done', next: 'done',
    escalate: will ? { note: 'start page: the lead also asked for help with a will (wills are a separate project, nothing routed); a person follows up' } : null,
    activity: { activity_type: 'start_page_answers', idempotency_key: key, payload: { path: 'answers_v4', ...a, request_id, via: 'start_page' } } };
}

// ---------------------------------------------------------------- POST /start/adviser (v4: the card first, no answers)
export const adviserKey = (leadId, requestId, confirm = false) => `w39:adviser:${leadId}:${requestId}${confirm ? ':confirm' : ''}`;
/**
 * The two-phase confirm without answers. The plan only marks the lead as on the page (conv_state.via start_page, which W05
 * bandKnown reads: a start-page booking is never held for the budget band) and cancels W03's stall; coverStep() then decides
 * (no confirm -> the card; confirm = the pick -> adviser_disclosed, then W01 routes with first_touch false + expect_broker_id).
 */
export function decideAdviser({ lead, request_id, confirm_adviser = null, prior = null, now = Date.now() } = {}) {
  const g = leadGate(lead);
  if (!g.ok) return { kind: 'reject', status: g.status, body: g.body, reason: g.reason };
  if (prior && prior.path) return { kind: 'replay', path: prior.path, cover: true, confirm_adviser };
  const at = iso(now);
  const cs = lead.conv_state || {};
  const key = adviserKey(lead.id, request_id, !!confirm_adviser);
  const conv = { via: 'start_page', ...(!cs.state || QUALIFYING_STATES.has(cs.state) ? { state: 'unbooked' } : {}) };
  return { kind: 'work', path: 'adviser', key, set: { conv_state: conv }, notes: [], send: null, escalate: null, cover: true, confirm_adviser, thread_stage: 'done',
    activity: { activity_type: 'start_page_adviser', idempotency_key: key, payload: { path: 'adviser', request_id, at, via: 'start_page', ...(confirm_adviser ? { confirm_adviser } : {}) } } };
}

// ---------------------------------------------------------------- POST /start/contact (phone calls, before /book)
export const contactKey = (leadId, requestId) => `w39:contact:${leadId}:${requestId}`;
/**
 * leads.call_number = the number the adviser calls when it is not the WhatsApp number (null = "use my WhatsApp number";
 * W05 books lead.call_number || lead.phone), leads.alt_number + alt_purpose 'reach_fallback' (the optional "in case we can't
 * reach you" number; dropped when it equals the number he will call). A new call_number clears its old line type check.
 * The timeline row keeps no numbers. One row per request_id: a repeat answers { ok: true } and writes nothing.
 */
export function decideContact({ lead, call_number = null, alt_number = null, request_id, prior = null, now = Date.now() } = {}) {
  const g = leadGate(lead);
  if (!g.ok) return { kind: 'reject', status: g.status, body: g.body, reason: g.reason };
  if (prior && prior.path) return { kind: 'replay', path: prior.path };
  const call = call_number && call_number !== lead.phone ? call_number : null;
  const effective = call || lead.phone || null;
  const alt = alt_number && alt_number !== effective ? alt_number : null;
  const key = contactKey(lead.id, request_id);
  return { kind: 'work', path: 'contact', key,
    set: { call_number: call, alt_number: alt, alt_purpose: alt ? 'reach_fallback' : null, call_number_changed: call !== (lead.call_number || null) },
    activity: { activity_type: 'start_page_contact', idempotency_key: key, payload: { path: 'contact', request_id, at: iso(now), via: 'start_page', call: call ? 'other_number' : 'whatsapp_number', alt: !!alt } } };
}
export const contactAnswer = (plan) => (!plan || plan.kind === 'reject' ? { status: (plan && plan.status) || 401, body: (plan && plan.body) || { error: 'try_again' } } : { status: 200, body: { ok: true } });

// ---------------------------------------------------------------- POST /start/move (reschedule from the page, v4.6)
export const MOVE_HORIZON_DAYS = 14; // W04 horizon_days, measured from NOW (generateSlots latest = now + horizon), never from the old booking
const ISO_TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;
/** POST /start/move body: { slot_start, method?, request_id }. A slot in the past or past now + 14 days -> 400 field slot_start. */
export function parseMove(body = {}, nowMs = Date.now()) {
  const b = asBody(body);
  if (!b) return fieldErr('body');
  if (typeof b.request_id !== 'string' || !REQUEST_ID.test(b.request_id)) return fieldErr('request_id');
  if (typeof b.slot_start !== 'string' || !ISO_TS.test(b.slot_start) || !Number.isFinite(Date.parse(b.slot_start))) return fieldErr('slot_start');
  const t = Date.parse(b.slot_start);
  if (t <= nowMs || t > nowMs + MOVE_HORIZON_DAYS * 24 * H) return fieldErr('slot_start');
  if (b.method !== undefined && b.method !== null && b.method !== '' && !PAGE_METHODS.includes(b.method)) return fieldErr('method');
  return { ok: true, request_id: b.request_id, slot_start: iso(t), method: b.method || null };
}
export const moveKey = (leadId, requestId) => `w39:move:${leadId}:${requestId}`;
/**
 * The move is W10's own (one implementation): its 'pick' op with the slot payload W10 already parses (slot_<start>:resched:<id>):
 * claim key, W04 is_free re-check (14 days from now, the same rules), the row moved in place (the old time is freed only by that
 * update), Graph PATCH, W09 rebuild, the adviser's "moved" notice and the client email. A held booking (waiting on the email
 * link) moves and stays held (W10 move_held). A method change on the same call goes through W10 change_method afterwards.
 * booking = the lead's live appointment (GET /start's). Returns { kind: 'reject'|'none'|'same'|'move', ... }.
 */
export function moveRequest({ lead, booking, req, now = Date.now() } = {}) {
  const g = leadGate(lead);
  if (!g.ok) return { kind: 'reject', status: g.status, body: g.body, reason: g.reason };
  if (!booking || !booking.id || !booking.appointment_date) return { kind: 'none', status: 409, body: { error: 'no_booking' } };
  const methodChange = req.method && req.method !== booking.method ? req.method : null;
  const key = moveKey(lead.id, req.request_id);
  const w10 = { source: 'W39', lead_id: lead.id, lead: { id: lead.id }, booking: { id: String(booking.id) }, msg: { list_id: `slot_${req.slot_start}:resched:${booking.id}`, wamid: `w39move:${req.request_id}` }, idempotency_key: key };
  const method = methodChange ? { source: 'W39', lead_id: lead.id, lead: { id: lead.id }, booking: { id: String(booking.id) }, delegate: { action: 'change_method', method: methodChange },
    msg: { payload: `change_method:${methodChange}:${booking.id}`, wamid: `w39method:${req.request_id}` }, idempotency_key: `${key}:method` } : null;
  if (ms(booking.appointment_date) === ms(req.slot_start)) return { kind: methodChange ? 'method_only' : 'same', w10: null, method };
  return { kind: 'move', w10, method, slot_start: req.slot_start };
}
/** After W10 ran (waits): the re-read appointment decides the answer. Moved -> 200 { ok, moved, booking }; else 409 slot_taken. */
export function moveAnswer({ plan, after = null } = {}) {
  if (!plan || plan.kind === 'reject') return { status: (plan && plan.status) || 401, body: (plan && plan.body) || { error: 'try_again' } };
  if (plan.kind === 'none') return { status: plan.status, body: plan.body };
  const view = (a) => ({ start: iso(ms(a.appointment_date)), end: iso(ms(a.ends_at || a.appointment_date)), method: a.method || null, held: a.status === 'pending_verification' });
  if (!after || !after.appointment_date) return { status: 409, body: { error: 'no_booking' } };
  if (plan.kind === 'same' || plan.kind === 'method_only') return { status: 200, body: { ok: true, moved: false, booking: view(after) } };
  return ms(after.appointment_date) === ms(plan.slot_start) ? { status: 200, body: { ok: true, moved: true, booking: view(after) } } : { status: 409, body: { error: 'slot_taken' } };
}

// ---------------------------------------------------------------- disclosure before routing (two phases, 18 Oct 2026)
// A lead sees the adviser card and the disclosure BEFORE it is routed. Phase (a), no confirm_adviser: the answers are stored
// and the broker W01 WOULD choose is computed (routingFor: the same tier / product / named-consent rules as routeExisting);
// nothing is written to broker_id -> next 'adviser'. Phase (b), confirm_adviser = that broker's id: the pick is computed
// again; equal -> 'adviser_disclosed' on the timeline, THEN W01 routes (expect_broker_id: W01 routes nobody else);
// different -> the new adviser, no routing; none -> chat.

/** brokers row (W39 "Load lead + brokers (pick)") -> the card the page shows. Never an email, number or calendar field. */
export const adviserCard = (b) => (b ? { id: String(b.id || b.broker_id), first_name: firstWord(b.adviser_name || b.contact_person), name: b.adviser_name || b.contact_person || null,
  firm: b.firm_name || b.practice_name || null, fsp: b.fsp_number || null, bio: approvedBio(b), photo_url: approvedPhoto(b) } : null);

/**
 * The adviser this lead has, or would get. lead = { id, broker_id, routed_at, consent_text, consent_mode, brand_id, budget_band,
 * product_interest, disqualified_reason, opted_out_at, suppressed }, brokers = the W01 core broker list (+ display columns).
 * Returns { adviser, routed } | { adviser: null, held: reason }.
 */
export function pickAdviser(lead = {}, brokers = []) {
  const byId = (id) => brokers.find((b) => String(b.id || b.broker_id) === String(id)) || null;
  if (lead.broker_id && lead.routed_at) return { adviser: adviserCard(byId(lead.broker_id) || { id: lead.broker_id }), routed: true };
  if (lead.opted_out_at || lead.disqualified_reason || lead.suppressed) return { adviser: null, held: 'not_routable' };
  // v4: the page asks no budget. An unknown band is provisional tier B, exactly W01's page budget_pending rule (a broker who
  // takes R750-R1,499 also takes R1,500+); W01 routeExisting reads the same null band the same way (only tier C narrows).
  const r = routingFor(lead.consent_text, lead.consent_mode || 'named', brokers, lead.brand_id, tierOf(lead.budget_band) || 'B', lead.product_interest || null);
  return r.held ? { adviser: null, held: r.held } : { adviser: adviserCard(r.broker), routed: false };
}

/** W01 Lead core input: the same routing as W03's route_and_first_touch, without the W06 first touch, and only to `expect`. */
export const routeInput = (leadId, expect) => ({ kind: 'route_and_first_touch', lead_id: leadId, first_touch: false, expect_broker_id: expect, source: 'W39' });
/** W01 Lead core input when nobody can take the lead: record the hold (+ the one tier-C notice), never route. */
export const holdInput = (leadId) => ({ kind: 'route_and_first_touch', lead_id: leadId, first_touch: false, hold_only: true, source: 'W39' });

/**
 * A cover path, after the answers are stored: what to do next. `steps` run in this order, so the disclosure row is written
 * BEFORE the routing call, never after. Returns { next, adviser?, steps: [], disclose?, route?, hold?, held?, changed? }.
 */
export function coverStep({ plan, lead, brokers = [] } = {}) {
  const pick = pickAdviser(lead, brokers);
  const confirm = plan && plan.confirm_adviser ? String(plan.confirm_adviser) : null;
  if (!pick.adviser) return lead.broker_id ? { next: 'chat', steps: [], held: pick.held } : { next: 'chat', steps: ['hold'], hold: holdInput(lead.id), held: pick.held };
  if (!confirm || confirm !== pick.adviser.id) return { next: 'adviser', adviser: pick.adviser, steps: [], ...(confirm ? { changed: true } : {}) };
  const disclose = { activity_type: 'adviser_disclosed', idempotency_key: `w39:disclosed:${lead.id}:${pick.adviser.id}`, broker_id: pick.adviser.id,
    payload: { broker_id: pick.adviser.id, fsp: pick.adviser.fsp, firm: pick.adviser.firm, adviser: pick.adviser.name, disclosure_version: DISCLOSURE_VERSION, via: 'start_page' } };
  if (pick.routed) return { next: 'slots', adviser: pick.adviser, steps: ['disclose'], disclose };
  return { next: 'slots_if_routed', adviser: pick.adviser, steps: ['disclose', 'route'], disclose, route: routeInput(lead.id, pick.adviser.id) };
}

/** The answers response + the side effects to run (only for the request that actually claimed its key). */
export function answer({ plan, step = null, broker_id = null, claimed = false } = {}) {
  if (!plan || plan.kind === 'reject') return { status: (plan && plan.status) || 401, body: (plan && plan.body) || { error: 'try_again' }, effects: [] };
  let body = { ok: true, next: plan.next || (plan.path === 'answers_v4' ? 'done' : 'chat') };
  if (plan.cover && step) {
    if (step.next === 'adviser') body = { ok: true, next: 'adviser', adviser: step.adviser };
    else if (step.next === 'slots') body = { ok: true, next: 'slots' };
    // routed by this call: slots only when W01 put the confirmed broker on the row (it routes nobody else)
    else if (step.next === 'slots_if_routed') body = { ok: true, next: broker_id && String(broker_id) === step.adviser.id ? 'slots' : 'chat' };
  }
  const effects = plan.kind === 'work' && claimed ? [plan.send && { kind: 'send', message: plan.send }, plan.escalate && { kind: 'escalate', note: plan.escalate.note }].filter(Boolean) : [];
  return { status: 200, body, effects };
}
