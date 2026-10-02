// automation/lib/w07.mjs  -  W07 conversation agent: the deterministic steps around the three LLM calls.
// Owner: automation-engineer. Imported by the n8n Code nodes in automation/W07.json
// (await import(pathToFileURL($env.REPO_DIR + '/automation/lib/w07.mjs'))) and by automation/tests/W07.test.mjs,
// so the workflow and its test run the same code. Node 18+, zero dependencies.
//
// Order (conversation/prompts/guardrail.md, no path skips a step):
//   inbound -> routeInbound (taps / STOP / broker numbers / CTWA never reach an LLM)
//   -> prefilter + redactForLLM -> intent-slot LLM -> parseNlu -> decide() (logic.mjs)
//   -> planActions (fixed lines, delegations, escalations, lead_theme rows)
//   -> reply LLM (only for actions that need words) -> outputGate -> classifier LLM on classifierInput() (I-27)
//   -> toneCheck -> assemble -> send.
import { prefilter, redactForLLM, redactForStorage, outputGate, classifierInput, toneCheck, sanitiseField } from '../../conversation/guardrail.mjs';
import { decide, DEFER_TOPICS, FAQ_TOPICS, INTENTS, ALL_TOPICS } from '../../conversation/logic.mjs';
import { LINES, fill, fixedLines } from '../../conversation/lines.mjs';
import { isPulseLine } from '../../conversation/pulse.mjs';

export const WORKFLOW = 'W07';
export const HOURS = { open: 8, close: 20 }; // handoff.md (6.8a): 08:00-20:00 SAST, every day until Jonathan says otherwise
const SAST = 2 * 3600_000;

// ---------- band mapping (NLU vocabulary in logic.mjs  <->  physical CHECK values in leads) ----------
export const AGE_TO_DB = { '<35': 'lt35', '35-44': '35_44', '45-50': '45_50', '51+': '51plus' };
export const BUDGET_TO_DB = { '<750': 'lt750', '750-1250': '750_1250', '1250+': '1250plus' };
export const AGE_FROM_DB = Object.fromEntries(Object.entries(AGE_TO_DB).map(([k, v]) => [v, k]));
export const BUDGET_FROM_DB = Object.fromEntries(Object.entries(BUDGET_TO_DB).map(([k, v]) => [v, k]));

// ---------- 1. inbound normalisation (Cloud API webhook -> flat messages) ----------
export function normaliseInbound(body = {}) {
  const out = [];
  for (const e of body.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    for (const m of v.messages || []) {
      const msg = { wamid: m.id, from: '+' + String(m.from || '').replace(/^\+/, ''), at_ms: Number(m.timestamp || 0) * 1000, type: m.type, text: '', payload: null, list_id: null, media: null, media_id: null, referral: m.referral || null, phone_number_id: v.metadata?.phone_number_id || null };
      if (m.type === 'text') msg.text = m.text?.body || '';
      else if (m.type === 'button') { msg.payload = m.button?.payload ?? null; msg.text = m.button?.text || ''; }
      else if (m.type === 'interactive') {
        const i = m.interactive || {};
        if (i.type === 'button_reply') { msg.payload = i.button_reply?.id ?? null; msg.text = i.button_reply?.title || ''; }
        else if (i.type === 'list_reply') { msg.list_id = i.list_reply?.id ?? null; msg.text = i.list_reply?.title || ''; }
        else if (i.type === 'nfm_reply') { msg.payload = 'flow_complete'; msg.flow_response = i.nfm_reply?.response_json || null; }
      } else if (['image', 'document', 'video', 'sticker'].includes(m.type)) { msg.media = m.type; msg.media_id = m[m.type]?.id || null; msg.text = m[m.type]?.caption || ''; }
      else if (m.type === 'audio') { msg.media = 'audio'; msg.media_id = m.audio?.id || null; }
      out.push(msg);
    }
  }
  return out;
}

// ---------- 2. deterministic router: taps, STOP, brokers, CTWA. No LLM on any of these. ----------
// Payload contract (templates README "Send-time notes"): quick-reply payloads are set at send time.
const LEAD_TAPS = {
  confirm: 'W09', reschedule: 'W10', cancel: 'W10', keep_it: 'W10', cancel_yes: 'W10', other_times: 'W10',
  see_open_times: 'W04_list', not_now: 'W08', no_thanks: 'W08',
  reach_yes: 'W12', reach_no: 'W12', pulse_yes: 'W35', pulse_no: 'W35',
  call_number_yes: 'W07_contact', call_number_other: 'W07_contact', alt_add: 'W07_contact', alt_no: 'W07_contact',
  play_voice_note: 'W09', looking_forward: 'W09', flow_complete: 'W28'
};
const STOP_WORDS = /^\s*(stop|unsubscribe|opt[ -]?out|stopp?|stop all)\s*[.!]*\s*$/iu;
export const BEST_TIME = { best_mornings: 'mornings', best_lunchtime: 'lunchtime', best_afternoons: 'afternoons', best_evenings: 'evenings', best_any: 'any' };

// W32 Approve / Later quick replies (optimisation/n8n-code/w32-pulse-messages.js + w32-escalate.js: "approve:<uuid>" | "later:<uuid>").
export const W32_TAP = /^(approve|later):[0-9a-f-]{36}$/i;
// Brokers still being set up record their intro voice note on WhatsApp (W23); live brokers' voice notes are W29 feedback.
export const PRE_LIVE_BROKER = new Set(['invited', 'prospect', 'onboarding', 'onboarded', 'ready_for_go_live']);

/**
 * routeInbound(msg, ctx) -> { route, reason }
 * ctx = { lead (row or null), broker_numbers: Set of E.164 adviser numbers, ops_numbers: Set of E.164 (Jonathan, KG),
 *         broker_status, suppressed: bool }
 * I-37e loop guard: a message W03 handed back (msg.origin === 'w03') is never routed to W03 again.
 */
export function routeInbound(msg, ctx = {}) {
  const r = routeCore(msg, ctx);
  if (msg.origin === 'w03' && r.route === 'W03') {
    return ctx.lead ? { route: 'nlu', reason: 'loop guard: W03-originated message for a known lead -> conversation agent' }
      : { route: 'ignore_loop', reason: 'loop guard: W03-originated message is never sent back to W03 (logged only)' };
  }
  return r;
}

function routeCore(msg, ctx) {
  const tapKey = (msg.payload || '').split(':')[0];
  // I-37e: W32 Approve / Later taps, only from the ops numbers that receive them; anyone else's tap falls through.
  if (ctx.ops_numbers && ctx.ops_numbers.has(msg.from) && W32_TAP.test(msg.payload || '')) return { route: 'W32_decision', reason: `W32 ${tapKey} tap` };
  if (ctx.broker_numbers && ctx.broker_numbers.has(msg.from)) {
    // I-37d: one inbound subscription; broker intro media is a W07 -> W23 sub-call.
    if (msg.media === 'video' || (msg.media === 'audio' && PRE_LIVE_BROKER.has(ctx.broker_status))) return { route: 'W23', reason: 'broker intro media (W23)' };
    if (['attended', 'no_show', 'rescheduled'].includes(tapKey)) return { route: 'W12', reason: 'broker outcome tap' };
    return { route: 'W29', reason: 'broker feedback (disposition list, quality, voice note, follow-up tap)' };
  }
  // STOP anywhere, in any state, before anything else (W15). prefilter's STOP_RX is the broad net; this is the exact word.
  if (STOP_WORDS.test(msg.text || '') || (msg.text && prefilter(msg.text).stop)) return { route: 'W15', reason: 'STOP' };
  if (!ctx.lead) return msg.referral || /check my life cover/iu.test(msg.text || '') ? { route: 'W03', reason: 'CTWA entry' } : { route: 'W03', reason: 'unknown number: W03 consent first' };
  if (ctx.lead.opted_out_at) return { route: 'ignore_opted_out', reason: 'opted out: logged only, no reply (W15 sent the one confirmation)' };
  const state = ctx.lead.conv_state?.state || 'unbooked';
  if (['consent_pending', 'q_age', 'q_bond', 'q_dependants', 'q_budget', 'q_budget_clarify'].includes(state) && (msg.payload || msg.list_id)) return { route: 'W03', reason: 'qualifying tap' };
  if (/^slot_.+:resched:/u.test(msg.list_id || msg.payload || '')) return { route: 'W10', reason: 'reschedule slot picked' };
  if (msg.list_id && /^slot_/u.test(msg.list_id)) return { route: 'W05', reason: 'slot picked from the 10-slot list' };
  if (msg.list_id && BEST_TIME[msg.list_id]) return { route: 'W07_contact', reason: 'best time tap' };
  if (msg.payload && /^slot_/u.test(msg.payload)) return { route: 'W05', reason: 'slot button (Time 1-3)' };
  if (tapKey && LEAD_TAPS[tapKey]) return { route: LEAD_TAPS[tapKey], reason: `tap ${tapKey}` };
  if (state === 'handoff') return { route: 'paused', reason: 'a person has this conversation' };
  // w07-alignment #13: the optional one-line answer after a W35 pulse tap goes to W35 (conversation/pulse.mjs decides;
  // advice / person / STOP / complaint / claim / distress return false and stay on the normal W07 path).
  if (msg.text && isPulseLine(msg.text, ctx.lead.conv_state || {}, Number.isFinite(ctx.now_ms) ? ctx.now_ms : Date.now())) return { route: 'W35', reason: 'lead pulse line' };
  return { route: 'nlu', reason: 'free text' };
}

// ---------- 3. pre-LLM step ----------
export function preStep(msg, lead = {}, broker = {}) {
  const adviser_first = String(broker.contact_person || broker.adviser_name || '').split(' ')[0] || 'your adviser';
  const pre = prefilter(msg.text || '', { adviser_first, media: msg.media, prev_deferred: Boolean(lead.conv_state?.prev_deferred) });
  return {
    pre,
    text_llm: redactForLLM(msg.text || ''),
    text_store: redactForStorage(msg.text || ''),
    adviser_first,
    // media is never downloaded or sent to a model (audio is transcribed first, then read like text)
    skip_llm: Boolean(pre.media) && !(msg.text || '').trim()
  };
}

// ---------- 4. intent-slot LLM request + validation ----------
export function intentUserTurn({ state, booking, now_ms, known = [], text_llm }) {
  const b = booking ? `${booking.day} ${booking.date} ${booking.time} by ${booking.method}` : 'none';
  return `STATE: ${state}\nCONSENT_PENDING: ${state === 'consent_pending'}\nBOOKING: ${b}\nNOW: ${new Date(now_ms + SAST).toISOString().slice(0, 19)}+02:00 Africa/Johannesburg\nKNOWN: ${known.join(', ')}\nMESSAGE: """${String(text_llm).replace(/"{3,}/gu, '"').slice(0, 1200)}"""`;
}
export function parseNlu(raw) {
  const fallback = { intent: 'other', secondary_intents: [], topics: ['unknown'], slots: {}, sentiment: 'neutral', language: 'en', confidence: 0, valid: false };
  let o;
  try { o = typeof raw === 'string' ? JSON.parse(raw.replace(/```json|```/g, '').trim()) : raw; } catch { return fallback; }
  if (!o || typeof o !== 'object' || !INTENTS.includes(o.intent)) return fallback;
  const topics = Array.isArray(o.topics) ? o.topics.filter((t) => ALL_TOPICS.includes(t)) : [];
  return { intent: o.intent, secondary_intents: (o.secondary_intents || []).filter((i) => INTENTS.includes(i)), topics, consent_answer: o.consent_answer ?? null, slots: o.slots && typeof o.slots === 'object' ? o.slots : {}, sentiment: o.sentiment || 'neutral', language: o.language || 'en', confidence: typeof o.confidence === 'number' ? o.confidence : 0.5, valid: true };
}

// ---------- 4b. facts for the reply request / fallbacks (w07-alignment #6, #7) ----------
export const METHOD_LABEL = { en: { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp call', phone: 'phone' }, af: { teams: 'Teams', zoom: 'Zoom', meet: 'Google Meet', whatsapp_call: 'WhatsApp-oproep', phone: 'telefoon' } };
/** Booking row (appointment_date timestamptz, method) -> { day, date, time (HH:MM SAST), method, method_label }. */
export function bookingView(b, lang = 'en') {
  if (!b) return null;
  const at = Date.parse(b.appointment_date || b.at || '');
  if (!Number.isFinite(at)) return { ...b, method_label: (METHOD_LABEL[lang] || METHOD_LABEL.en)[b.method] || b.method || '' };
  const loc = lang === 'af' ? 'af-ZA' : 'en-ZA'; const tz = 'Africa/Johannesburg';
  const d = new Date(at);
  const day = d.toLocaleDateString(loc, { weekday: 'long', timeZone: tz });
  const date = d.toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: tz });
  const time = new Date(at + SAST).toISOString().slice(11, 16);
  return { ...b, day, date, time, method_label: (METHOD_LABEL[lang] || METHOD_LABEL.en)[b.method] || b.method || '' };
}
export const bookingFact = (bv) => (bv && bv.time ? `${bv.day} ${bv.date} ${bv.time} by ${bv.method_label}` : null);
/** knowledge/faq.md -> { 'FAQ-01': { topic, type, en, af } } (same parse as evals/run.mjs). */
export function parseFaqMd(md) {
  const out = {};
  for (const block of String(md || '').split(/\n### /).slice(1)) {
    const id = block.match(/^(FAQ-\d+|DEF-\d+)/)?.[1];
    const field = (k) => block.match(new RegExp(`^- ${k}: (.*)$`, 'm'))?.[1]?.trim();
    if (id) out[id] = { topic: field('topic'), type: field('type'), en: field('en'), af: field('af') };
  }
  return out;
}
const KNOWN_FIELDS = ['first_name', 'age_band', 'budget_band', 'bond', 'dependants', 'method_pref', 'email', 'call_number', 'best_time', 'language'];
/** Slots already stored, so the model never asks twice (4.11 memory). Names only, never values. */
export const knownSlots = (lead = {}, booking = null) => KNOWN_FIELDS.filter((k) => lead[k] !== null && lead[k] !== undefined && lead[k] !== '').concat(booking ? ['booking'] : []);
/** reply.md DECISION.facts: approved FAQ answers (lead's language), known slots, booking with time. */
export function replyFacts({ plan, adviser_first, booking, faq = {}, lead = {} }) {
  const lang = plan.lang === 'af' ? 'af' : 'en';
  const f = {};
  for (const a of plan.reply_actions || []) if (a.startsWith('answer:')) { const e = faq[a.slice(7)]; if (e && e.type === 'answer') f[a.slice(7)] = e[lang] || e.en; }
  return { adviser_first, booking: bookingFact(booking), faq: f, known: knownSlots(lead, booking) };
}

// ---------- 5. actions -> plan ----------
// prompts/reply.md lists send_slots/offer_slots/reschedule*/cancel_confirm/change_method too; here those are delegated to
// W04/W10, which send ONE interactive message whose body is the reply.md fallback line (no second, generated message).
const REPLY_ACTIONS = /^(answer:FAQ-\d\d|capture_contact|set_language)$/u;
export function openTimeWord(now_ms, lang = 'en') {
  const h = new Date(now_ms + SAST).getUTCHours();
  const today = h < HOURS.open;
  return lang === 'af' ? (today ? 'vandag' : 'môre') : (today ? 'today' : 'tomorrow');
}
export const inHours = (now_ms) => { const h = new Date(now_ms + SAST).getUTCHours(); return h >= HOURS.open && h < HOURS.close; };

/**
 * Escalation kinds. `sensitive` is the logical kind (self-harm / bereavement, handoff.md trigger 6). The physical
 * escalations_kind_check has no `sensitive` yet (I-25), so it is stored as kind 'human_handoff', severity 'red',
 * note 'esc_kind=sensitive' - the same mapping W30/W31 use - until platform-architect pass 3 adds the value.
 */
export const ESC_DB_KIND = { sensitive: 'human_handoff', human_handoff: 'human_handoff', frustrated: 'human_handoff', unanswered: 'human_handoff', claim_problem: 'human_handoff', complaint: 'complaint', guardrail_trip: 'guardrail_trip', band_conflict: 'other', opted_out_message: 'other' };
export function escalationRow(kind, { lead_id, broker_id, brand_id, wamid, urgent = false }) {
  return {
    kind: ESC_DB_KIND[kind] || 'other',
    severity: kind === 'sensitive' ? 'red' : urgent || kind === 'complaint' ? 'urgent' : 'normal',
    ref_table: 'communications', ref_id: wamid, lead_id, broker_id, brand_id,
    note: `esc_kind=${kind}`,
    // trigger 6: both people at once, never batched into the digest; others primary first, backup at 15 min
    notify: kind === 'sensitive' ? ['Jonathan', 'KG'] : ['Jonathan'],
    deep_link: lead_id ? `/console/conversations/${lead_id}` : null
  };
}

/** Themes the lead raised (I-22): lead_activities activity_type 'lead_theme', payload.theme = label only. */
export function leadThemes(nlu, pre, text_store) {
  const set = new Set();
  for (const t of nlu.topics || []) if (DEFER_TOPICS.includes(t) || FAQ_TOPICS[t] || ['claim_problem', 'complaint', 'distress'].includes(t)) set.add(t);
  for (const t of pre.advice_topics || []) if (t !== 'followup') set.add(t === 'amount' ? 'cover_amount' : t);
  if (pre.health) set.add('health');
  const deferred = (t) => DEFER_TOPICS.includes(t) || t === 'health';
  // words: the redacted message (health -> whole message replaced), max 120 chars; never for distress
  return [...set].map((theme) => ({ theme, deferred: deferred(theme), words: theme === 'distress' || pre.health ? null : String(text_store).slice(0, 120) }));
}

/**
 * planActions(decision, ctx) -> what W07 does next. Pure.
 * ctx = { lead, broker, booking, pre, nlu, now_ms, lang, state, wamid, disclosed }
 */
export function planActions(decision, ctx) {
  const { pre, nlu, now_ms } = ctx;
  const lang = ctx.lang === 'af' ? 'af' : 'en';
  const L = LINES[lang];
  const first = sanitiseField('first_name', ctx.lead?.first_name || '').value;
  const vars = { first_name: first || '', adviser_first: ctx.adviser_first, open_time_word: openTimeWord(now_ms, lang), date: ctx.booking?.date, time: ctx.booking?.time, method: ctx.booking?.method_label };
  // #5: outputGate's injected_field check needs the RAW stored name, not the sanitised one
  const plan = { actions: decision.actions, next_state: decision.next_state, prefix: [], suffix: [], reply_actions: [], delegate: [], escalation: null, pause_reminders: false, send: true, unanswered: 0, themes: leadThemes(nlu, pre, ctx.text_store || ''), lead_updates: {}, first_name_raw: String(ctx.lead?.first_name || ''), discloses: false };
  const has = (a) => decision.actions.includes(a);
  const esc = (kind) => { plan.escalation = escalationRow(kind, { lead_id: ctx.lead?.id, broker_id: ctx.lead?.broker_id, brand_id: ctx.lead?.brand_id, wamid: ctx.wamid }); };

  if (has('stop')) { plan.delegate.push({ to: 'W15' }); plan.send = false; return plan; }
  if (has('handoff_urgent')) { esc('sensitive'); plan.send = false; plan.pause_reminders = true; plan.next_state = 'handoff'; return plan; }
  if (has('human_review')) { esc('opted_out_message'); plan.send = false; return plan; }
  if (has('paused')) { plan.send = false; return plan; }

  if (has('defer')) plan.suffix.push(L.DEFER, L.DEFER_NOTED);
  if (has('defer_after_call')) plan.suffix.push(L.DEFER_AFTER_CALL);
  if (has('handoff')) {
    const kind = pre.claim_problem || (nlu.topics || []).includes('claim_problem') ? 'claim_problem'
      : pre.complaint || (nlu.topics || []).includes('complaint') ? 'complaint'
        : nlu.sentiment === 'frustrated' ? 'frustrated'
          : (ctx.unanswered || 0) >= 1 && !pre.person && nlu.intent !== 'person' ? 'unanswered' : 'human_handoff';
    esc(kind);
    plan.suffix.push(kind === 'complaint' ? L.HANDOFF_COMPLAINT : kind === 'frustrated' && inHours(now_ms) ? L.HANDOFF_FRUSTRATED : inHours(now_ms) ? L.HANDOFF_IN_HOURS : L.HANDOFF_OUT_OF_HOURS);
    plan.next_state = 'handoff';
  }
  if (has('id_warning')) plan.suffix.push(L.ID_WARNING);
  if (has('bank_warning')) plan.suffix.push(L.BANK_WARNING);
  if (has('media_not_opened')) plan.suffix.push(L.MEDIA_NOT_OPENED);
  if (has('stay_in_lane')) plan.prefix.push(L.STAY_IN_LANE);
  if (has('clarify')) { plan.prefix.push(L.CLARIFY); plan.unanswered = (ctx.unanswered || 0) + 1; }
  if (has('commitment_ok')) plan.prefix.push(L.COMMIT_OK);
  if (has('commitment_check')) plan.prefix.push(L.COMMIT_CHECK);
  if (has('close_unbooked')) { plan.prefix.push(L.CLOSE_UNBOOKED); plan.delegate.push({ to: 'W08', action: 'close' }); plan.lead_updates.stage = 'unbooked_closed'; }
  if (has('flag_band_conflict')) esc('band_conflict');
  for (const a of decision.actions) {
    if (REPLY_ACTIONS.test(a)) plan.reply_actions.push(a);
    if (['consent_yes', 'consent_no', 'consent_reask', 'record_answer', 'next_question', 'repeat_question', 'budget_clarify', 'close_oob'].includes(a)) plan.delegate.push({ to: 'W03', action: a, slots: nlu.slots });
    if (a === 'send_slots' || a === 'offer_slots') plan.delegate.push({ to: 'W04', action: a, preferred_day: nlu.slots?.preferred_day || null, preferred_time: nlu.slots?.preferred_time || null });
    if (['reschedule', 'reschedule_slots', 'cancel_confirm', 'change_method'].includes(a)) plan.delegate.push({ to: 'W10', action: a, method: nlu.slots?.method || null });
    if (a === 'capture_contact') plan.delegate.push({ to: 'W07_contact', email: nlu.slots?.email || null, call_number: nlu.slots?.call_number || null });
    if (a === 'set_language' && nlu.language) plan.lead_updates.language = nlu.language;
  }
  // #8 (reply.md v1.0.2): greet / booking_status never reach the model. Booked -> BOOKING_STATUS; not booked -> W04 slots.
  if (has('greet') || has('booking_status')) {
    if (ctx.booking && ctx.booking.time) plan.prefix.push(L.BOOKING_STATUS);
    else if (!plan.delegate.some((d) => d.to === 'W04')) plan.delegate.push({ to: 'W04', action: 'send_slots', preferred_day: null, preferred_time: null });
  }
  // 4.11 disclosure: the first free-text reply carries DISCLOSE (W06's intro card already named the practice + FSP)
  if (!ctx.disclosed && (plan.prefix.length || plan.suffix.length || plan.reply_actions.length || plan.delegate.some((d) => ONE_MESSAGE[d.to]?.(d)))) {
    plan.prefix.unshift(ctx.adviser_first ? L.DISCLOSE : L.DISCLOSE_PRE_ROUTE);
    plan.discloses = true;
  }
  if (decision.actions.length === 1 && decision.actions[0] === 'none') plan.send = false;
  plan.vars = vars;
  plan.lang = lang;
  oneMessage(plan, ctx);
  return plan;
}

// #1 one message, never two (I-35e): when W04 (slots) or W10 (reschedule / cancel / method) sends the interactive
// message, W07's fixed lines travel INSIDE it and W07 sends nothing itself.
const ONE_MESSAGE = {
  W04: (d) => d.action === 'send_slots' || d.action === 'offer_slots',
  W10: (d) => ['reschedule', 'reschedule_slots', 'cancel_confirm', 'change_method'].includes(d.action)
};
export const WA_BODY_MAX = 1024;
function delegateIntroKey(d) {
  if (d.to === 'W04') return 'SLOTS_INTRO';
  return { reschedule: 'RESCHED_INTRO', reschedule_slots: 'RESCHED_INTRO', cancel_confirm: 'CANCEL_CONFIRM_Q', change_method: 'METHOD_CHANGED' }[d.action];
}
function oneMessage(plan, ctx) {
  const d = plan.delegate.find((x) => ONE_MESSAGE[x.to]?.(x));
  if (!d) return;
  const L = LINES[plan.lang];
  const vars = { ...plan.vars, method: d.action === 'change_method' ? methodLabel(d.method, plan.lang) || plan.vars.method : plan.vars.method };
  // FAQ answers on the same turn go in verbatim (approved text, no LLM) so nothing is lost and nothing is sent twice
  const faqLines = plan.reply_actions.filter((a) => a.startsWith('answer:')).map((a) => replyFallback(a, { lang: plan.lang, faq: ctx.faq })).filter(Boolean);
  const before = plan.prefix.map((l) => fill(l, vars));
  const after = [...faqLines, ...plan.suffix.map((l) => fill(l, vars))];
  d.lead_lines = [...before, ...after];
  d.intro_line = fill(L[delegateIntroKey(d)] || '', vars);
  d.body = [...before, d.intro_line, ...after].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  d.lang = plan.lang;
  d.carries_disclose = plan.discloses;
  if (d.body.length > WA_BODY_MAX) d.body = [...before, d.intro_line].join(' ').slice(0, WA_BODY_MAX); // never over the Cloud API limit
  plan.prefix = []; plan.suffix = []; plan.reply_actions = [];
  plan.send = false;
}
const methodLabel = (m, lang) => (m ? (METHOD_LABEL[lang] || METHOD_LABEL.en)[m] || m : '');

/** #14: `disclosed` only once a disclosure actually went out (own message sent, or carried by the W04/W10 message). */
export function disclosedAfter(prev, plan, sent) {
  if (prev) return true;
  if (!plan || !plan.discloses) return false;
  return Boolean(sent) || plan.delegate.some((d) => d.carries_disclose);
}

// ---------- 6. reply + gates ----------
export function replyFallback(action, ctx) {
  const lang = ctx.lang === 'af' ? 'af' : 'en';
  const L = LINES[lang];
  const vars = { adviser_first: ctx.adviser_first, date: ctx.booking?.date, time: ctx.booking?.time, method: ctx.new_method_label || ctx.booking?.method_label || '' };
  if (action.startsWith('answer:')) { const e = ctx.faq?.[action.slice(7)]; return (e && (e[lang] || e.en)) || ''; }
  if (action === 'send_slots' || action === 'offer_slots') return fill(L.SLOTS_INTRO, vars);
  if (action === 'reschedule' || action === 'reschedule_slots') return fill(L.RESCHED_INTRO, vars);
  if (action === 'cancel_confirm') return ctx.booking?.time ? fill(L.CANCEL_CONFIRM_Q, vars) : '';
  if (action === 'change_method') return ctx.new_method_label ? fill(L.METHOD_CHANGED, vars) : '';
  if (action === 'capture_contact') return L.SAVED;
  if (action === 'set_language') return L.LANG_SWITCH;
  if ((action === 'booking_status' || action === 'greet') && ctx.booking?.time) return fill(L.BOOKING_STATUS, vars);
  return '';
}

/** Build the classifier user turn (I-27: the classifier must see the lead's question; surface whatsapp). */
export const classifierTurn = (draft, question, lang) => classifierInput({ draft, question, lang, surface: 'whatsapp' });

/** #3: outputGate runs BEFORE the classifier (guardrail.md); a trip skips the paid classifier call. */
export function preClassifierGate(plan, draft, question = '') {
  const gate = outputGate(draft, { fixed_lines: fixedLines(plan.lang, plan.vars), question, first_name_raw: plan.first_name_raw ?? plan.vars.first_name });
  return gate.pass ? { pass: true, verdict: null } : { pass: false, verdict: { verdict: 'block', confidence: 1, categories: gate.categories.map((c) => `outputGate:${c}`) } };
}
export const CLASSIFIER_MIN_CONFIDENCE = 0.8; // #4: a pass below this is re-checked (Sonnet) or, until then, blocked

export function parseVerdict(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw.replace(/```json|```/g, '').trim()) : raw;
    if (o && (o.verdict === 'pass' || o.verdict === 'block')) return { verdict: o.verdict, confidence: Number(o.confidence ?? 0), categories: o.categories || [] };
  } catch { /* fails closed */ }
  return { verdict: 'block', confidence: 0, categories: ['invalid_or_timeout'] }; // guardrail.md: fails closed
}

/**
 * gateAndAssemble(plan, { draft, verdict, question, lead_used_emoji, fallbacks }) -> { text, guardrail_trip, guardrail_rule, used }
 * The LLM draft survives only if outputGate passes AND the classifier says pass AND toneCheck passes.
 */
export function gateAndAssemble(plan, { draft = '', verdict = null, question = '', lead_used_emoji = false, fallback = '' } = {}) {
  const fixed = fixedLines(plan.lang, plan.vars);
  const prefix = plan.prefix.map((l) => fill(l, plan.vars));
  const suffix = plan.suffix.map((l) => fill(l, plan.vars));
  let body = '';
  let trip = false;
  let rule = null;
  let used = 'none';
  if (plan.reply_actions.length) {
    const gate = outputGate(draft, { fixed_lines: fixed, question, first_name_raw: plan.first_name_raw ?? plan.vars.first_name });
    const v0 = verdict || { verdict: 'block', categories: ['not_run'] };
    // #4: low-confidence pass is not a pass (fails closed until the Sonnet re-check node exists); a block is never appealed
    const v = v0.verdict === 'pass' && !(Number(v0.confidence) >= CLASSIFIER_MIN_CONFIDENCE) ? { verdict: 'block', categories: ['low_confidence_pass'] } : v0;
    const tone = toneCheck(draft, { fixed_lines: fixed, lead_used_emoji, lang: plan.lang });
    if (draft && gate.pass && v.verdict === 'pass' && tone.pass) { body = draft; used = 'llm'; }
    else {
      trip = !gate.pass || v.verdict === 'block';
      rule = !gate.pass ? `outputGate:${gate.categories.join(',')}` : v.verdict === 'block' ? `classifier:${(v.categories || []).join(',')}` : `tone:${tone.issues.join(',')}`;
      body = fallback;
      used = 'fallback';
      // a blocked draft on an advice-shaped question gets the deferral line, never silence (guardrail.md "On block")
      if (trip && !suffix.includes(fill(LINES[plan.lang].DEFER, plan.vars)) && prefilter(question).defer) suffix.unshift(fill(LINES[plan.lang].DEFER, plan.vars), fill(LINES[plan.lang].DEFER_NOTED, plan.vars));
    }
  }
  const text = [...prefix, body, ...suffix].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  return { text, guardrail_trip: trip, guardrail_rule: rule, used };
}

/** 24-h customer-service window: free-form only inside it (Meta). W07 always answers an inbound, so this is a guard. */
export const inWindow = (last_inbound_ms, now_ms) => Number.isFinite(last_inbound_ms) && now_ms - last_inbound_ms < 24 * 3600_000;

// ---------- 7. post-booking contact confirms (4.6 "Flow in practice"; W05 calls this; taps come back via routeInbound) ----------
const CALL_METHODS = new Set(['whatsapp_call', 'phone']);
/** First question after a booking. Teams/Zoom/Meet: nothing (the link is the contact). */
export function contactStart(booking, broker, lang = 'en') {
  if (!CALL_METHODS.has(booking.method)) return null;
  const L = LINES[lang === 'af' ? 'af' : 'en'];
  const adviser = String(broker.contact_person || '').split(' ')[0];
  return { type: 'buttons', body: fill(L.CONTACT_CALL_NUMBER, { adviser_first: adviser }), buttons: [['call_number_yes', 'Yes, this one'], ['call_number_other', 'Use another number']] };
}
// Button / row titles are not in lines.mjs yet (request to conversation-designer); bodies are.
const BEST_LABELS = { mornings: 'Mornings', lunchtime: 'Lunchtime', afternoons: 'Afternoons', evenings: 'Evenings', any: 'Any time' };
const altQ = (L) => ({ type: 'buttons', body: L.CONTACT_ALT, buttons: [['alt_add', 'Add one'], ['alt_no', 'No thanks']] });
const bestQ = (L) => ({ type: 'list', body: L.CONTACT_BEST_TIME, rows: Object.entries(BEST_TIME).map(([id, v]) => [id, BEST_LABELS[v]]) });

/** SA mobile to E.164 (+27...). Returns null when it cannot be a SA number. */
export function toE164(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '27' + d.slice(1);
  return /^27[1-9]\d{8}$/.test(d) ? '+' + d : null;
}

/**
 * contactStep(lead, msg, lookup) -> { update, reply, next, lookup_needed }
 * conv_state.contact_step: 'call_number' -> 'typed_number' -> 'alt' -> 'typed_alt' -> 'best_time' -> 'done'
 * lookup = { line_type } for the typed number (Twilio Lookup v2), or null when not yet looked up.
 * Max 2 attempts on a typed number, then "we'll use this WhatsApp number". Ignored questions are never re-asked.
 */
export function contactStep(lead, msg, lookup = null) {
  const cs = { contact_step: 'call_number', attempts: 0, ...(lead.conv_state || {}) };
  const key = String(msg.payload || msg.list_id || '').split(':')[0];
  const out = { update: {}, conv_state: { ...cs }, reply: null, lookup_needed: null };
  const L = LINES[lead.language === 'af' ? 'af' : 'en'];
  const ALT_Q = altQ(L); const BEST_Q = bestQ(L);
  const toAlt = () => { out.conv_state.contact_step = 'alt'; out.conv_state.attempts = 0; out.reply = ALT_Q; };
  const toBest = () => { out.conv_state.contact_step = 'best_time'; out.reply = BEST_Q; };
  if (BEST_TIME[key]) { out.update.best_time = BEST_TIME[key]; out.conv_state.contact_step = 'done'; out.reply = { type: 'text', body: L.SAVED }; return out; }
  if (key === 'call_number_yes') { out.update.call_number = lead.phone; out.update.call_number_line_type = lead.line_type || 'mobile'; toAlt(); return out; }
  if (key === 'call_number_other') { out.conv_state.contact_step = 'typed_number'; out.reply = { type: 'text', body: L.CONTACT_TYPE_NUMBER }; return out; }
  if (key === 'alt_add') { out.conv_state.contact_step = 'typed_alt'; out.reply = { type: 'text', body: L.CONTACT_TYPE_ALT }; return out; }
  if (key === 'alt_no') { toBest(); return out; }
  if (cs.contact_step === 'typed_number' || cs.contact_step === 'typed_alt') {
    const e = toE164(msg.text);
    const alt = cs.contact_step === 'typed_alt';
    if (e && !lookup) { out.lookup_needed = e; return out; }
    const ok = e && lookup && lookup.line_type === 'mobile';
    if (ok) {
      if (alt) { out.update.alt_number = e; out.update.alt_purpose = 'reach_fallback'; toBest(); }
      else { out.update.call_number = e; out.update.call_number_line_type = 'mobile'; toAlt(); }
      return out;
    }
    out.conv_state.attempts = (cs.attempts || 0) + 1;
    if (out.conv_state.attempts >= 2) {
      if (alt) { toBest(); out.reply = { ...BEST_Q, pre: L.CONTACT_KEEP_NUMBER }; }
      else { out.update.call_number = lead.phone; out.update.call_number_line_type = lead.line_type || 'mobile'; toAlt(); out.reply = { ...ALT_Q, pre: L.CONTACT_USE_WA }; }
      return out;
    }
    out.reply = { type: 'text', body: L.CONTACT_BAD_NUMBER };
    return out;
  }
  return out;
}

/** I-37e: the item W07 passes to W32's "Console decision (sub-call)" trigger (its Validate node parses body.payload). */
export function w32DecisionItem(msg) {
  return { source: 'W07', payload: String(msg.payload || ''), from: msg.from, decided_by: msg.from, wamid: msg.wamid };
}

/** I-37d: the item W07 passes to W23 "Called by W07 (broker media)": Cloud API message shape, so W23's expressions
 *  ($json.messages[0].type, .from, [type].id) are unchanged. */
export function w23MediaItem(msg) {
  const type = msg.media;
  return { source: 'W07', metadata: { phone_number_id: msg.phone_number_id || null },
    messages: [{ id: msg.wamid, from: String(msg.from || '').replace(/^\+/, ''), timestamp: String(Math.floor((msg.at_ms || 0) / 1000)), type, [type]: { id: msg.media_id, caption: msg.text || undefined } }] };
}
