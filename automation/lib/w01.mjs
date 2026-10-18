// automation/lib/w01.mjs  -  W01 Lead intake (web) + "W01 Lead core" (the shared tail W02 and W03 call).
// Owner: automation-engineer. Loaded by the n8n Code nodes in automation/W01.json
// (require('lv-automation').w01, I-44a/I-46c) and by automation/tests/W01.test.mjs,
// so the workflow and its acceptance test run the same code. Node 18+, zero dependencies. No network, no database:
// every input a decision needs (counters, prior lead, suppression, brokers, Lookup result) is passed in by the caller.
//
// Which of my five: HBR (nothing here may delay the first WhatsApp: routing is written here, W06 sends < 60 s),
// Chili Piper (qualify -> route -> book inside one interaction: the broker is chosen before the response goes back,
// so the page can book at once), Meta Cloud API/CAPI docs (event_id dedupe, consent gate, no email to Meta).
//
// Order (W03-notes B.3, CONTRACTS.md "lead_token"):
//   screen()  cheap, no I/O: origin, honeypot, fill time, E.164, consent              (page only for the first three)
//   guard()   after the Context query + Turnstile: per-IP / per-number limits, Turnstile verdict
//   lookupNeeded() / lineTypeOf()   Twilio Lookup only after every free check passed (line type cached 30 d per hash)
//   decide()  landline/VoIP reject, 90-day dedupe (merge), bands, named-consent check, suppression, routing,
//             CAPI Lead payload (consent gate, no email), first-touch call to W06, public response body
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LT = require('../security/lead-token.js');
const CONSENT = require('../../landing/config/consent.json');

export const WORKFLOW = 'W01';
export const MIN = 60_000;
export const H = 60 * MIN;
export const D = 24 * H;
export const DEDUPE_DAYS = 90;
export const OUT_OF_BAND_RETENTION_H = 24; // 2.1.7: out-of-band submissions deleted within 24 h
export const IP_LIMIT_PER_HOUR = 10; // RATE_LIMIT_PER_IP_PER_HOUR default (W03-notes B.3 #4)
export const IP_LIMIT_FAIL_OPEN = 3; // B.5: Turnstile unreachable -> /lead fails open with a tighter per-IP limit
export const NUMBER_LIMIT_PER_DAY = 5; // RATE_LIMIT_PER_NUMBER_PER_DAY default (B.3 #7)
export const MIN_FILL_S = 3; // B.3 #3
export const MAX_FILL_S = 3600;
export const LOOKUP_CACHE_DAYS = 30; // B.3 #8: line type cached 30 days per number hash
export const FIRST_TOUCH_DEADLINE_S = 60;
export const EMAIL_METHODS = new Set(['teams', 'zoom', 'meet']); // 0.1 Email: only when the method needs an invite
export const PAGE_MESSAGE = {
  invalid_mobile: 'Please enter a valid SA mobile number.',
  consent_required: 'Please tick the box so we can share your details.',
  not_mobile: 'Please use a mobile number.',
};

// ---------------------------------------------------------------------------------------------- time + hashing
const SAST = 2 * H;
/** ms -> "2026-10-15T10:00:00+02:00" (Africa/Johannesburg, no DST): the format every fixture and test uses. */
export const isoSast = (t) => new Date(t + SAST).toISOString().replace(/\.\d{3}Z$/, '+02:00');
const msOf = (v) => (typeof v === 'number' ? v : Date.parse(v));

/**
 * One hash rule, identical to public.smc_hash_contact (migration 12, I-38a): a phone-like value is hashed as the
 * SHA-256 hex of its digits only (no "+"); anything else (email) as lower(trim). Used for suppression and dedupe.
 */
export function hashContact(p) {
  if (p === null || p === undefined || String(p).trim() === '') return null;
  const s = String(p);
  const digits = s.replace(/\D/g, '');
  const v = /^[+0-9 ()./-]+$/.test(s.trim()) && digits ? digits : s.trim().toLowerCase();
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------------------------- normalisers
/** SA number as typed -> E.164 (+27XXXXXXXXX) or null. Accepts 0XX, +27, 0027, 27, spaces, dashes, brackets, dots. */
export function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('0')) s = '27' + s.slice(1);
  return /^27[1-9]\d{8}$/.test(s) ? '+' + s : null;
}

// Every band vocabulary in the repo -> the leads_smc_checks codes (0.1: lt35 / 35_44 / 45_50 / 51plus; lt750 / 750_1250 / 1250plus).
export const AGE_TO_DB = {
  lt35: 'lt35', under_35: 'lt35', '<35': 'lt35', '35_44': '35_44', '35-44': '35_44',
  '45_50': '45_50', '45-50': '45_50', '51plus': '51plus', '51_plus': '51plus', '51+': '51plus',
};
export const BUDGET_TO_DB = {
  lt750: 'lt750', under_500: 'lt750', '500_750': 'lt750', '<500': 'lt750', '500-750': 'lt750', '<750': 'lt750',
  '750_1250': '750_1250', '750-1250': '750_1250', '1250plus': '1250plus', '1250_plus': '1250plus', '1250+': '1250plus', // legacy "R1,250+ (before split)"
  '1250_1499': '1250_1499', '1250-1499': '1250_1499', '1500_plus': '1500_plus', '1500plus': '1500_plus', '1500+': '1500_plus',
  '750_1499': '750_1499', '750-1499': '750_1499', // the SortMyCover React quiz (sites/sortmycover) sends the merged R750-R1,499 band
};
export const PRIORITY_BUDGET = new Set(['1500_plus']); // priority TAG only: never a disqualifier, never a routing filter
export const isPriority1500 = (band) => PRIORITY_BUDGET.has(band);
export const QUAL_AGE = new Set(['35_44', '45_50']);
export const QUAL_BUDGET = new Set(['750_1250', '750_1499', '1250plus', '1250_1499', '1500_plus']); // tiers A/B: every band from R750 up (1250plus = legacy pre-split)
// Tier C (Jonathan, 2026-10-11): under R750 is NOT out of band any more. The lead is stored, counts as a lead, keeps
// qualifying, and is routed only to a broker with the standing yes (brokers.accepts_low_budget, agreement 5.7 offer
// accepted at once); with none that has room it is HELD open (routing_reason held_low_budget) until an admin assigns it
// (routing_reason manual_low_budget) or LOW_BUDGET_HOLD_DAYS pass (closed politely, low_budget_no_taker). The database
// enforces the same rule (smc_leads_route_check) and counts it only at booked + attendance confirmed, like every lead.
export const LOW_BUDGET = 'lt750';
export const KNOWN_BUDGET = new Set([...QUAL_BUDGET, LOW_BUDGET]);
/** budget band (DB code) -> lead tier: A = R1,500+, B = R750-R1,499, C = under R750, null = unknown / not given. */
export const tierOf = (band) => (band === '1500_plus' ? 'A' : QUAL_BUDGET.has(band) ? 'B' : band === LOW_BUDGET ? 'C' : null);
export const LOW_BUDGET_HOLD_DAYS = 7;
// WILLS (Jonathan, 2026-10-11): the four wills / estate angles of the SortMyCover site (theme B, provider Capital Legacy).
// Their leads carry leads.product_interest = 'wills' and are routed ONLY to brokers with brokers.handles_wills (none with room
// -> routing_reason held_no_wills_broker). Same nurture, booking, verification and counting rules otherwise.
export const WILLS_ANGLES = new Set(['children-guardian', 'will-myth', 'will-and-cover', 'where-is-the-will']);
export const PRODUCTS = new Set(['life_cover', 'wills']);
// leads.source for every W01 lead. The live CHECK (leads_source_check) allows website_form, referral, campaign, cold_call, other,
// 'Campaign Lead', 'Search Lead' and 'Ayanda Prospecting%'. W01 used to write 'LV Campaign', which that check rejects, so no web or
// lead-ad lead could be inserted (found 2026-10-14 by automation/tests/quiz-v2-band.local.test.mjs). 'Campaign Lead' is the CRM's own
// picklist value for a lead that came from a Lead Velocity campaign.
export const LEAD_SOURCE = 'Campaign Lead';
// Quiz v2 (lv-site a206f12, 2026-10-13): the landing page no longer asks the budget. It sends budget_pending: true and
// help_with (the visitor's main reason, one of these). The band is asked later (WhatsApp / email-confirm page) and W05
// hands the booking to the adviser only once it is known (contract 5.1(c), S2.2: a self-declared band is Required).
export const HELP_WITH = new Set(['review', 'life', 'disability_income', 'severe_illness', 'wills']);
export const helpWithOf = (v) => (typeof v === 'string' && HELP_WITH.has(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
/** The page's own product choice (/book/ first question or ?for=, campaign theme), whitelisted; anything else -> null. */
export const productChoice = (v) => (typeof v === 'string' && PRODUCTS.has(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
/** leads.product_interest: a wills angle is always 'wills'; otherwise the page's choice (product_interest, lv-site fc89d5a),
 *  else derived from the angle ('life_cover'). */
export const productOf = (angle, requested = null) =>
  (WILLS_ANGLES.has(String(angle || '').toLowerCase()) ? 'wills' : productChoice(requested) ?? 'life_cover');
/**
 * Under-35 / over-50 (Jono, 18 Oct 2026): they may book with Mark. They are never marked qualified (qualified_at stays null)
 * and get a timeline note; counting is the database's rule (smc_count_lead), not qualified_at. One switch for every intake
 * that accepts them: the /start/ page (lib/w39.mjs re-exports it) and the Meta instant form (decide() below, W03 finishLeadAd).
 */
export const OUT_OF_BAND_AGE_BOOKS = true;
export const OOB_AGE_RULE = 'OUT_OF_BAND_AGE_BOOKS (Jono, 18 Oct 2026)';

// Meta instant form v2 (deliverables/media-buyer/instant-form-spec-v2.json, 18 Oct 2026). The form mirrors /start/: three
// multiple-choice custom questions with stable keys, then first name + WhatsApp number. Meta returns a custom question's
// answer as the option text (and a form built by hand in Ads Manager may get its own field names), so each answer is
// matched on its option key OR its exact option label, and a field whose name is unknown is matched on its value.
// Option keys are the /start/ codes where one exists (life / income / illness / review; lt35 / 35_44 / 45_50 / 51plus;
// yes / no / unsure); 'disability' is the one form-only key.
// intent -> the /start/ intent (lib/w39.mjs INTENTS) and the W01 HELP_WITH code. Disability and income protection are two
// options on the form but one /start/ intent ('income'); the option itself is kept for the adviser's brief.
export const LEAD_AD_QUESTION_KEYS = { intent: ['smc_intent', 'intent', 'help_with'], age_band: ['smc_age_band', 'age_band'], has_cover: ['smc_has_cover', 'has_cover'] };
export const LEAD_AD_INTENT = Object.freeze({
  life: { label: 'Life cover', intent: 'life', help_with: 'life' },
  disability: { label: 'Disability cover', intent: 'income', help_with: 'disability_income' },
  income: { label: 'Income protection', intent: 'income', help_with: 'disability_income' },
  illness: { label: 'Severe illness cover', intent: 'illness', help_with: 'severe_illness' },
  review: { label: 'Not sure yet', intent: 'review', help_with: 'review' },
});
export const LEAD_AD_AGE = Object.freeze({ lt35: 'Under 35', '35_44': '35 to 44', '45_50': '45 to 50', '51plus': 'Over 50' });
export const LEAD_AD_HAS_COVER = Object.freeze({ yes: 'Yes', no: 'No', unsure: 'Not sure' });
/** The required consent checkbox (custom_disclaimer_responses[].checkbox_key) and the optional ad-measurement one. */
export const LEAD_AD_CONSENT_KEYS = new Set(['consent', 'smc_consent']);
export const LEAD_AD_ADS_KEYS = new Set(['consent_ads', 'smc_consent_ads']);
/** The text version the v2 form's required checkbox shows: the site's named text, filled for the broker (consentRegistry). */
export const LEAD_AD_CONSENT_VERSION = 'CONSENT-NAMED-v5web';
const optSlug = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[\s-]+/g, '_');
const optionIndex = (codes, labelOf) => {
  const m = new Map();
  for (const [code, v] of Object.entries(codes)) { m.set(optSlug(code), code); m.set(optSlug(labelOf(v)), code); }
  return m;
};
const INTENT_IDX = optionIndex(LEAD_AD_INTENT, (v) => v.label);
const AGE_IDX = optionIndex(LEAD_AD_AGE, (v) => v);
const COVER_IDX = optionIndex(LEAD_AD_HAS_COVER, (v) => v);
for (const k of ['35_44', '45_50']) AGE_IDX.set(k.replace('_', '-'), k); // older form labels "35-44" / "45-50"
AGE_IDX.set('51_or_older', '51plus'); AGE_IDX.set('51+', '51plus');

/**
 * field_data (as { name: first value }) -> the v2 answers. { intent_option, intent, help_with, age_band, has_cover }; a missing
 * or unreadable answer is simply absent (tolerated: intent and has_cover are optional for the pipeline, age decides nothing).
 */
export function leadAdAnswers(fields = {}) {
  const out = {};
  const used = new Set();
  const take = (slot, idx) => {
    for (const k of LEAD_AD_QUESTION_KEYS[slot]) {
      if (fields[k] == null || fields[k] === '') continue;
      used.add(k);
      const code = idx.get(optSlug(fields[k]));
      if (code) return code;
    }
    return null;
  };
  let intent = take('intent', INTENT_IDX), age = take('age_band', AGE_IDX), cover = take('has_cover', COVER_IDX);
  // a hand-built form: unknown field names; match the remaining values on the option labels (each set is disjoint)
  const known = new Set(['first_name', 'full_name', 'last_name', 'phone_number', 'phone', 'email', 'budget_band', 'has_bond', 'has_dependants', 'preferred_method', 'call_ok', 'bond_children', 'language']);
  for (const [k, v] of Object.entries(fields)) {
    if (used.has(k) || known.has(k) || typeof v !== 'string') continue;
    const s = optSlug(v);
    if (!intent && INTENT_IDX.has(s)) intent = INTENT_IDX.get(s);
    else if (!age && AGE_IDX.has(s)) age = AGE_IDX.get(s);
    else if (!cover && COVER_IDX.has(s)) cover = COVER_IDX.get(s);
  }
  if (intent) Object.assign(out, { intent_option: intent, intent: LEAD_AD_INTENT[intent].intent, help_with: LEAD_AD_INTENT[intent].help_with });
  if (age) out.age_band = age;
  if (cover) out.has_cover = cover;
  return out;
}

/** custom_disclaimer_responses -> { consented, ads }. is_checked is "1" / "" in Graph (true / false accepted too). */
export function leadAdConsent(responses = []) {
  const on = (r) => r && (String(r.is_checked) === '1' || r.is_checked === true || String(r.is_checked).toLowerCase() === 'true');
  const list = (Array.isArray(responses) ? responses : []).filter((r) => r && typeof r === 'object');
  const keyed = list.some((r) => LEAD_AD_CONSENT_KEYS.has(r.checkbox_key) || LEAD_AD_ADS_KEYS.has(r.checkbox_key));
  // A form built by hand may carry Meta's own checkbox keys. Meta does not accept a submission without the required box,
  // so a ticked box still proves the consent; the optional ad-measurement choice is then NOT assumed (never ads by default).
  if (!keyed) return { consented: list.some(on), ads: false, keys_known: false };
  return {
    consented: list.some((r) => LEAD_AD_CONSENT_KEYS.has(r.checkbox_key) && on(r)),
    ads: list.some((r) => LEAD_AD_ADS_KEYS.has(r.checkbox_key) && on(r)),
    keys_known: true,
  };
}

export const LOW_BUDGET_HELD_TEMPLATE = 'lead_low_budget_held';
/** leads.routing_reason of a /start/ page web lead waiting for its answers and the adviser card (W39 routes it). No CHECK. */
export const START_PAGE_PENDING = 'start_page_pending';
export const LOW_BUDGET_CLOSED_TEMPLATE = 'lead_low_budget_closed';
// conv_state.state values while the lead is still answering (W03 owns them): the hand-off waits until the answers are in.
// 'start_page' (18 Oct 2026): the /start/ page link is out and the lead is answering there (W03 / W39).
export const QUALIFYING_STATES = new Set(['consent_pending', 'q_age', 'q_budget', 'q_budget_clarify', 'q_bond', 'q_dependants', 'q_method', 'capture_flow', 'start_page']);
const METHODS = new Set(['teams', 'zoom', 'meet', 'whatsapp_call', 'phone']);
const METHOD_ALIAS = { google_meet: 'meet', whatsapp: 'whatsapp_call' };

const yes = (v) => (v === true || v === 'yes' || v === 'true' ? true : v === false || v === 'no' || v === 'false' ? false : null);
const dependantsOf = (v) => (typeof v === 'boolean' ? v : v === 'none' ? false : ['kids', 'extended', 'partner', 'yes'].includes(v) ? true : null);
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : null) || null;
const str = (v) => (v === undefined ? null : v);
const methodOf = (m) => { const x = METHOD_ALIAS[m] || m; return METHODS.has(x) ? x : null; };
const adsSentence = (text, version) => /measure and improve|coded \(hashed\) form/i.test(text || '') || /CONSENT-ADS/i.test(version || '');

/**
 * Page body -> one canonical submission. Accepts the landing page's flat body (landing/README.md: consent:true,
 * consent_text, consent_version, lang, company_website, context.utm{...}) and the nested fixture shape
 * (consent{checked,text,version,at,...}, quiz{...}). opts.ip = the server-observed client IP (CF-Connecting-IP /
 * X-Forwarded-For); it wins over any IP in the body.
 */
export function normaliseSubmission(body = {}, opts = {}) {
  const c = body.context || {};
  const utm = c.utm || {};
  const q = body.quiz || body;
  const nested = body.consent && typeof body.consent === 'object';
  const consent = nested
    ? { checked: body.consent.checked === true, text: body.consent.text || null, version: body.consent.version || null, at: body.consent.at || null,
        page_url: body.consent.page_url || body.page_url || null, mode: body.consent.mode || body.consent_mode || null,
        ads: typeof body.consent.includes_ads_sentence === 'boolean' ? body.consent.includes_ads_sentence : adsSentence(body.consent.text, body.consent.version) }
    : { checked: body.consent === true || body.consent === 'yes' || body.consent === 'on', text: body.consent_text || null, version: body.consent_version || null, at: null,
        page_url: body.page_url || null, mode: body.consent_mode || null,
        // the site quiz (and the /start/ page) send the optional ad-measurement choice separately: consent_ads + its own text / version
        ads: adsSentence(body.consent_text, body.consent_version) || body.consent_ads === true || body.consent_ads === 'true',
        ads_text: typeof body.consent_ads_text === 'string' ? body.consent_ads_text : null, ads_version: typeof body.consent_ads_version === 'string' ? body.consent_ads_version : null };
  return {
    channel: 'page',
    brand_id: body.brand_id ?? null,
    is_synthetic: body.is_synthetic === true,
    submitted_at: body.submitted_at ?? null,
    first_name: cleanName(body.first_name),
    mobile_raw: typeof body.mobile === 'string' ? body.mobile : null,
    language: body.language ?? body.lang ?? null,
    angle: body.angle ?? null,
    // quiz v2: the no-JS form may send only help_with; wills -> wills, any cover reason -> life_cover (same two products)
    product_interest: productChoice(body.product_interest) ?? (helpWithOf(body.help_with) ? (helpWithOf(body.help_with) === 'wills' ? 'wills' : 'life_cover') : null),
    help_with: helpWithOf(body.help_with),
    budget_pending: body.budget_pending === true || body.budget_pending === 'true',
    // the /start/ page web intake (desktop "Book", no token yet, Jono 18 Oct 2026): no answers yet, never routed here
    start_page: body.start_page === true || body.start_page === 'true',
    quiz: {
      age_band: AGE_TO_DB[q.age_band] ?? null, budget_band: BUDGET_TO_DB[q.budget_band] ?? null,
      bond: yes(q.has_bond ?? q.bond), dependants: dependantsOf(q.has_dependants ?? q.dependants), work_cover: yes(q.has_work_cover ?? q.work_cover),
    },
    preferred_method: methodOf(body.preferred_method ?? body.method),
    email: typeof body.email === 'string' ? body.email.trim() : null,
    consent: { ...consent, source: 'page' },
    context: {
      // crm-audit-2026-10-06 R2: pixel.js sends context.utm.utm_* (+ cid/asid/adid/ref); the flat/fixture shapes still work.
      event_id: str(c.event_id), fbclid: str(c.fbclid), fbp: str(c.fbp), fbc: str(c.fbc), ad_id: str(c.ad_id ?? utm.adid ?? utm.ad_id),
      adset_id: str(c.adset_id ?? utm.asid ?? utm.adset_id), campaign_id: str(c.campaign_id ?? utm.cid ?? utm.campaign_id),
      utm_source: str(c.utm_source ?? utm.utm_source ?? utm.source), utm_medium: str(c.utm_medium ?? utm.utm_medium ?? utm.medium), utm_campaign: str(c.utm_campaign ?? utm.utm_campaign ?? utm.campaign),
      utm_content: str(c.utm_content ?? utm.utm_content ?? utm.content), utm_term: str(c.utm_term ?? utm.utm_term ?? utm.term), ref: str(c.ref ?? utm.ref),
      page_url: str(c.page_url ?? body.page_url), client_ip: opts.ip ?? str(c.client_ip), client_user_agent: opts.user_agent ?? str(c.client_user_agent ?? c.user_agent),
    },
    honeypot: body.honeypot ?? body.company_website ?? '',
    started_at: body.started_at ?? null,
    turnstile_token: body.turnstile_token ?? null,
    request_id: body.request_id ?? null,
  };
}

/**
 * The SortMyCover site's own consent texts (lv-site sites/sortmycover/config/consent.json, v5web, copied verbatim): the /start/
 * page and the WhatsApp chat widget show these. The ad-measurement choice is a separate optional radio (consent_ads).
 */
export const WEB_CONSENT = Object.freeze({
  named: { version: 'CONSENT-NAMED-v5web', text: 'I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp to book and remind me about my call, and may share my details with {practice_name} (FSP {fsp_number}), an adviser from an FSCA-authorised financial services provider, who may contact me by WhatsApp or phone about that call. I am 18 or older. I can opt out at any time by replying STOP.' },
  generic: { version: 'CONSENT-GENERIC-v5web', text: 'I agree that SortMyCover, a service of Lead Velocity (Pty) Ltd, may message me on WhatsApp to book and remind me about my call, and may share my details with an adviser from an FSCA-authorised financial services provider (FSP), who may contact me by WhatsApp or phone about that call. I am 18 or older. I can opt out at any time by replying STOP.' },
  ads: { version: 'CONSENT-ADS-v2web', text: 'I give SortMyCover permission to use my details in coded (hashed) form to measure and improve its ads on Facebook and Instagram. It will never use them to send me ads by message. This is optional, and the call does not depend on it.' },
});

/** The named-consent registry (landing/config/consent.json, CP-v0.1, + the site's v5web texts): version -> exact text for a practice. */
export function consentRegistry(broker = {}) {
  const fill = (t) => t.replace('{practice_name}', broker.practice_name || broker.firm_name || '').replace('{fsp_number}', broker.fsp_number || '');
  return {
    [CONSENT.named.version]: `${fill(CONSENT.named.text)} ${CONSENT.ads}`,
    [CONSENT.generic.version]: `${CONSENT.generic.text} ${CONSENT.ads}`,
    [WEB_CONSENT.named.version]: fill(WEB_CONSENT.named.text),
    [WEB_CONSENT.generic.version]: WEB_CONSENT.generic.text,
  };
}

/** The v2 answers kept for conv_state.start (null when the form carried none of them: an older form). */
const leadAdBlock = (a, formId) => (a.intent || a.has_cover
  ? { ...(a.intent ? { intent: a.intent, intent_option: a.intent_option } : {}), ...(a.has_cover ? { has_cover: a.has_cover } : {}), form_id: formId ?? null }
  : null);

/**
 * Lead Ads -> canonical submission. Accepts the raw Graph lead (field_data + custom_disclaimer_responses, the
 * fixture shape) and the W02 "ingest" item (W02.json "Fetch lead via Graph + backstop": mobile_raw, consent{...}).
 * The stored consent text is the exact form text for that version (opts.consent_texts, default consentRegistry()).
 */
export function normaliseLeadAd(p = {}, opts = {}) {
  const reg = opts.consent_texts || consentRegistry(opts.broker);
  if (Array.isArray(p.field_data)) {
    const f = Object.fromEntries(p.field_data.map((x) => [x.name, x.values?.[0]]));
    const cdr = p.custom_disclaimer_responses || [];
    const c = leadAdConsent(cdr);
    const ver = p.consent_text_version ?? LEAD_AD_CONSENT_VERSION;
    const text = reg[ver] ?? null;
    const from_registry = !opts.consent_texts && text != null;
    const a = leadAdAnswers(f);
    return {
      channel: 'lead_ad', brand_id: p.brand_id ?? 'smc', is_synthetic: p.is_synthetic === true, submitted_at: p.created_time,
      first_name: cleanName(f.first_name ?? String(f.full_name || '').split(' ')[0]), mobile_raw: f.phone_number ?? null, language: f.language ?? null,
      quiz: { age_band: AGE_TO_DB[a.age_band ?? f.age_band] ?? null, budget_band: BUDGET_TO_DB[f.budget_band] ?? null, bond: yes(f.has_bond), dependants: yes(f.has_dependants), work_cover: null },
      preferred_method: methodOf(f.preferred_method), email: f.email ?? null,
      // the v2 form's answers (no column for intent / has_cover: decide() keeps them in conv_state.start, as W39 does)
      help_with: a.help_with ?? null, product_interest: 'life_cover', lead_ad: leadAdBlock(a, p.form_id),
      consent: { checked: c.consented && !!text, text, version: ver, at: p.created_time, page_url: null, source: 'lead_ad', ads: adsSentence(text, ver) || c.ads,
        ads_version: c.ads ? WEB_CONSENT.ads.version : null, from_registry },
      // a raw Graph Lead carries its id as `id` (the fixture shape as leadgen_id)
      context: { event_id: null, ad_id: p.ad_id ?? null, adset_id: p.adset_id ?? null, campaign_id: p.campaign_id ?? null, leadgen_id: p.leadgen_id ?? p.id ?? null, form_id: p.form_id ?? null },
      honeypot: '', started_at: null, turnstile_token: null, request_id: p.leadgen_id ?? p.id ?? null,
    };
  }
  const l = p.lead || p;
  const ver = l.consent?.text_version ?? null;
  const text = reg[ver] ?? l.consent?.text ?? null;
  const from_registry = !opts.consent_texts && reg[ver] != null;
  // W02 v2 passes the form's answers map (meta-ads normalizeLead) and the checkbox responses through unchanged
  const a = leadAdAnswers({ ...(l.answers && typeof l.answers === 'object' ? l.answers : {}), ...(l.age_band != null ? { age_band: l.age_band } : {}) });
  const cdr = Array.isArray(l.consent?.responses) ? leadAdConsent(l.consent.responses) : null;
  const ads = adsSentence(text, ver) || (cdr ? cdr.ads : false);
  return {
    channel: 'lead_ad', brand_id: l.brand_id ?? null, is_synthetic: l.is_synthetic === true, submitted_at: l.consent?.captured_at ?? null,
    first_name: cleanName(l.first_name ?? String(l.full_name || '').split(' ')[0]), mobile_raw: l.mobile_raw ?? null, language: l.language ?? null,
    quiz: { age_band: AGE_TO_DB[a.age_band ?? l.age_band] ?? null, budget_band: BUDGET_TO_DB[l.budget_band] ?? null, bond: yes(l.bond_children?.bond ?? l.bond), dependants: yes(l.bond_children?.children ?? l.dependants), work_cover: null },
    preferred_method: methodOf(l.preferred_method), email: l.email ?? null,
    help_with: a.help_with ?? null, product_interest: 'life_cover', lead_ad: leadAdBlock(a, l.form_id),
    consent: { checked: l.consent?.given === true && (!cdr || cdr.consented) && !!text, text, version: ver, at: l.consent?.captured_at ?? null, page_url: null, source: 'lead_ad', ads,
      ads_version: cdr && cdr.ads ? WEB_CONSENT.ads.version : null, from_registry },
    context: { event_id: null, ad_id: l.ad_id ?? null, adset_id: l.adset_id ?? null, campaign_id: l.campaign_id ?? null, leadgen_id: l.leadgen_id ?? null, form_id: l.form_id ?? null },
    honeypot: '', started_at: null, turnstile_token: null, request_id: l.leadgen_id ?? null,
  };
}

/**
 * A Lead Ads consent text taken from the registry before the broker was known has an empty {practice_name}. The
 * instant form showed the practice of the broker it runs for, so once the brokers are loaded (W01 "Decide") the text
 * is filled with the routable broker. Without this every W02 lead in named mode would be held
 * (held_consent_names_other_practice). Page and CTWA texts are stored exactly as posted and are never rewritten.
 */
export function withRegistryText(sub, broker) {
  if (!sub || !sub.consent || !sub.consent.from_registry || !sub.consent.version) return sub;
  const t = consentRegistry(broker || {})[sub.consent.version];
  return t ? { ...sub, consent: { ...sub.consent, text: t } } : sub;
}

// ---------------------------------------------------------------------------------------------- responses
const reject = (http_status, error, extra = {}) => ({
  ok: false, http_status, reason: error,
  body: { ok: false, status: 'rejected', error, error_code: error, ...(PAGE_MESSAGE[error] ? { page_message: PAGE_MESSAGE[error] } : {}), ...extra },
});
/** Bots see a normal success and nothing is stored (landing/README.md honeypot behaviour). */
const fakeOk = (reason) => ({ ok: false, http_status: 200, reason, silent: true, body: { ok: true, status: 'accepted' } });

// ---------------------------------------------------------------------------------------------- 1. screen (no I/O)
/**
 * screen(sub, { now, origin_ok }) -> { ok:true, mobile, mobile_hash } | { ok:false, http_status, body, reason, silent? }
 * Page-only checks (origin, honeypot, fill time) are skipped for lead_ad.
 */
export function screen(sub, { now = Date.now(), origin_ok = true } = {}) {
  if (sub.channel === 'page') {
    if (!origin_ok) return reject(403, 'forbidden');
    if (sub.honeypot) return fakeOk('honeypot');
    if (sub.started_at) {
      const fill = (now - msOf(sub.started_at)) / 1000;
      if (!(fill >= MIN_FILL_S && fill <= MAX_FILL_S)) return fakeOk('fill_time');
    }
  }
  const mobile = toE164(sub.mobile_raw);
  if (!mobile) return reject(sub.channel === 'page' ? 422 : 200, 'invalid_mobile');
  if (!sub.consent?.checked || !sub.consent?.text) return reject(sub.channel === 'page' ? 422 : 200, 'consent_required');
  return { ok: true, mobile, mobile_hash: hashContact(mobile) };
}

// ---------------------------------------------------------------------------------------------- 2. guard
/**
 * guard(screened, ctx) after the "Context" query (counters) and Turnstile siteverify.
 * ctx = { channel, ip_hits (submissions from this IP in the last hour, before this one), number_hits (last 24 h),
 *         turnstile: { skipped?, reachable?, success?, hostname_ok?, action_ok? }, test_hooks, limits:{ip, number}, fail_mode }
 * Test hooks (staging only: TEST_HOOKS_ENABLED + X-Test-Token + is_synthetic) bypass steps 4, 5 and 7 (B.4).
 */
export function guard(screened, ctx = {}) {
  if (!screened.ok) return screened;
  if (ctx.channel && ctx.channel !== 'page') return { ...screened, bot_check: 'n/a' };
  const t = ctx.turnstile || { skipped: true };
  const failOpen = (ctx.fail_mode || 'open') === 'open';
  const unreachable = !t.skipped && t.reachable === false;
  let bot_check = t.skipped ? 'skipped' : 'passed';
  if (!ctx.test_hooks) {
    const ipLimit = unreachable && failOpen ? IP_LIMIT_FAIL_OPEN : (ctx.limits?.ip ?? IP_LIMIT_PER_HOUR);
    if ((ctx.ip_hits ?? 0) >= ipLimit) return reject(429, 'rate_limited', { retry_after_s: 3600 });
    if (!t.skipped) {
      if (unreachable) {
        if (!failOpen) return reject(400, 'try_again');
        bot_check = 'unverified';
      } else if (!(t.success && t.hostname_ok !== false && t.action_ok !== false)) return reject(400, 'try_again');
    }
    if ((ctx.number_hits ?? 0) >= (ctx.limits?.number ?? NUMBER_LIMIT_PER_DAY)) return reject(429, 'rate_limited', { retry_after_s: 86400 });
  }
  return { ...screened, bot_check };
}

/** Turnstile siteverify response -> guard input. A timeout / 5xx / no body = unreachable (B.5). */
export function turnstileVerdict(resp, { allowed_hosts = [], action = 'lead' } = {}) {
  if (!resp || resp.error || typeof resp.success !== 'boolean') return { reachable: false };
  return { reachable: true, success: resp.success, hostname_ok: !allowed_hosts.length || allowed_hosts.includes(resp.hostname), action_ok: !resp.action || resp.action === action };
}

// ---------------------------------------------------------------------------------------------- 3. Lookup
/** Pay for Twilio Lookup only when the number has no line type from the last 30 days (prior lead with the same hash). */
export function lookupNeeded(prior, now = Date.now()) {
  return !(prior && prior.line_type && prior.line_type !== 'unknown' && now - msOf(prior.created_at) <= LOOKUP_CACHE_DAYS * D);
}
/** Twilio Lookup v2 line_type_intelligence.type (or the test header value) -> mobile | landline | voip | unknown | other. */
export function lineTypeOf(t) {
  const v = String(t ?? 'unknown');
  if (v === 'mobile') return 'mobile';
  if (v === 'landline') return 'landline';
  if (/voip/i.test(v)) return 'voip';
  if (v === 'unknown' || v === '') return 'unknown';
  return 'other'; // tollFree, premium, sharedCost, uan, voicemail, pager, personal: not a mobile
}
/** Twilio HTTP response -> line type. An outage, timeout or auth error fails OPEN as 'unknown' (WhatsApp delivery is the real test). */
export function lineTypeFromLookup(resp) {
  if (!resp || resp.error || resp.status >= 400 || !resp.line_type_intelligence) return 'unknown';
  return lineTypeOf(resp.line_type_intelligence.type);
}

// ---------------------------------------------------------------------------------------------- 4. routing (1.3)
const practiceOf = (b) => b.practice_name || b.firm_name || '';
// Capacity (CRM lead_orders, 2026-10-11): a broker is routable only while he has an open paid SortMyCover lead order
// (order_remaining > 0, from public.smc_order_capacity). The database enforces the same rule again when the row is written
// (smc_leads_route_check: no open order -> the lead is held, never over-delivered).
const hasOpenOrder = (b) => Number(b.order_remaining) > 0;
const isRoutable = (b, brandId) => b && (brandId == null || b.brand_id === brandId) && b.status === 'active' && b.routing_on !== false && b.active !== false && !b.bookings_paused && hasOpenOrder(b);
/** Tier C goes only to a broker with the standing yes (brokers.accepts_low_budget); tiers A/B to any routable broker. */
export const takesTier = (b, tier) => tier !== 'C' || b.accepts_low_budget === true;
/** A wills lead goes only to a broker that handles wills (brokers.handles_wills). */
export const takesProduct = (b, product) => product !== 'wills' || b.handles_wills === true;
/**
 * pickBroker(brokers, brand_id, tier?) -> broker or null. One broker today ("single_broker"); with more, the broker furthest
 * from filling his open lead orders gets the lead (ratio = order_attached / order_capacity), ties by id. Tier C: only
 * brokers with accepts_low_budget (the same fairness rule among them).
 */
export function pickBroker(brokers = [], brandId = null, tier = null, product = null) {
  const ok = brokers.filter((b) => isRoutable(b, brandId) && takesTier(b, tier) && takesProduct(b, product));
  if (!ok.length) return null;
  const ratio = (b) => (Number(b.order_attached) || 0) / Math.max(1, Number(b.order_capacity) || 1);
  const best = [...ok].sort((a, b) => ratio(a) - ratio(b) || String(a.broker_id ?? a.id).localeCompare(String(b.broker_id ?? b.id)))[0];
  return { ...best, _reason: ok.length === 1 ? 'single_broker' : 'balanced' };
}
const brokerIdOf = (b) => b.broker_id ?? b.id;

/**
 * I-52b: the consent text must name this broker's practice AND its FSP number exactly as every named text renders it
 * ("{practice_name} (FSP {fsp_number})", consent.json named / W03 named prompt). A broker row without a practice name
 * matches nothing (an empty name would otherwise be "included" in any text).
 */
export function namesPractice(consentText, b) {
  const practice = practiceOf(b || {});
  if (!practice) return false;
  const text = String(consentText || '');
  return b.fsp_number ? text.includes(`${practice} (FSP ${b.fsp_number})`) : text.includes(practice);
}

/**
 * Named consent (0.1 default while there is one broker): the practice named in the consent text must be the broker
 * we route to, otherwise the lead is HELD (stored, not handed over, not messaged) and ops sees it in the console.
 */
export function routingFor(consentText, consentMode, brokers, brandId, tier = null, product = null) {
  const b = pickBroker(brokers, brandId, tier, product);
  if (!b) return { held: product === 'wills' ? 'held_no_wills_broker' : tier === 'C' ? 'held_low_budget' : 'held_no_capacity' };
  if (consentMode === 'named' && !namesPractice(consentText, b)) return { held: 'held_consent_names_other_practice' };
  return { broker: b };
}

// ---------------------------------------------------------------------------------------------- 5. decide
/**
 * decide(sub, ctx) -> what the workflow writes and answers.
 * ctx = { mobile, line_type, prior (latest lead with the same hash in this brand: {id, brand_id, created_at, line_type,
 *         duplicate_of, broker_id, opted_out_at}), suppressed, brokers, brand_id, consent_mode, now, lead_id, bot_check }
 * Returns { kind: 'reject' | 'duplicate' | 'insert', response:{http_status, body}, row?, activities[], first_touch?, capi?, mint_token }
 */
export function decide(sub, ctx) {
  const now = ctx.now ?? Date.now();
  const at = isoSast(now);
  const lt = ctx.line_type ?? 'unknown';
  if (lt !== 'mobile' && lt !== 'unknown') return { kind: 'reject', response: { http_status: sub.channel === 'page' ? 422 : 200, body: reject(422, 'not_mobile').body }, activities: [] };

  const brandId = ctx.brand_id ?? sub.brand_id;
  const c = sub.context || {};
  const p = ctx.prior;
  if (p && (p.brand_id == null || p.brand_id === brandId) && !p.duplicate_of && now - msOf(p.created_at) <= DEDUPE_DAYS * D) {
    // 90-day merge: no new lead, no WhatsApp, no CAPI Lead. The page gets a fresh token for the EXISTING lead and never
    // learns it was a duplicate (CONTRACTS.md "lead_token": "The page never learns whether a lead was a duplicate").
    // the /start/ page continues an unrouted lead too (it routes only after the adviser card): a token for any live prior lead
    const live = !p.opted_out_at && (!!p.broker_id || sub.start_page === true);
    return {
      kind: 'duplicate', lead_id: p.id, mint_token: live && sub.channel === 'page',
      response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: p.id } },
      activities: [{ lead_id: p.id, activity_type: 'duplicate_submission', actor_type: 'lead', occurred_at: at,
        payload: { channel: sub.channel, ad_id: c.ad_id ?? null, utm_content: c.utm_content ?? null, leadgen_id: c.leadgen_id ?? null, event_id: c.event_id ?? null, at },
        idempotency_key: `w01:dup:${p.id}:${c.event_id || c.leadgen_id || sub.request_id || now}` }],
    };
  }

  const q = sub.quiz || {};
  const method = sub.preferred_method ?? null;
  const consentMode = ctx.consent_mode || sub.consent.mode || 'named';
  const row = {
    id: ctx.lead_id, brand_id: brandId, origin: sub.channel, source: LEAD_SOURCE, is_synthetic: !!sub.is_synthetic, created_at: at,
    first_name: sub.first_name, phone: ctx.mobile, line_type: lt, language: sub.language ?? null,
    age_band: q.age_band ?? null, budget_band: q.budget_band ?? null, bond: q.bond ?? null, dependants: q.dependants ?? null, work_cover: q.work_cover ?? null,
    method_pref: method, angle: sub.angle ?? null, product_interest: productOf(sub.angle, sub.product_interest),
    // 0.1 Email: kept only when the chosen method needs an invite, purpose meeting_invite only (never marketing, never Meta)
    email: method && EMAIL_METHODS.has(method) && sub.email ? sub.email : null,
    email_purpose: method && EMAIL_METHODS.has(method) && sub.email ? 'meeting_invite' : null,
    email_status: method && EMAIL_METHODS.has(method) && sub.email ? 'unchecked' : null,
    consent_text: sub.consent.text, consent_text_version: sub.consent.version, consent_mode: consentMode,
    consent_at: sub.consent.at ? isoSast(msOf(sub.consent.at)) : at, consent_page_url: sub.consent.page_url ?? null, consent_source: sub.consent.source,
    consent_ads_at: sub.consent.ads ? (sub.consent.at ? isoSast(msOf(sub.consent.at)) : at) : null,
    lead_event_id: sub.channel === 'page' ? c.event_id ?? null : `evt_${ctx.lead_id}_lead`,
    fbclid: c.fbclid ?? null, fbp: c.fbp ?? null, fbc: c.fbc ?? null, ad_id: c.ad_id ?? null, adset_id: c.adset_id ?? null, campaign_id: c.campaign_id ?? null,
    leadgen_id: c.leadgen_id ?? null, ref: c.ref ?? null,
    utm_source: c.utm_source ?? null, utm_medium: c.utm_medium ?? null, utm_campaign: c.utm_campaign ?? null, utm_content: c.utm_content ?? null, utm_term: c.utm_term ?? null,
    page_url: c.page_url ?? null, client_ip: c.client_ip ?? null, client_user_agent: c.client_user_agent ?? null,
    broker_id: null, routed_at: null, routing_reason: null,
    stage: 'new', disqualified_reason: null, retention_delete_after: null, opted_out_at: null,
  };
  const activities = [];
  const created = { activity_type: 'lead_created', actor_type: 'lead', occurred_at: at, idempotency_key: `w01:created:${ctx.lead_id}`,
    payload: { channel: sub.channel, consent_text_version: row.consent_text_version, line_type: lt, bot_check: ctx.bot_check ?? null, lookup_unverified: lt === 'unknown' } };
  activities.push(created);

  // /start/ page web intake: the answers come later on the page (W39) and every age may book (W39 OUT_OF_BAND_AGE_BOOKS), so
  // nothing here is out of band and nothing is routed: W39 routes after the adviser card (disclosure before routing).
  const startPage = sub.channel === 'page' && sub.start_page === true;
  // Meta instant form v2 (18 Oct 2026): every age is accepted, as on /start/. An under-35 / over-50 (or a missing) age is
  // stored and booked like any lead, never marked qualified (W03 finishLeadAd), with a timeline note; nothing is routed out.
  const leadAdAgeBooks = sub.channel === 'lead_ad' && OUT_OF_BAND_AGE_BOOKS;
  const ageOut = !startPage && !leadAdAgeBooks && !QUAL_AGE.has(row.age_band);
  const ageAccepted = leadAdAgeBooks && !QUAL_AGE.has(row.age_band);
  // Meta Lead Ads terms (2026-10-05): the instant form no longer asks the monthly budget band. A lead-ad lead without
  // one is not out of band: the band is the first WhatsApp step (automation/ctwa/w03.js budgetQuestion), decided there
  // by the same QUAL_BUDGET set. A lead-ad lead that does carry a band (older form) is judged here as before.
  const budgetPending = sub.channel === 'lead_ad' && row.budget_band == null && !ageOut;
  // Quiz v2 (2026-10-13): a page lead that says budget_pending is not out of band either. It is routed now (provisionally
  // as tier B: a broker who takes R750-R1,499 also takes R1,500+) so the page can book at once, and W05 holds the booking
  // until the band is known (and the email verified). The band answer can still move it: lt750 -> the database trigger
  // (smc_leads_route_check) holds it as tier C unless the broker has the standing yes.
  const pageBudgetPending = sub.channel === 'page' && sub.budget_pending === true && row.budget_band == null && !ageOut;
  const budOut = !startPage && !budgetPending && !pageBudgetPending && !KNOWN_BUDGET.has(row.budget_band); // under R750 is tier C, not out of band (2026-10-11)
  const tier = pageBudgetPending ? 'B' : tierOf(row.budget_band);
  // help_with has no column on public.leads: it is kept in conv_state (jsonb), no DDL (spec 2a)
  if (sub.channel === 'page' && sub.help_with) row.conv_state = { help_with: sub.help_with };
  // lead ad v2: the form's answers, kept like the /start/ page keeps them (conv_state.start + help_with, W01 vocabulary)
  const leadAdState = sub.channel === 'lead_ad' && (sub.lead_ad || ageAccepted)
    ? { ...(sub.lead_ad ? { start: { ...sub.lead_ad, at, via: 'lead_ad' } } : {}), ...(sub.lead_ad && sub.lead_ad.intent && sub.help_with ? { help_with: sub.help_with } : {}), ...(ageAccepted ? { age_accepted: true } : {}) }
    : null;
  if (leadAdState) row.conv_state = leadAdState;
  if (ageOut || budOut) {
    Object.assign(row, { stage: 'disqualified', disqualified_reason: ageOut ? 'age_band' : 'budget_band', retention_delete_after: isoSast(now + OUT_OF_BAND_RETENTION_H * H) });
    return { kind: 'insert', outcome: 'not_qualified', row, activities, first_touch: null, capi: null, mint_token: false,
      response: { http_status: 200, body: { ok: true, status: 'not_qualified', out_of_band: true, lead_id: row.id } } };
  }

  if (ctx.suppressed) {
    // A STOPped / objected number: stored as evidence, never routed, never messaged (W15 / W24 suppression list).
    Object.assign(row, { stage: 'opted_out', opted_out_at: at, routing_reason: 'suppressed' });
    activities.push({ activity_type: 'suppressed_at_intake', actor_type: 'system', occurred_at: at, idempotency_key: `w01:suppressed:${ctx.lead_id}`, payload: { channel: sub.channel } });
    return { kind: 'insert', outcome: 'suppressed', row, activities, first_touch: null, capi: null, mint_token: false,
      response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: row.id } } };
  }

  // the W39 OUT_OF_BAND_AGE_BOOKS note: the age is on the timeline, counting is unchanged (no qualified_at)
  if (ageAccepted) {
    activities.push({ activity_type: 'lead_ad_age_out_of_band', actor_type: 'system', occurred_at: at, idempotency_key: `w01:age_oob:${ctx.lead_id}`,
      payload: { age_band: row.age_band, budget_band: row.budget_band, books: true, qualified: false, rule: OOB_AGE_RULE, via: 'lead_ad' } });
  }

  if (startPage) {
    // Not routed, no first touch, no WhatsApp (the lead has not messaged us: no 24-h session), no CAPI Lead yet: routeExisting()
    // sends Lead at the hand-over (start_page_pending counts as held, I-49c). The page continues with the token: GET /start,
    // POST /start/answers (adviser card, then confirm -> W39 routes with first_touch false), W04 /slots, W05 /book.
    Object.assign(row, { routing_reason: START_PAGE_PENDING, conv_state: { state: 'start_page', via: 'start_page' } });
    activities.push({ activity_type: 'start_page_pending', actor_type: 'system', occurred_at: at, idempotency_key: `w01:start_page:${ctx.lead_id}`,
      payload: { channel: 'page', consent_text_version: row.consent_text_version, ref: c.ref ?? null } });
    return { kind: 'insert', outcome: 'start_page', row, activities, first_touch: null, capi: null, mint_token: true,
      response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: row.id } } };
  }

  if (pageBudgetPending) {
    // Quiz v2: the band is the one thing the page did not ask. The first WhatsApp (< 60 s) is the approved qualify_budget
    // template (budgetQuestion below), whether or not a broker is free right now. The tap comes back W07 -> W03 (state
    // q_budget is a qualifying state, so no new W07 route) and W03 finishPageBudget records the band, routes a held lead and
    // finalizes any held booking. help_with (the page's reason) stays in conv_state; no q_reason step is asked on WhatsApp.
    row.conv_state = { state: 'q_budget', budget_pending: true, help_with: sub.help_with ?? null };
    activities.push({ activity_type: 'budget_question_pending', actor_type: 'system', occurred_at: at,
      idempotency_key: `w01:budget_pending:${ctx.lead_id}`, payload: { channel: 'page', help_with: sub.help_with ?? null } });
  }

  if (budgetPending) {
    // Not routed, not handed over, no CAPI Lead yet: routeExisting() sends Lead at the hand-over (held_* rule, I-49c).
    // The first WhatsApp (< 60 s, HBR) is the budget question; W07 sends the tap to W03 because conv_state is q_budget.
    Object.assign(row, { routing_reason: 'held_budget_pending', conv_state: { ...(row.conv_state || {}), state: 'q_budget' } });
    activities.push({ activity_type: 'budget_question_pending', actor_type: 'system', occurred_at: at, idempotency_key: `w01:budget_pending:${ctx.lead_id}`, payload: { channel: sub.channel } });
    return { kind: 'insert', outcome: 'budget_pending', row, activities, capi: null, mint_token: false,
      first_touch: { workflow: 'W03', op: 'ask_budget', lead_id: row.id, not_before: at, origin: row.origin, deadline_s: FIRST_TOUCH_DEADLINE_S },
      response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: row.id } } };
  }

  const r = routingFor(row.consent_text, consentMode, ctx.brokers || [], brandId, tier, row.product_interest);
  if (r.held) {
    row.routing_reason = r.held;
    activities.push({ activity_type: 'routing_held', actor_type: 'system', occurred_at: at, idempotency_key: `w01:held:${ctx.lead_id}`, payload: { reason: r.held, lead_tier: tier } });
    // R6-11 / I-49c: a held lead (consent names another practice, or no capacity) may never be handed over, so no CAPI
    // Lead now; routeExisting() sends it at the hand-over (held -> routed), same event_id, so Meta optimises on real leads.
    // Tier C held: one honest WhatsApp (we are checking which adviser can help at that budget), never a promise of a call.
    return { kind: 'insert', outcome: 'held', row, activities, first_touch: null, capi: null, mint_token: false,
      budget_question: pageBudgetPending,
      notice: r.held === 'held_low_budget' ? lowBudgetHeld(row) : null,
      response: { http_status: 200, body: { ok: true, status: 'held', lead_id: row.id } } };
  }
  const b = r.broker;
  Object.assign(row, { broker_id: brokerIdOf(b), routed_at: at, routing_reason: b._reason });
  activities.push({ activity_type: 'routed', actor_type: 'system', occurred_at: at, idempotency_key: `w01:routed:${ctx.lead_id}`,
    payload: { broker_id: row.broker_id, reason: row.routing_reason, ...(pageBudgetPending ? { provisional_tier: 'B' } : {}) } });
  // W05 keeps any booking held until budget_band is set (and the email verified)
  return {
    kind: 'insert', outcome: 'accepted', row, activities, capi: capiLead(row), mint_token: sub.channel === 'page', budget_question: pageBudgetPending,
    // routed_at is written in the same statement as the lead row; W06 is called only after that statement returns.
    first_touch: { workflow: 'W06', op: 'routed', lead_id: row.id, not_before: row.routed_at, origin: row.origin, deadline_s: FIRST_TOUCH_DEADLINE_S },
    response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: row.id, methods_supported: b.methods_supported || ['whatsapp_call', 'phone'] } },
  };
}

/**
 * The first WhatsApp for a lead-ad lead whose instant form no longer asks the budget band (Meta Lead Ads terms,
 * 2026-10-05): utility template qualify_budget, one quick reply per band. The payload ids are exactly W03's BUDGET_ROWS
 * ids (automation/ctwa/w03.js), so the tap is decided by W03's own QUAL_BUDGET set (W01.test.mjs pins the match).
 * Input for the shared sender (SUB-whatsapp-send, "decided" shape); correlation makes a retried W01 run send once.
 */
export const BUDGET_TEMPLATE = 'qualify_budget';
export const BUDGET_TAP_IDS = ['budget_under_500', 'budget_500_750', 'budget_750_1250', 'budget_1250_1499', 'budget_1500_plus'];
export function budgetQuestion(row) {
  return {
    to: row.phone, kind: 'template', template: BUDGET_TEMPLATE, variables: [String(row.first_name || '').trim() || 'there'],
    buttons: BUDGET_TAP_IDS.map((id) => ({ quick_reply: id })), lead_id: row.id, correlation: `w01:ask_budget:${row.id}`,
  };
}

/**
 * The ONE budget reminder (decided 2026-10-05): no tap within 3 h of the first qualify_budget -> the same template once
 * more, never inside lead quiet hours (20:00-08:00 SAST, same window as W08; a reminder due then goes at 08:00), then
 * nothing. The reminder sets retention_delete_after = reminder + 24 h: a lead who never taps is never handed over and is
 * deleted on the same 24-h rule as an out-of-band lead, counted from the reminder (a tap in time qualifies the lead and
 * W03 clears the date). Marked before sending (conv_state.budget_reminded_at): a duplicate is worse than a miss.
 */
export const BUDGET_REMINDER_H = 3;
export const BUDGET_REMINDER_QUIET = { from: 20, to: 8 };
export const NO_TAP_RETENTION_H = 24;
const inQuiet = (t) => { const h = new Date(t + 2 * H).getUTCHours(); return h >= BUDGET_REMINDER_QUIET.from || h < BUDGET_REMINDER_QUIET.to; };
export function budgetReminder(lead, nowMs = Date.now()) {
  const cs = lead && lead.conv_state || {};
  if (!lead || lead.origin !== 'lead_ad' || lead.routing_reason !== 'held_budget_pending' || cs.state !== 'q_budget') return null;
  if (lead.broker_id || lead.opted_out_at || lead.disqualified_reason || lead.qualified_at || cs.budget_reminded_at) return null;
  if (nowMs < msOf(lead.created_at) + BUDGET_REMINDER_H * H || inQuiet(nowMs)) return null;
  const at = isoSast(nowMs);
  return { lead_id: lead.id, reminded_at: at, retention_delete_after: isoSast(nowMs + NO_TAP_RETENTION_H * H),
    send: { ...budgetQuestion(lead), correlation: `w01:ask_budget_reminder:${lead.id}` } };
}

/**
 * CAPI Send payload for the Lead event (CONTRACTS.md "Sub-workflow interfaces" row "CAPI Send").
 * Consent gate first (event-spec): no consent_ads_at -> nothing. Page: the browser's event_id (Pixel + CAPI dedupe),
 * fallback evt_<lead_id>_lead. Lead Ads: evt_<lead_id>_lead, system_generated. Only ids travel: the callee hashes
 * phone + name inside capi.js; email is never sent to Meta (event-spec "Email is never sent").
 */
export function capiLead(row) {
  if (!row || !row.consent_ads_at) return null;
  return {
    event_name: 'Lead',
    event_id: row.origin === 'page' && row.lead_event_id ? row.lead_event_id : `evt_${row.id}_lead`,
    action_source: row.origin === 'page' ? 'website' : 'system_generated',
    lead_id: row.id, brand_id: row.brand_id, event_time: row.created_at,
  };
}

/**
 * W03 hand-off ("W01 Lead core", kind route_and_first_touch): the CTWA lead row already exists (consent at the tap,
 * qualified by taps), or a page / lead-ad lead W01 held at intake. Route it and start the first touch; a held page /
 * lead-ad lead gets its CAPI Lead here (I-49c). Idempotent: an already-routed lead is not re-routed.
 * first_touch: false (W39, the /start/ page, 18 Oct 2026): route exactly the same way but start no W06 first touch, because
 * the page shows the adviser and the slots itself (the intro card follows the booking: W05 -> W06 op booking). A held tier-C
 * lead still gets its one notice.
 * W39 disclosure before routing (18 Oct 2026): expect_broker_id = the adviser the lead was shown and confirmed; any other
 * pick is NOT routed (action 'skip', reason 'broker_changed'). hold_only: true records a hold (+ the tier-C notice) but
 * never routes (a broker that became free meanwhile -> 'skip', reason 'not_disclosed').
 */
export function routeExisting(lead, { brokers = [], now = Date.now(), consent_mode = 'named', first_touch = true, expect_broker_id = null, hold_only = false } = {}) {
  const at = isoSast(now);
  if (!lead || lead.opted_out_at || lead.disqualified_reason) return { action: 'skip', reason: !lead ? 'no_lead' : lead.opted_out_at ? 'opted_out' : 'out_of_band' };
  if (lead.broker_id && lead.routed_at) return { action: 'already_routed', first_touch: null };
  if (lead.suppressed) return { action: 'skip', reason: 'suppressed' };
  const r = routingFor(lead.consent_text, lead.consent_mode || consent_mode, brokers, lead.brand_id, tierOf(lead.budget_band), lead.product_interest || null);
  if (r.held) return { action: 'held', update: { routing_reason: r.held }, notice: r.held === 'held_low_budget' ? lowBudgetHeld(lead) : null };
  const b = r.broker;
  if (hold_only) return { action: 'skip', reason: 'not_disclosed' };
  if (expect_broker_id && String(brokerIdOf(b)) !== String(expect_broker_id)) return { action: 'skip', reason: 'broker_changed' };
  const update = { broker_id: brokerIdOf(b), routed_at: at, routing_reason: b._reason };
  // I-49c: the CAPI Lead W01 withheld at intake (held_*) goes now, at the hand-over. CTWA leads are W03's (never here).
  const wasHeld = (String(lead.routing_reason || '').startsWith('held_') || lead.routing_reason === START_PAGE_PENDING) && (lead.origin || 'ctwa') !== 'ctwa';
  return { action: 'routed', update, capi: wasHeld ? capiLead(lead) : null,
    first_touch: first_touch === false ? null : { workflow: 'W06', op: 'routed', lead_id: lead.id, not_before: at, origin: lead.origin || 'ctwa', deadline_s: FIRST_TOUCH_DEADLINE_S } };
}

// ---------------------------------------------------------------------------------------------- 5b. tier C (under R750)
/**
 * The one WhatsApp a held tier-C lead gets (template lead_low_budget_held): we are checking which authorised adviser can
 * help at the budget they chose and will come back to them. No promise of a call, no advice, no amounts. Shared sender
 * input ("decided" shape, as budgetQuestion); the correlation makes it once per lead, whichever path holds it.
 */
export function lowBudgetHeld(lead) {
  if (!lead || !lead.id || !lead.phone) return null;
  return { to: lead.phone, kind: 'template', template: LOW_BUDGET_HELD_TEMPLATE, variables: [String(lead.first_name || '').trim().split(/\s+/)[0] || 'there'],
    lead_id: lead.id, correlation: `w01:low_budget_held:${lead.id}` };
}

/**
 * Low-budget sweep, hand-off half: an admin assigned a held tier-C lead (portal: leads.broker_id + routing_reason
 * 'manual_low_budget'; the database reserved the place and recorded the accept). Start the normal booking flow exactly
 * like any routed lead: W06 { op: 'routed' } (slots card or Flow, then W05 booking with email verification and the Teams
 * link). Waits while the lead is still answering the qualifying questions. null = nothing to do.
 */
export function lowBudgetHandoff(lead) {
  if (!lead || !lead.id || !lead.broker_id || lead.routing_reason !== 'manual_low_budget') return null;
  if (lead.opted_out_at || lead.first_message_at || lead.disqualified_reason || lead.order_state !== 'attached') return null;
  if (QUALIFYING_STATES.has(lead.conv_state && lead.conv_state.state)) return null;
  return { op: 'routed', lead_id: lead.id, origin: lead.origin || 'ctwa', claim_key: `w01:low_budget_handoff:${lead.id}` };
}

/**
 * Low-budget sweep, close half: a tier-C lead nobody took within LOW_BUDGET_HOLD_DAYS of capture is closed politely, like an
 * unbooked close (stage unbooked_closed, routing_reason low_budget_no_taker, conv_state closed_unbooked). It is a real lead,
 * not out of band: no 24-h deletion, the normal retention clock (last_contact_at, CONTRACTS I-38d) applies. One message
 * (template lead_low_budget_closed), never in lead quiet hours (20:00-08:00 SAST: the 08:00 sweep picks it up).
 */
export function lowBudgetClose(lead, nowMs = Date.now()) {
  if (!lead || !lead.id || lead.broker_id || lead.routing_reason !== 'held_low_budget') return null;
  if (lead.opted_out_at || lead.disqualified_reason || ['unbooked_closed', 'opted_out', 'disqualified'].includes(lead.stage)) return null;
  if (nowMs < msOf(lead.created_at) + LOW_BUDGET_HOLD_DAYS * D || inQuiet(nowMs)) return null;
  return {
    lead_id: lead.id,
    update: { stage: 'unbooked_closed', routing_reason: 'low_budget_no_taker', conv_state_state: 'closed_unbooked', closed_reason: 'low_budget_no_taker' },
    send: lead.phone ? { to: lead.phone, kind: 'template', template: LOW_BUDGET_CLOSED_TEMPLATE, variables: [String(lead.first_name || '').trim().split(/\s+/)[0] || 'there'],
      lead_id: lead.id, correlation: `w01:low_budget_closed:${lead.id}` } : null,
  };
}

// ---------------------------------------------------------------------------------------------- 6. token
/** lead_token (CONTRACTS.md I-29): minted for the page response only; the secret comes from $env.LEAD_TOKEN_SECRET. */
export function mintToken(leadId, secret, nowMs = Date.now()) {
  return LT.mintLeadToken(leadId, { secret, nowMs }).token;
}

/** Client IP for counting only: HMAC with a salt, never stored raw (B.3 counters; POPIA minimisation). */
export function ipKey(ip, salt) {
  if (!ip) return null;
  return createHmac('sha256', String(salt || 'w01')).update(String(ip), 'utf8').digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------------------------- 7. workflow glue (pure)
/**
 * I-52b / rehearsal F1: the brand W01 writes under is brands.id (uuid), never the slug. A uuid brand_id carried on the
 * item (W02 ingest) wins; otherwise $env.BRAND_ID. Anything else fails fast here with a clear message instead of a
 * Postgres "invalid input syntax for type uuid" deep in the Context query.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function brandUuid(itemBrandId, envBrandId) {
  if (UUID_RE.test(String(itemBrandId || ''))) return String(itemBrandId).toLowerCase();
  const v = String(envBrandId ?? '').trim();
  if (!UUID_RE.test(v)) throw new Error(`BRAND_ID must be the brands.id uuid (got ${v ? JSON.stringify(v.slice(0, 40)) : 'nothing'}); set BRAND_ID in .env to the id of the SortMyCover row in public.brands, not its slug or code.`);
  return v.toLowerCase();
}

/** New lead id (uuid v4). Generated in code so the lead_token can be minted before the insert returns. */
export const newLeadId = () => randomUUID();

/**
 * Rate counters without a new table (W03-notes B.3 #4/#7 until ops.rate_counters exists): one public.webhook_events
 * row per counted request, source 'w01_ip' / 'w01_num', external_id '<key>:<request id>'. The key is an HMAC of the
 * IP (never the raw IP) or the digits-only mobile hash. Rows carry no PII and are purged with webhook_events.
 */
export function rateKeys({ ip, mobile_hash, request_id, salt, now = Date.now() } = {}) {
  const rid = request_id || `t${now}`;
  const k = ipKey(ip, salt);
  return {
    ip_prefix: k ? `ip:${k}:` : null, ip_external_id: k ? `ip:${k}:${rid}` : null,
    num_prefix: mobile_hash ? `num:${mobile_hash}:` : null, num_external_id: mobile_hash ? `num:${mobile_hash}:${rid}` : null,
  };
}

/**
 * Consent audit (compliance-qa review 2: "W01 to rebuild consent text server-side from version"). The text the page
 * posted is stored verbatim (it is what the person saw, 2.1.2), and it is compared with the registry text for that
 * version. A mismatch or an unknown version is logged on the timeline for compliance-qa; it never blocks the lead
 * (named-mode routing below still refuses a text that names another practice).
 */
export function consentAudit(sub, registry = {}) {
  const v = sub?.consent?.version ?? null;
  const known = v != null && Object.prototype.hasOwnProperty.call(registry, v);
  return { version: v, known_version: known, matches_registry: known ? registry[v] === sub.consent.text : null };
}

/** The /lead HTTP answer. lead_token only when decide() says so (routed or merged into a live lead). */
export function pageResponse(decision, token = null) {
  const body = { ...decision.response.body };
  if (decision.mint_token && token) body.lead_token = token;
  return { http_status: decision.response.http_status, body };
}

/** What "W01 Lead core" returns to a waiting caller (W02): no PII, only ids and the outcome. */
export function coreResult(decision) {
  return {
    outcome: decision.kind === 'insert' ? decision.outcome : decision.kind,
    lead_id: decision.row?.id ?? decision.lead_id ?? null,
    broker_id: decision.row?.broker_id ?? null,
    first_touch: !!decision.first_touch,
  };
}
