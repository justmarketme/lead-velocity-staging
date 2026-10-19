'use strict';
// automation/lib/wa-banner.cjs (Jono, 19 Oct 2026): every lead-facing WhatsApp message carries an amber image banner
// that says what it is for. The banners are the existing header cards served by Caddy on the VPS (/srv/smc-media):
//   https://n8n.sortmycover.co.za/media/whatsapp/headers/header-<name>.png   (1200x628, never rendered here)
// Templates carry the banner as their image header (Twilio Content twilio/card, lib/wa-provider.mjs TEMPLATE_VARIANTS).
// Session interactive messages (W03 / W07, inside the 24-h window) that cannot take an image header (a list on either
// provider; reply buttons on Twilio, whose twilio/quick-reply takes no media) get the banner as an image message sent
// FIRST, then the interactive message. Switch: WA_SESSION_BANNERS=on (default off, so production changes only when
// Jono flips it). Pure, CommonJS (inlined verbatim into W03's Code nodes; W07 reads it via lv-automation waProvider).

const HEADER_BASE = 'https://n8n.sortmycover.co.za/media/whatsapp/headers/';
/**
 * The existing cards. 19 Oct additions (upload each png to /srv/smc-media/whatsapp/headers/ before use): 'reschedule'
 * (W07 reschedule card), 'cancel' (W10 cancel card), 'leaving' (W15 STOP card).
 */
const HEADERS = ['welcome', 'intent', 'adviser', 'booked', 'expect', 'invite', 'reminder', 'video', 'reschedule', 'cancel', 'leaving'];
const headerUrl = (name) => {
  if (!HEADERS.includes(name)) throw new Error(`wa-banner: unknown header ${name}`);
  return `${HEADER_BASE}header-${name}.png`;
};

const bannersOn = (env = {}) => /^(on|true|1|yes)$/i.test(String(env.WA_SESSION_BANNERS || '').trim());
const providerOf = (env = {}) => (String(env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase() === 'twilio' ? 'twilio' : 'meta');

/**
 * Which banner a session interactive message gets, from its tap ids (the message builders stay untouched):
 *   consent_*            -> welcome  (W03 greeting / consent, lindi-flow-copy section 1)
 *   age_*                -> intent   (W03 first qualifying question = "what brings you here", section 2)
 *   slot_* / other_times -> booked   (slot lists: picking the booking, section 4b-4e)
 *   email_* / verify_*   -> invite   (where to send the invite, section 6)
 * Anything else (the later qualifying questions, best-time, call-number, Lindi's own buttons) -> null: one banner per
 * step, not on every question.
 */
function bannerFor(i = {}) {
  const ids = i.type === 'button'
    ? ((i.action && i.action.buttons) || []).map((b) => b && b.reply && b.reply.id)
    : i.type === 'list' ? (((i.action && i.action.sections) || []).flatMap((s) => s.rows || [])).map((r) => r && r.id) : [];
  const has = (re) => ids.some((id) => re.test(String(id || '')));
  if (has(/^consent_/)) return 'welcome';
  if (has(/^age_/)) return 'intent';
  if (has(/^(slot_|other_times)/)) return 'booked';
  if (has(/^(email_|verify_)/)) return 'invite';
  return null;
}

/**
 * Session banner plan for ONE outgoing Cloud API body (the `wa` a workflow hands to smc-whatsapp-send).
 * -> { banner: <Cloud API image body to send first> | null, wa: <the message, unchanged or with an inline header> }
 * Skipped (banner null, wa unchanged): switch off, not interactive, already has a header (cta_url Start here card),
 * a Flow, or no banner for its ids. Meta reply buttons take the image header inline (no extra message).
 * `name` overrides the id rule (a caller that knows the step).
 */
function sessionBanner(wa, env = {}, name = null) {
  const none = { banner: null, wa };
  if (!bannersOn(env) || !wa || wa.type !== 'interactive' || !wa.interactive) return none;
  const i = wa.interactive;
  if (i.header || !['button', 'list'].includes(i.type)) return none;
  const which = name || bannerFor(i);
  if (!which) return none;
  const link = headerUrl(which);
  if (providerOf(env) === 'meta' && i.type === 'button') return { banner: null, wa: { ...wa, interactive: { ...i, header: { type: 'image', image: { link } } } } };
  return { banner: { messaging_product: 'whatsapp', recipient_type: 'individual', to: wa.to, type: 'image', image: { link } }, wa };
}

module.exports = { HEADER_BASE, HEADERS, headerUrl, bannersOn, bannerFor, sessionBanner };
