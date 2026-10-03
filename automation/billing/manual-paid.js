'use strict';
/* NH-61: the cycle-1 payment path. Jonathan sees the broker's EFT in his own bank, opens the console
 * (src/pages/smc/Payments.tsx) and taps "Payment received" on the open invoice. The console POSTs
 * { invoice_reference } with his Supabase JWT to W16 /billing/payment-received. W16 writes ONE bank_credits row
 * (source 'manual', amount = the invoice total) and hands it to the same "Match credit to invoice" -> "Normalise
 * payment.received" -> "Mark invoice paid + create cycle" chain every other rail uses (6.5 item 2: "fire the same
 * payment received event"). No new table, column or function: bank_credits.external_id and source 'manual' exist (migrations 02, 06). */
const { verifySupabaseJwt } = require('../security/lead-token');
const { parseReference } = require('./reference');

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k === undefined ? undefined : headers[k];
  return Array.isArray(v) ? v[0] : v;
}

/** -> { ok:true, user_id, invoice_reference } | { ok:false, status, reason }. Never echoes the token. */
function parsePaymentReceivedRequest({ headers = {}, body = {} } = {}, { jwtSecret, nowMs = Date.now() } = {}) {
  const auth = headerValue(headers, 'authorization');
  if (!auth) return { ok: false, status: 401, reason: 'missing' };
  const m = /^Bearer\s+(\S+)$/i.exec(String(auth));
  if (!m) return { ok: false, status: 401, reason: 'malformed' };
  let v;
  try { v = verifySupabaseJwt(m[1], { secret: jwtSecret, nowMs }); } catch { return { ok: false, status: 500, reason: 'not_configured' }; }
  if (!v.ok) return { ok: false, status: 401, reason: v.reason };
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 2) return { ok: false, status: 400, reason: 'bad_body' };
  const ref = String(body.invoice_reference || '').trim().toUpperCase().slice(0, 30);
  if (!ref || !parseReference(ref)) return { ok: false, status: 400, reason: 'bad_reference' };
  return { ok: true, user_id: v.user_id, invoice_reference: ref };
}

/**
 * Decide what the tap does. row = { is_admin, invoice: { id, reference, status, tier_code, total_cents } | null }.
 * -> { respond: 200, credit, assign } | { respond: 403|404|409, message }.
 * The credit row is deterministic (external_id manual:<invoice id>), so a double tap is one credit.
 */
function planTap(row, { userId, now = new Date() } = {}) {
  if (!row || row.is_admin !== true) return { respond: 403, message: 'Admins only.' };
  const inv = row.invoice;
  if (!inv || !inv.id) return { respond: 404, message: 'No such invoice.' };
  if (inv.status === 'paid') return { respond: 409, message: 'Already marked paid.' };
  if (inv.status !== 'issued') return { respond: 409, message: 'This invoice is not open (' + inv.status + ').' };
  const cents = Number(inv.total_cents);
  if (!Number.isFinite(cents) || cents <= 0) return { respond: 409, message: 'Invoice amount is not valid.' };
  return {
    respond: 200,
    credit: { external_id: 'manual:' + inv.id, amount_cents: cents, reference: inv.reference, received_at: new Date(now).toISOString(), note: 'Payment received (console one-tap)' },
    assign: { invoice_id: inv.id, assigned_by: userId },
  };
}

module.exports = { parsePaymentReceivedRequest, planTap };
