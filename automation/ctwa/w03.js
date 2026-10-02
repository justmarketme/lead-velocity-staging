'use strict';
// W03 Click-to-WhatsApp intake: pure logic (no I/O). automation/W03.json inlines this file into its Code nodes;
// automation/tests/W03.test.mjs runs it offline against fixtures/synthetic-leads.json.
// Sources: 4.6 CTWA steps 1-4 + 7, automation/W03-notes.md (A.2 redirect, A.3 readOrigin), 0.1 consent mode `named`.
// Which of my five: Chili Piper (one chat, no hand-off), Meta Cloud API (referral, interactive, 72-h window),
// HBR (routing ends in W06 first touch < 60 s; nothing here waits).

const crypto = require('crypto');

// ---------------------------------------------------------------- redirect (I-09, W03-notes A.2)
const REDIRECT_REF_RE = /^(cmt_(\d{5,20}|org_\d{5,20}_\d{5,20})|dm_(messenger|instagram))$/;
const PREFILL = "Hi, I'd like to check my life cover";

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
    click: { ref: ok ? ref : null, ua_class: uaClass }, // ops.ctwa_clicks row: no IP, no full UA, no cookie
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
const CONSENT_GENERIC_V1 = "Before we start: if it's a fit, we'll share your details with an authorised financial services provider who'll contact you about life cover. OK to continue?";
function consentFor(mode, broker) {
  if (mode === 'generic') return { version: 'ctwa-v1', mode: 'generic', text: CONSENT_GENERIC_V1 };
  if (!broker || !broker.practice_name || !broker.fsp_number) return null; // named mode needs a named broker
  return {
    version: 'ctwa-named-v1',
    mode: 'named',
    text: `Before we start: if it's a fit, we'll share your details with ${broker.practice_name} (FSP ${broker.fsp_number}), an authorised financial services provider who'll contact you about life cover. OK to continue?`,
  };
}

// ---------------------------------------------------------------- tap-only questions (4.6 step 3)
const AGE_ROWS = [['age_under_35', 'Under 35'], ['age_35_44', '35 to 44'], ['age_45_50', '45 to 50'], ['age_51_plus', '51 or older']];
const BUDGET_ROWS = [['budget_under_500', 'Under R500 a month'], ['budget_500_750', 'R500 to R750'], ['budget_750_1250', 'R750 to R1,250'], ['budget_1250_plus', 'R1,250 or more']];
const BOND_ROWS = [['bond_yes_dependants_yes', 'Bond and dependants'], ['bond_yes_dependants_no', 'Bond, no dependants'], ['bond_no_dependants_yes', 'Dependants, no bond'], ['bond_no_dependants_no', 'Neither']];
const METHOD_TITLES = { teams: 'Teams video call', zoom: 'Zoom video call', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone call' };
const QUAL_AGE = new Set(['35_44', '45_50']); // 0.1 bands; 45-50 qualifies, 51+ does not
const QUAL_BUDGET = new Set(['750_1250', '1250_plus']); // 0.1: both upper bands qualify
// fixture/quiz codes -> leads_smc_checks codes (schema uses lt35 / 51plus / lt750 / 1250plus)
const AGE_TO_DB = { under_35: 'lt35', '35_44': '35_44', '45_50': '45_50', '51_plus': '51plus' };
const BUDGET_TO_DB = { under_500: 'lt750', '500_750': 'lt750', '750_1250': '750_1250', '1250_plus': '1250plus' };
const METHOD_TO_DB = { teams: 'teams', zoom: 'zoom', meet: 'meet', google_meet: 'meet', whatsapp_call: 'whatsapp_call', phone: 'phone' };
const STALL_HOURS = [1, 20, 68]; // 4.6 step 7, inside the 72-h CTWA window

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
  const t = thread ? { ...thread, answers: { ...(thread.answers || {}) } } : null;
  const send = (m) => actions.push({ kind: 'send', message: m });
  const stall = (stage) => actions.push({ kind: 'schedule_stall', stage, hours: STALL_HOURS, from: ctx.at, replaces: true });

  if (ctx.suppressed) return { thread: t, actions: [{ kind: 'ignore', reason: 'suppressed' }] }; // STOP'd number: W15 owns it
  if (ctx.existing_open_lead_id && (!t || t.stage === 'done')) {
    return { thread: t, actions: [{ kind: 'forward_w07', lead_id: ctx.existing_open_lead_id, reason: 'existing_lead_90d' }] }; // merge, no new consent, no new WhatsApp card
  }

  // first contact: consent first, nothing stored but the thread state
  if (!t || t.stage === 'closed') {
    const consent = consentFor(ctx.brand.consent_mode, ctx.broker);
    const origin = readOrigin(msg);
    if (!consent) {
      send({ type: 'text', body: "Thanks for getting in touch. We can't take new enquiries right now. Please try again in a few days." });
      return { thread: { stage: 'closed', origin, closed_reason: 'no_named_broker', at: ctx.at }, actions: actions.concat([{ kind: 'alert', signal_key: 'ctwa_no_broker' }]) };
    }
    send(buttons(consent.text, [['consent_yes', 'Yes, continue'], ['consent_no', 'No thanks']]));
    return { thread: { stage: 'await_consent', origin, consent, answers: {}, first_at: ctx.at, broker_id: ctx.broker ? ctx.broker.broker_id : null }, actions };
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
      actions.push({ kind: 'insert_lead', row });
      // business-messaging Lead (4.6: consent + valid number); needs Meta's ctwa_clid to attribute (W03-notes rule 1)
      if (row.ctwa_clid) actions.push({ kind: 'capi', event_name: 'Lead', event_id: `evt_${row.id}_ctwa_lead`, action_source: 'business_messaging' });
      t.stage = 'q_age';
      t.lead_id = row.id;
      send(question('q_age'));
      stall('q_age');
      return { thread: t, actions };
    }
    send(buttons(t.consent.text, [['consent_yes', 'Yes, continue'], ['consent_no', 'No thanks']])); // free text before consent: ask again
    return { thread: t, actions };
  }

  const ORDER = { q_age: 'age_', q_budget: 'budget_', q_bond: 'bond_', q_method: 'method_' };
  const prefix = ORDER[t.stage];
  if (!prefix) return { thread: t, actions: [{ kind: 'forward_w07', lead_id: t.lead_id, reason: 'after_qualifying' }] };
  if (!id || !id.startsWith(prefix)) {
    // tap-only: free text mid-question is logged for the brief (W07) and the same question is shown again
    if (msg.type === 'text') actions.push({ kind: 'forward_w07', lead_id: t.lead_id, reason: 'free_text_mid_qualifying', reply: false });
    send({ ...question(t.stage, ctx.broker), body: `Please tap one of the options. ${question(t.stage, ctx.broker).body}` });
    return { thread: t, actions };
  }
  const val = id.slice(prefix.length);
  if (t.stage === 'q_age') {
    t.answers.age_band = val;
    if (!QUAL_AGE.has(val)) return outOfBand(t, ctx, 'age_band', actions);
    t.stage = 'q_budget';
  } else if (t.stage === 'q_budget') {
    t.answers.budget_band = val;
    if (!QUAL_BUDGET.has(val)) return outOfBand(t, ctx, 'budget_band', actions);
    t.stage = 'q_bond';
  } else if (t.stage === 'q_bond') {
    t.answers.bond = val.startsWith('yes');
    t.answers.dependants = val.endsWith('dependants_yes');
    t.stage = 'q_method';
  } else if (t.stage === 'q_method') {
    t.answers.method_pref = METHOD_TO_DB[val] || null;
    t.stage = 'done';
    actions.push({ kind: 'cancel_stall' });
    actions.push({
      kind: 'update_lead', id: t.lead_id,
      set: { age_band: AGE_TO_DB[t.answers.age_band], budget_band: BUDGET_TO_DB[t.answers.budget_band], bond: t.answers.bond, dependants: t.answers.dependants, method_pref: t.answers.method_pref, qualified_at: ctx.at, stage: 'qualified' },
    });
    // route (1.3) is W01 core's job: same routing for every intake path; it writes broker_id/cycle_id/routed_at
    // before W06 exists (W01 rule), then W06 sends broker_intro_slots (or _v2 with the Flow button) < 60 s.
    actions.push({ kind: 'route_and_first_touch', lead_id: t.lead_id, template_hint: 'broker_intro_slots', deadline_s: 60 });
    return { thread: t, actions };
  }
  send(question(t.stage, ctx.broker));
  stall(t.stage);
  return { thread: t, actions };
}

function outOfBand(t, ctx, reason, actions) {
  const del = new Date(Date.parse(ctx.at) + 24 * 3600 * 1000).toISOString();
  actions.push({ kind: 'cancel_stall' });
  actions.push({
    kind: 'update_lead', id: t.lead_id,
    set: { age_band: AGE_TO_DB[t.answers.age_band] || null, budget_band: BUDGET_TO_DB[t.answers.budget_band] || null, disqualified_reason: reason, broker_id: null, stage: 'disqualified', retention_delete_after: del },
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
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.body }, action: { button: m.button.slice(0, 20), sections: [{ title: 'Options', rows: m.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) }] } } };
}

module.exports = { redirectFor, readOrigin, consentFor, step, question, tapId, toCloudApi, hashMobile, CONSENT_GENERIC_V1, AGE_TO_DB, BUDGET_TO_DB, METHOD_TO_DB, STALL_HOURS, REDIRECT_REF_RE };
