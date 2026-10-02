'use strict';
// W28 Booking Flow endpoint: screen logic only (crypto is flow-crypto.js, slots are W04's engine).
// Contract: automation/flows/booking-flow-endpoint.md. Inlined into automation/W28.json; tested by automation/tests/W28.test.mjs.
// Which of my five: Meta Flows docs (CalendarPicker, data_exchange, <3 s, ping), Calendly/Cal.com slot rules (W04 engine,
// re-check before book), Chili Piper (the lead never leaves WhatsApp; failure falls back to an in-chat list, not a web page).

const OFF = 2 * 3600 * 1000; // Africa/Johannesburg, UTC+02:00, no DST
const DAY = 24 * 3600 * 1000;
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sastDate = (t) => new Date(t + OFF).toISOString().slice(0, 10);
const dayLabel = (date) => { const d = new Date(`${date}T12:00:00Z`); return `${DOWL[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const shortLabel = (isoStart) => { const d = new Date(Date.parse(isoStart) + OFF); return `${DOW3[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()].slice(0, 3)}, ${isoStart.slice(11, 16)}`; };

const METHOD_COPY = {
  teams: ['Microsoft Teams video call', 'We email you the Teams link'],
  zoom: ['Zoom video call', 'We email you the Zoom link'],
  google_meet: ['Google Meet video call', 'We email you the Meet link'],
  whatsapp_call: ['WhatsApp call', '{a} calls you on WhatsApp'],
  phone: ['Phone call', '{a} calls your mobile'],
};
const INVITE_METHODS = new Set(['teams', 'zoom', 'google_meet']);
const DB_TO_FLOW_METHOD = { meet: 'google_meet' };
const MAX_DAY_SLOTS = 20; // RadioButtonsGroup limit
const LIST_ROWS = 10; // WhatsApp interactive list limit

// ---------------------------------------------------------------- email checks (< 300 ms)
const TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'outlok.com': 'outlook.com', 'hotmial.com': 'hotmail.com', 'webmial.co.za': 'webmail.co.za', 'gmail.co.za': 'gmail.com' };
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@([A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;

async function checkEmail(raw, { resolveMx, disposable = new Set(), previous, hash } = {}) {
  const email = String(raw || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'That email address doesn’t look right. Please check it.' };
  const domain = email.split('@')[1].toLowerCase();
  const seenBefore = !!previous && (previous === email || (typeof hash === 'function' && previous === hash(email)));
  if (TYPOS[domain] && !seenBefore) {
    const suggestion = `${email.split('@')[0]}@${TYPOS[domain]}`;
    return { ok: false, suggestion, suggestion_text: `Did you mean ${suggestion}?` }; // second submit of the same text is accepted
  }
  if (disposable.has(domain)) return { ok: false, error: 'Please use an email address you check regularly.' };
  let mx = [];
  try { mx = await resolveMx(domain); } catch { mx = []; }
  if (!mx || !mx.length) return { ok: false, error: `We couldn’t find ${domain}. Please check the address.` };
  return { ok: true, email, email_status: 'mx_ok', email_purpose: 'meeting_invite' };
}

// ---------------------------------------------------------------- calendar bounds for CalendarPicker
function bounds(broker, slots, now) {
  const minDate = sastDate(now + broker.min_notice_hours * 3600 * 1000);
  const maxDate = sastDate(now + broker.horizon_days * DAY);
  const include = DOWK.filter((k) => (broker.meeting_hours[k] || []).length).map((k) => DOW3[DOWK.indexOf(k)]);
  const free = new Set(slots.map((s) => s.start.slice(0, 10)));
  const unavailable = [];
  for (let t = Date.parse(`${minDate}T00:00:00+02:00`); sastDate(t) <= maxDate; t += DAY) {
    const d = sastDate(t);
    const works = (broker.meeting_hours[DOWK[new Date(`${d}T12:00:00Z`).getUTCDay()]] || []).length > 0;
    if (works && !free.has(d)) unavailable.push(d); // full, capped, blocked, holiday or paused
  }
  return { min_date: minDate, max_date: maxDate, include_days: include, unavailable_dates: unavailable };
}

const common = (ctx) => {
  const c = { broker_id: ctx.broker.broker_id, lead_id: ctx.lead.id, adviser_name: ctx.broker.adviser_first_name || ctx.broker.adviser_name };
  if (ctx.token.kind === 'reschedule') c.booking_id = ctx.token.booking_id;
  return c;
};

/**
 * @param req  decrypted Flow request
 * @param deps { verifyToken(t), loadContext(lead_id, token) -> {lead, broker, booking, flow_errors, booking_ui},
 *               slots(broker, {fresh}) -> {fallback?, slots:[{start,end}]}, now, resolveMx, disposable }
 * @returns { response, effects[] }  effects are executed by the workflow (log rows, list fallback, alerts)
 */
async function handle(req, deps) {
  const effects = [];
  if (!req || req.action === 'ping') return { response: { data: { status: 'active' } }, effects };
  const tok = deps.verifyToken(req.flow_token);
  if (!tok.ok) {
    effects.push({ kind: 'security_event', reason: `flow_token_${tok.reason}` });
    return { response: { data: { error_message: 'This booking link has expired. We’ll send you times here on WhatsApp.' } }, effects };
  }
  const ctx = await deps.loadContext(tok.lead_id, tok);
  ctx.token = tok;
  if (!ctx.lead || !ctx.broker || ctx.lead.opted_out_at) {
    effects.push({ kind: 'security_event', reason: 'flow_token_lead_gone' });
    return { response: { data: { error_message: 'This booking link is no longer active.' } }, effects };
  }
  const d = req.data || {};
  // never trust ids in the payload: they must equal the token's mapping
  if ((d.lead_id && d.lead_id !== ctx.lead.id) || (d.broker_id && d.broker_id !== ctx.broker.broker_id) || (tok.kind === 'reschedule' && d.booking_id && d.booking_id !== tok.booking_id)) {
    effects.push({ kind: 'security_event', reason: 'flow_payload_mismatch' });
    return { response: { data: { error_message: 'Something went wrong. We’ll send you times here on WhatsApp.' } }, effects: effects.concat([{ kind: 'send_list', lead_id: ctx.lead.id, reason: 'payload_mismatch' }]) };
  }

  if (req.action === 'error') {
    const n = (ctx.flow_errors || 0) + 1;
    effects.push({ kind: 'activity', activity_type: 'flow_error', payload: { flow_token: req.flow_token, error: d.error || null, n } });
    if (n >= 2) effects.push({ kind: 'send_list', lead_id: ctx.lead.id, reason: 'two_flow_errors' }); // W28 failure rule
    return { response: { data: { acknowledged: true } }, effects };
  }

  const now = deps.now;
  const fail = (screen, data) => ({ response: { screen, data: { ...common(ctx), ...data, slots: [], show_error: true, error_message: 'We can’t load times right now. We’ll send you times here on WhatsApp.' } }, effects: effects.concat([{ kind: 'send_list', lead_id: ctx.lead.id, reason: 'calendar_unavailable' }]) });

  if (req.action === 'INIT') {
    effects.push({ kind: 'activity', activity_type: 'flow_opened', payload: { flow_token: req.flow_token, kind: tok.kind } }); // I-22
    const r = await deps.slots(ctx.broker, { fresh: false });
    const methods = (ctx.broker.methods_supported || []).map((m) => DB_TO_FLOW_METHOD[m] || m)
      .filter((m) => METHOD_COPY[m] && (m !== 'google_meet' || ctx.broker.calendar_provider === 'google'))
      .map((m) => ({ id: m, title: METHOD_COPY[m][0], description: METHOD_COPY[m][1].replace('{a}', common(ctx).adviser_name) }));
    if (r.fallback || !r.slots.length) {
      effects.push({ kind: 'send_list', lead_id: ctx.lead.id, reason: r.fallback ? 'calendar_unavailable' : 'no_slots' });
      return { response: { data: { error_message: 'No times are open right now. We’ll message you here with the next times.' } }, effects };
    }
    const data = { ...common(ctx), heading: `How would you like to meet ${common(ctx).adviser_name}?`, methods, ...bounds(ctx.broker, r.slots, now) };
    if (tok.kind === 'reschedule' && ctx.booking) {
      Object.assign(data, { current_method: DB_TO_FLOW_METHOD[ctx.booking.method] || ctx.booking.method, current_date: ctx.booking.start.slice(0, 10), current_booking_text: `Now booked: ${shortLabel(ctx.booking.start)}, ${(METHOD_COPY[DB_TO_FLOW_METHOD[ctx.booking.method] || ctx.booking.method] || ['call'])[0]}` });
    }
    return { response: { screen: 'METHOD', data }, effects };
  }

  if (req.action !== 'data_exchange') return { response: { data: { acknowledged: true } }, effects };

  if (d.action_type === 'date_selected') {
    const r = await deps.slots(ctx.broker, { fresh: false, date: d.date });
    if (r.fallback) return fail('SLOTS', { method: d.method, date: d.date, date_label: dayLabel(d.date) });
    const day = r.slots.filter((s) => s.start.startsWith(d.date)).slice(0, MAX_DAY_SLOTS);
    if (!day.length) return { response: { screen: 'DATE', data: { ...common(ctx), method: d.method, ...bounds(ctx.broker, r.slots, now) } }, effects };
    return { response: { screen: 'SLOTS', data: { ...common(ctx), method: d.method, date: d.date, date_label: `${dayLabel(d.date)} (South African time)`, slots: day.map((s) => ({ id: s.start, title: s.start.slice(11, 16) })), show_error: false, error_message: '' } }, effects };
  }

  if (d.action_type === 'slot_selected') {
    const r = await deps.slots(ctx.broker, { fresh: true }); // fresh getSchedule, no cache
    if (r.fallback) return fail('SLOTS', { method: d.method, date: d.date, date_label: dayLabel(d.date) });
    if (!r.slots.some((s) => s.start === d.slot)) {
      const next3 = r.slots.filter((s) => s.start > d.slot).slice(0, 3);
      return { response: { screen: 'SLOTS', data: { ...common(ctx), method: d.method, date: d.date, date_label: `${dayLabel(d.date)} (South African time)`, slots: next3.map((s) => ({ id: s.start, title: shortLabel(s.start) })), show_error: true, error_message: 'That time was just taken. Here are the next free times.' } }, effects };
    }
    const base = { ...common(ctx), method: d.method, date: d.date, slot: d.slot };
    if (INVITE_METHODS.has(d.method)) {
      const word = d.method === 'teams' ? 'Teams' : d.method === 'zoom' ? 'Zoom' : 'Google Meet';
      return { response: { screen: 'EMAIL', data: { ...base, prompt: `Where should we send the ${word} invite?`, init_email: ctx.lead.email || '', show_suggestion: false, suggestion_text: '', show_error: false, error_message: '' } }, effects };
    }
    return { response: { screen: 'SUMMARY', data: { ...base, email: '', summary_text: summary(ctx, d.method, d.slot) } }, effects }; // 0.1: never ask email for call methods
  }

  if (d.action_type === 'email_entered') {
    if (!INVITE_METHODS.has(d.method)) return { response: { screen: 'SUMMARY', data: { ...common(ctx), method: d.method, date: d.date, slot: d.slot, email: '', summary_text: summary(ctx, d.method, d.slot) } }, effects };
    const c = await checkEmail(d.email, { resolveMx: deps.resolveMx, disposable: deps.disposable, previous: d.previous_email || ctx.email_suggested_for, hash: deps.hash });
    if (c.suggestion) effects.push({ kind: 'activity', activity_type: 'flow_email_suggested', payload: { flow_token: req.flow_token, typed_domain: String(d.email).split('@')[1] || null, typed_hash: deps.hash ? deps.hash(String(d.email)) : null } });
    const base = { ...common(ctx), method: d.method, date: d.date, slot: d.slot };
    if (!c.ok) {
      const word = d.method === 'teams' ? 'Teams' : d.method === 'zoom' ? 'Zoom' : 'Google Meet';
      return { response: { screen: 'EMAIL', data: { ...base, prompt: `Where should we send the ${word} invite?`, init_email: c.suggestion || String(d.email || ''), show_suggestion: !!c.suggestion, suggestion_text: c.suggestion_text || '', show_error: !c.suggestion, error_message: c.error || '' } }, effects };
    }
    effects.push({ kind: 'store_email', lead_id: ctx.lead.id, email: c.email, email_status: c.email_status, email_purpose: c.email_purpose });
    return { response: { screen: 'SUMMARY', data: { ...base, email: c.email, summary_text: summary(ctx, d.method, d.slot, c.email) } }, effects };
  }
  return { response: { data: { acknowledged: true } }, effects };
}

function summary(ctx, method, slot, email) {
  const a = common(ctx).adviser_name;
  const how = { teams: `Microsoft Teams video call. We’ll email the link to ${email}.`, zoom: `Zoom video call. We’ll email the link to ${email}.`, google_meet: `Google Meet video call. We’ll email the link to ${email}.`, whatsapp_call: `${a} will call you on WhatsApp.`, phone: `${a} will call your mobile.` }[method] || '';
  return `${shortLabel(slot)} (South African time), 30 minutes with ${a}. ${how}`;
}

/** Fallback ladder step 2 (0.3 #3, the launch path): interactive list of the next 10 slots, spread across days. */
function listFallback(broker, slots, offerSpread, to) {
  const picks = offerSpread(slots, LIST_ROWS);
  if (!picks.length) return null;
  const a = broker.adviser_first_name || broker.adviser_name;
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace('+', ''), type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: `Pick a time for your 30-minute call with ${a}. Times are South African time.` },
      footer: { text: 'Reply STOP to opt out' },
      action: { button: 'See times', sections: [{ title: 'Next free times', rows: picks.map((s) => ({ id: `slot_${s.start}`, title: shortLabel(s.start) })) }] },
    },
  };
}

module.exports = { handle, checkEmail, bounds, listFallback, shortLabel, dayLabel, INVITE_METHODS, LIST_ROWS, MAX_DAY_SLOTS };
