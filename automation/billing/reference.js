'use strict';
/* Unique payment reference (6.5 item 3; 3.6 consumer 2).
 *
 * Decision on NH-CD-07: 3.6's shape wins because the tier token carries information the
 * reconciler uses (expected amount); 6.5's shape is still accepted by the parser.
 *   issued : LV-{broker_ref}-{tier}-{YYYYMM}      e.g. LV-0007-B-202610   (16 chars)
 *   legacy : LV-{broker_ref}-{YYYYMM}             e.g. LV-0007-202610
 * {broker_ref} is a short numeric broker number (brokers.billing_ref, zero-padded to 4), not the
 * UUID `brokers.id`: LV-<uuid> is 40+ characters and SA bank "beneficiary reference" fields are
 * short (ASSUMPTION: <= 20 characters is safe at every SA bank; NH-BA-01). {tier} is the pricing
 * row's ref_code (B/S/G). Paystack transaction references append an attempt suffix
 * (-P1, -P2 ...) because Paystack requires a fresh reference per transaction; the parser ignores it.
 */
const { withinTolerance, TOLERANCE_CENTS } = require('./money');
const { tierRefCode, byRefCode } = require('./pricing');

const MAX_BANK_REF = 20;

function period(at) {
  if (typeof at === 'string' && /^\d{6}$/.test(at)) return at;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) throw new TypeError('bad period date');
  // Periods are SAST calendar months (UTC+2, no DST).
  const sast = new Date(d.getTime() + 2 * 3600 * 1000);
  return String(sast.getUTCFullYear()) + String(sast.getUTCMonth() + 1).padStart(2, '0');
}

function normaliseBrokerRef(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d{1,6}$/.test(s)) throw new TypeError('broker_ref must be 1-6 digits (brokers.billing_ref), got ' + JSON.stringify(s));
  return s.padStart(4, '0');
}

/** Build the reference printed on the invoice, checkout and every reminder. */
function formatReference({ brokerRef, tier, pricingRow, at = new Date() }) {
  const t = pricingRow ? tierRefCode(pricingRow) : String(tier || '').toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) throw new TypeError('tier token must be 1-3 letters');
  const ref = `LV-${normaliseBrokerRef(brokerRef)}-${t}-${period(at)}`;
  if (ref.length > MAX_BANK_REF) throw new RangeError(`reference ${ref} longer than ${MAX_BANK_REF}`);
  return ref;
}

/** Paystack transaction reference for an invoice attempt (Paystack allows letters, digits, - . =). */
function paystackReference(invoiceRef, attempt = 1) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 99) throw new RangeError('attempt 1-99');
  return `${invoiceRef}-P${attempt}`;
}

const validPeriod = (y, m) => Number(y) >= 2025 && Number(y) <= 2099 && Number(m) >= 1 && Number(m) <= 12;

/**
 * Find an LV reference inside free text (bank "Ref." field, inContact body, statement description).
 * Tolerates lower case, spaces/dots/underscores/slashes instead of hyphens, missing hyphens,
 * and text around it. Returns null if none. When several appear, the first valid one wins.
 * pricingRows (optional) resolves the tier token to a tier_code.
 */
function parseReference(text, pricingRows) {
  if (text === null || text === undefined) return null;
  const up = String(text).toUpperCase();
  // 1) Separated form (unambiguous): LV-0007-B-202610 / LV 7 B 202610 / LV-0007-202610
  const sep = /(?:^|[^A-Z0-9])LV[\s\-_./:]*(\d{1,6})[\s\-_./]+(?:([A-Z]{1,3})[\s\-_./]+)?(20\d{2})[\s\-_./]?(0[1-9]|1[0-2])(?![0-9])/g;
  let m;
  while ((m = sep.exec(up))) {
    if (validPeriod(m[3], m[4])) return build(m[1], m[2], m[3] + m[4], m[0], true, pricingRows);
  }
  // 2) Compact form (bank stripped the hyphens): LV0007B202610 / LV0007202610 / REF.LV0007B202610
  const cmp = /LV(\d{1,6}?)([A-Z]{1,3})?(20\d{2})(0[1-9]|1[0-2])(?!\d)/g;
  const candidates = up.split(/[^A-Z0-9]+/).filter(Boolean);
  candidates.push(up.replace(/[^A-Z0-9]/g, '')); // last resort: every separator removed
  for (const token of candidates) {
    cmp.lastIndex = 0;
    while ((m = cmp.exec(token))) {
      if (validPeriod(m[3], m[4])) return build(m[1], m[2], m[3] + m[4], m[0], false, pricingRows);
    }
  }
  return null;
}

function build(brokerDigits, tierToken, yyyymm, raw, separated, pricingRows) {
  const brokerRef = brokerDigits.padStart(4, '0');
  const tierRow = tierToken && pricingRows ? byRefCode(pricingRows, tierToken) : null;
  const format = tierToken ? '3.6' : '6.5';
  return {
    format,
    broker_ref: brokerRef,
    tier_token: tierToken || null,
    tier_code: tierRow ? tierRow.tier_code : null,
    tier_known: tierToken ? Boolean(tierRow) || !pricingRows : null,
    period: yyyymm,
    canonical: tierToken ? `LV-${brokerRef}-${tierToken}-${yyyymm}` : `LV-${brokerRef}-${yyyymm}`,
    separated,
    raw: raw.trim(),
  };
}

/** Same broker + same period = same invoice family, whichever format the payer typed. */
function sameInvoice(parsed, invoiceRef) {
  const inv = parseReference(invoiceRef);
  if (!parsed || !inv) return false;
  if (parsed.broker_ref !== inv.broker_ref || parsed.period !== inv.period) return false;
  return !parsed.tier_token || !inv.tier_token || parsed.tier_token === inv.tier_token;
}

function amountMatches(expectedCents, receivedCents, tol = TOLERANCE_CENTS) {
  return withinTolerance(expectedCents, receivedCents, tol);
}

module.exports = { MAX_BANK_REF, period, formatReference, paystackReference, parseReference, sameInvoice, amountMatches, normaliseBrokerRef };
