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
  '750_1250': '750_1250', '750-1250': '750_1250', '1250plus': '1250plus', '1250_plus': '1250plus', '1250+': '1250plus',
};
export const QUAL_AGE = new Set(['35_44', '45_50']);
export const QUAL_BUDGET = new Set(['750_1250', '1250plus']); // 0.1: R750-R1,250 and R1,250+ both qualify
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
        page_url: body.page_url || null, mode: body.consent_mode || null, ads: adsSentence(body.consent_text, body.consent_version) };
  return {
    channel: 'page',
    brand_id: body.brand_id ?? null,
    is_synthetic: body.is_synthetic === true,
    submitted_at: body.submitted_at ?? null,
    first_name: cleanName(body.first_name),
    mobile_raw: typeof body.mobile === 'string' ? body.mobile : null,
    language: body.language ?? body.lang ?? null,
    angle: body.angle ?? null,
    quiz: {
      age_band: AGE_TO_DB[q.age_band] ?? null, budget_band: BUDGET_TO_DB[q.budget_band] ?? null,
      bond: yes(q.has_bond ?? q.bond), dependants: dependantsOf(q.has_dependants ?? q.dependants), work_cover: yes(q.has_work_cover ?? q.work_cover),
    },
    preferred_method: methodOf(body.preferred_method ?? body.method),
    email: typeof body.email === 'string' ? body.email.trim() : null,
    consent: { ...consent, source: 'page' },
    context: {
      event_id: str(c.event_id), fbclid: str(c.fbclid), fbp: str(c.fbp), fbc: str(c.fbc), ad_id: str(c.ad_id),
      adset_id: str(c.adset_id), campaign_id: str(c.campaign_id),
      utm_source: str(c.utm_source ?? utm.source), utm_medium: str(c.utm_medium ?? utm.medium), utm_campaign: str(c.utm_campaign ?? utm.campaign),
      utm_content: str(c.utm_content ?? utm.content), utm_term: str(c.utm_term ?? utm.term),
      page_url: str(c.page_url ?? body.page_url), client_ip: opts.ip ?? str(c.client_ip), client_user_agent: opts.user_agent ?? str(c.client_user_agent ?? c.user_agent),
    },
    honeypot: body.honeypot ?? body.company_website ?? '',
    started_at: body.started_at ?? null,
    turnstile_token: body.turnstile_token ?? null,
    request_id: body.request_id ?? null,
  };
}

/** The named-consent registry (landing/config/consent.json, CP-v0.1): version -> exact text for a practice. */
export function consentRegistry(broker = {}) {
  const fill = (t) => t.replace('{practice_name}', broker.practice_name || broker.firm_name || '').replace('{fsp_number}', broker.fsp_number || '');
  return {
    [CONSENT.named.version]: `${fill(CONSENT.named.text)} ${CONSENT.ads}`,
    [CONSENT.generic.version]: `${CONSENT.generic.text} ${CONSENT.ads}`,
  };
}

/**
 * Lead Ads -> canonical submission. Accepts the raw Graph lead (field_data + custom_disclaimer_responses, the
 * fixture shape) and the W02 "ingest" item (W02.json "Fetch lead via Graph + backstop": mobile_raw, consent{...}).
 * The stored consent text is the exact form text for that version (opts.consent_texts, default consentRegistry()).
 */
export function normaliseLeadAd(p = {}, opts = {}) {
  const reg = opts.consent_texts || consentRegistry(opts.broker);
  if (Array.isArray(p.field_data)) {
    const f = Object.fromEntries(p.field_data.map((x) => [x.name, x.values?.[0]]));
    const consented = (p.custom_disclaimer_responses || []).some((r) => r.checkbox_key === 'consent' && String(r.is_checked) === '1');
    const text = reg[p.consent_text_version] ?? null;
    const from_registry = !opts.consent_texts && text != null;
    return {
      channel: 'lead_ad', brand_id: p.brand_id ?? 'smc', is_synthetic: p.is_synthetic === true, submitted_at: p.created_time,
      first_name: cleanName(f.first_name), mobile_raw: f.phone_number ?? null, language: f.language ?? null,
      quiz: { age_band: AGE_TO_DB[f.age_band] ?? null, budget_band: BUDGET_TO_DB[f.budget_band] ?? null, bond: yes(f.has_bond), dependants: yes(f.has_dependants), work_cover: null },
      preferred_method: methodOf(f.preferred_method), email: f.email ?? null,
      consent: { checked: consented && !!text, text, version: p.consent_text_version ?? null, at: p.created_time, page_url: null, source: 'lead_ad', ads: adsSentence(text, p.consent_text_version), from_registry },
      context: { event_id: null, ad_id: p.ad_id ?? null, adset_id: p.adset_id ?? null, campaign_id: p.campaign_id ?? null, leadgen_id: p.leadgen_id ?? null, form_id: p.form_id ?? null },
      honeypot: '', started_at: null, turnstile_token: null, request_id: p.leadgen_id ?? null,
    };
  }
  const l = p.lead || p;
  const ver = l.consent?.text_version ?? null;
  const text = reg[ver] ?? l.consent?.text ?? null;
  const from_registry = !opts.consent_texts && reg[ver] != null;
  return {
    channel: 'lead_ad', brand_id: l.brand_id ?? null, is_synthetic: l.is_synthetic === true, submitted_at: l.consent?.captured_at ?? null,
    first_name: cleanName(l.first_name ?? String(l.full_name || '').split(' ')[0]), mobile_raw: l.mobile_raw ?? null, language: l.language ?? null,
    quiz: { age_band: AGE_TO_DB[l.age_band] ?? null, budget_band: BUDGET_TO_DB[l.budget_band] ?? null, bond: yes(l.bond_children?.bond ?? l.bond), dependants: yes(l.bond_children?.children ?? l.dependants), work_cover: null },
    preferred_method: methodOf(l.preferred_method), email: l.email ?? null,
    consent: { checked: l.consent?.given === true && !!text, text, version: ver, at: l.consent?.captured_at ?? null, page_url: null, source: 'lead_ad', ads: adsSentence(text, ver), from_registry },
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
const isRoutable = (b, brandId) => b && (brandId == null || b.brand_id === brandId) && b.status === 'active' && b.routing_on !== false && b.active !== false && !b.bookings_paused;
/**
 * pickBroker(brokers, brand_id) -> broker or null. One broker today ("single_broker"); with more, the broker furthest
 * from their committed number this cycle gets the lead (ratio = leads_this_cycle / committed_leads), ties by id.
 */
export function pickBroker(brokers = [], brandId = null) {
  const ok = brokers.filter((b) => isRoutable(b, brandId));
  if (!ok.length) return null;
  const ratio = (b) => (Number(b.leads_this_cycle) || 0) / Math.max(1, Number(b.committed_leads) || 1);
  const best = [...ok].sort((a, b) => ratio(a) - ratio(b) || String(a.broker_id ?? a.id).localeCompare(String(b.broker_id ?? b.id)))[0];
  return { ...best, _reason: ok.length === 1 ? 'single_broker' : 'balanced' };
}
const brokerIdOf = (b) => b.broker_id ?? b.id;

/**
 * Named consent (0.1 default while there is one broker): the practice named in the consent text must be the broker
 * we route to, otherwise the lead is HELD (stored, not handed over, not messaged) and ops sees it in the console.
 */
export function routingFor(consentText, consentMode, brokers, brandId) {
  const b = pickBroker(brokers, brandId);
  if (!b) return { held: 'held_no_capacity' };
  if (consentMode === 'named' && !String(consentText || '').includes(practiceOf(b))) return { held: 'held_consent_names_other_practice' };
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
    const live = !!p.broker_id && !p.opted_out_at;
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
    id: ctx.lead_id, brand_id: brandId, origin: sub.channel, source: 'LV Campaign', is_synthetic: !!sub.is_synthetic, created_at: at,
    first_name: sub.first_name, phone: ctx.mobile, line_type: lt, language: sub.language ?? null,
    age_band: q.age_band ?? null, budget_band: q.budget_band ?? null, bond: q.bond ?? null, dependants: q.dependants ?? null, work_cover: q.work_cover ?? null,
    method_pref: method, angle: sub.angle ?? null,
    // 0.1 Email: kept only when the chosen method needs an invite, purpose meeting_invite only (never marketing, never Meta)
    email: method && EMAIL_METHODS.has(method) && sub.email ? sub.email : null,
    email_purpose: method && EMAIL_METHODS.has(method) && sub.email ? 'meeting_invite' : null,
    email_status: method && EMAIL_METHODS.has(method) && sub.email ? 'unchecked' : null,
    consent_text: sub.consent.text, consent_text_version: sub.consent.version, consent_mode: consentMode,
    consent_at: sub.consent.at ? isoSast(msOf(sub.consent.at)) : at, consent_page_url: sub.consent.page_url ?? null, consent_source: sub.consent.source,
    consent_ads_at: sub.consent.ads ? (sub.consent.at ? isoSast(msOf(sub.consent.at)) : at) : null,
    lead_event_id: sub.channel === 'page' ? c.event_id ?? null : `evt_${ctx.lead_id}_lead`,
    fbclid: c.fbclid ?? null, fbp: c.fbp ?? null, fbc: c.fbc ?? null, ad_id: c.ad_id ?? null, adset_id: c.adset_id ?? null, campaign_id: c.campaign_id ?? null,
    leadgen_id: c.leadgen_id ?? null,
    utm_source: c.utm_source ?? null, utm_medium: c.utm_medium ?? null, utm_campaign: c.utm_campaign ?? null, utm_content: c.utm_content ?? null, utm_term: c.utm_term ?? null,
    page_url: c.page_url ?? null, client_ip: c.client_ip ?? null, client_user_agent: c.client_user_agent ?? null,
    broker_id: null, cycle_id: null, tier_code: null, routed_at: null, routing_reason: null,
    stage: 'new', disqualified_reason: null, retention_delete_after: null, opted_out_at: null,
  };
  const activities = [];
  const created = { activity_type: 'lead_created', actor_type: 'lead', occurred_at: at, idempotency_key: `w01:created:${ctx.lead_id}`,
    payload: { channel: sub.channel, consent_text_version: row.consent_text_version, line_type: lt, bot_check: ctx.bot_check ?? null, lookup_unverified: lt === 'unknown' } };
  activities.push(created);

  const ageOut = !QUAL_AGE.has(row.age_band);
  const budOut = !QUAL_BUDGET.has(row.budget_band);
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

  const r = routingFor(row.consent_text, consentMode, ctx.brokers || [], brandId);
  if (r.held) {
    row.routing_reason = r.held;
    activities.push({ activity_type: 'routing_held', actor_type: 'system', occurred_at: at, idempotency_key: `w01:held:${ctx.lead_id}`, payload: { reason: r.held } });
    // R6-11 / I-49c: a held lead (consent names another practice, or no capacity) may never be handed over, so no CAPI
    // Lead now; routeExisting() sends it at the hand-over (held -> routed), same event_id, so Meta optimises on real leads.
    return { kind: 'insert', outcome: 'held', row, activities, first_touch: null, capi: null, mint_token: false,
      response: { http_status: 200, body: { ok: true, status: 'held', lead_id: row.id } } };
  }
  const b = r.broker;
  Object.assign(row, { broker_id: brokerIdOf(b), cycle_id: b.current_cycle_id ?? null, tier_code: b.tier_code ?? null, routed_at: at, routing_reason: b._reason });
  activities.push({ activity_type: 'routed', actor_type: 'system', occurred_at: at, idempotency_key: `w01:routed:${ctx.lead_id}`,
    payload: { broker_id: row.broker_id, cycle_id: row.cycle_id, reason: row.routing_reason } });
  return {
    kind: 'insert', outcome: 'accepted', row, activities, capi: capiLead(row), mint_token: sub.channel === 'page',
    // routed_at is written in the same statement as the lead row; W06 is called only after that statement returns.
    first_touch: { workflow: 'W06', op: 'routed', lead_id: row.id, not_before: row.routed_at, origin: row.origin, deadline_s: FIRST_TOUCH_DEADLINE_S },
    response: { http_status: 200, body: { ok: true, status: 'accepted', lead_id: row.id, methods_supported: b.methods_supported || ['whatsapp_call', 'phone'] } },
  };
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
 */
export function routeExisting(lead, { brokers = [], now = Date.now(), consent_mode = 'named' } = {}) {
  const at = isoSast(now);
  if (!lead || lead.opted_out_at || lead.disqualified_reason) return { action: 'skip', reason: !lead ? 'no_lead' : lead.opted_out_at ? 'opted_out' : 'out_of_band' };
  if (lead.broker_id && lead.routed_at) return { action: 'already_routed', first_touch: null };
  if (lead.suppressed) return { action: 'skip', reason: 'suppressed' };
  const r = routingFor(lead.consent_text, lead.consent_mode || consent_mode, brokers, lead.brand_id);
  if (r.held) return { action: 'held', update: { routing_reason: r.held } };
  const b = r.broker;
  const update = { broker_id: brokerIdOf(b), cycle_id: b.current_cycle_id ?? null, tier_code: b.tier_code ?? null, routed_at: at, routing_reason: b._reason };
  // I-49c: the CAPI Lead W01 withheld at intake (held_*) goes now, at the hand-over. CTWA leads are W03's (never here).
  const wasHeld = String(lead.routing_reason || '').startsWith('held_') && (lead.origin || 'ctwa') !== 'ctwa';
  return { action: 'routed', update, capi: wasHeld ? capiLead(lead) : null, first_touch: { workflow: 'W06', op: 'routed', lead_id: lead.id, not_before: at, origin: lead.origin || 'ctwa', deadline_s: FIRST_TOUCH_DEADLINE_S } };
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
