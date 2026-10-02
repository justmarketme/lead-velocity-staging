'use strict';
/* Money helpers. All arithmetic is in integer cents (ZAR has 2 decimals); never floats. */

const TOLERANCE_CENTS = 100; // 6.5 matching rule: amount within +/- R1 of the invoice

function toCents(zar) {
  if (typeof zar === 'number') {
    if (!Number.isFinite(zar)) throw new TypeError('amount is not finite');
    return Math.round(zar * 100);
  }
  const c = parseRandAmount(zar);
  if (c === null) throw new TypeError('not an amount: ' + String(zar));
  return c;
}

/**
 * Parse a rand amount as banks and people write it, into cents.
 * Accepts: "R12,345.00", "R 12 345.00", "ZAR12345", "12 345,00", "12.345,00", "R1.00", "-R500.00".
 * Returns null when the text holds no amount. Thousands separators: comma, space, NBSP, dot (only
 * when a comma is the decimal mark). A single separator followed by exactly 2 digits is decimal.
 */
function parseRandAmount(text) {
  if (text === null || text === undefined) return null;
  let s = String(text).replace(/[  ]/g, ' ').trim();
  const neg = /^-|^\(|-\s*$|\bDR\b/i.test(s) || /^-?\s*R\s*-/.test(s);
  s = s.replace(/ZAR|R|\(|\)|CR|DR|-|\+/gi, '').trim();
  if (!/^\d[\d ,.]*$/.test(s)) return null;
  s = s.replace(/ /g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart = s;
  let frac = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot);
    intPart = s.slice(0, dec).replace(/[.,]/g, '');
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const idx = s.lastIndexOf(sep);
    const after = s.slice(idx + 1);
    const count = s.split(sep).length - 1;
    if (count === 1 && after.length <= 2) { intPart = s.slice(0, idx); frac = after; }
    else { intPart = s.split(sep).join(''); }
  }
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(frac)) return null;
  const cents = Number(intPart) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

/** "R12,345.00"-style display string from cents (en-ZA uses spaces; we use commas to match the site copy). */
function formatZar(cents, { decimals = 'auto' } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const rands = Math.floor(abs / 100);
  const c = abs % 100;
  const int = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const showDec = decimals === true || (decimals === 'auto' && c !== 0);
  return (neg ? '-' : '') + 'R' + int + (showDec ? '.' + String(c).padStart(2, '0') : '');
}

function withinTolerance(expectedCents, receivedCents, tol = TOLERANCE_CENTS) {
  return Math.abs(expectedCents - receivedCents) <= tol;
}

module.exports = { TOLERANCE_CENTS, toCents, parseRandAmount, formatZar, withinTolerance };
