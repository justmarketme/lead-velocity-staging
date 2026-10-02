'use strict';
/* FNB inContact credit-alert parser for howzit@leadvelocity.co.za (6.5 bank reconciliation 1a; W17).
 * FNB has no self-serve API for a small business, so the credit alert e-mail is the near-real-time
 * feed and the nightly statement (W18) is the record.
 *
 * Input: a Microsoft Graph message ({ id, from, subject, receivedDateTime, body, bodyPreview,
 * internetMessageHeaders }) or a plain { from, subject, text } object.
 *
 * ASSUMPTION: FNB's exact alert wording and sender addresses were not researched (0.1). The
 * extractors below are field-based (amount / direction / reference / time / account tail) rather
 * than one rigid template, so wording changes degrade to "unrecognised" (-> W22 alert) instead of
 * a wrong match. GATE-INCONTACT: validate against 20 real alerts, then pin their fingerprints.
 */
const crypto = require('crypto');
const { parseRandAmount } = require('./money');
const { parseReference } = require('./reference');

const DEFAULT_SENDER_DOMAINS = ['fnb.co.za'];
const SUBJECT_RE = /\b(?:in\s?contact|payment\s+(?:received|notification)|credit(?:ed)?|deposit|funds\s+received|inward\s+payment)\b/i;

const CREDIT_RE = /\b(?:paid\s+to|credited\s+to|credit(?:ed)?\s+(?:of|into|to)|deposit(?:ed)?(?:\s+of)?|payment\s+received|funds\s+received|received\s+(?:in(?:to)?|on)|inward\s+payment|t\/fer\s+(?:from\s+.{1,40}?\s+)?to\s+(?:cheq|bus|savings|curr))/i;
const DEBIT_RE = /\b(?:paid\s+from|withdrawn|withdrawal|reserved\s+for|purchase|debited|debit\s+order|paid\s+out|t\/fer\s+from\s+(?:cheq|bus|savings|curr)\s+a\/c|declined|scheduled\s+payment\s+to)\b/i;

const AMOUNT_RE = /(?:-\s?)?(?:ZAR|R)\s?-?\d{1,3}(?:[ , .]\d{3})*(?:[.,]\d{2})?(?!\d)|(?:ZAR|R)\s?\d+(?:[.,]\d{2})?(?!\d)/i;
const LABEL_AMOUNT_RE = /\bAmount\s*[:\-]\s*((?:ZAR|R)?\s?[\d ,. ]+\d)/i;
const LABEL_REF_RE = /\b(?:Ref(?:erence)?(?:\s*no\.?)?|Their\s+ref(?:erence)?|Payment\s+ref(?:erence)?)\s*[.:#\-]?\s*([^\n\r]+?)(?=\s*(?:\.\s|\.$|;|\n|\r|$|\s{2,}|\s(?:Date|Time|On|Amount|Account|Bal)\b))/i;
const ACCOUNT_RE = /\b(?:a\/c|acc(?:oun)?t(?:\s+(?:ending|no\.?|number))?)\s*[.:]*\s*(?:in\s+)?\.{0,3}\s*(\d{3,6})\b/i;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function messageText(msg) {
  if (msg.text) return String(msg.text);
  const b = msg.body || {};
  if (typeof b === 'string') return /<[a-z][\s\S]*>/i.test(b) ? htmlToText(b) : b;
  if (b.content) return String(b.contentType || '').toLowerCase() === 'html' || /<[a-z][\s\S]*>/i.test(b.content) ? htmlToText(b.content) : String(b.content);
  return String(msg.bodyPreview || '');
}

function fromAddress(msg) {
  const f = msg.from;
  if (!f) return '';
  if (typeof f === 'string') return f.replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase();
  return String((f.emailAddress && f.emailAddress.address) || f.address || '').trim().toLowerCase();
}

function headerList(msg) {
  const h = msg.internetMessageHeaders;
  if (!Array.isArray(h)) return null;
  return h.map((x) => ({ name: String(x.name || '').toLowerCase(), value: String(x.value || '') }));
}

/**
 * Sender + subject filter (6.5: "filter on FNB's sender address and the credit/payment received
 * subject pattern so other mail in that inbox is ignored"). If Graph returned headers and
 * Authentication-Results shows DMARC/DKIM/SPF failing, the mail is rejected (a spoofed
 * "payment received" must never mark an invoice paid).
 */
function filterMessage(msg, { senderDomains = DEFAULT_SENDER_DOMAINS, senderAddresses = [] } = {}) {
  const addr = fromAddress(msg);
  const domain = addr.split('@')[1] || '';
  const senderOk = senderAddresses.map((s) => s.toLowerCase()).includes(addr) ||
    senderDomains.some((d) => domain === d || domain.endsWith('.' + d));
  if (!senderOk) return { pass: false, reason: 'sender_not_fnb' };
  if (!SUBJECT_RE.test(String(msg.subject || ''))) return { pass: false, reason: 'subject_not_credit_alert' };
  const hdrs = headerList(msg);
  if (hdrs) {
    const auth = hdrs.filter((h) => h.name === 'authentication-results').map((h) => h.value.toLowerCase()).join(' ');
    if (/\bdmarc=fail\b|\bdkim=fail\b|\bspf=fail\b/.test(auth)) return { pass: false, reason: 'auth_failed' };
  }
  return { pass: true, reason: 'ok' };
}

function toUtcIso(y, mo, d, h, mi, s = 0) {
  // Alerts are SAST (UTC+2, no DST).
  const t = Date.UTC(y, mo - 1, d, h - 2, mi, s);
  const dt = new Date(t);
  if (Number.isNaN(t) || dt.getUTCMonth() !== new Date(Date.UTC(y, mo - 1, d)).getUTCMonth()) return null;
  return dt.toISOString();
}

/** Timestamp in the alert; year inferred from the mail's receivedDateTime when the alert omits it. */
function parseTimestamp(text, receivedIso) {
  const rx = receivedIso ? new Date(receivedIso) : new Date();
  const ry = rx.getUTCFullYear();
  const pick = (y, mo, d, h, mi, s) => {
    if (y === null) {
      // "03Oct 09:14" with no year: take the year that puts it closest to (and not far after) receipt.
      for (const cand of [ry, ry - 1]) {
        const iso = toUtcIso(cand, mo, d, h, mi, s);
        if (iso && new Date(iso) - rx < 2 * 86400000) return iso;
      }
      return null;
    }
    if (y < 100) y += 2000;
    return toUtcIso(y, mo, d, h, mi, s);
  };
  let m;
  // 2026/10/03 09:14:22 | 2026-10-03 09:14
  if ((m = /\b(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})[ T,]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text))) return pick(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  // 03/10/2026 09:14 (SA day-first)
  if ((m = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})[ ,]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text))) return pick(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
  // 03 October 2026 09:14 | 03Oct26 09:14 | 03 Oct 09:14 | 3Oct 9:14
  if ((m = /\b(\d{1,2})\s?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s?(\d{4}|\d{2}))?[ ,]+(?:at\s+)?(\d{1,2})[:h](\d{2})(?::(\d{2}))?/i.exec(text))) {
    return pick(m[3] ? +m[3] : null, MONTHS[m[2].toLowerCase()], +m[1], +m[4], +m[5], +(m[6] || 0));
  }
  return null;
}

function extractAmount(text) {
  const l = LABEL_AMOUNT_RE.exec(text);
  if (l) { const c = parseRandAmount(l[1]); if (c !== null) return c; }
  const m = AMOUNT_RE.exec(text);
  return m ? parseRandAmount(m[0]) : null;
}

function extractReference(text) {
  const l = LABEL_REF_RE.exec(text);
  return l ? l[1].trim().replace(/[.\s]+$/, '') : null;
}

function direction(text) {
  const isDebit = DEBIT_RE.test(text);
  const isCredit = CREDIT_RE.test(text);
  if (isCredit && !isDebit) return 'credit';
  if (isDebit && !isCredit) return 'debit';
  if (isCredit && isDebit) {
    // e.g. "t/fer from X to cheq a/c": whichever phrase comes first decides.
    const c = text.search(CREDIT_RE);
    const d = text.search(DEBIT_RE);
    return c <= d ? 'credit' : 'debit';
  }
  return 'unknown';
}

function formatId(text) {
  if (/FNB\s*:?-?\)/.test(text)) return 'fnb_sms_style';
  if (LABEL_AMOUNT_RE.test(text)) return 'labelled';
  if (/\bdeposit of\b|\bcredit of\b/i.test(text)) return 'sentence';
  return 'unknown';
}

/** Shape of an alert with the values blanked: same wording -> same fingerprint. */
function fingerprint(text) {
  const shape = String(text)
    .replace(/LV[\s\-_./]*\d{1,6}[\s\-_./]*(?:[A-Z]{1,3}[\s\-_./]*)?20\d{2}[\s\-_./]?\d{2}/gi, '<REF>')
    .replace(AMOUNT_RE, '<AMT>')
    .replace(/\d/g, '#')
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi, '<MON>')
    .replace(/(Ref(?:erence)?\s*[.:#\-]?\s*)[^\n.]+/i, '$1<TXT>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return crypto.createHash('sha1').update(shape).digest('hex').slice(0, 12);
}

/**
 * Parse one message. Never throws.
 * @returns {{ filtered: {pass,reason}, recognised: boolean, direction, amount_cents, reference_raw,
 *   parsed_reference, account_tail, occurred_at, format_id, fingerprint, missing: string[],
 *   graph_message_id, received_at }}
 */
function parseAlert(msg, opts = {}) {
  const out = { graph_message_id: msg.id || null, received_at: msg.receivedDateTime || null };
  const filtered = filterMessage(msg, opts);
  out.filtered = filtered;
  if (!filtered.pass) return { ...out, recognised: false, direction: null, missing: [] };
  const text = messageText(msg);
  const amount = extractAmount(text);
  const refRaw = extractReference(text);
  const parsedRef = parseReference(refRaw || text, opts.pricingRows);
  const acc = ACCOUNT_RE.exec(text);
  const dir = direction(text);
  const when = parseTimestamp(text, msg.receivedDateTime);
  const missing = [];
  if (amount === null) missing.push('amount');
  if (dir === 'unknown') missing.push('direction');
  if (!when) missing.push('timestamp');
  return {
    ...out,
    recognised: missing.length === 0,
    direction: dir,
    amount_cents: amount === null ? null : Math.abs(amount),
    reference_raw: refRaw,
    parsed_reference: parsedRef ? parsedRef.canonical : null,
    reference: parsedRef,
    account_tail: acc ? acc[1] : null,
    occurred_at: when,
    format_id: formatId(text),
    fingerprint: fingerprint(text),
    missing,
  };
}

/** bank_credits row for a recognised credit (W17 insert; idempotent on graph_message_id). */
function toBankCredit(parsed) {
  if (!parsed.recognised || parsed.direction !== 'credit') return null;
  return {
    source: 'incontact',
    graph_message_id: parsed.graph_message_id,
    received_at: parsed.occurred_at || parsed.received_at,
    amount_zar: parsed.amount_cents / 100,
    amount_cents: parsed.amount_cents,
    reference_raw: parsed.reference_raw,
    parsed_reference: parsed.parsed_reference,
    account_tail: parsed.account_tail,
    match_status: 'unmatched',
  };
}

/**
 * Format-change detector. Input: parse results of FNB-filtered mails in this poll plus the set of
 * fingerprints seen before (n8n static data). Any FNB alert we cannot read is an alert (money),
 * a readable alert in a new shape is a warning, so a quiet wording change is noticed before it breaks.
 */
function detectFormatChange(results, knownFingerprints = []) {
  const known = new Set(knownFingerprints);
  const fnb = results.filter((r) => r.filtered && r.filtered.pass);
  const unrecognised = fnb.filter((r) => !r.recognised);
  const newShapes = fnb.filter((r) => r.recognised && r.fingerprint && !known.has(r.fingerprint));
  const level = unrecognised.length ? 'alert' : newShapes.length ? 'warn' : 'ok';
  return {
    level,
    unrecognised: unrecognised.map((r) => ({ graph_message_id: r.graph_message_id, missing: r.missing, fingerprint: r.fingerprint })),
    new_fingerprints: [...new Set(newShapes.map((r) => r.fingerprint))],
    known_after: [...new Set([...known, ...newShapes.map((r) => r.fingerprint)])],
  };
}

module.exports = { DEFAULT_SENDER_DOMAINS, SUBJECT_RE, filterMessage, parseAlert, parseTimestamp, toBankCredit, detectFormatChange, fingerprint, htmlToText, messageText };
