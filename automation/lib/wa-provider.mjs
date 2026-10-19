// WhatsApp provider switch: WHATSAPP_PROVIDER = meta (default) | twilio. Pure functions, no I/O.
// Outbound: toTwilioRequest() maps the Meta-shaped payload that sub-whatsapp-send decide() builds (or that a caller
// hands over prebuilt) onto Twilio's Messages API form. Inbound: normaliseTwilioInbound() maps Twilio's form payload
// onto the EXACT msg shape of lib/w07.mjs normaliseInbound() (and statuses onto the W07 status item), so W07 routes it
// unchanged.
//
// Verified against Twilio's docs on 2026-10-11 (links in automation/SETUP-TWILIO.md "Sources"):
//  - Content API: one numbered variable namespace per Content resource ({{1}}..{{n}}), ContentSid + ContentVariables
//    (JSON string) on POST /Messages, no Body/MediaUrl next to a ContentSid.
//  - twilio/quick-reply (session: max 3 buttons, variables allowed in title and id), twilio/list-picker (session only,
//    1-10 items, variables in id/item/description, description required), twilio/card (WhatsApp: text in `title`, media
//    with a static domain + variable path, QUICK_REPLY ids come back as ButtonPayload), whatsapp/flows (flow_id fixed,
//    flow_token MUST be a variable, flow_first_page_id, is_flow_first_page_endpoint). Flows and cards with several
//    buttons always need WhatsApp approval through Twilio's ApprovalRequests.
//  - Inbound: From/To whatsapp:+E164, Body, MessageSid, WaId, ProfileName, ButtonPayload/ButtonText (quick replies AND,
//    per Twilio, list selections may arrive here), ListId/ListTitle (UNCONFIRMED: kept when present), NumMedia +
//    MediaUrl0/MediaContentType0, Referral* (Click-to-WhatsApp: ReferralCtwaClid, ReferralSourceId/Url/Type, ...),
//    a completed Flow as InteractiveData {"flowResponse":{...}} and FlowData (raw JSON string), never in Body.
//  - Status callback: MessageSid, MessageStatus (queued/sending/sent/delivered/read/undelivered/failed), ErrorCode,
//    EventType=READ on a read receipt.
//  - Media download: HTTP Basic auth with an API key (SID:secret) or AccountSid:AuthToken.
// Still UNCONFIRMED (to check on the live sender, SETUP-TWILIO.md step 9): ListId on a list-picker reply, and whether
// an approved twilio/card accepts a variable QUICK_REPLY id (Meta allows a send-time payload, so we rely on it).
import { cleanParam } from './wa.mjs';
import banners from './wa-banner.cjs';

// Banners (19 Oct 2026, lib/wa-banner.cjs): header cards, the session banner plan, WA_SESSION_BANNERS.
export const { HEADER_BASE, HEADERS, headerUrl, bannersOn, bannerFor, sessionBanner } = banners;

export const providerOf = (env = {}) => (String(env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase() === 'twilio' ? 'twilio' : 'meta');
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
export const waAddr = (v) => `whatsapp:+${digits(v)}`;
export const DEFAULT_MEDIA_BASE = 'https://media.sortmycover.co.za';
/** Static host every Content template media variable sits under (Twilio: "the domain must be static"). */
export const mediaBase = (env = {}) => String(env.TWILIO_MEDIA_BASE_URL || env.INTRO_PUBLIC_BASE || DEFAULT_MEDIA_BASE).replace(/\/+$/, '');

/** TWILIO_CONTENT_SIDS = JSON { "<template name | content key>": "HX..." } (tolerates bad JSON -> {}). */
export function contentSids(env = {}) {
  try { const o = JSON.parse(env.TWILIO_CONTENT_SIDS || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
}

// ------------------------------------------------------------------ the one variable plan (generator AND sender)
/** A button's default payload when the caller sent none: Meta falls back to the button text; we send the same slug. */
export const defaultPayload = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tap';
const varCount = (s) => new Set([...String(s || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

/**
 * The Twilio variable slots of a Meta template spec (automation/templates/<name>.json), in Twilio's single numbering:
 * body {{1}}..{{B}}, then the header (text variables, or ONE media path), then every dynamic button in index order
 * (quick reply -> its id, URL with {{1}} -> the suffix, FLOW -> the flow_token). Both the Content definition generator
 * (templates/twilio/build-content.mjs) and toTwilioRequest() use this, so the numbers can never drift apart.
 */
export function twilioVarPlan(spec = {}) {
  const comps = spec.components || [];
  const body = comps.find((c) => c.type === 'BODY') || {};
  const head = comps.find((c) => c.type === 'HEADER');
  const btns = (comps.find((c) => c.type === 'BUTTONS') || {}).buttons || [];
  const slots = [];
  for (let i = 0; i < varCount(body.text); i++) slots.push({ kind: 'body', i });
  if (head && head.banner) { /* static banner image (TEMPLATE_VARIANTS): no variable */ }
  else if (head && head.format === 'TEXT') for (let i = 0; i < varCount(head.text); i++) slots.push({ kind: 'header_text', i });
  else if (head && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(head.format)) slots.push({ kind: 'header_media', format: head.format });
  btns.forEach((b, index) => {
    // src = the button's index in the SUBMITTED (v1) template: the caller's payload is always v1-shaped; a variant that
    // keeps only some buttons (booking_confirmed_v3) still reads each value from the v1 position.
    const src = b.src_index === undefined ? index : b.src_index; // null: the value comes from a variant's derive()
    if (b.type === 'QUICK_REPLY') slots.push({ kind: 'button', type: 'quick_reply', index, src, text: b.text });
    else if (b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || '')) slots.push({ kind: 'button', type: 'url', index, src, text: b.text });
    else if (b.type === 'FLOW') slots.push({ kind: 'button', type: 'flow', index, src, text: b.text });
  });
  return slots.map((s, k) => ({ ...s, n: k + 1 }));
}

// ------------------------------------------------------------------ banner variants of the lead-facing templates
// Jono, 19 Oct 2026: every lead-facing template carries an image banner saying what it is for. A variant is a separate
// Twilio Content resource (own approval) generated by templates/twilio/build-content.mjs from the v1 spec: the SAME body,
// variables, buttons and category, the text header (if any) replaced by the static banner image, nothing else, unless
// the row says so (the *_v3 method variants: own body text, the join link as a URL button, Reschedule only; derive()
// maps the v1 values onto them and decides whether the variant fits this message).
// The sender uses a variant ONLY when its key has a SID in TWILIO_CONTENT_SIDS (first listed wins), so nothing changes
// before approval: add "<key>": "HX..." once the variant shows approved (GET content.twilio.com/v1/ContentAndApprovals).
// The caller's payload stays v1-shaped; the variant's own var plan (src = v1 button index) numbers the variables.
// Templates with their own media header (intro_media, unbooked_nudge_24h: the adviser's video; broker_intro_*: the
// adviser's intro card) and the Flow templates (*_v2, unpublished) get no variant.
export const MOVE_LINE = 'Life happens. If you ever need to move your call, just come back to this chat and ask to reschedule.';
const STOP = 'Reply STOP to opt out.';
const firstOf = (s) => String(s || '').trim().split(/\s+/)[0];
// the /j/<booking id> join redirect (lib/w05.mjs joinRedirect) inside a v1 method-detail variable
const JOIN_ID = /\/j\/([A-Za-z0-9_-]{6,64})$/;
const JOIN_URL = 'https://sortmycover.co.za/j/{{1}}';
export const TEMPLATE_VARIANTS = [
  // booking_confirmed, by the method the v1 {{5}} already carries (lib/w05.mjs confirmDetail). No "Add to calendar" (the
  // booking is already in their calendar from the email / .ics), no Confirm / Cancel: Reschedule only (+ Join on Teams).
  { key: 'booking_confirmed_teams_v3', base: 'booking_confirmed', header: 'booked',
    body: `Hi {{1}}, you are booked. *{{2}}* will meet you on *{{3}} at {{4}}* by Microsoft Teams. The invite is in your email, and you can join straight from the button below. ${MOVE_LINE} ${STOP}`,
    example: ['Lerato', 'Mark Smith', 'Tue 7 Oct', '10:00'],
    buttons: [{ type: 'URL', text: 'Join Teams call', url: JOIN_URL, example: ['https://sortmycover.co.za/j/bk_8f3a2c'], src_index: 0 }, 2],
    derive: (b) => (/^Microsoft Teams\b/.test(String(b[4] || '')) ? { body: b.slice(0, 4) } : null) },
  // phone: needs the number in v1 {{5}} as "phone call on 0XX XXX XXXX" (one-line change in lib/w05.mjs confirmDetail,
  // owned elsewhere). Until then {{5}} is "phone call", derive() returns null and the sender falls through to v2 / v1.
  { key: 'booking_confirmed_phone_v3', base: 'booking_confirmed', header: 'booked',
    body: `Hi {{1}}, you are booked. {{2}} will call you on {{3}} at *{{4}}* on *{{5}}*. ${MOVE_LINE} ${STOP}`,
    example: ['Lerato', 'Mark', '082 123 4567', '10:00', 'Tue 7 Oct'],
    buttons: [2],
    derive: (b) => { const m = /^phone call on (0\d{2} \d{3} \d{4})$/.exec(String(b[4] || '')); return m ? { body: [b[0], firstOf(b[1]), m[1], b[3], b[2]] } : null; } },
  { key: 'booking_confirmed_v2', base: 'booking_confirmed', header: 'booked', sid: 'HXff2e2c298cc23411336ccd907ca1f5f4' },
  { key: 'reminder_24h_v2', base: 'reminder_24h', header: 'reminder', sid: 'HX553796498a577ed87d7660bb79188da3' },
  // reminder_2h on Teams: the join link becomes a button (v1 {{4}} "Join on Teams: https://sortmycover.co.za/j/<id>")
  { key: 'reminder_2h_teams_v3', base: 'reminder_2h', header: 'reminder',
    body: `Hi {{1}}, {{2}} has set aside 30 minutes for you today at *{{3}}* on Microsoft Teams. You can join straight from the button below. If you can't make it, reply here or tap Reschedule. ${STOP}`,
    example: ['Lerato', 'Mark Smith', '10:00'],
    buttons: [{ type: 'URL', text: 'Join Teams call', url: JOIN_URL, example: ['https://sortmycover.co.za/j/bk_8f3a2c'], src_index: null }, 0],
    derive: (b) => { const s = String(b[3] || ''); const m = /^Join on Teams: https:\/\/\S+$/.test(s) && JOIN_ID.exec(s); return m ? { body: b.slice(0, 3), buttons: { 0: m[1] } } : null; } },
  { key: 'reminder_2h_v2', base: 'reminder_2h', header: 'reminder', sid: 'HXe739563b95a73b72770feeebc737e443' },
  { key: 'missed_you_v2', base: 'missed_you', header: 'reminder', sid: 'HX54d757e00cfd516eccbe8c70432bf706' },
  { key: 'qualify_budget_v2', base: 'qualify_budget', header: 'intent', sid: 'HXf52cd6d5e4631e1a3b51906d463f0178' },
  // reminder_10m online: v1 {{3}} "Join here: https://sortmycover.co.za/j/<id>" does not name the host, so the button
  // says "Join your call" (Teams, Zoom or Meet all redirect through /j/)
  { key: 'reminder_10m_online_v3', base: 'reminder_10m', header: 'reminder',
    body: `Hi {{1}}, your call with {{2}} starts in 10 minutes. You can join straight from the button below. ${STOP}`,
    example: ['Lerato', 'Mark Smith'],
    buttons: [{ type: 'URL', text: 'Join your call', url: JOIN_URL, example: ['https://sortmycover.co.za/j/bk_8f3a2c'], src_index: null }],
    derive: (b) => { const s = String(b[2] || ''); const m = /^Join here: https:\/\/\S+$/.test(s) && JOIN_ID.exec(s); return m ? { body: b.slice(0, 2), buttons: { 0: m[1] } } : null; } },
  { key: 'reminder_10m_v2', base: 'reminder_10m', header: 'reminder' },
  { key: 'prep_nudge_v2', base: 'prep_nudge', header: 'reminder' },
  // what_to_expect in the v4 form (Jono, 19 Oct 2026: lindi-flow-copy.md 5e, incl. the payslip tip, so prep_nudge is
  // covered too). Same W09 values (first, adviser, method label); derive() uses the adviser's first name twice. No
  // "Add to calendar" (the invite is already in their calendar, as booking_confirmed v3).
  { key: 'what_to_expect_v4', base: 'what_to_expect', header: 'expect',
    body: "Hi {{1}}, here's what to expect on your call with {{2}}:\n• About 30 minutes, by {{3}}.\n• {{4}} starts by telling you their firm, FSP number and how they are paid.\n• They ask about your household and explain how the different kinds of cover work.\n• Nothing is bought on the call. Any next step is your choice.\nIf you have a payslip or a current policy schedule nearby it helps, but it isn't needed. " + STOP,
    example: ['Lerato', 'Mark', 'Microsoft Teams', 'Mark'],
    buttons: [],
    derive: (b) => (b[0] && b[1] && b[2] ? { body: [b[0], firstOf(b[1]), b[2], firstOf(b[1])] } : null) },
  { key: 'what_to_expect_v2', base: 'what_to_expect', header: 'expect' },
  { key: 'reschedule_offer_v3', base: 'reschedule_offer', header: 'reschedule' }, // _v2 is the Flow template
  { key: 'intro_media_voice_v2', base: 'intro_media_voice', header: 'video' }, // "A voice note from {{1}}" text header -> banner
  { key: 'unbooked_nudge_2h_v2', base: 'unbooked_nudge_2h', header: 'adviser' },
  { key: 'unbooked_nudge_24h_text_v2', base: 'unbooked_nudge_24h_text', header: 'adviser' }, // "Meet {{1}}" text header -> banner
  { key: 'unbooked_nudge_72h_v2', base: 'unbooked_nudge_72h', header: 'adviser' },
  { key: 'reach_check_v2', base: 'reach_check', header: 'adviser' },
  { key: 'attended_thanks_v2', base: 'attended_thanks', header: 'adviser' },
  { key: 'invite_email_bounced_v2', base: 'invite_email_bounced', header: 'invite' },
  { key: 'booking_held_verify_email_v2', base: 'booking_held_verify_email', header: 'invite' },
  { key: 'booking_hold_released_v2', base: 'booking_hold_released', header: 'invite' },
  { key: 'booking_confirm_chat_v2', base: 'booking_confirm_chat', header: 'booked' },
  { key: 'lead_low_budget_held_v2', base: 'lead_low_budget_held', header: 'intent' },
  { key: 'lead_low_budget_closed_v2', base: 'lead_low_budget_closed', header: 'intent' },
];

/**
 * v1 spec + variant row -> the variant's spec: banner header, the body (v1's, or the row's own text + example), the
 * buttons (a number = that v1 button, src_index = its v1 position; an object = a new button, src_index null when its
 * value comes from derive()). Pure.
 */
export function variantSpec(spec = {}, v = {}) {
  const v1 = (spec.components || []);
  const v1Buttons = (v1.find((c) => c.type === 'BUTTONS') || {}).buttons || [];
  const comps = [{ type: 'HEADER', format: 'IMAGE', banner: headerUrl(v.header) }];
  for (const c of v1) {
    if (c.type === 'HEADER') continue;
    if (c.type === 'BODY' && v.body) comps.push({ type: 'BODY', text: v.body, example: { body_text: [v.example || []] } });
    else if (c.type === 'BUTTONS' && Array.isArray(v.buttons)) continue;
    else comps.push(c);
  }
  if (Array.isArray(v.buttons) && v.buttons.length) {
    comps.push({ type: 'BUTTONS', buttons: v.buttons.map((b) => (typeof b === 'number' ? { ...v1Buttons[b], src_index: b } : { ...b })) });
  }
  return { ...spec, name: v.key, components: comps };
}

/** Body parameter texts of a Meta template payload. */
const bodyValues = (tpl = {}) => (((tpl.components || []).find((c) => c.type === 'body') || {}).parameters || []).map((p) => (p && p.text != null ? String(p.text) : ''));

/**
 * The banner variant to send for template `name`, as { key, spec, derived }, else null. A variant is eligible when its
 * key has a SID and, for a method variant, derive() accepts the v1 values (first eligible row wins).
 */
export function templateVariant(name, sids = {}, spec = null, tpl = null) {
  if (!spec) return null;
  for (const v of TEMPLATE_VARIANTS) {
    if (v.base !== name || !sids[v.key]) continue;
    const derived = v.derive ? v.derive(bodyValues(tpl || {})) : null;
    if (v.derive && !derived) continue;
    return { key: v.key, spec: variantSpec(spec, v), derived };
  }
  return null;
}

/** Value of a header / button parameter of a Meta send payload. */
function paramValue(p = {}) {
  if (p.type === 'text') return p.text;
  if (p.type === 'payload') return p.payload;
  if (p.type === 'action') return p.action && p.action.flow_token;
  const m = p[p.type];
  return (m && (m.link || m.id)) || p.text || '';
}

/** Media link -> the variable path under the static media base, or { error }. */
export function mediaPath(link, env = {}) {
  const base = mediaBase(env);
  const s = String(link || '');
  if (!s) return { error: 'twilio_media_missing' };
  if (!s.startsWith(base + '/')) return { error: 'twilio_media_outside_base' };
  return { path: s.slice(base.length + 1) };
}

/**
 * Meta template payload -> { vars } in Twilio numbering, or { error }. With `spec` (the submitted Meta template) the
 * slots follow twilioVarPlan(spec) and a quick reply the caller left empty gets defaultPayload(button text), as Meta
 * would. Without a spec: body, header, buttons in payload order (the 2026-10-04 behaviour, kept for old callers).
 */
export function templateVariables(tpl = {}, env = {}, spec = null, derived = null) {
  const comps = tpl.components || [];
  const vars = {};
  if (!spec) {
    let k = 0;
    for (const ty of ['body', 'header', 'button']) for (const c of comps.filter((x) => x.type === ty)) for (const p of c.parameters || []) {
      let v = paramValue(p);
      if (ty === 'header' && p.type !== 'text') { const mp = mediaPath(v, env); if (mp.error) return { error: mp.error }; v = mp.path; }
      vars[String(++k)] = cleanParam(v);
    }
    return { vars };
  }
  const body = (comps.find((c) => c.type === 'body') || {}).parameters || [];
  const head = (comps.find((c) => c.type === 'header') || {}).parameters || [];
  const btn = (index) => comps.find((c) => c.type === 'button' && String(c.index) === String(index));
  for (const s of twilioVarPlan(spec)) {
    let v;
    if (s.kind === 'body') v = derived && derived.body ? derived.body[s.i] : paramValue(body[s.i]);
    else if (s.kind === 'button' && s.src === null) v = derived && derived.buttons ? derived.buttons[s.index] : undefined;
    else if (s.kind === 'header_text') v = paramValue(head[s.i]);
    else if (s.kind === 'header_media') { const mp = mediaPath(paramValue(head[0]), env); if (mp.error) return { error: mp.error }; v = mp.path; }
    else {
      const b = btn(s.src != null ? s.src : s.index);
      v = b && b.parameters && b.parameters[0] ? paramValue(b.parameters[0]) : undefined;
      if ((v === undefined || v === '') && s.type === 'quick_reply') v = defaultPayload(s.text);
      if ((v === undefined || v === '') && s.type !== 'quick_reply') return { error: `twilio_missing_${s.type}_variable` };
    }
    if (v === undefined) return { error: 'twilio_missing_variable' };
    vars[String(s.n)] = cleanParam(v);
  }
  return { vars };
}

// ------------------------------------------------------------------ session (24-h window) interactive -> generic Content
// The generic session templates live in automation/templates/twilio/ (smc_session_buttons_1..3, smc_session_list_1..10).
// They need no WhatsApp approval (Twilio: quick-reply and list-picker are session types) but must exist as Content
// resources, so their SIDs sit in TWILIO_CONTENT_SIDS like every other template.
export const SESSION_BUTTONS_KEY = (n) => `smc_session_buttons_${n}`;
export const SESSION_LIST_KEY = (n) => `smc_session_list_${n}`;
export const FLOW_KEY = (flowId) => `flow:${flowId}`;
const clip = (s, n) => cleanParam(String(s || '').slice(0, n));

// /start/ page link (18 Oct 2026): ONE session call-to-action (header image, body, one URL button) carrying a fresh lt1 lead
// token in the URL FRAGMENT (CONTRACTS.md lead_token: never a query or path). Twilio's Content API only substitutes a
// variable at the END of a URL and documents no encoding rule for '#', so the '#lt=' sits in the STATIC part of the
// Content URL and the variable is the token alone ([A-Za-z0-9._-], nothing to encode either way). Docs read 18 Oct 2026:
// https://www.twilio.com/docs/content/twilio-call-to-action, https://www.twilio.com/docs/content/twiliocard (an unapproved
// card in session: one URL button, static media). Meta's in-session interactive cta_url takes the whole URL (no template).
export const START_CTA_KEY = 'smc_start_cta';
export const START_PAGE_LINK = 'https://sortmycover.co.za/start/#lt=';
export const START_CTA_HEADER = headerUrl('welcome'); // Jono 19 Oct 2026 (was header-intent)
export const START_CTA_BUTTON = 'Start here';
const TOKEN_SAFE = /^[A-Za-z0-9._-]{1,256}$/;
/** Meta interactive cta_url (our /start/ link) -> { key, vars } for the smc_start_cta Content, or null (another URL / bad token). */
export function startCtaContent(i = {}) {
  const url = String((i.action && i.action.parameters && i.action.parameters.url) || '');
  // the reschedule card's link (#move=1&lt=) does not start with START_PAGE_LINK (#lt=), so the order of checks is safe
  const link = url.startsWith(START_PAGE_LINK) ? START_PAGE_LINK : url.startsWith(RESCHEDULE_LINK) ? RESCHEDULE_LINK : null;
  if (!link) return null;
  const token = url.slice(link.length);
  if (!TOKEN_SAFE.test(token)) return null;
  return { key: link === START_PAGE_LINK ? START_CTA_KEY : RESCHEDULE_CTA_KEY, vars: { 1: ((i.body && i.body.text) || '-').slice(0, 1024), 2: token } };
}

// ------------------------------------------------------------------ reschedule card (Jono, 19 Oct 2026)
// "Can I move my call?" (Lindi's reschedule intent, delegated to W10) or a Reschedule tap (reschedule:<booking_id> on
// booking_confirmed / a reminder) -> instead of W10's slot list, ONE card: header-reschedule banner, the current booking,
// "Pick a new time" -> sortmycover.co.za/start/#move=1&lt=<lt1 token> (the page's move flow, W39), "Keep my time"
// (keep_it:<booking_id>, W10's existing no-change path). Twilio substitutes a variable only at the END of a URL, so
// "move=1" sits BEFORE "lt=" in the static part of the fragment. Transport, in order:
//   twilio: template reschedule_card (approved twilio/card: banner + body + URL + quick reply) when its SID is set,
//           else session smc_reschedule_cta (unapproved session card: banner + body + ONE URL button, so no "Keep my
//           time": a session card cannot mix a URL and a quick reply without approval), else W10 as today;
//   meta:   session interactive cta_url (one URL button; Meta has no in-session URL + reply-button mix).
// It never degrades to a text Body (the token would sit in the message log). brands.start_page off, no lead token, no
// live booked / confirmed booking, or another W10 action -> W10 exactly as today. W07 sends it (patch-w07-reschedule-card.mjs).
export const RESCHEDULE_LINK = 'https://sortmycover.co.za/start/#move=1&lt=';
export const RESCHEDULE_CTA_KEY = 'smc_reschedule_cta';
export const RESCHEDULE_TEMPLATE = 'reschedule_card';
export const RESCHEDULE_BUTTON = 'Pick a new time';
export const KEEP_BUTTON = 'Keep my time';
const SAST_MS = 2 * 3600 * 1000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sast = (t) => new Date(Date.parse(t) + SAST_MS);
const firstWordOf = (s) => String(s || '').trim().split(/\s+/)[0].replace(/[^\p{L}' -]/gu, '').slice(0, 30);
/** The card text (copy fixed by Jono, 19 Oct 2026). No first name -> "No problem, life happens." */
export function rescheduleCardBody({ first = '', adviser = '', date = '', time = '' } = {}) {
  return `No problem${first ? `, ${first}` : ''}, life happens. Your call with ${adviser || 'your adviser'} is booked for ${date} at ${time}. Tap below to pick a new time. You can choose any open time in the next 14 days.`;
}
/** Is this W10-bound W07 item a reschedule request (not cancel / keep / a slot pick / method change)? */
export function isRescheduleRequest(item = {}) {
  const d = item.delegate;
  if (d && typeof d === 'object') return ['reschedule', 'reschedule_slots'].includes(d.action) || (Array.isArray(d.actions) && d.actions.length === 1 && ['reschedule', 'reschedule_slots'].includes(d.actions[0]));
  const p = String((item.msg && (item.msg.payload || item.msg.list_id)) || '');
  return /^reschedule(:|$)/.test(p);
}
/**
 * W07 item headed for W10 -> { send: <Cloud API body for smc-whatsapp-send>, via } or { skip: reason } (then W10 as today).
 * opts: { start_page (brands.start_page = 'on'), token (minted lt1 for the lead, or null), env }
 */
export function rescheduleCardPlan(item = {}, opts = {}) {
  const env = opts.env || {};
  if (!isRescheduleRequest(item)) return { skip: 'not_reschedule' };
  if (opts.start_page !== true) return { skip: 'start_page_off' };
  if (!opts.token || !TOKEN_SAFE.test(String(opts.token))) return { skip: 'no_lead_token' };
  const lead = item.lead || {}; const bk = item.booking || {};
  if (!lead.id || !lead.phone || !bk.id || !bk.appointment_date || !['booked', 'confirmed'].includes(bk.status) || !Number.isFinite(Date.parse(bk.appointment_date))) return { skip: 'no_live_booking' };
  const d = sast(bk.appointment_date);
  const v = { first: firstWordOf(lead.first_name), adviser: firstWordOf(item.adviser_first || (item.broker && item.broker.contact_person)), date: `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`, time: d.toISOString().slice(11, 16) };
  const to = String(lead.phone).replace(/\D/g, '');
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  const sids = contentSids(env);
  if (providerOf(env) === 'twilio' && sids[RESCHEDULE_TEMPLATE] && v.first) {
    // no spec file: the sender numbers body {{1}}-{{4}}, then the buttons in payload order ({{5}} URL token, {{6}} keep id)
    const components = [
      { type: 'body', parameters: [v.first, v.adviser || 'your adviser', v.date, v.time].map((text) => ({ type: 'text', text: cleanParam(text) })) },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(opts.token) }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `keep_it:${bk.id}` }] },
    ];
    return { via: 'template', send: { ...base, type: 'template', template: { name: RESCHEDULE_TEMPLATE, language: { code: 'en' }, components } } };
  }
  if (providerOf(env) === 'twilio' && !sids[RESCHEDULE_CTA_KEY]) return { skip: 'twilio_reschedule_content_missing' };
  return { via: 'session_cta', send: { ...base, type: 'interactive', interactive: { type: 'cta_url', header: { type: 'image', image: { link: headerUrl('reschedule') } },
    body: { text: rescheduleCardBody(v).slice(0, 1024) }, action: { name: 'cta_url', parameters: { display_text: RESCHEDULE_BUTTON, url: `${RESCHEDULE_LINK}${opts.token}` } } } } };
}

/** Interactive (buttons / list) rendered as plain text: Body + the option titles, for when no Content template exists. */
export function interactiveAsText(i = {}) {
  const body = (i.body && i.body.text) || '';
  let opts = [];
  if (i.type === 'button') opts = ((i.action && i.action.buttons) || []).map((b) => b.reply && b.reply.title);
  else if (i.type === 'list') opts = (((i.action && i.action.sections) || []).flatMap((s) => s.rows || [])).map((r) => r.title);
  opts = opts.filter(Boolean);
  return opts.length ? `${body}\n\nReply with: ${opts.join(' / ')}` : body;
}

/** Meta interactive -> { key, vars } for the generic session Content template, or null (unsupported shape). */
export function sessionInteractive(i = {}) {
  const head = i.header && i.header.type === 'text' && i.header.text ? `${i.header.text}\n\n` : '';
  const body = `${head}${(i.body && i.body.text) || ''}`.slice(0, 1024);
  if (i.type === 'button') {
    const b = ((i.action && i.action.buttons) || []).filter((x) => x && x.reply).slice(0, 3);
    if (!b.length) return null;
    const vars = { 1: body || '-' };
    b.forEach((x, k) => { vars[String(2 + 2 * k)] = clip(x.reply.title, 20); vars[String(3 + 2 * k)] = clip(x.reply.id, 200); });
    return { key: SESSION_BUTTONS_KEY(b.length), vars };
  }
  if (i.type === 'list') {
    const rows = (((i.action && i.action.sections) || []).flatMap((s) => s.rows || [])).filter(Boolean).slice(0, 10);
    if (!rows.length) return null;
    const vars = { 1: body || '-', 2: clip((i.action && i.action.button) || 'Options', 20) };
    rows.forEach((r, k) => {
      vars[String(3 + 3 * k)] = clip(r.id, 200);
      vars[String(4 + 3 * k)] = clip(r.title, 24);
      vars[String(5 + 3 * k)] = clip(r.description || r.title, 72); // Twilio: description is required on every item
    });
    return { key: SESSION_LIST_KEY(rows.length), vars };
  }
  if (i.type === 'flow') {
    const p = (i.action && i.action.parameters) || {};
    if (!p.flow_id || !p.flow_token) return null;
    return { key: FLOW_KEY(p.flow_id), vars: { 1: body || '-', 2: String(p.flow_token) } };
  }
  return null;
}

/**
 * Meta payload (from decide(), or prebuilt by a caller) -> Twilio Messages form fields, or { skip, reason }.
 *  text        -> Body
 *  media       -> MediaUrl (public link only; a Meta media `id` has no Twilio equivalent -> skip)
 *  template    -> ContentSid + ContentVariables (SID from TWILIO_CONTENT_SIDS[name]; none -> skip twilio_content_sid_missing)
 *  interactive -> ContentSid of the generic session template (buttons / list) or of the Flow (`flow:<flow_id>`);
 *                 an explicit `interactive.content_key` still wins; buttons / list without any SID -> text fallback;
 *                 cta_url (the /start/ link only) -> smc_start_cta with the token as {{2}}, never a text fallback.
 * opts: { statusCallback, spec (Meta template spec, for exact numbering), context: { content_key }, variables }
 */
export function toTwilioRequest(payload = {}, env = {}, opts = {}) {
  const from = env.TWILIO_WHATSAPP_FROM;
  if (!from) return { skip: true, reason: 'twilio_from_missing' };
  const base = { To: waAddr(payload.to), From: /^whatsapp:/.test(from) ? from : waAddr(from) };
  if (opts.statusCallback) base.StatusCallback = opts.statusCallback;
  const sids = contentSids(env);
  const t = payload.type;
  if (t === 'text') return { form: { ...base, Body: payload.text && payload.text.body } };
  if (['image', 'video', 'audio', 'document', 'sticker'].includes(t)) {
    const m = payload[t] || {};
    if (!m.link) return { skip: true, reason: 'twilio_media_needs_public_link' };
    return { form: { ...base, MediaUrl: m.link, ...(m.caption ? { Body: m.caption } : {}) } };
  }
  if (t === 'template') {
    const tpl = payload.template || {};
    // A banner variant (TEMPLATE_VARIANTS) wins when its own SID is configured; its own var plan numbers the variables.
    const v = opts.spec ? templateVariant(tpl.name, sids, opts.spec, tpl) : null;
    const sid = v ? sids[v.key] : sids[tpl.name];
    if (!sid) return { skip: true, reason: 'twilio_content_sid_missing' };
    const r = templateVariables(tpl, env, v ? v.spec : (opts.spec || null), v ? v.derived : null);
    if (r.error) return { skip: true, reason: r.error };
    return { form: { ...base, ContentSid: sid, ContentVariables: JSON.stringify(r.vars) }, ...(v ? { content_key: v.key } : {}) };
  }
  if (t === 'interactive') {
    const i = payload.interactive || {};
    const key = i.content_key || (opts.context && opts.context.content_key);
    if (key && sids[key]) return { form: { ...base, ContentSid: sids[key], ContentVariables: JSON.stringify(opts.variables || {}) }, via: 'content' };
    if (i.type === 'cta_url') {
      // never a text fallback: a Body with the link would put the lead token in Twilio's message log
      const cta = startCtaContent(i);
      if (!cta) return { skip: true, reason: 'twilio_cta_url_unsupported' };
      if (!sids[cta.key]) return { skip: true, reason: 'twilio_cta_content_missing' };
      return { form: { ...base, ContentSid: sids[cta.key], ContentVariables: JSON.stringify(cta.vars) }, via: 'session_content', content_key: cta.key };
    }
    const s = sessionInteractive(i);
    if (s && sids[s.key]) return { form: { ...base, ContentSid: sids[s.key], ContentVariables: JSON.stringify(s.vars) }, via: 'session_content', content_key: s.key };
    if (i.type === 'flow') return { skip: true, reason: 'twilio_flow_content_missing' }; // a Flow cannot degrade to text
    return { form: { ...base, Body: interactiveAsText(i) }, via: 'text_fallback' };
  }
  return { skip: true, reason: 'twilio_unsupported_type' };
}

/** Twilio Messages response -> { ok, external_id, error }. 201 { sid } on success; { code, message } on error. */
export function interpretTwilio(res = {}) {
  const body = res.body !== undefined ? res.body : res;
  const code = res.statusCode || res.status;
  if (body && body.sid && !(code && code >= 400)) return { ok: true, external_id: body.sid, error: null };
  return { ok: false, external_id: null, error: String((body && (body.message || body.code)) || res.error || 'send_failed').slice(0, 300) };
}

const STATUS = { queued: 'sent', accepted: 'sent', scheduled: 'sent', sending: 'sent', sent: 'sent', delivered: 'delivered', read: 'read', undelivered: 'failed', failed: 'failed', canceled: 'failed' };

/** InteractiveData / FlowData of a completed Flow -> the nfm_reply.response_json string W05 reads (Meta shape). */
export function flowResponseOf(p = {}) {
  if (p.FlowData) return String(p.FlowData);
  if (p.InteractiveData) {
    try { const d = typeof p.InteractiveData === 'string' ? JSON.parse(p.InteractiveData) : p.InteractiveData; if (d && d.flowResponse) return JSON.stringify(d.flowResponse); } catch (_) { /* not JSON: ignored */ }
  }
  return null;
}

/**
 * Twilio inbound form params -> [{ kind:'message', msg } | { kind:'status', ... }] in the shapes W07 consumes
 * ("Verify signature + normalise" outputs, minus valid/payload_hash which the node adds).
 */
export function normaliseTwilioInbound(p = {}, nowMs = Date.now()) {
  const sid = p.MessageSid || p.SmsMessageSid || p.SmsSid;
  if (p.MessageStatus && String(p.SmsStatus || '').toLowerCase() !== 'received') {
    const status = String(p.EventType || '').toUpperCase() === 'READ' ? 'read' : STATUS[String(p.MessageStatus).toLowerCase()];
    if (!status) return [];
    return [{ kind: 'status', wamid: sid, status, ts: Math.floor(nowMs / 1000), error: p.ErrorCode ? `${p.ErrorCode} ${p.ErrorMessage || ''}`.trim() : null }];
  }
  const nMedia = Number(p.NumMedia || 0);
  const msg = { wamid: sid, from: '+' + digits(p.From), at_ms: nowMs, type: 'text', text: '', payload: null, list_id: null, media: null, media_id: null,
    referral: null, phone_number_id: digits(p.To) || null, profile_name: p.ProfileName || null };
  const flow = flowResponseOf(p);
  if (flow) { msg.type = 'interactive'; msg.payload = 'flow_complete'; msg.flow_response = flow; }
  else if (p.ListId) { msg.type = 'interactive'; msg.list_id = p.ListId; msg.text = p.ListTitle || p.Body || ''; }
  else if (p.ButtonPayload != null && p.ButtonPayload !== '') {
    // Meta: a template quick-reply is type 'button' ({payload,text}); an in-session reply button is 'interactive'. Both land as payload+text.
    msg.type = 'button'; msg.payload = p.ButtonPayload; msg.text = p.ButtonText || p.Body || '';
    // A list-picker selection may also arrive as ButtonPayload (Twilio docs). Only the best-time rows exist solely in a
    // list, so they become list_id; a slot_ id routes to W05 from either field (booked_via is then 'chat', not 'list').
    if (/^best_/.test(String(p.ButtonPayload))) { msg.type = 'interactive'; msg.list_id = p.ButtonPayload; msg.payload = null; }
  } else if (nMedia > 0) {
    const ct = String(p.MediaContentType0 || '');
    msg.media = ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : 'document';
    msg.type = msg.media; msg.text = p.Body || '';
    msg.media_id = `twilio:${p.MediaUrl0}`; // downstream fetch: twilioMediaRequest()
  } else msg.text = p.Body || '';
  if (p.ReferralSourceId || p.ReferralSourceUrl || p.ReferralCtwaClid) {
    msg.referral = { source_id: p.ReferralSourceId, source_url: p.ReferralSourceUrl, source_type: p.ReferralSourceType, headline: p.ReferralHeadline, body: p.ReferralBody, ctwa_clid: p.ReferralCtwaClid };
    Object.keys(msg.referral).forEach((k) => msg.referral[k] === undefined && delete msg.referral[k]);
  }
  return [{ kind: 'message', msg }];
}

/** Basic auth for Twilio REST and media: API key (preferred) else AccountSid:AuthToken (the CRM's existing pair). */
export function twilioBasicAuth(env = {}) {
  const user = env.TWILIO_API_KEY_SID || env.TWILIO_ACCOUNT_SID;
  const pass = env.TWILIO_API_KEY_SID ? env.TWILIO_API_KEY_SECRET : env.TWILIO_AUTH_TOKEN;
  if (!user || !pass) return null;
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

/** Authenticated download of a Twilio media URL (taken from msg.media_id 'twilio:<url>'). Only api.twilio.com. */
export function twilioMediaRequest(mediaId, env = {}) {
  const url = String(mediaId || '').replace(/^twilio:/, '');
  if (!/^https:\/\/api\.twilio\.com\//.test(url)) return null;
  const auth = twilioBasicAuth(env);
  if (!auth) return null;
  return { method: 'GET', url, headers: { Authorization: auth } };
}
