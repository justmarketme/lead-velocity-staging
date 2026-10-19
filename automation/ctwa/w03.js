'use strict';
// W03 Click-to-WhatsApp intake: pure logic (no I/O). automation/W03.json inlines this file into its Code nodes;
// automation/tests/W03.test.mjs runs it offline against fixtures/synthetic-leads.json.
// Sources: 4.6 CTWA steps 1-4 + 7, automation/W03-notes.md (A.2 redirect, A.3 readOrigin), 0.1 consent mode `named`.
// Which of my five: Chili Piper (one chat, no hand-off), Meta Cloud API (referral, interactive, 72-h window),
// HBR (routing ends in W06 first touch < 60 s; nothing here waits).

const crypto = require('crypto');

// ---------------------------------------------------------------- redirect (I-09, W03-notes A.2)
const REDIRECT_REF_RE = /^(cmt_(\d{5,20}|org_\d{5,20}_\d{5,20})|dm_(messenger|instagram))$/;
// 18 Oct 2026 (Jono): all four ads pre-fill the booking sentence. W07 still recognises the old "check my life cover" opener.
const PREFILL = "Hi, I'd like to book a 30-minute call with an adviser.";

/** GET {CTWA_BASE_URL}/{ref} -> 302 to wa.me only. waDigits comes from the brands row, never from the URL. */
function redirectFor(ref, waDigits, uaHeader = '') {
  if (!/^27\d{9}$/.test(String(waDigits || ''))) throw new Error('brand WhatsApp number not configured');
  const ok = REDIRECT_REF_RE.test(String(ref || ''));
  const text = ok ? `${PREFILL} (ref ${ref})` : PREFILL;
  const ua = String(uaHeader).toLowerCase();
  const uaClass = /iphone|ipad|ios/.test(ua) ? 'ios' : /android/.test(ua) ? 'android' : /windows|macintosh|linux|cros/.test(ua) ? 'desktop' : 'other';
  return {
    status: 302,
    headers: { Location: `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    click: { ref: ok ? ref : null, ua_class: uaClass }, // counting fields only (no IP, no full UA, no cookie); not stored in the CRM chain
  };
}

// ---------------------------------------------------------------- origin (W03-notes A.3, verbatim rule)
const REF_RE = /\(ref ((?:cmt_(?:org_)?[0-9_]{5,45})|dm_(?:messenger|instagram))\)\s*$/;
function readOrigin(msg) {
  const r = msg.referral || null;
  const body = msg.type === 'text' ? (msg.text && typeof msg.text === 'object' ? msg.text.body : msg.text) || '' : '';
  const m = msg.type === 'text' ? REF_RE.exec(body) : null;
  const ref = m ? m[1] : null;
  const fromRef = ref && ref.startsWith('cmt_') ? 'comment' : ref && ref.startsWith('dm_') ? 'dm' : null;
  const refAd = ref ? /^cmt_(\d{5,20})$/.exec(ref) : null;
  return {
    origin: r ? 'ctwa' : fromRef || 'ctwa',
    ref,
    ad_id: r && r.source_type === 'ad' ? r.source_id : refAd ? refAd[1] : null,
    ctwa_clid: (r && r.ctwa_clid) || null,
    referral_source_type: (r && r.source_type) || null,
    referral_source_id: (r && r.source_id) || null,
    text_without_ref: m ? body.replace(REF_RE, '').trim() : msg.type === 'text' ? body : null,
  };
}

// ---------------------------------------------------------------- consent (0.1: named while one broker)
// v3 (Jonathan, 2026-10-07): scope 'life cover' -> 'insurance and financial planning', same as landing/config/consent.json
// CONSENT-NAMED-v3 / CONSENT-GENERIC-v3, because the capture Flow asks about funeral, retirement, investments and disability too.
const CONSENT_GENERIC_TEXT = "Before we start: if it's a fit, we'll share your details with an authorised financial services provider who'll contact you about insurance and financial planning. OK to continue?";
const CONSENT_GENERIC_VERSION = 'ctwa-generic-v3';
const CONSENT_NAMED_VERSION = 'ctwa-named-v3';
const CONSENT_NAMED_FOOTER = 'Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy';
const WA_BUTTON_BODY_MAX = 1024; // Cloud API interactive body limit
function consentFor(mode, broker) {
  if (mode === 'generic') return { version: CONSENT_GENERIC_VERSION, mode: 'generic', text: CONSENT_GENERIC_TEXT };
  if (!broker || !broker.practice_name || !broker.fsp_number) return null; // named mode needs a named broker
  return {
    version: CONSENT_NAMED_VERSION,
    mode: 'named',
    // v2 (compliance-qa review 4 §2a): one added line = responsible party + opt-out route + privacy link, so the
    // WhatsApp consent record is equivalent evidence to the landing named consent. Body stays < 1,024 chars (button body limit).
    text: `Before we start: if it's a fit, we'll share your details with ${broker.practice_name} (FSP ${broker.fsp_number}), an authorised financial services provider who'll contact you about insurance and financial planning. OK to continue?\n\n${CONSENT_NAMED_FOOTER}`,
  };
}

// ---------------------------------------------------------------- website opener (sites/sortmycover/docs/WHATSAPP-OPENERS.md)
// 17 Oct 2026: WhatsApp is the only way to book. The site's chat widget asks for the consent tick, then opens wa.me with:
//   Hi Lindi, I'd like to chat about <topic>. I agree that SortMyCover may message me on WhatsApp about this and share my
//   details with <who>. Ref <code>
// An unchanged opener IS the consent, in the person's own words, so W03 stores the lead at once (no consent buttons).
// Edited text that drops the consent sentence never matches, and the normal consent question is asked instead.
// Parse defensively: the person can edit the text, and phones swap ' for a curly apostrophe.
const OPENER_RE = /^\s*Hi Lindi,\s+I['’]d like to chat about (.+?)\.\s+(I agree that SortMyCover may message me on WhatsApp about this and share my details with (.+?)\.)\s+Ref ([a-z0-9-]{2,40})(?:\s+via\s+([a-z0-9_\/-]{1,120}))?\s*$/i;
const OPENER_CONSENT_VERSION = 'CONSENT-GENERIC-v5web';
const OPENER_CONSENT_SOURCE = 'whatsapp_opener';
// site page codes (w-*) and campaign landing pages (a01-a06, b01-b04: the angle's neutral meta_code)
const OPENER_REF_RE = /^(w-[a-z0-9-]{1,30}|[ab]\d{2})$/;
/** Opener text -> { topic, who, consent_text, ref, source, product_interest, reasons, wills } or null (no match / unknown ref). */
function parseOpener(text) {
  const m = OPENER_RE.exec(String(text || ''));
  if (!m) return null;
  const ref = m[4].toLowerCase();
  if (!OPENER_REF_RE.test(ref)) return null;
  const topic = m[1].trim().slice(0, 120);
  const who = m[3].trim().slice(0, 80);
  const wills = /capital legacy/i.test(who) || /\b(will|wills|guardian)\b/i.test(topic) || /^b\d{2}$/.test(ref) || /will/.test(ref);
  const income = !wills && /income|salary|disab/i.test(topic);
  // group 5 (optional): where the visitor came from before the page, "<source>/<campaign>/<content>" (site sourceTag())
  const [vs, vc, vt] = String(m[5] || '').toLowerCase().split('/');
  const via = vs ? { source: vs.slice(0, 24), campaign: vc ? vc.slice(0, 64) : null, content: vt ? vt.slice(0, 64) : null } : null;
  return {
    topic, who, ref, wills, via,
    consent_text: m[2].replace(/’/g, "'"), // the consent sentence exactly as sent
    // leads_source_check allows a category only; the exact code is kept in leads.ref
    source: /^[ab]\d{2}$/.test(ref) ? 'campaign' : 'website_form',
    product_interest: wills ? 'wills' : 'life_cover',
    reasons: wills ? null : [income ? 'disability' : 'life_cover'],
  };
}
/** The first reply to an opener: greet, name the topic (the welcome option, pre-selected), then the next step. */
function openerGreeting(op, profileName) {
  const first = String(profileName || '').trim().split(/\s+/)[0].replace(/[^\p{L}' -]/gu, '').slice(0, 30);
  const hi = first ? `Hi ${first}, I'm Lindi` : "Hi, I'm Lindi";
  // Jono, 17 Oct 2026: no "AI assistant" wording; Lindi introduces herself as SortMyCover's (same as the W07 fallbacks)
  return `${hi} from SortMyCover. Thanks for getting in touch about ${op.topic}. If it's something else, just tell me.`;
}

/**
 * Where an opt-in came from (Jono, 17 Oct 2026: "at any time ... see exactly where it came from"). One record per consent,
 * stored on the lead (consent_source = the door, ref, utm_*, ad_id, ctwa_clid) and in full in the consent activity payload.
 * Doors: whatsapp_opener (site / landing page chat, page code + optional via), ctwa_ad / ctwa_post (Twilio CTWA referral),
 * whatsapp_direct (anything else).
 */
function provenanceFor({ op = null, origin = {}, referral = null, wamid = null, at = null, text = '', version = null } = {}) {
  const r = referral && typeof referral === 'object' ? referral : null;
  const type = r && String(r.source_type || '').toLowerCase();
  const door = op ? 'whatsapp_opener' : r ? (type === 'post' ? 'ctwa_post' : 'ctwa_ad') : 'whatsapp_direct';
  return {
    door, page_ref: op ? op.ref : null, via: op ? op.via : null,
    referral: r ? { source_type: r.source_type || null, source_id: r.source_id || null, source_url: r.source_url || null, headline: r.headline || null, ctwa_clid: r.ctwa_clid || null } : null,
    comment_ref: !op && origin.ref ? origin.ref : null,
    consent_version: version, opener_text: String(text || '').slice(0, 600), inbound_sid: wamid, received_at: at,
  };
}

/**
 * One public.lead_optins row (append-only, migration 20261017150000_lead_optins.sql on feat/optin-provenance; contract in
 * side-session-notes OPTIN-PROVENANCE-CONTRACT-2026-10-17.md). channel is left null: a trigger derives it.
 */
function optinRecord(row) {
  const pv = row.provenance || {};
  const r = pv.referral || {};
  const v = pv.via || {};
  return {
    lead_id: row.id, brand_id: row.brand_id, ref_code: pv.page_ref || null,
    via_source: v.source || null, via_campaign: v.campaign || null, via_content: v.content || null,
    referral_source_type: r.source_type || null, referral_source_id: r.source_id || null, referral_source_url: r.source_url || null,
    referral_headline: r.headline || null, ctwa_clid: r.ctwa_clid || null,
    consent_version: row.consent_text_version, consent_text: row.consent_text || null, opener_text: pv.opener_text || null,
    message_sid: pv.inbound_sid || null, received_at: pv.received_at || row.consent_at, recorded_by: 'W03',
  };
}

// ---------------------------------------------------------------- tap-only questions (4.6 step 3)
const AGE_ROWS = [['age_under_35', 'Under 35'], ['age_35_44', '35 to 44'], ['age_45_50', '45 to 50'], ['age_51_plus', '51 or older']];
const BUDGET_ROWS = [['budget_under_500', 'Under R500 a month'], ['budget_500_750', 'R500 to R750'], ['budget_750_1250', 'R750 to R1,250'], ['budget_1250_1499', 'R1,250 to R1,499'], ['budget_1500_plus', 'R1,500 or more']];
// Quiz v2 (2026-10-14): a web lead whose page no longer asks the budget is asked with the approved qualify_budget template
// (W01 budgetQuestion: the five BUDGET_ROWS bands, forward-looking wording, never "what do you pay now"). A re-ask uses the
// same list and the same wording; the tap ids are the template's, so one vocabulary serves lead-ad and web leads.
const BOND_ROWS = [['bond_yes_dependants_yes', 'Bond and dependants'], ['bond_yes_dependants_no', 'Bond, no dependants'], ['bond_no_dependants_yes', 'Dependants, no bond'], ['bond_no_dependants_no', 'Neither']];
const METHOD_TITLES = { teams: 'Teams video call', zoom: 'Zoom video call', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone call' };
// 18 Oct 2026 (Jono): every age books AND counts toward the broker's order, so the age is asked (Mark wants it) but never closes
// the chat or disqualifies: QUAL_AGE is gone from W03; 'qualified' is the budget band alone (tier A/B), the same on /start/ (W39)
// and the Instant Form (W01 / finishLeadAd).
const QUAL_BUDGET = new Set(['750_1250', '750_1499', '1250_plus', '1250_1499', '1500_plus']); // 0.1: every band from R750 up qualifies (1250_plus = legacy pre-split)
// Tier C (Jonathan, 2026-10-11): under R750 is NOT out of band. The answer is recorded (lt750) and the questions go on; W01
// routes it only to a broker with the standing yes (brokers.accepts_low_budget) or holds it (held_low_budget).
const LOW_BUDGET = new Set(['under_500', '500_750', 'lt750', 'under_750']);
// fixture/quiz codes -> leads_smc_checks codes (schema uses lt35 / 51plus / lt750 / 1250plus)
const AGE_TO_DB = { under_35: 'lt35', '35_44': '35_44', '45_50': '45_50', '51_plus': '51plus' };
const BUDGET_TO_DB = { under_500: 'lt750', '500_750': 'lt750', under_750: 'lt750', '750_1250': '750_1250', '750_1499': '750_1499', '1250_plus': '1250plus', '1250_1499': '1250_1499', '1500_plus': '1500_plus' };
// a "not sure" tap, in any of the spellings the two lists use, is the clarify path (one re-ask), never a band
const UNSURE_IDS = new Set(['unsure', 'not_sure', 'budget_unsure', 'budget_not_sure']);
const METHOD_TO_DB = { teams: 'teams', zoom: 'zoom', meet: 'meet', google_meet: 'meet', whatsapp_call: 'whatsapp_call', phone: 'phone' };
const STALL_HOURS = [1, 20, 68]; // 4.6 step 7, inside the 72-h CTWA window
BUDGET_TO_DB.lt750 = 'lt750'; // typed "<750" (I-47a)
// I-47a: qualifying order is 4.6 step 3 (age -> budget -> bond/dependants -> method); NH-59 default applied.
const Q_STAGES = ['q_age', 'q_budget', 'q_budget_clarify', 'q_bond', 'q_dependants', 'q_method'];
const STAGE_OF = { q_age: 'q_age', q_budget: 'q_budget', q_budget_clarify: 'q_budget_clarify', q_bond: 'q_bond', q_dependants: 'q_bond', q_method: 'q_method' };
const NEXT_STATE = { q_age: 'q_budget', q_budget: 'q_bond', q_budget_clarify: 'q_bond', q_bond: 'q_method', q_method: 'unbooked' }; // leads.conv_state.state after an answer
// NLU bands (conversation/logic.mjs BANDS) -> the tap id W03 would have received (then -> DB codes via AGE_TO_DB / BUDGET_TO_DB).
const NLU_AGE = { '<35': 'age_under_35', '35-44': 'age_35_44', '45-50': 'age_45_50', '51+': 'age_51_plus' };
const NLU_BUDGET = { '<750': 'budget_lt750', '750-1250': 'budget_750_1250', '1250+': 'budget_1250_plus', '1250-1499': 'budget_1250_1499', '1500+': 'budget_1500_plus' };
const DB_TO_AGE = { lt35: 'under_35', '35_44': '35_44', '45_50': '45_50', '51plus': '51_plus' };
const DB_TO_BUDGET = { lt750: 'lt750', '750_1250': '750_1250', '750_1499': '750_1499', '1250plus': '1250_plus', '1250_1499': '1250_1499', '1500_plus': '1500_plus' };
const MAX_HOPS = 3; // I-48b: at most 3 W03/W05/W07 hand-backs per inbound message
/** I-48b hop limit: hops already taken by this message -> { hops (after this hand-back), over }. */
function hopNext(hops) { const h = (Number(hops) || 0) + 1; return { hops: h, over: h > MAX_HOPS }; }

/** I-47a: typed answer (W07 intent-slot NLU slots) -> tap id for the current stage; 'unsure' for a budget "not sure"; null = no answer. */
function typedTap(stage, slots) {
  const s = slots || {};
  if (stage === 'q_age') return NLU_AGE[s.age_band] || null;
  if (stage === 'q_budget' || stage === 'q_budget_clarify') return s.budget_band === 'unsure' ? 'unsure' : NLU_BUDGET[s.budget_band] || null;
  if (stage === 'q_bond') {
    if (typeof s.bond !== 'boolean' && typeof s.dependants !== 'boolean') return null;
    return `bond_${s.bond === true ? 'yes' : 'no'}_dependants_${s.dependants === true ? 'yes' : 'no'}`;
  }
  if (stage === 'q_method') return s.method && METHOD_TO_DB[s.method] ? `method_${s.method}` : null;
  return null;
}

/** I-47a: a lead W07 owns (no wa_thread) whose conv_state is q_*: rebuild the thread from the lead row. */
function threadFromLead(lead) {
  const st = lead && lead.conv_state && lead.conv_state.state;
  if (!lead || !lead.id || !Q_STAGES.includes(st)) return null;
  const answers = {};
  if (lead.age_band && DB_TO_AGE[lead.age_band]) answers.age_band = DB_TO_AGE[lead.age_band];
  if (lead.budget_band && DB_TO_BUDGET[lead.budget_band]) answers.budget_band = DB_TO_BUDGET[lead.budget_band];
  if (typeof lead.bond === 'boolean') answers.bond = lead.bond;
  if (typeof lead.dependants === 'boolean') answers.dependants = lead.dependants;
  return { stage: STAGE_OF[st], lead_id: lead.id, answers, from_lead: true, broker_id: lead.broker_id || null, origin: lead.origin || null };
}

// ---------------------------------------------------------------- /start/ page (brand flag start_page, 18 Oct 2026)
// Jono approved a branded page that replaces the qualifying taps: ONE call-to-action message (header image, body, one URL
// button) opens sortmycover.co.za/start/#lt=<lt1 token> (token in the fragment, CONTRACTS.md lead_token). The page answers
// through W39 (POST /start/answers), which routes the lead and shows the slots. Off by default (brands.start_page);
// with the flag off, or without a token from the workflow, nothing changes. Anything typed or tapped in chat while the
// page is pending falls back to the tap path (q_age) exactly as before, so the chat still works on its own.
const START_PAGE_LINK = 'https://sortmycover.co.za/start/#lt=';
// Jono 19 Oct 2026: the Start here card carries the welcome banner (header-welcome), every lead-facing message its own banner.
const START_PAGE_HEADER = 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-welcome.png';
const START_PAGE_BUTTON = 'Start here';
const firstWord = (s) => String(s || '').trim().split(/\s+/)[0].replace(/[^\p{L}' -]/gu, '').slice(0, 30);
/** How the page works, one step per line (Jono, 19 Oct 2026, words fixed). No "free", no "AI", no operator name. */
const START_PAGE_STEPS = "Here's how it works:\n" +
  '1. Pick a time for your 30-minute call: Microsoft Teams or phone.\n' +
  '2. Tell us where to send your invite.\n' +
  '3. Meet your adviser and answer two quick questions so they come prepared.\n' +
  "4. You're back here on WhatsApp.\n" +
  "I'll be here to guide you all the way.";
/**
 * The CTA body. `greeted`: the opener greeting already said "Hi {name}, I'm Lindi from SortMyCover", so only the steps follow.
 * No first name -> "Hi there,". `adviserFirst` is kept for callers; the copy no longer names the adviser.
 */
function startPageBody(profileName, adviserFirst, greeted = false) { // eslint-disable-line no-unused-vars
  const first = firstWord(profileName);
  if (greeted) return START_PAGE_STEPS;
  return `Hi ${first || 'there'}, I'm Lindi from SortMyCover. ${START_PAGE_STEPS}`;
}
/** ctx -> the token to put in the link, or null (flag off, or the workflow could not mint / send it). */
const startPageToken = (ctx) => (ctx.brand && ctx.brand.start_page === true && ctx.start_page && typeof ctx.start_page.token === 'string' && ctx.start_page.token ? ctx.start_page.token : null);
function startPageMessage(token, ctx, greet = null) {
  return { type: 'cta_url', header_image: START_PAGE_HEADER, button: START_PAGE_BUTTON, url: `${START_PAGE_LINK}${token}`,
    body: greet ? `${greet}\n\n${startPageBody(ctx.profile_name, ctx.broker && ctx.broker.adviser_first_name, true)}` : startPageBody(ctx.profile_name, ctx.broker && ctx.broker.adviser_first_name) };
}
/** A message while the page is pending: back to the tap path, first question, exactly as without the page. */
function startPageFallback(t, ctx, actions) {
  const lead = ctx.lead && ctx.lead.id === ctx.existing_open_lead_id ? ctx.lead : null;
  const base = t && t.stage === 'start_page' ? t : { lead_id: (lead && lead.id) || ctx.existing_open_lead_id, answers: {}, from_lead: true, broker_id: (lead && lead.broker_id) || null, origin: (lead && lead.origin) || null };
  const thread = { ...base, stage: 'q_age', answers: { ...(base.answers || {}) } };
  actions.push({ kind: 'update_lead', id: thread.lead_id, set: { conv_state_state: 'q_age' } });
  actions.push({ kind: 'send', message: question('q_age') });
  actions.push({ kind: 'schedule_stall', stage: 'q_age', hours: STALL_HOURS, from: ctx.at, replaces: true });
  return { thread, actions };
}

const list = (body, button, rows) => ({ type: 'list', body, button, rows: rows.map(([id, title]) => ({ id, title })) });
const buttons = (body, rows) => ({ type: 'button', body, buttons: rows.map(([id, title]) => ({ id, title })) });

function question(stage, broker) {
  if (stage === 'q_age') return list('Which age group are you in?', 'Choose age', AGE_ROWS);
  if (stage === 'q_budget') return list('Roughly what could you put towards cover each month?', 'Choose amount', BUDGET_ROWS);
  if (stage === 'q_bond') return list('Do you have a bond or people who depend on your income?', 'Choose one', BOND_ROWS);
  if (stage === 'q_method') {
    const ms = (broker && broker.methods_supported) || ['phone'];
    const rows = ms.filter((m) => METHOD_TITLES[m] || m === 'google_meet').map((m) => [`method_${m}`, METHOD_TITLES[m] || METHOD_TITLES.meet]);
    const body = `How would you like to talk to ${(broker && broker.adviser_first_name) || 'the adviser'}?`;
    return rows.length <= 3 ? buttons(body, rows) : list(body, 'Choose', rows);
  }
  return null;
}

/** id of a tap, whatever shape the Cloud API (or the fixture) used. */
function tapId(msg) {
  if (msg.payload) return msg.payload;
  if (msg.type === 'button' && msg.button) return msg.button.payload;
  if (msg.type === 'interactive' && msg.interactive) {
    const i = msg.interactive;
    return (i.button_reply && i.button_reply.id) || (i.list_reply && i.list_reply.id) || null;
  }
  return null;
}

const hashMobile = (e164) => crypto.createHash('sha256').update(e164).digest('hex');

/**
 * One inbound message -> new thread state + actions for the workflow to execute.
 * ctx: { at (iso), mobile (E.164), profile_name, lead_id (uuid to use on insert), broker (routed candidate or null),
 *        brand: { brand_id, consent_mode }, existing_open_lead_id, suppressed, wamid }
 * thread: null for a sender we have never seen; persisted by the workflow (wa_threads, keyed by mobile hash).
 */
function step(thread, msg, ctx) {
  const actions = [];
  // a stored placeholder ({ stage: 'none' }, written before I-47a when there was no thread) counts as no thread
  const t = thread && thread.stage && thread.stage !== 'none' ? { ...thread, answers: { ...(thread.answers || {}) } } : null;
  const send = (m) => actions.push({ kind: 'send', message: m });
  const stall = (stage) => actions.push({ kind: 'schedule_stall', stage, hours: STALL_HOURS, from: ctx.at, replaces: true });

  // I-47b: no brand row for the receiving number -> log + W22 signal; never stop silently, never store a thread.
  if (!ctx.brand || !ctx.brand.brand_id) return { thread: null, no_thread: true, actions: [{ kind: 'log_no_brand', phone_number_id: ctx.phone_number_id || null },
    { kind: 'alert', signal_key: 'w03_no_brand', scope: `pnid:${ctx.phone_number_id || 'none'}`, severity: 'red', source: 'W03', what: 'WhatsApp message to a number with no brands row (phone_number_id)', impact: 'CTWA leads on this number get no consent prompt', first_action: 'Set brands.phone_number_id for the receiving number' }] };
  if (ctx.suppressed) return { thread: t, actions: [{ kind: 'ignore', reason: 'suppressed' }] }; // STOP'd number: W15 owns it
  // /start/ page pending: the lead row is the truth when W03 has it (W39 moves it on once the page is answered), else the thread
  const openLead = ctx.existing_open_lead_id && ctx.lead && ctx.lead.id === ctx.existing_open_lead_id ? ctx.lead : null;
  const pagePending = openLead ? (openLead.conv_state && openLead.conv_state.state) === 'start_page' : !!(t && t.stage === 'start_page' && ctx.existing_open_lead_id);
  if (pagePending) return startPageFallback(t, ctx, actions);
  // a thread W03 rebuilt from a W07-owned lead (from_lead) is a cache only: the lead's conv_state stays the truth
  if (ctx.existing_open_lead_id && (!t || t.stage === 'done' || t.from_lead)) {
    const lt = threadFromLead(ctx.lead && ctx.lead.id === ctx.existing_open_lead_id ? ctx.lead : null);
    if (lt) return qualify(lt, msg, ctx, actions);
    return { thread: t, actions: [{ kind: 'forward_w07', lead_id: ctx.existing_open_lead_id, reason: 'existing_lead_90d' }] }; // merge, no new consent, no new WhatsApp card
  }

  // first contact: consent first, nothing stored but the thread state
  if (!t || t.stage === 'closed') {
    const origin = readOrigin(msg);
    // website opener: the unchanged opener carries the consent sentence, so the lead is stored now (WHATSAPP-OPENERS.md rule 1)
    const op = msg.type === 'text' ? parseOpener(origin.text_without_ref) : null;
    const firstText = origin.text_without_ref;
    delete origin.text_without_ref; // the thread is stored (wa_threads.state, "no PII in state"): the message text stays on the inbound row
    if (op) return openerIntake(op, origin, { ...ctx, referral: msg.referral || null, text: firstText }, actions);
    const consent = consentFor(ctx.brand.consent_mode, ctx.broker);
    if (!consent) {
      send({ type: 'text', body: "Thanks for getting in touch. We can't take new enquiries right now. Please try again in a few days." });
      return { thread: { stage: 'closed', origin, closed_reason: 'no_named_broker', at: ctx.at }, actions: actions.concat([{ kind: 'alert', signal_key: 'ctwa_no_broker' }]) };
    }
    send(buttons(consent.text, [['consent_yes', 'Yes, continue'], ['consent_no', 'No thanks']]));
    return { thread: { stage: 'await_consent', origin, consent, answers: {}, first_at: ctx.at, broker_id: ctx.broker ? ctx.broker.broker_id : null,
      first_wamid: ctx.wamid || null, first_referral: msg.referral || null }, actions }; // no free text in thread state: the SID points at the stored inbound
  }

  const id = tapId(msg);
  if (t.stage === 'await_consent') {
    if (id === 'consent_no') {
      actions.push({ kind: 'suppress', mobile_hash: hashMobile(ctx.mobile), source: 'no_consent_ctwa' });
      send({ type: 'text', body: 'No problem. We won’t contact you again. Take care.' });
      return { thread: { stage: 'closed', closed_reason: 'consent_no', at: ctx.at }, actions: actions.concat([{ kind: 'cancel_stall' }]) }; // origin + answers dropped
    }
    if (id === 'consent_yes') {
      const o = t.origin || {};
      const row = {
        id: ctx.lead_id, brand_id: ctx.brand.brand_id, origin: o.origin || 'ctwa', ref: o.ref || null, ad_id: o.ad_id || null,
        ctwa_clid: o.ctwa_clid || null, phone: ctx.mobile, first_name: ctx.profile_name || null,
        consent_text: t.consent.text, consent_text_version: t.consent.version, consent_mode: t.consent.mode,
        consent_at: ctx.at, consent_source: 'ctwa', verified_at: ctx.at, wa_delivered_at: t.first_at, stage: 'verified',
        is_synthetic: !!ctx.is_synthetic,
      };
      // provenance (17 Oct 2026): the door is decided by the FIRST message (t.origin / t.first_*), the evidence is this tap
      row.provenance = provenanceFor({ origin: o, referral: t.first_referral || null, wamid: ctx.wamid, at: ctx.at, text: '', version: t.consent.version });
      row.provenance.first_inbound_sid = t.first_wamid || null;
      row.consent_source = row.provenance.door;
      row.optin = optinRecord(row);
      actions.push({ kind: 'insert_lead', row });
      // business-messaging Lead (4.6: consent + valid number); needs Meta's ctwa_clid to attribute (W03-notes rule 1)
      // lead_id + ctwa_clid travel with it: smc-capi-send rejects a business_messaging event without them (invalid_input)
      if (row.ctwa_clid) actions.push({ kind: 'capi', event_name: 'Lead', event_id: `evt_${row.id}_ctwa_lead`, action_source: 'business_messaging', lead_id: row.id, brand_id: row.brand_id, ctwa_clid: row.ctwa_clid });
      t.stage = 'q_age';
      t.lead_id = row.id;
      // Capture Flow v2 (2026-10-07): when the brand has switched to the Flow and the workflow supplied a minted
      // 'capture' flow_token, the consent tap opens the Flow instead of the tap-by-tap questions. Anything missing -> tap path.
      const cf = ctx.brand.capture_ui === 'flow_v2' && ctx.capture_flow && ctx.capture_flow.flow_id && ctx.capture_flow.flow_token ? ctx.capture_flow : null;
      if (cf) {
        t.stage = 'capture_flow';
        row.conv_state = { state: 'capture_flow' };
        row.wa_id = ctx.mobile.replace(/^\+/, ''); row.wa_verified = true; // the inbound message itself proves the WhatsApp number
        send({ type: 'flow', body: `Thanks${ctx.profile_name ? ` ${String(ctx.profile_name).split(/\s+/)[0]}` : ''}. A few quick taps and you can pick a time with an adviser.`, flow: { flow_id: cf.flow_id, flow_token: cf.flow_token, flow_cta: 'Start', flow_action: 'navigate', screen: 'REASONS' } });
        stall('capture_flow');
        return { thread: t, actions };
      }
      if (ctx.brand.capture_ui === 'flow_v2') actions.push({ kind: 'log', reason: 'capture_flow_unavailable_tap_path' });
      const sp = startPageToken(ctx);
      if (sp) {
        t.stage = 'start_page';
        row.conv_state = { state: 'start_page' };
        send(startPageMessage(sp, ctx));
        stall('start_page');
        return { thread: t, actions };
      }
      row.conv_state = { state: 'q_age' }; // I-48k: W03 owns leads.conv_state.state while qualifying
      send(question('q_age'));
      stall('q_age');
      return { thread: t, actions };
    }
    send(buttons(t.consent.text, [['consent_yes', 'Yes, continue'], ['consent_no', 'No thanks']])); // free text before consent: ask again
    return { thread: t, actions };
  }

  return qualify(t, msg, ctx, actions);
}

/**
 * Website opener from a number with no open lead (WHATSAPP-OPENERS.md rules 1 and 2). Consent = the opener's own consent
 * sentence (version CONSENT-GENERIC-v5web, mode generic: the site's tick names "an authorised adviser" / Capital Legacy),
 * evidence = the inbound message id + received time (lead_activities W03:consent:{wamid}). Then the flow spec from step 2:
 * greet, name the topic, ask the first question. Wills go to a person: there is no wills booking calendar yet.
 */
function openerIntake(op, origin, ctx, actions) {
  const send = (m) => actions.push({ kind: 'send', message: m });
  const row = {
    id: ctx.lead_id, brand_id: ctx.brand.brand_id, origin: 'ctwa', ref: op.ref, ad_id: origin.ad_id || null,
    ctwa_clid: origin.ctwa_clid || null, phone: ctx.mobile, first_name: ctx.profile_name || null,
    consent_text: op.consent_text, consent_text_version: OPENER_CONSENT_VERSION, consent_mode: 'generic',
    consent_at: ctx.at, consent_source: OPENER_CONSENT_SOURCE, verified_at: ctx.at, wa_delivered_at: ctx.at, stage: 'verified',
    source: op.source, product_interest: op.product_interest, reasons: op.reasons,
    utm_source: op.via ? op.via.source : null, utm_campaign: op.via ? op.via.campaign : null, utm_content: op.via ? op.via.content : null,
    provenance: provenanceFor({ op, origin, referral: ctx.referral, wamid: ctx.wamid, at: ctx.at, text: ctx.text, version: OPENER_CONSENT_VERSION }),
    is_synthetic: !!ctx.is_synthetic,
  };
  row.optin = optinRecord(row);
  actions.push({ kind: 'insert_lead', row });
  const greet = openerGreeting(op, ctx.profile_name);
  if (op.wills) {
    row.conv_state = { state: 'handoff', topic: op.topic, ref: op.ref };
    send({ type: 'text', body: `${greet.replace(/ If it's something else, just tell me\.$/, '')} Wills are done with a Capital Legacy consultant, so I've asked a person from our team to message you here shortly to set up the call.` });
    return { thread: { stage: 'done', lead_id: row.id, origin, opener: { ref: op.ref, topic: op.topic } }, actions: actions.concat([{ kind: 'escalate', lead_id: row.id, note: `wills opener ${op.ref}: no wills calendar, a person books the Capital Legacy call` }]) };
  }
  const sp = startPageToken(ctx);
  if (sp) {
    row.conv_state = { state: 'start_page', topic: op.topic, ref: op.ref };
    send(startPageMessage(sp, ctx, greet));
    actions.push({ kind: 'schedule_stall', stage: 'start_page', hours: STALL_HOURS, from: ctx.at, replaces: true });
    return { thread: { stage: 'start_page', origin, answers: {}, first_at: ctx.at, lead_id: row.id, opener: { ref: op.ref, topic: op.topic } }, actions };
  }
  row.conv_state = { state: 'q_age', topic: op.topic, ref: op.ref };
  const q = question('q_age');
  send({ ...q, body: `${greet}\n\n${q.body}` });
  actions.push({ kind: 'schedule_stall', stage: 'q_age', hours: STALL_HOURS, from: ctx.at, replaces: true });
  return { thread: { stage: 'q_age', origin, answers: {}, first_at: ctx.at, lead_id: row.id, opener: { ref: op.ref, topic: op.topic } }, actions };
}

/** Qualifying (4.6 step 3 order): a tap, or a typed answer W07 handed over (ctx.typed = { slots, actions }, I-47a). */
function qualify(t, msg, ctx, actions) {
  const send = (m) => actions.push({ kind: 'send', message: m });
  const stall = (stage) => actions.push({ kind: 'schedule_stall', stage, hours: STALL_HOURS, from: ctx.at, replaces: true });
  const ORDER = { q_age: 'age_', q_budget: 'budget_', q_budget_clarify: 'budget_', q_bond: 'bond_', q_method: 'method_' };
  const prefix = ORDER[t.stage];
  if (!prefix) return { thread: t, actions: [{ kind: 'forward_w07', lead_id: t.lead_id, reason: 'after_qualifying', hops: ctx.hops || 0 }] };
  let id = tapId(msg);
  if ((!id || !id.startsWith(prefix)) && ctx.typed) id = typedTap(t.stage, ctx.typed.slots) || id;
  if (prefix === 'budget_' && UNSURE_IDS.has(id)) id = 'unsure';
  if (id === 'unsure') {
    // logic.mjs budget_clarify: one clarifying re-ask, a second "not sure" closes (state-machine.md q_budget_clarify)
    if (t.stage === 'q_budget_clarify') { t.answers.budget_band = 'unsure'; return outOfBand(t, ctx, 'budget_band', actions); }
    t.stage = 'q_budget_clarify';
    actions.push({ kind: 'update_lead', id: t.lead_id, set: { conv_state_state: 'q_budget_clarify' } });
    send({ ...question('q_budget', ctx.broker), body: `No problem, a rough idea is fine. ${question('q_budget', ctx.broker).body}` });
    stall('q_budget');
    return { thread: t, actions };
  }
  if (!id || !id.startsWith(prefix)) {
    // tap-only: free text mid-question is logged for the brief (W07) and the same question is shown again.
    // A message W07 already handed over (ctx.typed) is not forwarded back: W07 logged it (I-48b, no extra hop).
    if (msg.type === 'text' && !ctx.typed) actions.push({ kind: 'forward_w07', lead_id: t.lead_id, reason: 'free_text_mid_qualifying', reply: false, hops: ctx.hops || 0 });
    const q = question(STAGE_OF[t.stage] === 'q_budget_clarify' ? 'q_budget' : t.stage, ctx.broker);
    send({ ...q, body: `Please tap one of the options. ${q.body}` });
    return { thread: t, actions };
  }
  const val = id.slice(prefix.length);
  const from = t.stage;
  let set;
  if (from === 'q_age') {
    t.answers.age_band = val; // any band: the flow goes on to the budget
    t.stage = 'q_budget';
    set = { age_band: AGE_TO_DB[val] };
  } else if (from === 'q_budget' || from === 'q_budget_clarify') {
    t.answers.budget_band = val;
    if (!QUAL_BUDGET.has(val) && !LOW_BUDGET.has(val)) return outOfBand(t, ctx, 'budget_band', actions);
    if (t.from_lead && t.origin === 'lead_ad') return finishLeadAd(t, ctx, actions, val);
    if (t.from_lead && t.origin === 'page') return finishPageBudget(t, ctx, actions, val);
    t.stage = 'q_bond';
    set = { budget_band: BUDGET_TO_DB[val] };
  } else if (from === 'q_bond') {
    const typedBond = ctx.typed && !(tapId(msg) || '').startsWith('bond_') ? ctx.typed.slots || {} : null;
    t.answers.bond = typedBond ? (typeof typedBond.bond === 'boolean' ? typedBond.bond : null) : val.startsWith('yes');
    t.answers.dependants = typedBond ? (typeof typedBond.dependants === 'boolean' ? typedBond.dependants : null) : val.endsWith('dependants_yes');
    t.stage = 'q_method';
    set = { bond: t.answers.bond, dependants: t.answers.dependants };
  } else if (from === 'q_method') {
    t.answers.method_pref = METHOD_TO_DB[val] || null;
    t.stage = 'done';
    actions.push({ kind: 'cancel_stall' });
    actions.push({
      kind: 'update_lead', id: t.lead_id,
      set: { age_band: AGE_TO_DB[t.answers.age_band], budget_band: BUDGET_TO_DB[t.answers.budget_band], bond: t.answers.bond, dependants: t.answers.dependants, method_pref: t.answers.method_pref, qualified_at: ctx.at, stage: 'qualified', conv_state_state: NEXT_STATE.q_method },
    });
    if (t.from_lead && t.broker_id) {
      // already routed (W07-owned lead): hand back; W07 offers slots from 'unbooked'
      actions.push({ kind: 'forward_w07', lead_id: t.lead_id, reason: 'after_qualifying', hops: ctx.hops || 0 });
      return { thread: t, actions };
    }
    // route (1.3) is W01 core's job: same routing for every intake path; it writes broker_id/routed_at (the database attaches the lead to the broker's open lead order)
    // before W06 exists (W01 rule), then W06 sends broker_intro_slots (or _v2 with the Flow button) < 60 s.
    actions.push({ kind: 'route_and_first_touch', lead_id: t.lead_id, template_hint: 'broker_intro_slots', deadline_s: 60 });
    return { thread: t, actions };
  }
  // I-47a/I-48k: W03 records each answer and writes leads.conv_state.state itself (W07 skips `state` on hand-off turns)
  for (const k of Object.keys(set)) if (set[k] === null || set[k] === undefined) delete set[k];
  actions.push({ kind: 'update_lead', id: t.lead_id, set: { ...set, conv_state_state: NEXT_STATE[from] } });
  send(question(t.stage, ctx.broker));
  stall(t.stage);
  return { thread: t, actions };
}

/**
 * Meta Lead Ads terms (decided 2026-10-05): no income / financial question in an instant form without Meta's permission.
 * The instant form (v2, 18 Oct 2026: intent, age band, cover today) asks no budget; the monthly band is the FIRST WhatsApp step.
 * W01 stores the lead unrouted (routing_reason held_budget_pending, conv_state q_budget) and sends the qualify_budget
 * template (automation/lib/w01.mjs budgetQuestion, same row ids as BUDGET_ROWS) within 60 s; the tap comes back through W07 -> W03 (qualifying tap) and the SAME QUAL_BUDGET set decides:
 * in band (tiers A/B, and tier C under R750 since 2026-10-11) -> qualified -> W01 routes (tier C only to a broker with the
 * standing yes, else held_low_budget) -> W06 broker intro; out of band -> outOfBand() (no hand-over, deleted in 24 h).
 * Nothing else is asked: the instant form already covered the rest, and the method is chosen when booking.
 */
function finishLeadAd(t, ctx, actions, val) {
  t.stage = 'done';
  // Instant form v2 (18 Oct 2026): every age books and counts (lib/w01.mjs OUT_OF_BAND_AGE_BOOKS, as /start/), so qualified is the
  // band alone (tier A/B); tier C (under R750) gets the band only, as finishPageBudget. Either way it is a real lead that
  // answered: the budget reminder's 24-h delete date is cleared (keep_lead).
  const inBand = QUAL_BUDGET.has(val);
  actions.push({ kind: 'cancel_stall' });
  actions.push({ kind: 'update_lead', id: t.lead_id, set: { budget_band: BUDGET_TO_DB[val], conv_state_state: NEXT_STATE.q_method, ...(inBand ? { qualified_at: ctx.at, stage: 'qualified' } : { keep_lead: true }) } });
  actions.push({ kind: 'route_and_first_touch', lead_id: t.lead_id, template_hint: 'broker_intro_slots', deadline_s: 60 });
  return { thread: t, actions };
}

/**
 * Quiz v2 (2026-10-14): a web lead W01 stored with conv_state.budget_pending (routed provisionally, or held for want of a free
 * broker) taps its band on the qualify_budget template. In order:
 *  1. record the band. In band (tier A/B): also qualified_at + stage 'qualified' (age and reason came from the page, the band from
 *     WhatsApp), which is what lets the CRM's appointment-request sweep catch a lead whose broker has no bookable calendar. Tier C
 *     (under R750): band only; the database (smc_leads_route_check) un-routes it to held_low_budget unless the broker has the
 *     standing yes, and it is never marked qualified here.
 *  2. route_and_first_touch (W01 core). A no-op for an already routed lead; a held lead is routed now that its tier is known, and a
 *     tier C lead that lost its broker gets the one honest lead_low_budget_held message.
 *  3. W05 op finalize: a held booking whose email is verified is handed over now. Without a verified email or a held booking it
 *     returns nothing, and the email-verify step runs the same finalize when the link is opened (band first or email first).
 */
function finishPageBudget(t, ctx, actions, val) {
  t.stage = 'done';
  const inBand = QUAL_BUDGET.has(val);
  actions.push({ kind: 'cancel_stall' });
  actions.push({ kind: 'update_lead', id: t.lead_id, set: { budget_band: BUDGET_TO_DB[val], conv_state_state: NEXT_STATE.q_method, ...(inBand ? { qualified_at: ctx.at, stage: 'qualified' } : {}) } });
  if (inBand) actions.push({ kind: 'send', message: { type: 'text', body: 'Thanks, that helps the adviser prepare.' } });
  actions.push({ kind: 'route_and_first_touch', lead_id: t.lead_id, template_hint: 'broker_intro_slots', deadline_s: 60 });
  actions.push({ kind: 'finalize_booking', op: 'finalize', lead_id: t.lead_id });
  return { thread: t, actions };
}

function outOfBand(t, ctx, reason, actions) {
  const del = new Date(Date.parse(ctx.at) + 24 * 3600 * 1000).toISOString();
  actions.push({ kind: 'cancel_stall' });
  actions.push({
    kind: 'update_lead', id: t.lead_id,
    set: { age_band: AGE_TO_DB[t.answers.age_band] || null, budget_band: BUDGET_TO_DB[t.answers.budget_band] || null, disqualified_reason: reason, broker_id: null, stage: 'disqualified', retention_delete_after: del, conv_state_state: 'closed_oob' },
  });
  actions.push({ kind: 'send', message: { type: 'text', body: 'Thanks for your answers. Based on them, we’re not the right fit for you right now, so we won’t pass your details on. Take care.' } });
  return { thread: { ...t, stage: 'closed', closed_reason: reason }, actions };
}

/** Cloud API body for one `send` action (session message, inside the customer service window). */
function toCloudApi(to, m) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace('+', '') };
  if (m.type === 'text') return { ...base, type: 'text', text: { body: m.body } };
  if (m.type === 'button') {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: m.body }, action: { buttons: m.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) } } };
  }
  if (m.type === 'cta_url') {
    // Cloud API interactive cta_url (session); under WHATSAPP_PROVIDER=twilio lib/wa-provider.mjs maps it to smc_start_cta
    return { ...base, type: 'interactive', interactive: { type: 'cta_url', ...(m.header_image ? { header: { type: 'image', image: { link: m.header_image } } } : {}), body: { text: m.body.slice(0, WA_BUTTON_BODY_MAX) }, action: { name: 'cta_url', parameters: { display_text: m.button.slice(0, 20), url: m.url } } } };
  }
  if (m.type === 'flow') {
    return { ...base, type: 'interactive', interactive: { type: 'flow', body: { text: m.body }, action: { name: 'flow', parameters: { flow_message_version: '3', flow_id: m.flow.flow_id, flow_token: m.flow.flow_token, flow_cta: m.flow.flow_cta, flow_action: m.flow.flow_action, flow_action_payload: { screen: m.flow.screen } } } } };
  }
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.body }, action: { button: m.button.slice(0, 20), sections: [{ title: 'Options', rows: m.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) }] } } };
}

module.exports = { startPageBody, startPageMessage, START_PAGE_STEPS, START_PAGE_LINK, START_PAGE_HEADER, START_PAGE_BUTTON, parseOpener, openerGreeting, provenanceFor, optinRecord, OPENER_RE, OPENER_CONSENT_VERSION, OPENER_CONSENT_SOURCE, BUDGET_ROWS, QUAL_BUDGET, LOW_BUDGET, typedTap, threadFromLead, hopNext, MAX_HOPS, Q_STAGES, NEXT_STATE, redirectFor, readOrigin, consentFor, CONSENT_NAMED_VERSION, CONSENT_GENERIC_VERSION, CONSENT_NAMED_FOOTER, WA_BUTTON_BODY_MAX, step, question, tapId, toCloudApi, hashMobile, CONSENT_GENERIC_TEXT, AGE_TO_DB, BUDGET_TO_DB, METHOD_TO_DB, STALL_HOURS, REDIRECT_REF_RE };
