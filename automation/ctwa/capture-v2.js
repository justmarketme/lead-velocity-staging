'use strict';
// automation/ctwa/capture-v2.js - SortMyCover WhatsApp capture flow v2 (Jonathan, 2026-10-07).
// Owner: automation-engineer. CommonJS + node:crypto only, so inline-for-n8n.mjs can inline it like w03.js / w28-endpoint.js.
// Spec + exact copy: deliverables/automation-engineer/whatsapp-capture-flow-v2.md. Tests: automation/tests/capture-v2.test.mjs.
//
// Path: CTWA ad or landing -> consent tap (W03, unchanged) -> wa_id is channel-verified -> capture Flow (this module's
// endpoint handler, kind 'capture' flow_token) -> tier A (R1,500+) books Teams in the Flow (W04 slots, W05 book) and gets
// the broker_intro_booked card; tier B (R750-R1,499) is OFFERED to the routed broker (Accept/Decline) and only books after
// acceptance; below R750 or outside 0.1 age bands -> polite close, never delivered or counted.
//
// Which of my five: HBR (consent + first Flow inside the first minute; nothing here waits on a human for tier A),
// Chili Piper (qualify -> route -> book inside the one WhatsApp chat, no separate site), Calendly/Cal.com (slots come from
// W04 rules over Graph, W05 re-checks before insert), Meta Cloud API & Flows (CalendarPicker, data_exchange < 3 s,
// utility templates only). Pure: no network, no DB. Every input arrives via deps; every write leaves as an effect.
const crypto = require('crypto');

// ------------------------------------------------------------------------------------------------ copy (single source)
const REASONS = [
  ['life_cover', 'Life cover'],
  ['funeral_cover', 'Funeral cover'],
  ['retirement_planning', 'Retirement planning'],
  ['investments', 'Investments'],
  ['disability', 'Disability cover'],
  ['paying_too_much', "I feel like I'm paying too much"],
  ['other', 'Something else'],
];
const SPEND = [
  ['lt500', 'Under R500'],
  ['500_1000', 'R500 to R1,000'],
  ['1000_1500', 'R1,000 to R1,500'],
  ['1500_2500', 'R1,500 to R2,500'],
  ['2500plus', 'R2,500 or more'],
  ['prefer_not', 'Prefer not to say'],
];
const AGE = [['lt35', 'Under 35'], ['35_44', '35 to 44'], ['45_50', '45 to 50'], ['51plus', '51 or older']];
const BUDGET = [['1500_plus', 'R1,500 or more'], ['1250_1499', 'R1,250 to R1,499'], ['750_1250', 'R750 to R1,249'], ['lt750', 'Under R750']];
const SMOKER = [['no', 'No'], ['yes', 'Yes'], ['prefer_not', 'Prefer not to say']];
const INCOME = [
  ['lt20k', 'Under R20,000'],
  ['20k_40k', 'R20,000 to R39,999'],
  ['40k_60k', 'R40,000 to R59,999'],
  ['60k_100k', 'R60,000 to R99,999'],
  ['100kplus', 'R100,000 or more'],
  ['prefer_not', 'Prefer not to say'],
];
const NUMBER_CHOICE = [['same', 'Yes, use my WhatsApp number'], ['other', 'No, use another number']];

const COPY = {
  reasons_title: 'What can we help with?',
  reasons_heading: 'What would you like to talk to an adviser about?',
  reasons_label: 'Choose all that apply',
  spend_title: 'Your current cover',
  spend_heading_default: 'What are you paying at the moment? (Optional)',
  spend_heading_too_much: "You said you might be paying too much. What are you paying at the moment? (Optional)",
  spend_label: 'Total per month',
  name_title: 'Your name',
  name_heading: 'What is your name?',
  first_name_label: 'Name',
  last_name_label: 'Surname',
  email_title: 'Your email',
  email_heading: 'Where should we send your meeting invite?',
  email_label: 'Email',
  alt_same_label: 'Same as above (no other email)',
  alt_email_label: 'Alternative email (optional)',
  number_title: 'Your number',
  number_heading: 'Is {wa_number} the number to call you on?',
  other_number_label: 'Other number (only if you chose another)',
  age_title: 'Your age',
  age_heading: 'Which age group are you in?',
  budget_title: 'Your budget',
  budget_heading: 'Roughly what could you put towards cover each month?',
  smoker_title: 'One more thing',
  smoker_heading: 'Do you smoke? (Optional — used only to brief your adviser {broker_first_name} before the call.)',
  income_title: 'Your income',
  income_heading: 'What is your monthly income before tax? (Optional)',
  date_title: 'Pick a day',
  date_heading: 'Pick a day for your Teams call with {adviser}',
  date_label: 'Day',
  slots_title: 'Pick a time',
  confirm_title: 'Check and book',
  confirm_button: 'Book my call',
  continue: 'Continue',
  done: 'Done',
  // terminal (END) screen variants
  end_booked_heading: "You're booked",
  end_booked_body: '{adviser} from {practice} (FSP {fsp}) will meet you on Teams on {when}. We have emailed the Teams invite to {email}. Your confirmation is on its way here on WhatsApp.',
  end_matching_heading: "We're matching you with an adviser",
  end_matching_body: "Thanks {first_name}. We're matching you with an authorised adviser now. We'll message you here on WhatsApp shortly so you can pick a time.",
  end_close_heading: 'Thank you',
  end_close_body: "Thanks for your time, {first_name}. Based on your answers, the advisers we work with aren't the right fit right now, so we won't pass your details on. Take care.",
  end_invalid_body: "Thanks for your time. We couldn't confirm your contact details, so we can't pass your enquiry on right now. You can message us again at any time.",
  end_noslots_heading: 'Almost done',
  end_noslots_body: "Thanks {first_name}. We'll send you {adviser}'s next free times here on WhatsApp in a moment.",
  end_taken_body: "That time was just taken. We'll send you the next free times here on WhatsApp in a moment.",
  // validation lines
  err_reasons: 'Please choose at least one.',
  err_name: 'Please enter your real name and surname, letters only.',
  err_email: 'That email address doesn’t look right. Please check it.',
  err_other_number_missing: 'Please type the other number, or choose your WhatsApp number.',
  err_other_number: 'Please use a South African mobile number.',
  err_no_day_slots: 'That day just filled up. Please pick another day.',
  // email verification (sent from howzit@ via Graph after the Flow completes)
  verify_subject: 'Confirm your email for your call with {adviser}',
  verify_body: 'Hi {first_name},\n\nPlease confirm this is your email address so {adviser} can send you your meeting details:\n\n{link}\n\nOr reply on WhatsApp with this code: {code}\n\nThe link and code work for 24 hours. If you did not ask for this, ignore this email.\n\nSortMyCover',
  // tier B broker offer (template broker_lead_offer) + lead-side lines
  lead_matching_wa: "Thanks {first_name}. We're matching you with an authorised adviser now. We'll message you here shortly so you can pick a time.",
  lead_held_wa: "Thanks for your patience, {first_name}. All our advisers are fully booked right now. We'll message you here as soon as one is free.",
  broker_offer_accepted: 'Accepted. {first_name} is now your lead and gets your booking card.',
  broker_offer_declined: 'Declined. {first_name} will not be sent to you and does not count.',
};

const fill = (s, v) => String(s).replace(/\{([a-z_]+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : m));

// ------------------------------------------------------------------------------------------------ rules
const SCREENS = ['REASONS', 'SPEND', 'NAME', 'EMAIL', 'NUMBER', 'AGE', 'BUDGET', 'SMOKER', 'INCOME', 'DATE', 'SLOTS', 'CONFIRM', 'END'];
const QUAL_AGE = new Set(['35_44', '45_50']); // 0.1 (same as w01.mjs / w03.js): <35 and 51+ are out of band
const TIER_OF = { '1500_plus': 'A', '1250_1499': 'B', '750_1250': 'B' }; // lt750 -> no tier, polite close
const MAX_CONTACT_ATTEMPTS = 3; // the third invalid name/email/number submit auto-disqualifies (invalid_contact)
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const UNVERIFIED_FLAG_AFTER_MS = 24 * 3600 * 1000;
// Reason -> licence category the broker needs (FAIS product categories, internal codes). paying_too_much / other say
// nothing about product, so they never flag. needs_human: compliance-qa to confirm this mapping.
const REASON_LICENCE = {
  life_cover: 'lt_risk', disability: 'lt_risk', funeral_cover: 'lt_funeral',
  retirement_planning: 'retirement', investments: 'investments',
};
// Never sent to Meta (CAPI / Pixel / custom_data) - 2.1.7 special-ish personal info + purpose limitation.
const NEVER_TO_META = new Set(['smoker', 'smoker_status', 'smoker_question_text', 'smoker_answered_at', 'income_band', 'spend_band', 'reasons',
  'last_name', 'email', 'alt_email', 'call_number', 'first_name', 'age_band', 'budget_band', 'lead_tier']);

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ'’ -]{0,38}[A-Za-zÀ-ÖØ-öø-ÿ])?$/;
const JUNK_NAMES = new Set(['test', 'asdf', 'name', 'surname', 'none', 'na', 'n/a', 'xxx', 'abc']);
function validName(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || !NAME_RE.test(s) || JUNK_NAMES.has(s.toLowerCase())) return null;
  return s;
}
function toE164(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1); else if (s.startsWith('00')) s = s.slice(2); else if (s.startsWith('0')) s = '27' + s.slice(1);
  return /^27[1-9]\d{8}$/.test(s) ? '+' + s : null;
}
const prettyMobile = (e164) => (/^\+27\d{9}$/.test(e164 || '') ? `0${e164.slice(3, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}` : e164 || 'your WhatsApp number');
const pick = (rows, id) => (rows.some(([k]) => k === id) ? id : null);
const firstWord = (s) => String(s || '').trim().split(/\s+/)[0] || '';

/** Reasons outside the broker's licence categories. brokers.licence_categories absent -> flag "licence check needed". */
function licenceFlags(reasons, broker) {
  const needed = [...new Set((reasons || []).map((r) => REASON_LICENCE[r]).filter(Boolean))];
  if (!needed.length) return { flag: null, missing: [] };
  const held = broker && Array.isArray(broker.licence_categories) ? broker.licence_categories : null;
  if (!held) return { flag: 'licence_check_needed', missing: needed };
  const missing = needed.filter((c) => !held.includes(c));
  return { flag: missing.length ? 'outside_licence' : null, missing };
}

/** Whitelist for anything bound for Meta. Smoker, income, spend, reasons and contact fields can never pass. */
function capiCustomData(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!NEVER_TO_META.has(k)) out[k] = v;
  return out;
}

// ------------------------------------------------------------------------------------------------ email checks
const TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'outlok.com': 'outlook.com', 'hotmial.com': 'hotmail.com', 'gmail.co.za': 'gmail.com' };
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@([A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;
async function checkEmail(raw, { resolveMx, disposable = new Set(), previous } = {}) {
  const email = String(raw || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: COPY.err_email };
  const domain = email.split('@')[1].toLowerCase();
  if (TYPOS[domain] && previous !== email) return { ok: false, suggestion: `${email.split('@')[0]}@${TYPOS[domain]}`, error: `Did you mean ${email.split('@')[0]}@${TYPOS[domain]}?` };
  if (disposable.has(domain)) return { ok: false, error: 'Please use an email address you check regularly.' };
  let mx = [];
  try { mx = resolveMx ? await resolveMx(domain) : []; } catch (e) { mx = []; }
  if (!mx || !mx.length) return { ok: false, error: `We couldn’t find ${domain}. Please check the address.` };
  return { ok: true, email };
}

// ------------------------------------------------------------------------------------------------ email verification
// One email, two ways to confirm: a magic link (one tap) and a 6-digit code (typed on WhatsApp). Only hashes are stored.
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function issueEmailVerification(lead, { secret, now, baseUrl = 'https://sortmycover.co.za', adviser = 'your adviser', randomInt = crypto.randomInt } = {}) {
  if (!secret || String(secret).length < 32) throw new Error('EMAIL_VERIFY_SECRET must be >= 32 chars');
  if (!lead || !lead.id || !lead.email) return null;
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const exp = Math.floor((now + VERIFY_TTL_MS) / 1000);
  const payload = `ev1.${lead.id}.${exp}`;
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${payload}|${sha(String(lead.email).toLowerCase())}`).digest());
  const token = `${payload}.${sig}`;
  const link = `${baseUrl}/v/${token}`;
  const vars = { first_name: firstWord(lead.first_name), adviser, link, code };
  return {
    set: { email_verify_code_hash: sha(`${lead.id}|${code}`), email_verify_sent_at: new Date(now).toISOString(), email_verify_expires_at: new Date(exp * 1000).toISOString(), email_verify_attempts: 0 },
    code, token, link,
    mail: { message: { subject: fill(COPY.verify_subject, vars), body: { contentType: 'Text', content: fill(COPY.verify_body, vars) }, toRecipients: [{ emailAddress: { address: lead.email } }] }, saveToSentItems: true },
  };
}
/** Magic link: valid signature for THIS lead's current email and not expired. A changed email invalidates old links. */
function verifyEmailToken(token, lead, { secret, now }) {
  const p = String(token || '').split('.');
  if (p.length !== 4 || p[0] !== 'ev1' || !lead || p[1] !== String(lead.id) || !/^\d+$/.test(p[2])) return { ok: false, reason: 'malformed' };
  const want = b64url(crypto.createHmac('sha256', secret).update(`ev1.${p[1]}.${p[2]}|${sha(String(lead.email || '').toLowerCase())}`).digest());
  const a = Buffer.from(want), b = Buffer.from(p[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  if (Number(p[2]) * 1000 <= now) return { ok: false, reason: 'expired' };
  return { ok: true, set: { email_verified: true, email_verified_at: new Date(now).toISOString(), email_verified_via: 'link' } };
}
/** 6-digit code typed on WhatsApp. 5 wrong tries lock it (a new email is needed). */
function verifyEmailCode(code, lead, { now }) {
  if (!lead || !lead.email_verify_code_hash) return { ok: false, reason: 'none_issued' };
  if (lead.email_verified) return { ok: true, already: true, set: {} };
  if ((lead.email_verify_attempts || 0) >= 5) return { ok: false, reason: 'locked' };
  if (Date.parse(lead.email_verify_expires_at) <= now) return { ok: false, reason: 'expired' };
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || sha(`${lead.id}|${c}`) !== lead.email_verify_code_hash) return { ok: false, reason: 'wrong', set: { email_verify_attempts: (lead.email_verify_attempts || 0) + 1 } };
  return { ok: true, set: { email_verified: true, email_verified_at: new Date(now).toISOString(), email_verified_via: 'code' } };
}
/** Nightly/hourly sweep: email still unverified 24 h after sending -> flag. The lead stays valid (WhatsApp is verified). */
function emailVerificationSweep(leads, now) {
  return (leads || []).filter((l) => l.email && !l.email_verified && l.email_verify_sent_at && !l.email_unverified_flag
    && now - Date.parse(l.email_verify_sent_at) >= UNVERIFIED_FLAG_AFTER_MS)
    .map((l) => ({ kind: 'update_lead', id: l.id, set: { email_unverified_flag: true, email_unverified_flagged_at: new Date(now).toISOString() } }));
}

// ------------------------------------------------------------------------------------------------ Flow message (W03 hook)
/** The interactive Flow message W03 sends right after the consent tap (session message, inside the 24-h window). */
function captureFlowMessage({ flow_id, flow_token, first_name }) {
  return {
    type: 'flow',
    body: `Thanks${first_name ? ` ${firstWord(first_name)}` : ''}. A few quick taps and you can pick a time with an adviser.`,
    flow: { flow_id, flow_token, flow_cta: 'Start', flow_action: 'navigate', screen: 'REASONS' },
  };
}

// ------------------------------------------------------------------------------------------------ endpoint handler
const SAST = 2 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sastDate = (t) => new Date(t + SAST).toISOString().slice(0, 10);
const whenLabel = (iso) => { const d = new Date(Date.parse(iso) + SAST); return `${DOW3[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} at ${d.toISOString().slice(11, 16)}`; }; // SAST wall time whatever the input offset
function bounds(broker, slots, now) {
  const min = sastDate(now + (broker.min_notice_hours ?? 2) * 3600 * 1000);
  const max = sastDate(now + (broker.horizon_days ?? 14) * DAY);
  const mh = broker.meeting_hours || {};
  const include = DOWK.filter((k) => (mh[k] || []).length).map((k) => DOW3[DOWK.indexOf(k)]);
  const free = new Set(slots.map((s) => s.start.slice(0, 10)));
  const unavailable = [];
  for (let t = Date.parse(`${min}T00:00:00+02:00`); sastDate(t) <= max; t += DAY) {
    const d = sastDate(t);
    if ((mh[DOWK[new Date(`${d}T12:00:00Z`).getUTCDay()]] || []).length && !free.has(d)) unavailable.push(d);
  }
  return { min_date: min, max_date: max, include_days: include, unavailable_dates: unavailable };
}

const ok = (screen, data = {}) => ({ screen, data: { show_error: false, error_message: '', ...data } });
const err = (screen, message, data = {}) => ({ screen, data: { ...data, show_error: true, error_message: message } });

/**
 * One decrypted Flow request -> { response, effects[] }.
 * deps: { verifyToken(t) -> {ok, lead_id, kind}, loadContext(lead_id) -> { lead, broker, capture }, now (ms),
 *         resolveMx, disposable:Set, lookup(e164) -> { line_type }, slots(broker, {fresh, date}) -> {fallback?, slots:[{start,end}]},
 *         book({lead, broker, method:'teams', start, end, email}) -> {ok, booking} | {taken:true} | {error} }
 * capture = the answers so far (leads.capture_state jsonb), echoed back in a save_capture effect after every screen.
 */
async function handle(req, deps) {
  const effects = [];
  if (!req || req.action === 'ping') return { response: { data: { status: 'active' } }, effects };
  const tok = deps.verifyToken(req.flow_token);
  if (!tok.ok || tok.kind !== 'capture') {
    effects.push({ kind: 'security_event', reason: tok.ok ? 'flow_token_wrong_kind' : `flow_token_${tok.reason}` });
    return { response: { data: { error_message: 'This link has expired. Message us again and we’ll pick up where you left off.' } }, effects };
  }
  const ctx = await deps.loadContext(tok.lead_id);
  if (!ctx || !ctx.lead || !ctx.broker || ctx.lead.opted_out_at) {
    effects.push({ kind: 'security_event', reason: 'flow_token_lead_gone' });
    return { response: { data: { error_message: 'This link is no longer active.' } }, effects };
  }
  const { lead, broker } = ctx;
  const cap = { ...(ctx.capture || {}), attempts: { ...((ctx.capture || {}).attempts || {}) } };
  const now = deps.now;
  const at = new Date(now).toISOString();
  const adviser = broker.adviser_first_name || firstWord(broker.adviser_name) || 'your adviser';
  const save = () => effects.push({ kind: 'save_capture', lead_id: lead.id, capture: cap });
  const reply = (r) => { save(); return { response: r, effects }; };
  const end = (heading, body) => reply(ok('END', { heading, body }));

  if (cap.closed) return { response: ok('END', { heading: COPY.end_close_heading, body: fill(COPY.end_close_body, { first_name: cap.first_name || '' }) }), effects };
  if (req.action === 'INIT') {
    effects.push({ kind: 'activity', activity_type: 'capture_flow_opened', payload: { lead_id: lead.id } });
    return reply(ok('REASONS', { reasons_options: REASONS.map(([id, title]) => ({ id, title })) }));
  }
  if (req.action === 'error') { effects.push({ kind: 'activity', activity_type: 'capture_flow_error', payload: req.data || {} }); return { response: { data: { acknowledged: true } }, effects }; }
  if (req.action !== 'data_exchange') return { response: { data: { acknowledged: true } }, effects };

  const d = req.data || {};
  const disqualify = (reason, body) => {
    cap.closed = true; cap.closed_reason = reason;
    effects.push({ kind: 'disqualify', lead_id: lead.id, reason, set: { stage: 'disqualified', disqualified_reason: reason, delivered: false, counts_toward_cycle: false } });
    return end(COPY.end_close_heading, body || fill(COPY.end_close_body, { first_name: cap.first_name || firstWord(lead.first_name) }));
  };
  const strike = (field, screen, message, data) => {
    cap.attempts[field] = (cap.attempts[field] || 0) + 1;
    if (cap.attempts[field] >= MAX_CONTACT_ATTEMPTS) return disqualify('invalid_contact', COPY.end_invalid_body);
    return reply(err(screen, message, data));
  };

  switch (d.screen) {
    case 'REASONS': {
      const reasons = [...new Set((Array.isArray(d.reasons) ? d.reasons : []).filter((r) => pick(REASONS, r)))];
      if (!reasons.length) return reply(err('REASONS', COPY.err_reasons, { reasons_options: REASONS.map(([id, title]) => ({ id, title })) }));
      cap.reasons = reasons;
      const lic = licenceFlags(reasons, broker);
      cap.licence_flag = lic.flag; cap.licence_missing = lic.missing;
      if (lic.flag) effects.push({ kind: 'flag', lead_id: lead.id, flag: lic.flag, detail: { reasons, missing: lic.missing, broker_id: broker.broker_id } });
      return reply(ok('SPEND', { spend_heading: reasons.includes('paying_too_much') ? COPY.spend_heading_too_much : COPY.spend_heading_default }));
    }
    case 'SPEND': {
      cap.spend_band = pick(SPEND, d.spend) || null; // optional: blank is fine
      return reply(ok('NAME'));
    }
    case 'NAME': {
      const f = validName(d.first_name), l = validName(d.last_name);
      if (!f || !l) return strike('name', 'NAME', COPY.err_name);
      cap.first_name = f; cap.last_name = l;
      return reply(ok('EMAIL', { init_email: lead.email || '' }));
    }
    case 'EMAIL': {
      const c = await checkEmail(d.email, { resolveMx: deps.resolveMx, disposable: deps.disposable, previous: cap.email_suggested });
      if (!c.ok) {
        if (c.suggestion) { cap.email_suggested = c.suggestion; return reply(err('EMAIL', c.error, { init_email: c.suggestion })); } // a typo hint is not a strike
        return strike('email', 'EMAIL', c.error, { init_email: String(d.email || '') });
      }
      cap.email = c.email;
      cap.alt_email_same = d.alt_same === true || d.alt_same === 'true';
      cap.alt_email = null;
      if (!cap.alt_email_same && d.alt_email && String(d.alt_email).trim()) {
        const a = await checkEmail(d.alt_email, { resolveMx: deps.resolveMx, disposable: deps.disposable, previous: d.alt_email });
        if (!a.ok) return reply(err('EMAIL', `Alternative email: ${a.error}`, { init_email: c.email }));
        if (a.email.toLowerCase() !== c.email.toLowerCase()) cap.alt_email = a.email;
      }
      return reply(ok('NUMBER', { number_heading: fill(COPY.number_heading, { wa_number: prettyMobile(lead.phone) }) }));
    }
    case 'NUMBER': {
      const heading = { number_heading: fill(COPY.number_heading, { wa_number: prettyMobile(lead.phone) }) };
      if (d.same_number !== 'other') {
        cap.call_number = lead.phone; cap.call_number_same_as_wa = true; cap.call_number_verified = true; cap.call_number_line_type = 'mobile';
      } else {
        if (!String(d.other_number || '').trim()) return reply(err('NUMBER', COPY.err_other_number_missing, heading));
        const e = toE164(String(d.other_number));
        if (!e) return strike('number', 'NUMBER', COPY.err_other_number, heading);
        let lt = 'unknown';
        try { lt = (await deps.lookup(e)).line_type || 'unknown'; } catch (x) { lt = 'unknown'; }
        if (lt === 'landline' || lt === 'voip') return strike('number', 'NUMBER', COPY.err_other_number, heading);
        cap.call_number = e; cap.call_number_same_as_wa = false; cap.call_number_verified = false; cap.call_number_line_type = lt;
      }
      return reply(ok('AGE'));
    }
    case 'AGE': {
      const a = pick(AGE, d.age_band);
      if (!a) return reply(err('AGE', 'Please choose one.'));
      cap.age_band = a;
      if (!QUAL_AGE.has(a)) return disqualify('age_band');
      return reply(ok('BUDGET'));
    }
    case 'BUDGET': {
      const b = pick(BUDGET, d.budget_band);
      if (!b) return reply(err('BUDGET', 'Please choose one.'));
      cap.budget_band = b;
      cap.lead_tier = TIER_OF[b] || null;
      if (!cap.lead_tier) return disqualify('budget_band'); // below R750: never delivered, never counted
      return reply(ok('SMOKER', { smoker_heading: fill(COPY.smoker_heading, { broker_first_name: adviser }) }));
    }
    case 'SMOKER': {
      const s = pick(SMOKER, d.smoker);
      cap.smoker = s; // null = skipped
      // consent evidence: the exact wording shown, and when (only when they answered)
      cap.smoker_question_text = s ? fill(COPY.smoker_heading, { broker_first_name: adviser }) : null;
      cap.smoker_answered_at = s ? at : null;
      return reply(ok('INCOME'));
    }
    case 'INCOME': {
      cap.income_band = pick(INCOME, d.income) || null;
      cap.completed_answers_at = at;
      effects.push({ kind: 'update_lead', id: lead.id, set: leadColumns(cap, lead, at) });
      if (cap.lead_tier === 'B') {
        cap.awaiting_offer = true;
        effects.push({ kind: 'broker_offer', lead_id: lead.id, broker_id: broker.broker_id });
        return end(COPY.end_matching_heading, fill(COPY.end_matching_body, { first_name: cap.first_name }));
      }
      return dateScreen();
    }
    case 'DATE': {
      if (cap.lead_tier !== 'A' && !cap.offer_accepted) return end(COPY.end_matching_heading, fill(COPY.end_matching_body, { first_name: cap.first_name }));
      const r = await deps.slots(broker, { fresh: false, date: d.date });
      if (r.fallback) return noSlots('calendar_unavailable');
      const day = (r.slots || []).filter((s) => s.start.startsWith(String(d.date || ''))).slice(0, 20);
      if (!day.length) return reply(err('DATE', COPY.err_no_day_slots, { date_heading: fill(COPY.date_heading, { adviser }), ...bounds(broker, r.slots || [], now) }));
      return reply(ok('SLOTS', { date: d.date, date_label: `${whenLabel(day[0].start).split(' at ')[0]} (South African time)`, slots: day.map((s) => ({ id: s.start, title: whenLabel(s.start).split(' at ')[1] })) }));
    }
    case 'SLOTS': {
      const r = await deps.slots(broker, { fresh: true });
      if (r.fallback) return noSlots('calendar_unavailable');
      const s = (r.slots || []).find((x) => x.start === d.slot);
      if (!s) { effects.push({ kind: 'send_list', lead_id: lead.id, reason: 'slot_taken' }); return end(COPY.end_noslots_heading, COPY.end_taken_body); }
      cap.slot = s;
      return reply(ok('CONFIRM', { summary_text: `${whenLabel(s.start)} (South African time), 30-minute Microsoft Teams call with ${adviser} from ${broker.practice_name} (FSP ${broker.fsp_number}). We’ll email the Teams link to ${cap.email}.` }));
    }
    case 'CONFIRM': {
      if (!cap.slot) return dateScreen();
      const r = await deps.book({ lead: { ...lead, ...leadColumns(cap, lead, at) }, broker, method: 'teams', start: cap.slot.start, end: cap.slot.end, email: cap.email });
      if (r && r.taken) { effects.push({ kind: 'send_list', lead_id: lead.id, reason: 'slot_taken' }); cap.slot = null; return end(COPY.end_noslots_heading, COPY.end_taken_body); }
      if (!r || !r.ok) { effects.push({ kind: 'send_list', lead_id: lead.id, reason: 'book_failed' }); return noSlots('book_failed'); }
      cap.booking_id = r.booking.id;
      effects.push({ kind: 'send_template', template: 'broker_intro_booked', to: lead.phone, vars: [cap.first_name, broker.practice_name, broker.fsp_number, broker.adviser_name, 'Microsoft Teams', whenLabel(cap.slot.start).split(' at ')[0], whenLabel(cap.slot.start).split(' at ')[1]], buttons: [{ url: `c/${r.booking.id}` }], evidence: 'disclosure' });
      effects.push({ kind: 'send_email_verification', lead_id: lead.id });
      return end(COPY.end_booked_heading, fill(COPY.end_booked_body, { adviser, practice: broker.practice_name, fsp: broker.fsp_number, when: whenLabel(cap.slot.start), email: cap.email }));
    }
    default:
      return { response: { data: { acknowledged: true } }, effects };
  }

  async function dateScreen() {
    if (!(broker.methods_supported || []).includes('teams')) return noSlots('broker_no_teams');
    const r = await deps.slots(broker, { fresh: false });
    if (r.fallback || !(r.slots || []).length) return noSlots(r.fallback ? 'calendar_unavailable' : 'no_slots');
    return reply(ok('DATE', { date_heading: fill(COPY.date_heading, { adviser }), ...bounds(broker, r.slots, now) }));
  }
  function noSlots(reason) {
    effects.push({ kind: 'send_list', lead_id: lead.id, reason });
    if (cap.email) effects.push({ kind: 'send_email_verification', lead_id: lead.id });
    return end(COPY.end_noslots_heading, fill(COPY.end_noslots_body, { first_name: cap.first_name || '', adviser }));
  }
}

/** capture_state -> leads columns (migration 20261007190000_smc_19_capture_v2.sql). */
function leadColumns(cap, lead, at) {
  return {
    first_name: cap.first_name ?? lead.first_name ?? null, last_name: cap.last_name ?? null,
    reasons: cap.reasons || null, spend_band: cap.spend_band ?? null,
    email: cap.email ?? lead.email ?? null, email_status: cap.email ? 'mx_ok' : lead.email_status ?? null, email_purpose: cap.email ? 'meeting_invite' : null,
    email_verified: lead.email_verified === true, alt_email: cap.alt_email ?? null, alt_email_same: cap.alt_email_same ?? null,
    wa_id: String(lead.phone || '').replace(/^\+/, '') || null, wa_verified: true,
    call_number: cap.call_number ?? null, call_number_line_type: cap.call_number_line_type ?? null, call_number_verified: cap.call_number_verified ?? null,
    age_band: cap.age_band ?? null, budget_band: cap.budget_band ?? null, lead_tier: cap.lead_tier ?? null,
    smoker: cap.smoker ?? null, smoker_question_text: cap.smoker_question_text ?? null, smoker_answered_at: cap.smoker_answered_at ?? null,
    income_band: cap.income_band ?? null, licence_flag: cap.licence_flag ?? null, method_pref: 'teams',
    qualified_at: cap.lead_tier ? at : null, stage: cap.lead_tier ? 'qualified' : lead.stage ?? null,
  };
}

// ------------------------------------------------------------------------------------------------ tier B broker offer
// Choice (stated in the spec): an offer expires after 2 WORKING hours (Mon-Fri 08:00-17:00 SAST, SA public holidays
// excluded); an offer made out of hours starts its clock at the next opening. Expired = declined (reason 'expired').
const OFFER_WORK_MIN = 120;
const WORK_START = 8, WORK_END = 17;
function offerExpiry(fromMs, holidays = new Set(), minutes = OFFER_WORK_MIN) {
  let t = fromMs, left = minutes * 60000;
  for (let guard = 0; guard < 400 && left > 0; guard++) {
    const d = new Date(t + SAST), day = d.getUTCDay(), date = d.toISOString().slice(0, 10);
    const open = Date.parse(`${date}T${String(WORK_START).padStart(2, '0')}:00:00+02:00`), close = Date.parse(`${date}T${WORK_END}:00:00+02:00`);
    if (day === 0 || day === 6 || holidays.has(date) || t >= close) { t = Date.parse(`${sastDate(t + DAY)}T00:00:00+02:00`); continue; }
    if (t < open) t = open;
    const take = Math.min(left, close - t);
    t += take; left -= take;
  }
  return t;
}

/** Make the offer to the routed broker: template broker_lead_offer (Accept / Decline) + portal row. Lead gets the matching line. */
function makeOffer({ lead, broker, now, holidays }) {
  const expires = offerExpiry(now, holidays);
  const a = lead.capture || lead;
  const offer = { lead_id: lead.id, broker_id: broker.broker_id, offered_at: new Date(now).toISOString(), expires_at: new Date(expires).toISOString(), status: 'offered' };
  const vars = [firstWord(broker.adviser_name), firstWord(a.first_name || lead.first_name), BAND_LABEL.age[a.age_band] || '-', BAND_LABEL.budget[a.budget_band] || '-', (a.reasons || []).map((r) => (REASONS.find(([k]) => k === r) || [, r])[1]).join(', ') || '-', whenLabel(offer.expires_at)];
  return {
    offer,
    effects: [
      { kind: 'insert_offer', row: offer },
      { kind: 'update_lead', id: lead.id, set: { offer_status: 'offered', offer_broker_id: broker.broker_id, offered_at: offer.offered_at, offer_expires_at: offer.expires_at, stage: 'qualified' } },
      { kind: 'send_template', template: 'broker_lead_offer', to: broker.adviser_whatsapp, vars, quick_replies: [`offer_accept:${lead.id}`, `offer_decline:${lead.id}`] },
      { kind: 'send_text', to: lead.phone, body: fill(COPY.lead_matching_wa, { first_name: firstWord(a.first_name || lead.first_name) }) },
      { kind: 'schedule', job: 'offer_expiry', lead_id: lead.id, broker_id: broker.broker_id, at: offer.expires_at },
    ],
  };
}
const BAND_LABEL = { age: Object.fromEntries(AGE), budget: Object.fromEntries(BUDGET) };

/**
 * Broker taps Accept / Decline (WhatsApp quick reply or portal), or the expiry job fires (decision 'expired').
 * deps: { offer (current row), lead, brokers (eligible, in routing order), declined_broker_ids, consent_mode, now, nextBroker(lead, excluded) -> broker|null }
 * Idempotent: a decision on an offer that is no longer 'offered' changes nothing (double taps, late taps after expiry).
 */
function decideOffer(decision, { offer, lead, now, consent_mode = 'named', nextBroker, actor_broker_id }) {
  const at = new Date(now).toISOString();
  if (!offer || offer.status !== 'offered') return { changed: false, effects: [{ kind: 'activity', activity_type: 'offer_decision_ignored', payload: { lead_id: lead && lead.id, decision, status: offer && offer.status } }] };
  if (decision !== 'expired' && actor_broker_id && actor_broker_id !== offer.broker_id) return { changed: false, effects: [{ kind: 'security_event', reason: 'offer_wrong_broker' }] };
  const first = firstWord((lead.capture && lead.capture.first_name) || lead.first_name);
  if (decision === 'accept') {
    return { changed: true, effects: [
      { kind: 'update_offer', lead_id: lead.id, broker_id: offer.broker_id, set: { status: 'accepted', decided_at: at } },
      { kind: 'update_lead', id: lead.id, set: { offer_status: 'accepted', offer_decided_at: at, broker_id: offer.broker_id, delivered: true, counts_toward_cycle: true } },
      { kind: 'send_text', to: offer.broker_whatsapp || null, body: fill(COPY.broker_offer_accepted, { first_name: first }) },
      // delivery = the existing W06 path: broker_intro_slots_v2 (disclosure + Flow button) -> W28 books Teams
      { kind: 'first_touch', lead_id: lead.id, template: 'broker_intro_slots_v2' },
    ] };
  }
  if (decision !== 'decline' && decision !== 'expired') return { changed: false, effects: [] };
  const declined = [...new Set([...(lead.declined_broker_ids || []), offer.broker_id])];
  const effects = [
    { kind: 'update_offer', lead_id: lead.id, broker_id: offer.broker_id, set: { status: decision === 'expired' ? 'expired' : 'declined', decided_at: at } },
    { kind: 'update_lead', id: lead.id, set: { offer_status: decision === 'expired' ? 'expired' : 'declined', offer_decided_at: at, declined_broker_ids: declined, broker_id: null, delivered: false, counts_toward_cycle: false } },
  ];
  if (decision === 'decline') effects.push({ kind: 'send_text', to: offer.broker_whatsapp || null, body: fill(COPY.broker_offer_declined, { first_name: first }) });
  const next = nextBroker ? nextBroker(lead, new Set(declined)) : null; // never re-offered to a broker who declined or let it expire
  if (!next) {
    effects.push({ kind: 'update_lead', id: lead.id, set: { offer_status: 'held', stage: 'qualified' } });
    effects.push({ kind: 'send_text', to: lead.phone, body: fill(COPY.lead_held_wa, { first_name: first }) });
    effects.push({ kind: 'alert', signal_key: 'tier_b_held', lead_id: lead.id });
    return { changed: true, effects };
  }
  // named consent names ONE practice: a different broker needs a fresh consent tap naming them before anything is shared
  if (consent_mode === 'named') effects.push({ kind: 'reconsent', lead_id: lead.id, broker_id: next.broker_id, then: 'offer' });
  else effects.push({ kind: 'offer_next', lead_id: lead.id, broker_id: next.broker_id });
  return { changed: true, effects };
}

// ------------------------------------------------------------------------------------------------ dispute evidence (admin)
/**
 * Assemble the evidence pack for one lead: consent record, disclosure message + delivery, all answers with timestamps,
 * smoker wording, offer decisions, booking confirmation + Graph event id, email verification. Pure: the caller loads rows.
 * Never includes hashed codes or tokens.
 */
function disputeEvidence({ lead, booking = null, messages = [], offers = [], activities = [] }, { now, requested_by }) {
  if (!lead) return null;
  const strip = (o) => { const c = { ...o }; delete c.email_verify_code_hash; return c; };
  const l = strip(lead);
  const disclosure = messages.find((m) => m.wamid && m.wamid === lead.disclosure_msg_id) || messages.find((m) => /^broker_intro_/.test(m.template || '')) || null;
  const pack = {
    generated_at: new Date(now).toISOString(), requested_by: requested_by || null, lead_id: l.id, broker_id: l.broker_id || null, cycle_id: l.cycle_id || null,
    consent: { text: l.consent_text, version: l.consent_text_version, mode: l.consent_mode, at: l.consent_at, source: l.consent_source, page_url: l.consent_page_url || null, ads_at: l.consent_ads_at || null },
    channel_verification: { wa_id: l.wa_id || null, wa_verified: !!l.wa_verified, verified_at: l.verified_at || null, wa_delivered_at: l.wa_delivered_at || null },
    disclosure: disclosure ? { template: disclosure.template, wamid: disclosure.wamid, sent_at: disclosure.sent_at, delivered_at: disclosure.delivered_at || null, read_at: disclosure.read_at || null } : null,
    answers: { reasons: l.reasons || null, spend_band: l.spend_band || null, first_name: l.first_name, last_name: l.last_name || null, email: l.email || null, alt_email: l.alt_email || null,
      call_number: l.call_number || null, call_number_verified: l.call_number_verified ?? null, age_band: l.age_band, budget_band: l.budget_band, lead_tier: l.lead_tier || null, income_band: l.income_band || null,
      smoker: l.smoker || null, smoker_question_text: l.smoker_question_text || null, smoker_answered_at: l.smoker_answered_at || null, answered_at: l.qualified_at || null },
    email_verification: { email_verified: !!l.email_verified, verified_at: l.email_verified_at || null, via: l.email_verified_via || null, sent_at: l.email_verify_sent_at || null, unverified_flag: !!l.email_unverified_flag },
    attribution: { origin: l.origin, campaign_id: l.campaign_id || null, adset_id: l.adset_id || null, ad_id: l.ad_id || null, ctwa_clid: l.ctwa_clid || null, utm_source: l.utm_source || null, utm_campaign: l.utm_campaign || null },
    offers: offers.map((o) => ({ broker_id: o.broker_id, status: o.status, offered_at: o.offered_at, decided_at: o.decided_at || null, expires_at: o.expires_at })),
    booking: booking ? { id: booking.id, method: booking.method, start: booking.start || booking.starts_at, created_at: booking.created_at, graph_event_id: booking.graph_event_id || null, join_url_present: !!booking.join_url, invite_email_status: booking.invite_email_status || null } : null,
    flags: { licence_flag: l.licence_flag || null, disqualified_reason: l.disqualified_reason || null, opted_out_at: l.opted_out_at || null },
    timeline: activities.map((a) => ({ at: a.created_at, type: a.activity_type })).sort((x, y) => String(x.at).localeCompare(String(y.at))),
  };
  const gaps = [];
  if (!pack.consent.text || !pack.consent.at) gaps.push('consent_missing');
  if (!pack.disclosure) gaps.push('disclosure_missing');
  else if (!pack.disclosure.delivered_at) gaps.push('disclosure_not_delivered');
  if (!pack.channel_verification.wa_verified) gaps.push('wa_not_verified');
  pack.gaps = gaps;
  pack.complete = gaps.length === 0;
  return pack;
}

module.exports = {
  COPY, REASONS, SPEND, AGE, BUDGET, SMOKER, INCOME, NUMBER_CHOICE, SCREENS, TIER_OF, QUAL_AGE, REASON_LICENCE, NEVER_TO_META, MAX_CONTACT_ATTEMPTS,
  OFFER_WORK_MIN, fill, validName, toE164, licenceFlags, capiCustomData, checkEmail, captureFlowMessage, handle, leadColumns, bounds,
  issueEmailVerification, verifyEmailToken, verifyEmailCode, emailVerificationSweep, offerExpiry, makeOffer, decideOffer, disputeEvidence,
};
