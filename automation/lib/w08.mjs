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
//  - ASSUMPTION: quiet hours 20:00-08:00 SAST - a nudge due then waits to 08:00 (CTWA: never past the 72-h window,
//    so a CTWA nudge that would be pushed past it is skipped).
//  - ASSUMPTION: close = 24 h after the last nudge (so a tap on the last nudge still books).
//  - Idempotency: lead_activities.idempotency_key = w08:{lead_id}:{touch}; INSERT ... ON CONFLICT DO NOTHING
//    RETURNING id, and only a returned row is sent. A scheduler that fires twice sends once.
import { LINES } from '../../conversation/lines.mjs';
export const H = 3600_000;
const SAST = 2 * H;
export const OFFSETS = {
  unbooked: [{ touch: 'unbooked_nudge_2h', after: 2 * H }, { touch: 'unbooked_nudge_24h', after: 24 * H }, { touch: 'unbooked_nudge_72h', after: 72 * H }],
  ctwa_stall: [{ touch: 'unbooked_nudge_2h', after: 1 * H }, { touch: 'unbooked_nudge_24h', after: 20 * H }, { touch: 'unbooked_nudge_72h', after: 68 * H }]
};
export const CLOSE_AFTER_LAST = 24 * H;
export const CTWA_WINDOW = 72 * H;
export const QUIET = { from: 20, to: 8 };
export const MAX_LEAD_MESSAGES = 12; // 4.6 cost design
const STALL_STATES = new Set(['consent_pending', 'q_age', 'q_bond', 'q_dependants', 'q_budget', 'q_budget_clarify']);
const CLOSED = new Set(['unbooked_closed', 'opted_out', 'disqualified', 'booked', 'confirmed', 'attended', 'no_show', 'dispositioned', 'replacement_due']);

export function track(lead) {
  const state = lead.conv_state?.state;
  return lead.origin === 'ctwa' && STALL_STATES.has(state) ? 'ctwa_stall' : 'unbooked';
}

/** Shift a time out of quiet hours to 08:00 SAST. */
export function outOfQuiet(t) {
  const d = new Date(t + SAST);
  const h = d.getUTCHours();
  if (h >= QUIET.to && h < QUIET.from) return t;
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (h >= QUIET.from ? 1 : 0), QUIET.to, 0) - SAST;
  return base;
}

/** The plan for one lead: [{touch, due_ms}] + close_ms. Pure. */
export function nurturePlan(lead) {
  const t0 = Date.parse(lead.first_message_at);
  const tr = track(lead);
  const steps = [];
  for (const s of OFFSETS[tr]) {
    const due = outOfQuiet(t0 + s.after);
    if (tr === 'ctwa_stall' && due >= t0 + CTWA_WINDOW) continue; // never spend outside the free entry window on a stall nudge
    steps.push({ touch: s.touch, due_ms: due });
  }
  const last = steps.length ? steps[steps.length - 1].due_ms : t0;
  return { track: tr, steps, close_ms: last + CLOSE_AFTER_LAST };
}

/** Why a lead must not be nudged (null = OK). */
export function stopReason(lead, ctx = {}) {
  if (lead.opted_out_at) return 'opted_out';
  if (ctx.suppressed) return 'suppressed';
  if (ctx.has_live_booking) return 'booked';
  if (lead.stage && CLOSED.has(lead.stage)) return `stage_${lead.stage}`;
  if (lead.conv_state?.state === 'handoff') return 'handoff';
  if (lead.conv_state?.declined_nurture) return 'no_thanks';
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
  if (!next) return now_ms >= p.close_ms ? { action: 'close', reason: 'sequence finished', idempotency_key: `w08:${lead.id}:close` } : { action: 'wait' };
  if (now_ms < next.due_ms) return { action: 'wait', touch: next.touch, due_ms: next.due_ms };
  if (new Date(now_ms + SAST).getUTCHours() >= QUIET.from || new Date(now_ms + SAST).getUTCHours() < QUIET.to) return { action: 'wait', reason: 'quiet hours' };
  return { action: 'send', touch: next.touch, ...message(lead, ctx, next.touch, now_ms), idempotency_key: `w08:${lead.id}:${next.touch}` };
}

const firstName = (l) => (l.first_name || '').trim() || 'there';
const adviserFirst = (b) => String(b.contact_person || '').split(' ')[0];
export function message(lead, ctx, touch, now_ms) {
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
// English = the approved template text, unchanged until meta-operator resubmits (K-6 "no obligation" wording is theirs).
const SESSION_EN = {
  unbooked_nudge_2h: (v) => `Hi ${v[0]}, following up on your life cover enquiry. A call with ${v[1]} takes about 30 minutes, and there is nothing to buy on the call. Tap below to see open times.`,
  unbooked_nudge_24h: (v) => `Hi ${v[0]}, here is ${v[1]} in about 25 seconds, so you know who you would be speaking to about your enquiry. Tap below to see open times.`,
  unbooked_nudge_24h_text: (v) => `Hi ${v[0]}, a little about the adviser for your enquiry: ${v[1]} Tap below to see open times.`,
  unbooked_nudge_72h: (v) => `Hi ${v[0]}, this is our last message about your life cover enquiry. If you would still like a 30-minute call with ${v[1]}, tap below to pick a time. If not, no problem, we will not message again.`
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
