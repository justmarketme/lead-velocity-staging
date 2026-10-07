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
const CONSENT_NAMED_VERSION = 'ctwa-named-v2';
const CONSENT_NAMED_FOOTER = 'Lead Velocity (Pty) Ltd runs SortMyCover and is responsible for your details. Reply STOP to opt out. Privacy: sortmycover.co.za/privacy';
const WA_BUTTON_BODY_MAX = 1024; // Cloud API interactive body limit
function consentFor(mode, broker) {
  if (mode === 'generic') return { version: 'ctwa-v1', mode: 'generic', text: CONSENT_GENERIC_V1 };
  if (!broker || !broker.practice_name || !broker.fsp_number) return null; // named mode needs a named broker
  return {
    version: CONSENT_NAMED_VERSION,
    mode: 'named',
    // v2 (compliance-qa review 4 §2a): one added line = responsible party + opt-out route + privacy link, so the
    // WhatsApp consent record is equivalent evidence to the landing named consent. Body stays < 1,024 chars (button body limit).
    text: `Before we start: if it's a fit, we'll share your details with ${broker.practice_name} (FSP ${broker.fsp_number}), an authorised financial services provider who'll contact you about life cover. OK to continue?\n\n${CONSENT_NAMED_FOOTER}`,
  };
}

// ---------------------------------------------------------------- tap-only questions (4.6 step 3)
const AGE_ROWS = [['age_under_35', 'Under 35'], ['age_35_44', '35 to 44'], ['age_45_50', '45 to 50'], ['age_51_plus', '51 or older']];
// CP 1.4 (2026-10-07): three bands; only Under R750 fails. Older tap ids (under_500, 500_750, 750_1250, 1250_1499) stay mapped for in-flight chats.
const BUDGET_ROWS = [['budget_lt750', 'Under R750 a month'], ['budget_750_1499', 'R750 to R1,499'], ['budget_1500_plus', 'R1,500 or more']];
const BOND_ROWS = [['bond_yes_dependants_yes', 'Bond and dependants'], ['bond_yes_dependants_no', 'Bond, no dependants'], ['bond_no_dependants_yes', 'Dependants, no bond'], ['bond_no_dependants_no', 'Neither']];
const METHOD_TITLES = { teams: 'Teams video call', zoom: 'Zoom video call', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'Phone call' };
const QUAL_AGE = new Set(['35_44', '45_50']); // 0.1 bands; 45-50 qualifies, 51+ does not
const QUAL_BUDGET = new Set(['750_1499', '1500_plus', '750_1250', '1250_plus', '1250_1499']); // 0.1: every band from R750 up qualifies (1250_plus = legacy pre-split)
// fixture/quiz codes -> leads_smc_checks codes (schema uses lt35 / 51plus / lt750 / 1250plus)
const AGE_TO_DB = { under_35: 'lt35', '35_44': '35_44', '45_50': '45_50', '51_plus': '51plus' };
const BUDGET_TO_DB = { under_500: 'lt750', '500_750': 'lt750', '750_1499': '750_1499', '750_1250': '750_1250', '1250_plus': '1250plus', '1250_1499': '1250_1499', '1500_plus': '1500_plus' };
const METHOD_TO_DB = { teams: 'teams', zoom: 'zoom', meet: 'meet', google_meet: 'meet', whatsapp_call: 'whatsapp_call', phone: 'phone' };
const STALL_HOURS = [1, 20, 68]; // 4.6 step 7, inside the 72-h CTWA window
BUDGET_TO_DB.lt750 = 'lt750'; // typed "<750" (I-47a)
// I-47a: qualifying order is 4.6 step 3 (age -> budget -> bond/dependants -> method); NH-59 default applied.
const Q_STAGES = ['q_age', 'q_budget', 'q_budget_clarify', 'q_bond', 'q_dependants', 'q_method'];
const STAGE_OF = { q_age: 'q_age', q_budget: 'q_budget', q_budget_clarify: 'q_budget_clarify', q_bond: 'q_bond', q_dependants: 'q_bond', q_method: 'q_method' };
const NEXT_STATE = { q_age: 'q_budget', q_budget: 'q_bond', q_budget_clarify: 'q_bond', q_bond: 'q_method', q_method: 'unbooked' }; // leads.conv_state.state after an answer
// NLU bands (conversation/logic.mjs BANDS) -> the tap id W03 would have received (then -> DB codes via AGE_TO_DB / BUDGET_TO_DB).
const NLU_AGE = { '<35': 'age_under_35', '35-44': 'age_35_44', '45-50': 'age_45_50', '51+': 'age_51_plus' };
const NLU_BUDGET = { '<750': 'budget_lt750', '750-1499': 'budget_750_1499', '750-1250': 'budget_750_1250', '1250+': 'budget_1250_plus', '1250-1499': 'budget_1250_1499', '1500+': 'budget_1500_plus' };
const DB_TO_AGE = { lt35: 'under_35', '35_44': '35_44', '45_50': '45_50', '51plus': '51_plus' };
const DB_TO_BUDGET = { lt750: 'lt750', '750_1499': '750_1499', '750_1250': '750_1250', '1250plus': '1250_plus', '1250_1499': '1250_1499', '1500_plus': '1500_plus' };
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
  // a thread W03 rebuilt from a W07-owned lead (from_lead) is a cache only: the lead's conv_state stays the truth
  if (ctx.existing_open_lead_id && (!t || t.stage === 'done' || t.from_lead)) {
    const lt = threadFromLead(ctx.lead && ctx.lead.id === ctx.existing_open_lead_id ? ctx.lead : null);
    if (lt) return qualify(lt, msg, ctx, actions);
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

/** Qualifying (4.6 step 3 order): a tap, or a typed answer W07 handed over (ctx.typed = { slots, actions }, I-47a). */
function qualify(t, msg, ctx, actions) {
  const send = (m) => actions.push({ kind: 'send', message: m });
  const stall = (stage) => actions.push({ kind: 'schedule_stall', stage, hours: STALL_HOURS, from: ctx.at, replaces: true });
  const ORDER = { q_age: 'age_', q_budget: 'budget_', q_budget_clarify: 'budget_', q_bond: 'bond_', q_method: 'method_' };
  const prefix = ORDER[t.stage];
  if (!prefix) return { thread: t, actions: [{ kind: 'forward_w07', lead_id: t.lead_id, reason: 'after_qualifying', hops: ctx.hops || 0 }] };
  let id = tapId(msg);
  if ((!id || !id.startsWith(prefix)) && ctx.typed) id = typedTap(t.stage, ctx.typed.slots) || id;
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
    t.answers.age_band = val;
    if (!QUAL_AGE.has(val)) return outOfBand(t, ctx, 'age_band', actions);
    t.stage = 'q_budget';
    set = { age_band: AGE_TO_DB[val] };
  } else if (from === 'q_budget' || from === 'q_budget_clarify') {
    t.answers.budget_band = val;
    if (!QUAL_BUDGET.has(val)) return outOfBand(t, ctx, 'budget_band', actions);
    if (t.from_lead && t.origin === 'lead_ad') return finishLeadAd(t, ctx, actions, val);
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
    // route (1.3) is W01 core's job: same routing for every intake path; it writes broker_id/cycle_id/routed_at
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
 * The instant form keeps age, call_ok and bond/children; the monthly budget band is the FIRST WhatsApp step instead.
 * W01 stores the lead unrouted (routing_reason held_budget_pending, conv_state q_budget) and sends the qualify_budget
 * template (automation/lib/w01.mjs budgetQuestion, same row ids as BUDGET_ROWS) within 60 s; the tap comes back through W07 -> W03 (qualifying tap) and the SAME QUAL_BUDGET set decides:
 * in band -> qualified -> W01 routes -> W06 broker intro; out of band -> outOfBand() (no hand-over, deleted in 24 h).
 * Nothing else is asked: the instant form already covered the rest, and the method is chosen when booking.
 */
function finishLeadAd(t, ctx, actions, val) {
  t.stage = 'done';
  actions.push({ kind: 'cancel_stall' });
  actions.push({ kind: 'update_lead', id: t.lead_id, set: { budget_band: BUDGET_TO_DB[val], qualified_at: ctx.at, stage: 'qualified', conv_state_state: NEXT_STATE.q_method } });
  actions.push({ kind: 'route_and_first_touch', lead_id: t.lead_id, template_hint: 'broker_intro_slots', deadline_s: 60 });
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
  return { ...base, type: 'interactive', interactive: { type: 'list', body: { text: m.body }, action: { button: m.button.slice(0, 20), sections: [{ title: 'Options', rows: m.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) }] } } };
}

module.exports = { BUDGET_ROWS, QUAL_BUDGET, typedTap, threadFromLead, hopNext, MAX_HOPS, Q_STAGES, NEXT_STATE, redirectFor, readOrigin, consentFor, CONSENT_NAMED_VERSION, CONSENT_NAMED_FOOTER, WA_BUTTON_BODY_MAX, step, question, tapId, toCloudApi, hashMobile, CONSENT_GENERIC_V1, AGE_TO_DB, BUDGET_TO_DB, METHOD_TO_DB, STALL_HOURS, REDIRECT_REF_RE };
