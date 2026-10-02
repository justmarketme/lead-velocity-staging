'use strict';
/**
 * redact.js — log redaction for n8n execution data, workflow logs and alert payloads (0.3 #10).
 * Zero dependencies. Masks: e-mail addresses, SA / E.164 phone numbers, 13-digit SA ID numbers.
 * Keys that are always secrets are replaced wholesale. Used by W22 before writing ops.notifications
 * and by any Code node that logs or forwards a payload outside the lead's own record.
 */
const SECRET_KEYS = /^(authorization|cookie|set-cookie|x-hub-signature(-256)?|x-paystack-signature|x-twilio-signature|access_token|refresh_token|client_secret|password|passphrase|api_key|apikey|token|secret|private_key)$/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g;
// SA ID: YYMMDD SSSS C A Z — 13 digits, not part of a longer digit run.
const SA_ID = /(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{7}(?!\d)/g;
// Phones: +27 / 27 / 0 prefixed SA mobiles and generic E.164, tolerant of spaces and dashes.
const PHONE = /(?<![\w])(\+?\d[\d\s-]{7,15}\d)(?![\w])/g;
// Platform object ids (ad_id, leadgen_id, wamid …) are digit runs too; keep them readable in logs.
const ID_KEY = /(^id$|_id$|Id$|_sid$|^sid$)/;

function maskPhone(m) {
  const digits = m.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return m;
  return (m.trim().startsWith('+') ? '+' : '') + '*'.repeat(Math.max(0, digits.length - 3)) + digits.slice(-3);
}

function redactString(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(EMAIL, (_, a, d, tld) => `${a}***@${d}***.${tld}`)
    .replace(SA_ID, '[id-redacted]')
    .replace(PHONE, (m) => maskPhone(m));
}

/** Deep-copies and redacts. Never mutates the input. */
function redact(value, depth = 0) {
  if (depth > 12) return '[depth-limit]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(k)) out[k] = '[secret]';
      else if (ID_KEY.test(k) && (typeof v === 'number' || (typeof v === 'string' && /^[\w.:-]+$/.test(v)))) out[k] = v;
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

module.exports = { redact, redactString, maskPhone };
