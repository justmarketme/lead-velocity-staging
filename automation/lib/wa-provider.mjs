// WhatsApp provider switch: WHATSAPP_PROVIDER = meta (default) | twilio. Pure functions, no I/O.
// Outbound: toTwilioRequest() maps the Meta-shaped payload that sub-whatsapp-send decide() already builds onto Twilio's
// Messages API form. Inbound: normaliseTwilioInbound() maps Twilio's form payload onto the EXACT msg shape of
// lib/w07.mjs normaliseInbound() (and statuses onto the W07 status item), so W07 routes it unchanged.
// ASSUMPTIONS to verify against a live Twilio account are marked ASSUMPTION (see CONTRACTS.md "WhatsApp provider switch").
import { cleanParam } from './wa.mjs';

export const providerOf = (env = {}) => (String(env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase() === 'twilio' ? 'twilio' : 'meta');
const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
export const waAddr = (v) => `whatsapp:+${digits(v)}`;

/** TWILIO_CONTENT_SIDS = JSON { "<template name | content key>": "HX..." } (tolerates bad JSON -> {}). */
export function contentSids(env = {}) {
  try { const o = JSON.parse(env.TWILIO_CONTENT_SIDS || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
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

/**
 * Meta payload (from decide()) -> Twilio Messages form fields, or { skip, reason }.
 *  text        -> Body
 *  media       -> MediaUrl (public link only; a Meta media `id` has no Twilio equivalent -> skip)
 *  template    -> ContentSid + ContentVariables (SID from TWILIO_CONTENT_SIDS[name]; none -> skip twilio_content_sid_missing)
 *  interactive -> ContentSid (key `interactive.content_key`/`context.content_key`) when mapped, else text fallback
 * ASSUMPTION: a Twilio Content template numbers variables as one namespace: body {{1}}..{{n}}, then header text
 * variables, then dynamic button variables, in that order (Meta numbers each component separately).
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
    const vars = {}; let k = 0;
    const comps = tpl.components || [];
    const order = ['body', 'header', 'button'];
    for (const ty of order) for (const c of comps.filter((x) => x.type === ty)) for (const p of c.parameters || []) {
      const v = p.type === 'text' ? p.text : p.type === 'payload' ? p.payload : (p[p.type] && p[p.type].link) || p.text || '';
      vars[String(++k)] = cleanParam(v);
    }
    return { form: { ...base, ContentSid: sid, ContentVariables: JSON.stringify(vars) } };
  }
  if (t === 'interactive') {
    const i = payload.interactive || {};
    const key = i.content_key || (opts.context && opts.context.content_key);
    const sid = key && sids[key];
    if (sid) return { form: { ...base, ContentSid: sid, ContentVariables: JSON.stringify(opts.variables || {}) }, via: 'content' };
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

const STATUS = { queued: 'sent', accepted: 'sent', sending: 'sent', sent: 'sent', delivered: 'delivered', read: 'read', undelivered: 'failed', failed: 'failed' };

/**
 * Twilio inbound form params -> [{ kind:'message', msg } | { kind:'status', ... }] in the shapes W07 consumes
 * ("Verify signature + normalise" outputs, minus valid/payload_hash which the node adds).
 */
export function normaliseTwilioInbound(p = {}, nowMs = Date.now()) {
  const sid = p.MessageSid || p.SmsMessageSid || p.SmsSid;
  if (p.MessageStatus && String(p.SmsStatus || '').toLowerCase() !== 'received') {
    const status = STATUS[String(p.MessageStatus).toLowerCase()];
    if (!status) return [];
    return [{ kind: 'status', wamid: sid, status, ts: Math.floor(nowMs / 1000), error: p.ErrorCode ? `${p.ErrorCode} ${p.ErrorMessage || ''}`.trim() : null }];
  }
  const nMedia = Number(p.NumMedia || 0);
  const msg = { wamid: sid, from: '+' + digits(p.From), at_ms: nowMs, type: 'text', text: '', payload: null, list_id: null, media: null, media_id: null,
    referral: null, phone_number_id: digits(p.To) || null };
  if (p.ListId) { msg.type = 'interactive'; msg.list_id = p.ListId; msg.text = p.ListTitle || p.Body || ''; }
  else if (p.ButtonPayload != null && p.ButtonPayload !== '') {
    // Meta: a template quick-reply is type 'button' ({payload,text}); an in-session reply button is 'interactive'. Both land as payload+text.
    msg.type = 'button'; msg.payload = p.ButtonPayload; msg.text = p.ButtonText || p.Body || '';
  } else if (nMedia > 0) {
    const ct = String(p.MediaContentType0 || '');
    msg.media = ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : 'document';
    msg.type = msg.media; msg.text = p.Body || '';
    msg.media_id = `twilio:${p.MediaUrl0}`; // downstream fetch: twilioMediaRequest()
  } else msg.text = p.Body || '';
  // ASSUMPTION: CTWA referral arrives as Referral* params (ReferralSourceId/Url/Type, ReferralHeadline, ReferralBody, ReferralCtwaClid).
  if (p.ReferralSourceId || p.ReferralSourceUrl || p.ReferralCtwaClid) {
    msg.referral = { source_id: p.ReferralSourceId, source_url: p.ReferralSourceUrl, source_type: p.ReferralSourceType, headline: p.ReferralHeadline, body: p.ReferralBody, ctwa_clid: p.ReferralCtwaClid };
    Object.keys(msg.referral).forEach((k) => msg.referral[k] === undefined && delete msg.referral[k]);
  }
  return [{ kind: 'message', msg }];
}

/** Authenticated download of a Twilio media URL (taken from msg.media_id 'twilio:<url>'): Basic auth with the API key. */
export function twilioMediaRequest(mediaId, env = {}) {
  const url = String(mediaId || '').replace(/^twilio:/, '');
  if (!/^https:\/\/api\.twilio\.com\//.test(url)) return null;
  return { method: 'GET', url, headers: { Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString('base64') } };
}
