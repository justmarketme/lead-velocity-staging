'use strict';
/* The `pricing` catalogue (3.6; Chargebee's one-catalogue idea without the SaaS).
 * Every surface gets its numbers from rows shaped like the Postgres `pricing` table.
 * In n8n the rows come from a Postgres node; locally/tests from pricing.seed.json.
 *   node automation/billing/pricing.js --sql   -> idempotent upsert for the seed rows */

const REQUIRED = ['tier_code', 'name', 'price_zar', 'committed_leads', 'replacement_cap_cycle', 'media_share_zar'];

function loadSeed(file) {
  // fs/path loaded lazily so the module inlines into n8n Code nodes (only crypto is allowed there).
  const fs = require('fs');
  const path = require('path');
  const j = JSON.parse(fs.readFileSync(file || path.join(__dirname, 'pricing.seed.json'), 'utf8'));
  return validateRows(j.rows);
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('pricing: no rows');
  const seenCode = new Set();
  const seenRef = new Set();
  for (const r of rows) {
    for (const k of REQUIRED) if (r[k] === undefined || r[k] === null || r[k] === '') throw new Error(`pricing ${r.tier_code || '?'}: missing ${k}`);
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(r.tier_code)) throw new Error(`pricing: bad tier_code ${r.tier_code}`);
    for (const k of ['price_zar', 'committed_leads', 'replacement_cap_cycle', 'media_share_zar']) {
      if (!(Number(r[k]) > 0)) throw new Error(`pricing ${r.tier_code}: ${k} must be > 0`);
    }
    if (seenCode.has(r.tier_code)) throw new Error(`pricing: duplicate tier_code ${r.tier_code}`);
    seenCode.add(r.tier_code);
    const ref = tierRefCode(r);
    if (seenRef.has(ref)) throw new Error(`pricing: reference token ${ref} is not unique (set ref_code)`);
    seenRef.add(ref);
  }
  return rows;
}

/** One-to-three letter tier token for payment references. Explicit ref_code wins. */
function tierRefCode(row) {
  if (row.ref_code) {
    const t = String(row.ref_code).toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(t)) throw new Error(`pricing ${row.tier_code}: ref_code must be 1-3 letters`);
    return t;
  }
  return String(row.tier_code).replace(/^SMC_/, '').charAt(0).toUpperCase();
}

function byTierCode(rows, code) {
  const r = rows.find((x) => x.tier_code === code);
  if (!r) throw new Error('pricing: unknown tier_code ' + code);
  return r;
}

function byRefCode(rows, token) {
  const t = String(token || '').toUpperCase();
  return rows.find((x) => tierRefCode(x) === t) || null;
}

/** Rows a surface may show. `at` = Date; staging may pass includeUnapproved to render rows whose active_from is null. */
function activeRows(rows, { at = new Date(), includeUnapproved = false } = {}) {
  return rows
    .filter((r) => {
      if (r.active_from === null || r.active_from === undefined) return includeUnapproved;
      if (new Date(r.active_from) > at) return false;
      if (r.active_to && new Date(r.active_to) <= at) return false;
      return true;
    })
    .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.price_zar - b.price_zar);
}

/** Amounts in cents for one cycle of a tier. VAT only when vat_rate is set (0.1: excl. VAT until registered). */
function cycleAmounts(row) {
  const exclCents = Math.round(Number(row.price_zar) * 100);
  const rate = row.vat_rate === null || row.vat_rate === undefined ? null : Number(row.vat_rate);
  const vatCents = rate ? Math.round(exclCents * rate) : null;
  return { excl_vat_cents: exclCents, vat_cents: vatCents, total_cents: exclCents + (vatCents || 0), vat_rate: rate };
}

/**
 * Effective Lead Price in whole rand (agreement 1.1.14, Schedule 1): what one Qualified Lead of a plan is worth. It is the
 * rate every undelivered lead of that plan is credited or refunded at, the plan's own leads AND top-up leads (Jonathan
 * 2026-10-10; never the top-up price).
 *   - Monthly tier: price_zar / committed_leads, rounded to the whole rand exactly as the pricing page and Schedule 1 show it.
 *   - Pilot (the seed's `pilot` object): its stated price_per_lead_zar.
 * `row` may be a `pricing` row, the seed's `pilot` object, or a `cycles` snapshot { price_zar, committed_leads, topup_leads }:
 * committed_leads on a cycle includes paid top-ups, so the plan's own commitment is committed_leads - topup_leads. Dividing the
 * plan price by the total would spread the top-up leads into the plan price and understate the rate.
 */
function effectiveLeadPriceZar(row) {
  if (row && Number(row.price_per_lead_zar) > 0) return Number(row.price_per_lead_zar);
  const planLeads = Number(row && row.committed_leads) - Math.max(0, Number(row && row.topup_leads) || 0);
  if (!(Number(row && row.price_zar) > 0) || !(planLeads > 0)) throw new RangeError('effectiveLeadPriceZar: price_zar and the plan\'s committed_leads (net of top-ups) must be > 0');
  return Math.round(Number(row.price_zar) / planLeads);
}

/** Effective Lead Price for every plan in a parsed pricing.seed.json: { SMC_PILOT, SMC_BRONZE, ... } (whole rand). */
function effectiveLeadPrices(seed) {
  const out = {};
  if (seed && seed.pilot) out[seed.pilot.tier_code] = effectiveLeadPriceZar(seed.pilot);
  for (const r of (seed && seed.rows) || []) out[r.tier_code] = effectiveLeadPriceZar(r);
  return out;
}

/** Derived values other surfaces quote (price per committed lead, 3.5). Never typed elsewhere. */
function derived(row) {
  return {
    price_per_committed_lead_zar: effectiveLeadPriceZar(row),
  };
}

const sqlLit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

function seedSql(rows) {
  const cols = ['tier_code', 'name', 'ref_code', 'price_zar', 'committed_leads', 'replacement_cap_cycle', 'media_share_zar', 'paystack_page_code', 'paystack_plan_code', 'active_from', 'active_to', 'vat_rate'];
  const values = rows.map((r) => '(' + cols.map((c) => (c === 'ref_code' ? sqlLit(tierRefCode(r)) : sqlLit(r[c]))).join(', ') + ')').join(',\n  ');
  // Paystack codes and active_from are never overwritten by a re-seed (W25 / approval own them).
  return `-- generated by automation/billing/pricing.js --sql from pricing.seed.json (3.6)\n` +
    `insert into public.pricing (${cols.join(', ')}) values\n  ${values}\n` +
    `on conflict (tier_code) do update set name = excluded.name, ref_code = excluded.ref_code, price_zar = excluded.price_zar,\n` +
    `  committed_leads = excluded.committed_leads, replacement_cap_cycle = excluded.replacement_cap_cycle,\n` +
    `  media_share_zar = excluded.media_share_zar, vat_rate = excluded.vat_rate;\n`;
}

module.exports = { loadSeed, validateRows, tierRefCode, byTierCode, byRefCode, activeRows, cycleAmounts, derived, effectiveLeadPriceZar, effectiveLeadPrices, seedSql };

if (require.main === module && process.argv.includes('--sql')) process.stdout.write(seedSql(loadSeed()));
