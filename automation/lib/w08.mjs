// automation/lib/w08.mjs  -  W08 unbooked nurture (4.6 item 5, 4.12 last row, state-machine.md section 5).
// Imported by automation/W08.json (Code nodes) and automation/tests/W08.test.mjs. Node 18+, zero dependencies.
//
// Rules (all from the prompt, ASSUMPTIONs marked):
//  - Web / lead-ad leads that are routed and disclosed but have no live booking: +2 h, +24 h, +72 h after
//    first_message_at, then close as unbooked (stage unbooked_closed).
//  - CTWA stall nudges have ONE owner: W03 (automation/ctwa/w03.js STALL_HOURS, consent question only before consent).
//    A CTWA lead has no broker_id until W01 core routes it after qualification, so W08 stops on every lead without
//    broker_id (reason ctwa_pre_routing_w03 / not_disclosed). The ctwa_stall offsets below only apply to a routed
//    CTWA lead whose conv_state is still a qualifying state (defensive; never overlaps W03).
//  - +24 h carries the intro video (unbooked_nudge_24h); no approved video -> unbooked_nudge_24h_text (bio_short).
//  - Template-only outside the 24-h customer-service window. Inside it the same words go as a session
//    interactive message (no template fee), with the same two buttons.
//  - Stops at once on: live booking, opted out, suppressed, handoff, "No thanks", closed stage.
//  - Contact hours (smoke test #13, 21 Oct 2026; was an ASSUMPTION of quiet hours 20:00-08:00 every day): nudges are direct
//    marketing, so they follow the CPA s12 / Reg 4 hours in lib/contact-hours.mjs: Mon-Fri 08:00-20:00, Sat 09:00-13:00,
//    never Sunday or a public holiday (data/za-public-holidays.json). A nudge due outside them moves to the next allowed
//    time, at least MIN_NUDGE_GAP after the previous nudge (CTWA: never past the 72-h window, so a stall nudge pushed past
//    it is skipped and the last Start here nudge goes at the latest allowed moment inside it).
//  - ASSUMPTION: close = 24 h after the last nudge (so a tap on the last nudge still books).
//  - Idempotency: lead_activities.idempotency_key = w08:{lead_id}:{touch}; INSERT ... ON CONFLICT DO NOTHING
//    RETURNING id, and only a returned row is sent. A scheduler that fires twice sends once.
//  - START track (19 Oct 2026, Jono: nobody nudged a lead who never taps Start here or leaves the page): a lead whose
//    Start here card went out (W03 consent -> conv_state.state 'start_page', or W39 v4 marked conv_state.via 'start_page')
//    and who has no live booking and no W06 first touch. W08 owns these nudges (W03's stall_due_at is written but never
//    read; if it is ever wired it must skip state 'start_page'). Clock = leads.created_at (the consent insert, seconds
//    before the card). +2 h, +24 h, then a last one at +72 h (+68 h for a click-to-WhatsApp lead, so every nudge stays
//    inside Meta's 72-h free entry window), close 24 h after the last. Each carries its banner card and a fresh
//    /start/#lt=<token> button: welcome, then video (Mark's hello), then adviser. Covers "never opened the page" and
//    "opened it and left without booking" alike (routing on the page writes broker_id but books nothing).
import { LINES } from '../../conversation/lines.mjs';
import { inMarketingHours, nextMarketingTime, latestMarketingTimeBefore } from './contact-hours.mjs';
export const H = 3600_000;
export const OFFSETS = {
  unbooked: [{ touch: 'unbooked_nudge_2h', after: 2 * H }, { touch: 'unbooked_nudge_24h', after: 24 * H }, { touch: 'unbooked_nudge_72h', after: 72 * H }],
  ctwa_stall: [{ touch: 'unbooked_nudge_2h', after: 1 * H }, { touch: 'unbooked_nudge_24h', after: 20 * H }, { touch: 'unbooked_nudge_72h', after: 68 * H }],
  start: [{ touch: 'start_nudge_2h', after: 2 * H }, { touch: 'start_nudge_24h', after: 24 * H }, { touch: 'start_nudge_final', after: 72 * H }],
  start_ctwa: [{ touch: 'start_nudge_2h', after: 2 * H }, { touch: 'start_nudge_24h', after: 24 * H }, { touch: 'start_nudge_final', after: 68 * H }]
};
export const START_LINK = 'https://sortmycover.co.za/start/#lt=';
export const HEADER_BASE = 'https://n8n.sortmycover.co.za/media/whatsapp/headers/';
/** touch -> banner card (checklist/whatsapp-kit/profile/headers). */
export const START_BANNER = { start_nudge_2h: 'welcome', start_nudge_24h: 'video', start_nudge_final: 'adviser' };
const TOKEN_SAFE = /^lt1\.[A-Za-z0-9._-]{10,400}$/;
/** Start here went out and nothing is booked yet; a lead W06 already introduced (first_message_at) keeps the classic track. */
export function isStartPending(lead) {
  const cs = lead.conv_state || {};
  return !lead.first_message_at && (cs.state === 'start_page' || (cs.via === 'start_page' && !['handoff', 'closed_unbooked', 'closed_oob'].includes(cs.state)));
}
export const CLOSE_AFTER_LAST = 24 * H;
export const CTWA_WINDOW = 72 * H;
/** Two nudges that both move to the same opening (a weekend, a holiday) go at least this far apart, never together. */
export const MIN_NUDGE_GAP = 6 * H;
/** A restarted (post-cancel) nudge goes out before W10's C1A decision at cancelled_at + 96 h (lib/w10.mjs C1A_SEQUENCE_MS), with 2 h to spare. */
export const RESTART_LAST_BEFORE = 94 * H;
export const MAX_LEAD_MESSAGES = 12; // 4.6 cost design
const STALL_STATES = new Set(['consent_pending', 'q_age', 'q_bond', 'q_dependants', 'q_budget', 'q_budget_clarify']);
const CLOSED = new Set(['unbooked_closed', 'opted_out', 'disqualified', 'booked', 'confirmed', 'attended', 'no_show', 'dispositioned', 'replacement_due']);

export function track(lead) {
  if (isStartPending(lead)) return lead.origin === 'ctwa' ? 'start_ctwa' : 'start';
  const state = lead.conv_state?.state;
  return lead.origin === 'ctwa' && STALL_STATES.has(state) ? 'ctwa_stall' : 'unbooked';
}

/** Shift a time into the contact hours (lib/contact-hours.mjs): t itself when allowed, else the next opening. */
export const outOfQuiet = (t) => nextMarketingTime(t);

/** The latest moment at or before t inside the contact hours (19:30 on a weekday, 12:30 on a Saturday, when t is outside). */
export const latestDaytimeBefore = (t) => latestMarketingTimeBefore(t);

/** The plan for one lead: [{touch, due_ms}] + close_ms. Pure. */
export function nurturePlan(lead) {
  // I-39c: a cancelled booking restarts the full +2/+24/+72 h sequence from appointments.cancelled_at (C1A); W10's
  // hourly sweep decides at 96 h, so a restarted sequence never closes here.
  const restart = restartFrom(lead);
  const tr = restart ? 'unbooked' : track(lead);
  const t0 = restart ?? Date.parse(tr.startsWith('start') ? (lead.start_sent_at || lead.created_at) : lead.first_message_at);
  const steps = [];
  for (const s of OFFSETS[tr]) {
    const prev = steps.length ? steps[steps.length - 1].due_ms : null;
    let due = outOfQuiet(t0 + s.after);
    if (prev !== null && due < prev + MIN_NUDGE_GAP) due = outOfQuiet(prev + MIN_NUDGE_GAP);
    if (tr === 'ctwa_stall' && due >= t0 + CTWA_WINDOW) continue; // never spend outside the free entry window on a stall nudge
    if (restart !== null && due >= restart + RESTART_LAST_BEFORE) {
      // review 21 Oct: the contact hours pushed it past W10's 96 h C1A decision (e.g. a Wednesday-afternoon cancel's +72 h is
      // Saturday afternoon -> Monday): send at the latest contact-hours moment before it instead, if still after the last
      const back = latestDaytimeBefore(restart + RESTART_LAST_BEFORE);
      if (back > (prev !== null ? prev + MIN_NUDGE_GAP : t0)) steps.push({ touch: s.touch, due_ms: back });
      continue;
    }
    if (tr === 'start_ctwa' && due >= t0 + CTWA_WINDOW) {
      // quiet hours pushed it past the free window: send at the latest daytime moment inside it instead (if still after the last)
      const back = latestDaytimeBefore(t0 + CTWA_WINDOW - 30 * 60_000);
      if (back > (prev !== null ? prev + MIN_NUDGE_GAP : t0)) steps.push({ touch: s.touch, due_ms: back });
      continue;
    }
    steps.push({ touch: s.touch, due_ms: due });
  }
  const last = steps.length ? steps[steps.length - 1].due_ms : t0;
  return { track: tr, steps, close_ms: last + CLOSE_AFTER_LAST, restart_ms: restart };
}
/** cancelled_at of the latest cancelled booking, when it is after first contact (else null). */
export function restartFrom(lead) {
  const c = Date.parse(lead.cancelled_at || '');
  const f = Date.parse(lead.first_message_at || '');
  return Number.isFinite(c) && (!Number.isFinite(f) || c > f) ? c : null;
}

/** Why a lead must not be nudged (null = OK). */
export function stopReason(lead, ctx = {}) {
  if (lead.opted_out_at) return 'opted_out';
  if (ctx.suppressed) return 'suppressed';
  if (ctx.has_live_booking) return 'booked';
  // I-39c: stage may still read booked/confirmed after a cancellation; the live-booking check above covers a rebook
  if (lead.stage && CLOSED.has(lead.stage) && !(restartFrom(lead) && ['booked', 'confirmed'].includes(lead.stage))) return `stage_${lead.stage}`;
  if (lead.conv_state?.declined_call) return 'declined_call';
  if (lead.conv_state?.state === 'handoff') return 'handoff';
  if (lead.conv_state?.declined_nurture) return 'no_thanks';
  if (isStartPending(lead) && !restartFrom(lead)) {
    if (!Number.isFinite(Date.parse(lead.start_sent_at || lead.created_at))) return 'no_start_time';
    if ((ctx.outbound_count || 0) >= MAX_LEAD_MESSAGES) return 'message_cap';
    return null;
  }
  if (!lead.broker_id && lead.origin === 'ctwa') return 'ctwa_pre_routing_w03'; // W03 owns pre-routing stall nudges
  if (!lead.first_message_at || !lead.broker_id) return 'not_disclosed';
  if ((ctx.outbound_count || 0) >= MAX_LEAD_MESSAGES) return 'message_cap';
  return null;
}

/**
 * due(lead, ctx, now_ms) -> { action: 'send'|'close'|'wait'|'stop', touch?, channel?, template?, vars?, idempotency_key?, reason? }
 * ctx = { has_live_booking, suppressed, sent: Set(touch), last_inbound_ms, broker: {contact_person, intro_video_url, bio_short}, outbound_count }
 */
export function due(lead, ctx, now_ms) {
  const why = stopReason(lead, ctx);
  if (why) return { action: 'stop', reason: why };
  const p = nurturePlan(lead);
  const next = p.steps.find((s) => !(ctx.sent || new Set()).has(s.touch));
  const cyc = p.restart_ms ? `:r${p.restart_ms}` : ''; // new idempotency keys for the restarted sequence
  if (!next) {
    if (p.restart_ms) return { action: 'stop', reason: 'post_cancel_sequence_done_w10_sweep_decides' };
    return now_ms >= p.close_ms ? { action: 'close', reason: 'sequence finished', idempotency_key: `w08:${lead.id}:close` } : { action: 'wait' };
  }
  if (now_ms < next.due_ms) return { action: 'wait', touch: next.touch, due_ms: next.due_ms };
  if (!inMarketingHours(now_ms)) return { action: 'wait', reason: 'contact hours', due_ms: outOfQuiet(now_ms) };
  return { action: 'send', touch: next.touch, ...message(lead, ctx, next.touch, now_ms), idempotency_key: `w08:${lead.id}:${next.touch}${cyc}`, restart: Boolean(p.restart_ms) };
}

const firstName = (l) => (l.first_name || '').trim() || 'there';
const adviserFirst = (b) => String(b.contact_person || '').split(' ')[0];
export function message(lead, ctx, touch, now_ms) {
  if (START_BANNER[touch]) return startMessage(lead, ctx, touch, now_ms);
  const b = ctx.broker || {};
  const lang = lead.language === 'af' ? 'af' : 'en';
  const video = (b.intro_video_url && (b.intro_video_url[lang] || b.intro_video_url.en)) || null;
  let template = touch;
  let vars = [firstName(lead), adviserFirst(b)];
  let header = null;
  if (touch === 'unbooked_nudge_24h') {
    if (video) header = { type: 'video', link: video };
    else { template = 'unbooked_nudge_24h_text'; vars = [firstName(lead), String(b.bio_short || '').replace(/\s+/g, ' ').trim()]; header = { type: 'text', params: [adviserFirst(b)] }; }
  }
  const window = Number.isFinite(ctx.last_inbound_ms) && now_ms - ctx.last_inbound_ms < 24 * H;
  const buttons = touch === 'unbooked_nudge_72h' ? [['see_open_times', 'See open times'], ['no_thanks', 'No thanks']] : [['see_open_times', 'See open times'], ['not_now', 'Not now']];
  // templates are approved in English only; inside the window the session words follow the lead's language (#11)
  return { channel: window ? 'session' : 'template', template, template_lang: 'en', lang, vars, header, buttons, payload_suffix: `:${lead.id}`, ...(window ? { session: sessionWords(template, vars, lang) } : {}) };
}

// ---------- Start here nudges (templates start_nudge_2h / _24h / _final; session = the smc_start_cta card) ----------
const START_EN = {
  start_nudge_2h: (v) => `Hi ${v[0]}, your 30-minute call with ${v[1]} is one tap away. Pick a time that suits you, by Microsoft Teams or phone. It takes about a minute.`,
  start_nudge_24h: (v) => `Hi ${v[0]}, ${v[1]} still has open times this week for your 30-minute call. There's no obligation to buy anything, and any next step is your choice. Tap below to pick a time.`,
  start_nudge_final: (v) => `Hi ${v[0]}, this is our last message about your call with ${v[1]}. If you'd still like to talk it through, tap below to pick a time. If not, no problem, we won't message again.`
};
// 20 Oct 2026 (Jono's final rule: only the W03 consent says "Reply STOP to opt out."): no STOP line, in session and in the
// *_v2 templates. The 19 Oct start_nudge_* Content keeps it as submitted (templates/twilio/build-content.mjs START_NUDGE_V1_TAIL).
export const startWords = (touch, vars) => (START_EN[touch] ? START_EN[touch](vars) : '');
/**
 * One Start here nudge. channel 'session' inside the 24-h window (a cta_url card: welcome banner, "Start here" URL button,
 * which lib/wa-provider.mjs maps to the smc_start_cta Content under Twilio), else the start_nudge_* template: banner image
 * header, body {{1}} first name {{2}} adviser, URL button "Pick a time" -> /start/#lt={{3}}, quick reply {{4}}
 * (Not now; No thanks on the last). The template name is the base key; under Twilio lib/wa-provider.mjs START_NUDGE_KEYS
 * sends the *_v2 Content once its SID is set. needs_token: W08.json mints a fresh lt1 lead token at send time (startPayload).
 */
export function startMessage(lead, ctx, touch, now_ms) {
  const b = ctx.broker || {};
  const vars = [firstName(lead), adviserFirst(b) || 'an adviser'];
  const window = Number.isFinite(ctx.last_inbound_ms) && now_ms - ctx.last_inbound_ms < 24 * H;
  const reply = touch === 'start_nudge_final' ? ['no_thanks', 'No thanks'] : ['not_now', 'Not now'];
  return { kind: 'start', channel: window ? 'session' : 'template', template: touch, template_lang: 'en', lang: 'en', vars,
    header: { type: 'image', link: HEADER_BASE + 'header-' + START_BANNER[touch] + '.png' }, banner: START_BANNER[touch],
    buttons: [reply], payload_suffix: `:${lead.id}`, needs_token: true, session: { body: startWords(touch, vars), lang: 'en' } };
}
/** Cloud API body for a start nudge, given the minted token. null on a bad token or no phone (W08 then skips the send). */
export function startPayload(d, token) {
  if (!token || !TOKEN_SAFE.test(String(token))) return null;
  const to = String(d.phone || '').replace(/\D/g, '');
  if (!to) return null;
  if (d.channel === 'session') {
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive: { type: 'cta_url', header: { type: 'image', image: { link: HEADER_BASE + 'header-welcome.png' } },
      body: { text: d.session.body.slice(0, 1024) }, action: { name: 'cta_url', parameters: { display_text: 'Start here', url: START_LINK + token } } } };
  }
  const id = d.buttons[0][0];
  const components = [
    { type: 'header', parameters: [{ type: 'image', image: { link: d.header.link } }] },
    { type: 'body', parameters: d.vars.map((text) => ({ type: 'text', text: String(text).replace(/\s+/g, ' ').trim().slice(0, 60) })) },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(token) }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: id + d.payload_suffix }] }];
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: d.template, language: { code: 'en' }, components } };
}

/** Tap handlers (routed here by W07). */
export function onTap(lead, payload) {
  const key = String(payload || '').split(':')[0];
  // "No thanks" to further messages = a POPIA s11(3)/s69 objection: close AND suppress the number hash in the same
  // statement (W08.json "Save tap result"), exactly like W03's consent-stage No thanks (review 4 §1 #28).
  if (key === 'no_thanks') return { stage: 'unbooked_closed', conv_state: { ...(lead.conv_state || {}), declined_nurture: true, state: 'closed_unbooked' }, reply_line: 'CLOSE_UNBOOKED', suppress: { source: 'objection', note: 'no_thanks_nurture' } };
  if (key === 'not_now') return { stage: lead.stage, conv_state: lead.conv_state || {}, reply_line: null }; // keep the plan; no reply (no nagging)
  return null;
}

// ---------- session words (inside the 24-h window): identical to the approved template body (w07-alignment #9, #11) ----------
// English = the approved template body word for word (reworded templates: K-6 "no obligation" on +2 h, w07-alignment #10 on +72 h).
const SESSION_EN = {
  unbooked_nudge_2h: (v) => `Hi ${v[0]}, following up on your insurance and financial planning enquiry. A call with ${v[1]} takes about 30 minutes, and there's no obligation to buy anything. Tap below to see open times.`,
  unbooked_nudge_24h: (v) => `Hi ${v[0]}, here is ${v[1]} in about 25 seconds, so you know who you would be speaking to about your enquiry. Tap below to see open times.`,
  unbooked_nudge_24h_text: (v) => `Hi ${v[0]}, a little about the adviser for your enquiry: ${v[1]} Tap below to see open times.`,
  unbooked_nudge_72h: (v) => `Hi ${v[0]}, this is our last message about your insurance and financial planning enquiry. On the call, ${v[1]} goes through where you are now, and any next step is your choice. Tap below to pick a time, or if not, no problem, we won't message again.`
};
// Afrikaans: taken from conversation/lines.mjs when conversation-designer adds the keys (NUDGE_2H, NUDGE_24H, NUDGE_24H_TEXT,
// NUDGE_72H with {first_name} / {adviser_first} / {bio_short}); until then an Afrikaans lead gets the approved English words.
const AF_KEY = { unbooked_nudge_2h: 'NUDGE_2H', unbooked_nudge_24h: 'NUDGE_24H', unbooked_nudge_24h_text: 'NUDGE_24H_TEXT', unbooked_nudge_72h: 'NUDGE_72H' };
export function sessionWords(template, vars, lang = 'en') {
  const af = lang === 'af' && LINES.af && LINES.af[AF_KEY[template]];
  const fillv = (l) => String(l).replace(/\{(first_name|adviser_first|bio_short)\}/g, (m, k) => (k === 'first_name' ? vars[0] : vars[1]));
  const body = af ? fillv(af) : (SESSION_EN[template] ? SESSION_EN[template](vars) : '');
  const used = af ? 'af' : 'en';
  return { body: body ? body + ' ' + LINES[used].STOP_HINT : '', lang: used };
}
