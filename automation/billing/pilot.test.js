'use strict';
/* Pilot guard (10 Oct 2026, Jonathan: "Pilot": R8,500 once-off = 10 Qualified Leads x R850).
 *
 * The Pilot is not in the monthly ladder (`rows`), so billing.test.js and price-diff never touch it. This file pins
 * the number and every place it must agree: the seed, the edge copy, src/lib/pricing.ts (through that edge copy),
 * the agreement (canonical + marked client copy), the W25 renderers and the public copy. A failure here means one
 * surface drifted from pricing.seed.json (or the 10 Oct replacement/notice terms).
 *   node --test automation/billing/pilot.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const render = require('./render');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const seed = JSON.parse(read('automation/billing/pricing.seed.json'));
const zar = (n) => 'R' + Math.round(n).toLocaleString('en-US');
const perLead = (price, leads) => Math.round(price / leads);

const AGREEMENT_DIR = 'deliverables/contracts-drafter/lead-generation-agreement/';
const AGREEMENTS = {
  canonical: read(AGREEMENT_DIR + 'lead-velocity-services-agreement.md'),
  marked: read(AGREEMENT_DIR + 'lead-velocity-services-agreement-v0.3-marked.md'),
};

const PILOT_TOTAL = seed.pilot.price_per_lead_zar * seed.pilot.committed_leads;
const LADDER = seed.rows.map((r) => ({ name: r.name, price: r.price_zar, leads: r.committed_leads, elp: perLead(r.price_zar, r.committed_leads) }));

test('seed: the Pilot is R8,500 once-off = 10 Qualified Leads x R850, first-time clients only, and offered', () => {
  const p = seed.pilot;
  assert.equal(p.offered, true, 'pilot.offered is the switch every surface reads (reinstated 10 Oct)');
  assert.equal(p.tier_code, 'SMC_PILOT');
  assert.equal(p.price_per_lead_zar, 850);
  assert.equal(p.committed_leads, 10);
  assert.equal(PILOT_TOTAL, 8500);
  assert.equal(p.once_off, true);
  assert.equal(p.first_time_clients_only, true);
  assert.equal(p.continue_on, 'Bronze or higher');
  assert.equal(seed.rows.some((r) => r.tier_code === p.tier_code), false, 'the Pilot stays outside the monthly ladder (checkout, W25, Paystack plans)');
});

test('seed: ladder, top-up and terms the Pilot is quoted against', () => {
  assert.deepEqual(LADDER, [
    { name: 'Bronze', price: 16500, leads: 20, elp: 825 },
    { name: 'Silver', price: 24500, leads: 30, elp: 817 },
    { name: 'Gold', price: 35500, leads: 45, elp: 789 },
  ]);
  assert.deepEqual(seed.topup, { price_per_lead_zar: 850, min_leads: 10, notice_days: 7 });
  assert.equal(seed.terms.cycle_days, 30);
  assert.equal(seed.terms.shortfall_rollover_days, 14);
  assert.equal(seed.terms.cancel_notice_days, 7);
  assert.equal(seed.terms.goodwill_replacements_per_week, 3, 'one weekly cap on every plan, no separate Pilot cap');
});

test('edge copy: pricing.generated.ts is current and carries the same Pilot as the seed', () => {
  execFileSync(process.execPath, [path.join(__dirname, 'gen-edge-pricing.mjs'), '--check'], { stdio: 'pipe' });
  const m = read('supabase/functions/_shared/pricing.generated.ts').match(/^const seed = (\{[\s\S]*?\n\});$/m);
  assert.ok(m, 'embedded seed found');
  const embedded = JSON.parse(m[1]);
  assert.deepEqual(embedded.pilot, seed.pilot);
  assert.deepEqual(embedded.terms, seed.terms);
});

async function loadEdgePricing() {
  const file = path.join(ROOT, 'supabase/functions/_shared/pricing.generated.ts');
  try { return await import(pathToFileURL(file).href); } catch { /* Node without type stripping: transpile instead */ }
  let ts;
  try { ts = require('typescript'); } catch { return null; }
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports;
}

test('src/lib/pricing.ts (via the edge copy): Pilot is R8,500 / 10 / R850, offered, in ALL_PLANS and the chatbot summary', async (t) => {
  const P = await loadEdgePricing();
  if (!P) return t.skip('neither native TypeScript import nor the typescript package is available');
  assert.equal(P.PILOT_OFFERED, true);
  assert.equal(P.PILOT.price_zar, 8500);
  assert.equal(P.PILOT.committed_leads, 10);
  assert.equal(P.perLead(P.PILOT), 850);
  assert.equal(P.isPilot(P.PILOT), true);
  assert.deepEqual(P.ALL_PLANS.map((p) => p.name), ['Pilot', 'Bronze', 'Silver', 'Gold']);
  assert.equal(P.planByName('Pilot plan').tier_code, 'SMC_PILOT');
  assert.deepEqual(P.TIERS.map((x) => [x.name, x.price_zar, x.committed_leads, P.perLead(x)]), LADDER.map((x) => [x.name, x.price, x.leads, x.elp]));
  const summary = P.pricingSummaryText();
  assert.ok(summary.includes('Pilot: R8,500 once-off for 10 Qualified Leads (R850 per lead)'), 'chatbot summary leads with the Pilot');
  assert.ok(summary.includes('continue on Bronze or higher by paying in advance, otherwise the agreement ends'));
  assert.ok(P.REPLACEMENT_TEXT.includes('up to 3 no-shows or leads you couldn\'t reach a week'));
  assert.ok(summary.includes(P.REPLACEMENT_TEXT), 'chatbot summary carries the same replacement rule as the website');
  assert.equal(/no-shows only/i.test(summary), false);
});

for (const [which, md] of Object.entries(AGREEMENTS)) {
  test(`agreement (${which}): Pilot, Effective Lead Prices, weekly cap and notice agree with the seed`, () => {
    assert.ok(md.includes(`| Pilot (first-time clients only; one introductory Billing Cycle) | ${zar(PILOT_TOTAL)} excl. VAT, once-off | ${seed.pilot.committed_leads} Qualified Leads (${zar(seed.pilot.price_per_lead_zar)} each) |`), 'S1.3 Pilot row');
    for (const l of LADDER.filter((x) => x.name !== 'Bronze')) {
      assert.ok(md.includes(`| ${l.name} | ${zar(l.price)} excl. VAT | ${l.leads} Qualified Leads, about ${zar(l.elp)} each |`), `S1.3 ${l.name} row states the Fee, not a placeholder`);
    }
    assert.equal(/\[PER PRICING PAGE\]|\[CURRENT:/.test(md), false, 'no bracketed Plan placeholders in Schedule 1');
    const elp = `${zar(perLead(PILOT_TOTAL, seed.pilot.committed_leads))} for the Pilot Plan, ${LADDER.map((l) => `${zar(l.elp)} for ${l.name}`).join(', ').replace(/, ([^,]*)$/, ' and $1')})`;
    assert.ok(md.includes(`at the Fees shown there on the Signature Date: ${elp}`), '1.1.14 Effective Lead Prices');
    assert.ok(md.includes('9.7 **Pilot Plan.** The Pilot Plan is available once only'), '9.7');
    assert.ok(/continue on the Bronze Plan or a higher Plan \(Silver or Gold\) by paying that Plan's Fee in advance under clause 10/.test(md), '9.7 move on');
    assert.ok(/no notice under clause 9\.5 is needed/.test(md), '9.7 does not also require 9.5 notice');
    assert.ok(/replacements of up to 3 per Calendar Week with no separate cap for the Pilot Plan/.test(md), '9.7 replacement rule');
    assert.ok(/no more than 3 replacement requests per Calendar Week, whichever Plan the Client is on/.test(md), '7.2');
    assert.ok(/within the maximum of 3 replacement requests per Calendar Week in clause 7\.2/.test(md), '1.1.28');
    assert.ok(/Replacements \(clause 7\)[^|\n]*\| Goodwill, not a right: no more than 3 replacement requests per Calendar Week, whichever Plan/.test(md), 'Schedule 1 row');
    assert.ok(/11\.1 \*\*Cancellation on notice\.\*\* .*?at least 7 days'/.test(md), '11.1 notice stays 7 days');
    assert.equal(/minimum Plan is Bronze|no longer offers a Pilot/.test(md), false, 'withdrawn wording is gone');
  });

  test(`agreement (${which}): the rounded Effective Lead Price can never refund more than the Fee`, () => {
    // 30 x R817 = R24,510 > R24,500 and 45 x R789 = R35,505 > R35,500: a full-cycle refund would exceed what was paid.
    const over = LADDER.filter((l) => l.leads * l.elp > l.price).map((l) => l.name);
    assert.deepEqual(over, ['Silver', 'Gold'], 'the rounding over-refund this cap exists for');
    assert.equal(seed.pilot.committed_leads * seed.pilot.price_per_lead_zar, PILOT_TOTAL);
    assert.ok(/the total refunded for a Billing Cycle \(or for a Top-Up\) is never more than the Client paid for it/.test(md), '6.3 cap');
    assert.ok(/never more in total than the Client paid for those leads/.test(md), '11.6 cap');
  });

  test(`agreement (${which}): Uncontactable Lead means the same thing in 1.1.35 and Schedule 3`, () => {
    assert.ok(/answered neither of the Client's calls \(made at the booked start time and again at least 10 minutes later, on every phone number in the Lead Data\)/.test(md), '1.1.35 two calls');
    assert.ok(/the Client called the Consumer at the booked start time and again at least 10 minutes later, on every phone number in the Lead Data, and the Consumer answered neither call/.test(md), 'S3.4(a) two calls');
    assert.ok(/at least 3 attempts by the Client to reach the Consumer over at least 72 hours/.test(md), '1.1.35 limb (b)');
    assert.ok(/made at least 3 attempts to reach the Consumer, by phone call or WhatsApp message to the numbers in the Lead Data, over at least 72 hours/.test(md), 'S3.4(b)');
  });
}

test('W25 renderers print the weekly rule and the 10 Oct shortfall wording, never the per-cycle allowance', () => {
  assert.equal(render.REPLACEMENTS_PER_WEEK, seed.terms.goodwill_replacements_per_week, 'render.js mirror of terms.goodwill_replacements_per_week');
  assert.equal(render.SHORTFALL_ROLLOVER_DAYS, seed.terms.shortfall_rollover_days, 'render.js mirror of terms.shortfall_rollover_days');
  const rows = seed.rows.map((r) => ({ ...r, active_from: '2026-01-01' }));
  const html = render.renderTierCards(rows, { at: new Date('2026-10-10') });
  assert.ok(html.includes('Goodwill replacements: up to 3 requests a week'));
  assert.ok(html.includes('up to 3 requests a calendar week on every plan, the Pilot included'));
  assert.ok(html.includes('rolls into your next cycle or is refunded at your plan&#39;s rate per lead'));
  assert.ok(html.includes('then roll the balance over or refund it'));
  for (const stale of [/replacements per cycle/i, /per cycle on this plan/i, /extend and credit/i, /anything still short is credited/i, /No notice period/i]) {
    assert.equal(stale.test(html), false, `tier cards no longer print ${stale}`);
  }
  for (const r of seed.rows) assert.equal(html.includes(`Up to ${r.replacement_cap_cycle} replacements`), false);
  const json = JSON.parse(render.checkoutPricingJson(rows, { at: new Date('2026-10-10') }));
  assert.equal(json.length, seed.rows.length);
  for (const j of json) {
    assert.equal(j.goodwill_replacements_per_week, 3);
    assert.equal('replacement_cap_cycle' in j, false, 'the internal per-cycle allowance never reaches the checkout page');
  }
  assert.ok(render.proposalTierBlock(rows[0]).includes('Replacements: goodwill, up to 3 requests a calendar week on every plan, with proof.'));
});

test('price-diff: a Pilot price (total or per lead) typed outside the seed fails the check, like a ladder price', () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-pilot-'));
  fs.mkdirSync(path.join(dir, 'src'));
  const run = () => { try { execFileSync(process.execPath, [path.join(__dirname, 'price-diff.mjs'), '--json'], { env: { ...process.env, PRICE_DIFF_ROOT: dir }, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  try {
    assert.equal(run(), 0);
    fs.writeFileSync(path.join(dir, 'src', 'bad.ts'), `export const pilot = "${zar(PILOT_TOTAL)}";\n`);
    assert.equal(run(), 1, 'the Pilot total');
    fs.writeFileSync(path.join(dir, 'src', 'bad.ts'), `export const perLead = "${zar(seed.pilot.price_per_lead_zar)}";\n`);
    assert.equal(run(), 1, 'the Pilot price per lead');
    fs.writeFileSync(path.join(dir, 'src', 'bad.ts'), `export const perLead = "${zar(seed.pilot.price_per_lead_zar)}"; // price-diff:allow test\n`);
    assert.equal(run(), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('public copy: no superseded replacement scope, notice, delivery or spacing text', () => {
  const surfaces = [
    'src/lib/pricing.ts', 'src/pages/Pricing.tsx', 'src/pages/portal/Agreement.tsx', 'src/pages/portal/Help.tsx', 'src/pages/portal/Leads.tsx',
    'src/pages/portal/Reports.tsx', 'src/components/dashboard/ProposalGenerator.tsx', 'supabase/functions/_shared/knowledge.ts',
    'src/hooks/useChatbot.ts', 'src/pages/BrokerOnboarding.tsx', 'src/pages/Services.tsx',
    'automation/billing/render.js', 'billing/checkout/checkout.js', 'billing/checkout/index.html',
  ];
  const stale = [
    [/no-shows only/i, 'replacements also cover leads the Client could not reach (10 Oct)'],
    [/no-show replacements a week/i, 'replacements are not for no-shows alone (10 Oct)'],
    [/no notice needed|no notice period/i, 'cancellation is on 7 days\' written notice (10 Oct)'],
    [/replacements per cycle/i, 'the per-cycle allowance is internal (4 / 6 / 9), not a published rule'],
    [/\{prog\.replacement_cap\}|\{s2\.replacements\.cap\}/, 'brokers are not shown the internal per-cycle cap'],
    [/Weekly Delivery/, 'the unit is the 30-day cycle; leads arrive as they qualify'],
  ];
  for (const f of surfaces) {
    const text = read(f);
    for (const [re, why] of stale) assert.equal(re.test(text), false, `${f}: ${why}`);
  }
  // the JSX line break after {PILOT.continue_on} drops its trailing space ("higherby" on the live page)
  assert.ok(read('src/pages/Pricing.tsx').includes('{PILOT.continue_on}{" "}'), 'Pricing.tsx: space kept between "Bronze or higher" and "by paying in advance"');
});

test('every plan-aware generator offers the Pilot through ALL_PLANS', () => {
  for (const f of ['src/components/dashboard/ProposalGenerator.tsx', 'src/components/dashboard/InvoiceGenerator.tsx', 'src/components/dashboard/ContractGenerator.tsx']) {
    assert.ok(/\bALL_PLANS\b/.test(read(f)), `${f} lists plans from ALL_PLANS`);
  }
  assert.ok(/PILOT_OFFERED/.test(read('src/pages/Pricing.tsx')) && /<div data-tier=\{PILOT\.tier_code\}/.test(read('src/pages/Pricing.tsx')), '/pricing shows the Pilot row while it is offered');
});
