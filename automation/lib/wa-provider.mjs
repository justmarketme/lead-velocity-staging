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
  if (head && head.format === 'TEXT') for (let i = 0; i < varCount(head.text); i++) slots.push({ kind: 'header_text', i });
  else if (head && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(head.format)) slots.push({ kind: 'header_media', format: head.format });
  btns.forEach((b, index) => {
    if (b.type === 'QUICK_REPLY') slots.push({ kind: 'button', type: 'quick_reply', index, text: b.text });
    else if (b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || '')) slots.push({ kind: 'button', type: 'url', index, text: b.text });
    else if (b.type === 'FLOW') slots.push({ kind: 'button', type: 'flow', index, text: b.text });
  });
  return slots.map((s, k) => ({ ...s, n: k + 1 }));
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
export function templateVariables(tpl = {}, env = {}, spec = null) {
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
    if (s.kind === 'body') v = paramValue(body[s.i]);
    else if (s.kind === 'header_text') v = paramValue(head[s.i]);
    else if (s.kind === 'header_media') { const mp = mediaPath(paramValue(head[0]), env); if (mp.error) return { error: mp.error }; v = mp.path; }
    else {
      const b = btn(s.index);
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
export const START_CTA_HEADER = 'https://n8n.sortmycover.co.za/media/whatsapp/headers/header-intent.png';
export const START_CTA_BUTTON = 'Start here';
const TOKEN_SAFE = /^[A-Za-z0-9._-]{1,256}$/;
/** Meta interactive cta_url (our /start/ link) -> { key, vars } for the smc_start_cta Content, or null (another URL / bad token). */
export function startCtaContent(i = {}) {
  const url = String((i.action && i.action.parameters && i.action.parameters.url) || '');
  if (!url.startsWith(START_PAGE_LINK)) return null;
  const token = url.slice(START_PAGE_LINK.length);
  if (!TOKEN_SAFE.test(token)) return null;
  return { key: START_CTA_KEY, vars: { 1: ((i.body && i.body.text) || '-').slice(0, 1024), 2: token } };
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
    const sid = sids[tpl.name];
    if (!sid) return { skip: true, reason: 'twilio_content_sid_missing' };
    const r = templateVariables(tpl, env, opts.spec || null);
    if (r.error) return { skip: true, reason: r.error };
    return { form: { ...base, ContentSid: sid, ContentVariables: JSON.stringify(r.vars) } };
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
