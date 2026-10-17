// automation/lib/wa.mjs  -  shared WhatsApp Cloud API payload builders + SAST time helpers for W09 / W12 / W13.
// Pure (no I/O). Imported by automation/lib/w09.mjs, w12.mjs, w13.mjs. Node 18+, zero dependencies.
// Template rules (automation/templates/README.md "Send-time notes"): parameters carry no newline, no tab and never
// more than 4 spaces in a row; quick-reply payloads are set at send time; URL buttons take one text parameter.
export const MIN = 60_000;
export const H = 60 * MIN;
export const D = 24 * H;
const SAST = 2 * H; // Africa/Johannesburg, UTC+02:00 all year (no DST)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ms = (t) => {
  const v = typeof t === 'number' ? t : Date.parse(t);
  if (!Number.isFinite(v)) throw new Error(`bad time ${t}`);
  return v;
};
/** ms -> "2026-10-15T10:00:00+02:00" (same format as the fixtures and tests/_harness.mjs iso()). */
export const iso = (t) => new Date(ms(t) + SAST).toISOString().replace(/\.\d{3}Z$/, '+02:00');
export const sastHour = (t) => new Date(ms(t) + SAST).getUTCHours();
/** "Thu 15 Oct" */
export const dateLabel = (t) => { const d = new Date(ms(t) + SAST); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
/** "10:00" */
export const timeLabel = (t) => new Date(ms(t) + SAST).toISOString().slice(11, 16);

/**
 * Quiet hours 20:00-08:00 SAST (same rule as lib/w08.mjs QUIET, conversation/handoff.md hours).
 * outOfQuiet(t) -> t, or 08:00 SAST of the same/next morning when t falls inside quiet hours.
 */
export const QUIET = { from: 20, to: 8 };
export const inQuiet = (t) => { const h = sastHour(t); return h >= QUIET.from || h < QUIET.to; };
export function outOfQuiet(t) {
  if (!inQuiet(t)) return t;
  const d = new Date(ms(t) + SAST);
  const h = d.getUTCHours();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (h >= QUIET.from ? 1 : 0), QUIET.to, 0) - SAST;
}

/** Template parameter hygiene: no newline/tab, no 5+ spaces, never empty (Meta rejects an empty parameter). */
export const cleanParam = (v, fallback = '-') => {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {5,}/g, '    ').trim();
  return s || fallback;
};
/** "Lerato M." (brokers and ops only ever see first name + initial; compliance-qa 1.7, POPIA). */
export const firstAndInitial = (lead = {}) => {
  const f = String(lead.first_name || '').trim();
  const i = String(lead.last_name || '').trim().slice(0, 1).toUpperCase();
  return `${f || 'Your lead'}${i ? ` ${i}.` : ''}`;
};
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * templateMessage(to, name, { body, header, buttons, lang })
 *   body    : array of body parameter values ({{1}}..{{n}})
 *   header  : null | { text } | { video } | { image }   (TEXT header with a variable, or a media header link)
 *   buttons : array in template button order: { quick_reply: payload } | { url: suffix } | null (static button)
 */
export function templateMessage(to, name, { body = [], header = null, buttons = [], lang = 'en' } = {}) {
  const components = [];
  if (header?.text !== undefined) components.push({ type: 'header', parameters: [{ type: 'text', text: cleanParam(header.text) }] });
  else if (header?.video) components.push({ type: 'header', parameters: [{ type: 'video', video: { link: header.video } }] });
  else if (header?.image) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: header.image } }] });
  if (body.length) components.push({ type: 'body', parameters: body.map((v) => ({ type: 'text', text: cleanParam(v) })) });
  buttons.forEach((b, index) => {
    if (!b) return;
    if (b.quick_reply !== undefined) components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload: String(b.quick_reply) }] });
    else if (b.url !== undefined) components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text: cleanParam(b.url) }] });
  });
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name, language: { code: lang }, components } };
}

export const textMessage = (to, body) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: String(body).slice(0, 4096) } });
export const audioMessage = (to, link) => ({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'audio', audio: { link } });
export function listMessage(to, { body, footer, button, sections }) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive: { type: 'list', body: { text: body }, ...(footer ? { footer: { text: footer } } : {}), action: { button, sections } } };
}

/** Parameter counts of a template message (the tests compare these with the submitted template JSON). */
export function paramCounts(msg) {
  const c = msg.template.components;
  const of = (t) => c.filter((x) => x.type === t);
  return {
    header: of('header').reduce((n, x) => n + x.parameters.length, 0),
    body: of('body').reduce((n, x) => n + x.parameters.length, 0),
    quick_reply: of('button').filter((x) => x.sub_type === 'quick_reply').length,
    url: of('button').filter((x) => x.sub_type === 'url').length
  };
}

/**
 * Virtual clock for the synthetic run (tests/_harness.mjs "Test hooks"): a caller-supplied `now` is honoured ONLY
 * when TEST_HOOKS_ENABLED=true on the n8n side AND the item is marked is_synthetic. Production always uses the wall clock.
 */
export function nowFrom(input = {}, env = {}, wall = Date.now()) {
  if (String(env.TEST_HOOKS_ENABLED) === 'true' && input.is_synthetic === true && input.now) {
    const v = Date.parse(input.now);
    if (Number.isFinite(v)) return v;
  }
  return wall;
}

/** I-38d (CONTRACTS.md): a lead-facing send that Meta accepted (wamid) touches leads.last_contact_at; dry runs never. */
export const touchesLastContact = (to, wamid) => to === 'lead' && typeof wamid === 'string' && wamid.length > 0 && !wamid.startsWith('dry:');
