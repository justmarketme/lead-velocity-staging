// automation/lib/owner-alert.mjs  -  one WhatsApp to the owner from the SortMyCover number (Jono, 24 Oct 2026).
// Owner rule: until the separate internal WhatsApp number ("Zoe Experience") exists, EVERY SortMyCover notification must
// reach Jono on WhatsApp +27 72 554 8057, sent from the SortMyCover Twilio number (+27 60 015 6480). The first real lead
// (24 Oct, 08:12 SAST) produced no WhatsApp at all: W38's only transport was EMMA (Teams / Telegram), and the console
// escalations of W10 / W11 / W12 / W13 / W15 / W39 reached nobody. docs/OWNER-ALERTS-AUDIT.md has the map.
//
// Pure, no I/O. Code node form: const O = require('lv-automation').ownerAlert;
//   O.ownerAlert({ what, detail, who, source, key, subject, window_open }, env) -> smc-whatsapp-send `prebuilt` items
// Every item: record:false (Jono's number is also a test lead: no communications row, no last_contact_at touch),
// bypass_suppression:true (a STOP he sent as a tester must never silence ops), caller = the workflow, one per recipient.
// Transport = SUB-whatsapp-send (Twilio Content, WHATSAPP_PROVIDER=twilio, from TWILIO_WHATSAPP_FROM); it applies
// DRY_RUN_SENDS, the SYNTHETIC_TEST_NUMBERS dry-run and WHATSAPP_TEST_RECIPIENTS itself. SMC_TEST_PHONES (Jono, KG) is a
// routing list only (lib/routing-split.mjs): the sender never dry-runs those numbers, so these alerts really send.
// Template: `ops_update` (UTILITY, automation/templates/ops_update.json) once TWILIO_CONTENT_SIDS has its SID, else the
// approved `ops_alert` (same three body variables: name, what, detail). A template delivers inside and outside the 24-h
// window; a caller that KNOWS the window is open may pass window_open:true for a plain text instead.
// Hygiene, once, for every caller: redact() (emails, SA numbers, SA ID numbers), lines joined with " | ", no newline /
// tab / 5+ spaces in a variable (Meta rule), what <= 200 and detail <= 600 characters, a synthetic subject
// (SYNTHETIC_TEST_NUMBERS, exact numbers) -> no item (the console row / email is the record).
// POPIA data minimisation (W38's rule): first name, the last 3 digits of the number, the practice, times. personLabel()
// builds exactly that; callers never pass the full number or message text.
// Idempotency is the caller's: W38 (watermark + seen map), W22 (24-h key), W07 / W10 (one run per hand-off). The
// correlation `owner:<source>:<key>:<who>` is for tracing (record:false sends are not de-duplicated by the sender).
import { isSyntheticNumber, cleanParam } from './wa.mjs';
import { contentSids } from './wa-provider.mjs';

/** The documented default (automation/.env.example SMC_OWNER_WHATSAPP): Jono. Zoe Experience later = change the env only. */
export const DEFAULT_OWNER_WHATSAPP = '+27725548057';
export const TEMPLATE_PREFERRED = 'ops_update';
export const TEMPLATE_FALLBACK = 'ops_alert';
export const MAX_WHAT = 200;
export const MAX_DETAIL = 600;
export const FALLBACK_DETAIL = 'See the CRM';
export const NAME = { owner: 'Jono', kg: 'KG' };
export const WHO = ['owner', 'kg', 'both'];

// ---- redaction (moved here from lib/w22.mjs, which re-exports it) ---------------------------------------------------
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g;
const SA_ID = /(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{7}(?!\d)/g;
const PHONE = /(?<![\w./-])(\+?(?:27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4})(?![\w])/g;
/** Mask emails, SA phone numbers and SA ID numbers (an alert never carries a lead's contact details). */
export const redact = (s) => String(s == null ? '' : s).replace(EMAIL, '$1***@$2***.$3').replace(SA_ID, '[id]').replace(PHONE, '[phone]');

// ---- recipients ------------------------------------------------------------------------------------------------------
/** SMC_OWNER_WHATSAPP, else OPS_WHATSAPP_JONATHAN (live today), else the documented default. Never empty. */
export const ownerNumber = (env = {}) => String((env && (env.SMC_OWNER_WHATSAPP || env.OPS_WHATSAPP_JONATHAN)) || DEFAULT_OWNER_WHATSAPP).trim();
export const kgNumber = (env = {}) => String((env && env.OPS_WHATSAPP_KG) || '').trim();
/** who: 'owner' (default) | 'kg' | 'both' -> [{ who, to }], KG only when OPS_WHATSAPP_KG is set. */
export function recipients(who = 'owner', env = {}) {
  const w = WHO.includes(who) ? who : 'owner';
  const out = [];
  if (w === 'owner' || w === 'both') out.push({ who: 'owner', to: ownerNumber(env) });
  if ((w === 'kg' || w === 'both') && kgNumber(env)) out.push({ who: 'kg', to: kgNumber(env) });
  return out;
}

// ---- template -------------------------------------------------------------------------------------------------------
/** The Content key the sender will find: ops_update once its SID is in TWILIO_CONTENT_SIDS, else ops_alert (approved). */
export const templateKey = (env = {}) => (contentSids(env)[TEMPLATE_PREFERRED] ? TEMPLATE_PREFERRED : TEMPLATE_FALLBACK);
/** False until TWILIO_CONTENT_SIDS carries either key (provider=twilio sends nothing without a SID; W22 then emails only). */
export const hasOwnerTemplate = (env = {}) => { const s = contentSids(env); return !!(s[TEMPLATE_PREFERRED] || s[TEMPLATE_FALLBACK]); };

// ---- text hygiene ----------------------------------------------------------------------------------------------------
const joinLines = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/))
  .map((s) => String(s == null ? '' : s).replace(/^\s*-\s+/, '').trim()).filter(Boolean).join(' | ');
/** One template variable: redacted, one line, no 5+ spaces, at most `max` characters (cut on a word, "..."). */
export function clip(v, max) {
  const t = cleanParam(redact(joinLines(v)), '');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3).replace(/\s+\S*$/, '');
  return (cut || t.slice(0, max - 3)) + '...';
}
/** Last 3 digits of a number, whatever arrives ('' when shorter). */
export const phoneTail = (v) => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length >= 3 ? d.slice(-3) : ''; };
/** First word of the name, letters only; an email or a number typed into the name field is never echoed. */
export function firstNameOf(v) {
  const w = String(v == null ? '' : v).trim().split(/\s+/)[0] || '';
  const clean = w.replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 30);
  return !w || /@|\d{4,}/.test(w) || !clean ? 'name not given yet' : clean;
}
/** "Thandi, phone ends 234" (POPIA: first name + last 3 digits, nothing else). */
export const personLabel = ({ first_name, phone, phone_last3 } = {}) => {
  const tail = phoneTail(phone_last3 != null ? phone_last3 : phone);
  return `${firstNameOf(first_name)}, ${tail ? `phone ends ${tail}` : 'no number'}`;
};

/** subject = { phone?, from?, is_synthetic? } | a number: a SYNTHETIC_TEST_NUMBERS subject alerts nobody. */
export function syntheticSubject(subject, env = {}) {
  if (!subject) return false;
  const s = typeof subject === 'object' ? subject : { phone: subject };
  if (s.is_synthetic === true || s.is_synthetic === 't' || s.is_synthetic === 'true') return true;
  return [s.phone, s.from].some((v) => v && isSyntheticNumber(v, env));
}

/**
 * ownerAlert({ what, detail, who, source, key, subject, window_open }, env) -> [] | [<smc-whatsapp-send prebuilt item>, ...]
 *   what        one short line: what happened ("1 new lead", "Lead needs a person")        (required; <= 200 chars)
 *   detail      the lines (string with newlines, or an array), joined " | "                  (<= 600 chars; '' -> "See the CRM")
 *   who         'owner' | 'kg' | 'both'                                                     (default 'owner')
 *   source      the workflow ('W38', 'W07', ...): the sender's `caller` and part of the correlation
 *   key         the caller's idempotency handle (tick watermark, wamid, booking id, W22 key): part of the correlation
 *   subject     { phone, from, is_synthetic } of the person this is about: synthetic -> []
 *   window_open true ONLY when the caller knows the owner wrote to the SMC number < 24 h ago: plain text instead of a template
 * Items carry `who` and `template` next to the sender fields (the sender ignores unknown fields; W22 reads `who`).
 */
export function ownerAlert(a = {}, env = {}) {
  const what = clip(a.what, MAX_WHAT);
  if (!what) return [];
  if (syntheticSubject(a.subject, env)) return [];
  const detail = clip(a.detail, MAX_DETAIL) || FALLBACK_DETAIL;
  const source = String(a.source || 'owner-alert').slice(0, 40);
  const key = String(a.key || '').replace(/\s+/g, '_').slice(0, 120) || what.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const tpl = templateKey(env);
  const text = a.window_open === true;
  return recipients(a.who, env).map(({ who, to }) => ({
    kind: 'prebuilt', to, record: false, caller: source, bypass_suppression: true,
    correlation: `owner:${source}:${key}:${who}`.slice(0, 200),
    who, template: text ? null : tpl,
    wa: text
      ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: `SortMyCover update: ${what}. ${detail}`.slice(0, 4096) } }
      : { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl, language: { code: 'en' },
          components: [{ type: 'body', parameters: [NAME[who], what, detail].map((t) => ({ type: 'text', text: t })) }] } },
  }));
}
