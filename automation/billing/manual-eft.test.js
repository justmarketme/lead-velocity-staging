'use strict';
// NH-61 (confirmed 2026-10-03). Offline. Run: node --test automation/billing/manual-eft.test.js
// Cycle 1 = payment by EFT in advance per 30-day cycle; Jonathan taps "Payment received" in the console; the tap fires the
// SAME W16 payment.received path as an automated match. Paystack / W17 / W18 stay built, tested, and OFF by default.
// No bank account details anywhere in the build.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const W16 = JSON.parse(read('automation/W16.json'));
const W17 = JSON.parse(read('automation/W17.json'));
const W18 = JSON.parse(read('automation/W18.json'));
const flags = require('./flags');
const mp = require('./manual-paid');
const rec = require('./reconcile');
const pricing = require('./pricing');
const inv = require('./invoice');

const rows = pricing.loadSeed();
const BRONZE = pricing.byTierCode(rows, 'SMC_BRONZE');
const SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
const ADMIN = '11111111-2222-4333-8444-555555555555';
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims = {}) {
  const h = b64u({ alg: 'HS256', typ: 'JWT' });
  const p = b64u({ sub: ADMIN, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
}
const node = (w, name) => { const n = w.nodes.find((x) => x.name === name); assert.ok(n, 'node missing: ' + name); return n; };
const next = (w, name, out = 0) => ((w.connections[name] || { main: [] }).main[out] || []).map((c) => c.node);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
// Runs a generated Code node the way n8n does (self-contained bundle). refs: node name -> json of its first item.
async function run(wf, name, { json = {}, env = {}, refs = {} } = {}) {
  const fn = new AsyncFunction('$json', '$env', '$', '$input', 'require', node(wf, name).parameters.jsCode);
  const $ = (k) => { if (!(k in refs)) throw new Error(`$('${k}') not provided`); const r = refs[k]; return { first: () => ({ json: r }), item: { json: r }, all: () => [{ json: r }] }; };
  return fn(json, env, $, { all: () => [{ json }], first: () => ({ json }) }, require);
}

const invoice = { id: 'f0f0f0f0-0000-4000-8000-000000000001', reference: 'LV-0007-B-202610', status: 'issued', tier_code: 'SMC_BRONZE', total_cents: BRONZE.price_zar * 100 };

/* ------------------------------------------------------------------ flags */
test('NH-61 flags: Paystack, W17 and W18 are OFF unless the env is exactly true', () => {
  for (const env of [{}, { PAYSTACK_ENABLED: '' }, { PAYSTACK_ENABLED: 'false' }, { PAYSTACK_ENABLED: 'yes' }, { PAYSTACK_ENABLED: '{{PAYSTACK_ENABLED}}' }]) assert.equal(flags.paystackEnabled(env), false, JSON.stringify(env));
  assert.equal(flags.paystackEnabled({ PAYSTACK_ENABLED: 'true' }), true);
  assert.equal(flags.incontactEnabled({}), false);
  assert.equal(flags.incontactEnabled({ INCONTACT_ENABLED: 'true' }), true);
  assert.equal(flags.statementImportEnabled({}), false);
  assert.equal(flags.statementImportEnabled({ STATEMENT_IMPORT_ENABLED: 'true' }), true);
  const ex = read('automation/.env.example');
  for (const k of ['PAYSTACK_ENABLED', 'INCONTACT_ENABLED', 'STATEMENT_IMPORT_ENABLED']) assert.match(ex, new RegExp('^' + k + '=false', 'm'), k + ' defaults to false in .env.example');
});

test('NH-61 flags: with Paystack off every checkout method resolves to manual EFT', () => {
  for (const m of ['instant_eft', 'card', 'manual_eft', undefined, 'bogus']) assert.equal(flags.resolveCheckoutMethod(m, {}), 'manual_eft', String(m));
  assert.deepEqual(flags.allowedMethods({}), ['manual_eft']);
  assert.equal(flags.resolveCheckoutMethod('card', { PAYSTACK_ENABLED: 'true' }), 'card');
  assert.equal(flags.resolveCheckoutMethod(undefined, { PAYSTACK_ENABLED: 'true' }), 'instant_eft');
});

/* ------------------------------------------------------------------ one-tap: request, plan */
test('one-tap: request needs a valid Supabase JWT and a valid invoice reference', () => {
  const p = (headers, body = { invoice_reference: 'lv-0007-b-202610' }) => mp.parsePaymentReceivedRequest({ headers, body }, { jwtSecret: SECRET });
  const ok = p({ Authorization: 'Bearer ' + jwt() });
  assert.deepEqual(ok, { ok: true, user_id: ADMIN, invoice_reference: 'LV-0007-B-202610' });
  assert.equal(p({}).reason, 'missing');
  assert.equal(p({ authorization: 'Bearer x.y.z' }).reason, 'malformed');
  assert.equal(p({ authorization: 'Bearer ' + jwt({ exp: Math.floor(Date.now() / 1000) - 120 }) }).reason, 'expired');
  assert.equal(p({ authorization: 'Bearer ' + jwt() }, { invoice_reference: 'not a reference' }).reason, 'bad_reference');
  assert.equal(p({ authorization: 'Bearer ' + jwt() }, { invoice_reference: 'LV-0007-B-202610', a: 1, b: 2 }).reason, 'bad_body');
  assert.equal(mp.parsePaymentReceivedRequest({ headers: { authorization: 'Bearer ' + jwt() }, body: {} }, { jwtSecret: 'short' }).status, 500, 'unset secret fails closed');
});

test('one-tap: plan refuses non-admins, unknown, paid and void invoices; double tap is one deterministic credit', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  assert.equal(mp.planTap({ is_admin: false, invoice }, { userId: ADMIN }).respond, 403);
  assert.equal(mp.planTap({ is_admin: true, invoice: null }, { userId: ADMIN }).respond, 404);
  assert.equal(mp.planTap({ is_admin: true, invoice: { ...invoice, status: 'paid' } }, { userId: ADMIN }).respond, 409);
  assert.equal(mp.planTap({ is_admin: true, invoice: { ...invoice, status: 'void' } }, { userId: ADMIN }).respond, 409);
  const a = mp.planTap({ is_admin: true, invoice }, { userId: ADMIN, now });
  const b = mp.planTap({ is_admin: true, invoice }, { userId: ADMIN, now: new Date('2026-10-03T10:00:09Z') });
  assert.equal(a.respond, 200);
  assert.equal(a.credit.external_id, 'manual:' + invoice.id);
  assert.equal(a.credit.external_id, b.credit.external_id, 'same invoice -> same external_id -> unique index makes it one credit');
  assert.equal(a.credit.amount_cents, invoice.total_cents);
  assert.deepEqual(a.assign, { invoice_id: invoice.id, assigned_by: ADMIN });
});

/* ------------------------------------------------------------------ one-tap: end to end through the real W16 nodes */
test('one-tap W16 wiring: console webhook -> verify -> admin check -> credit row -> the SAME match/normalise/mark-paid chain', () => {
  const hook = node(W16, 'Console: POST /billing/payment-received');
  assert.equal(hook.parameters.path, 'billing/payment-received');
  assert.equal(hook.parameters.responseMode, 'responseNode');
  assert.deepEqual(next(W16, hook.name), ['Tap: verify admin JWT + body']);
  assert.deepEqual(next(W16, 'Tap: verify admin JWT + body'), ['Tap: caller ok?']);
  assert.deepEqual(next(W16, 'Tap: caller ok?', 0), ['Tap: is admin + load open invoice']);
  assert.deepEqual(next(W16, 'Tap: caller ok?', 1), ['Tap: respond error (reason only)']);
  assert.deepEqual(next(W16, 'Tap: is admin + load open invoice'), ['Tap: plan (admin, open invoice, credit row)']);
  assert.deepEqual(next(W16, 'Tap: allowed?', 0), ['Tap: write the manual bank credit (idempotent)']);
  assert.deepEqual(next(W16, 'Tap: allowed?', 1), ['Tap: respond refusal']);
  assert.deepEqual(next(W16, 'Tap: write the manual bank credit (idempotent)').sort(), ['Tap: respond ok', 'Tap: same input as a bank credit']);
  assert.deepEqual(next(W16, 'Tap: same input as a bank credit'), ['Load credit, invoices, same-day credits']);
  // ...and that node is the one W17/W18's sub-call enters too
  assert.ok(next(W16, 'From W17/W18/console: bank credit').includes('Load credit, invoices, same-day credits'));
  assert.deepEqual(next(W16, 'Load credit, invoices, same-day credits'), ['Match credit to invoice']);
  const sql = node(W16, 'Tap: is admin + load open invoice').parameters.query;
  assert.match(sql, /user_roles/); assert.match(sql, /'admin'/);
  assert.doesNotMatch(JSON.stringify(hook), /bank|account/i);
});

test('one-tap end to end: tap -> same payment.received event as an automated match -> mark-paid parameters (no DB, no sends)', async () => {
  // 1. verify + plan, through the generated Code nodes
  const verified = (await run(W16, 'Tap: verify admin JWT + body', { json: { headers: { authorization: 'Bearer ' + jwt() }, body: { invoice_reference: invoice.reference } }, env: { SUPABASE_JWT_SECRET: SECRET } }))[0].json;
  assert.equal(verified.ok, true);
  const plan = (await run(W16, 'Tap: plan (admin, open invoice, credit row)', { json: { is_admin: true, invoice }, refs: { 'Tap: verify admin JWT + body': verified } }))[0].json;
  assert.equal(plan.respond, 200);
  // 2. what the insert would return, then the hand-off item
  const creditId = 'c0c0c0c0-0000-4000-8000-0000000000aa';
  const handoff = (await run(W16, 'Tap: same input as a bank credit', { json: { id: creditId }, refs: { 'Tap: plan (admin, open invoice, credit row)': plan } }))[0].json;
  assert.deepEqual(handoff, { bank_credit_id: creditId, invoice_id: invoice.id, assigned_by: ADMIN });
  // 3. "Load credit..." would return this ctx; the real Match node decides
  const credit = { id: creditId, source: 'manual', amount_cents: plan.credit.amount_cents, reference_raw: invoice.reference, parsed_reference: invoice.reference, received_at: plan.credit.received_at, match_status: 'unmatched' };
  const ctx = { ctx: { credit, invoices: [{ ...invoice, due_at: null, paid_at: null }], credits: [], pricing: rows, assign_invoice: { id: invoice.id, reference: invoice.reference, tier_code: invoice.tier_code }, assigned_by: ADMIN } };
  const matched = (await run(W16, 'Match credit to invoice', { json: ctx }))[0].json;
  assert.equal(matched.action, 'mark_paid');
  assert.equal(matched.reason, 'manual_assign:' + ADMIN);
  assert.equal(matched.ev.event, 'payment.received');
  assert.equal(matched.ev.method, 'manual_eft');
  assert.equal(matched.ev.invoice_reference, invoice.reference);
  // 4. an automated W17 match of the same invoice produces the same event (same name, method, reference, amount)
  const auto = rec.matchCredit({ ...credit, id: 'c-auto', source: 'incontact', graph_message_id: 'SYNTH-AUTO-1', external_id: 'incontact:SYNTH-AUTO-1', received_at: plan.credit.received_at },
    { invoices: [{ ...invoice, status: 'issued' }], credits: [], pricingRows: rows });
  assert.equal(auto.action, 'mark_paid');
  for (const k of ['event', 'method', 'invoice_reference', 'amount_cents', 'tier_code', 'period']) assert.deepEqual(matched.ev[k], auto.event[k], k);
  // 5. both feed Normalise -> Mark invoice paid + create cycle
  assert.deepEqual(next(W16, 'Match result', 0), ['Normalise payment.received']);
  const norm = (await run(W16, 'Normalise payment.received', { json: matched }))[0].json;
  assert.equal(norm.method, 'manual_eft');
  assert.equal(norm.ref, invoice.reference);
  assert.equal(norm.amount_cents, invoice.total_cents);
  assert.equal(norm.credit_status, 'manual');
  assert.equal(norm.assigned_by, ADMIN);
  assert.equal(norm.bank_credit_id, creditId);
  assert.match(norm.audit_reason, /manual_assign by /);
  assert.deepEqual(next(W16, 'Normalise payment.received'), ['Mark invoice paid + create cycle']);
  const mark = node(W16, 'Mark invoice paid + create cycle').parameters.query;
  assert.match(mark, /where reference = \$1 and status = 'issued'/, 'only an issued invoice flips: a double tap cannot create a second cycle');
  assert.match(mark, /on conflict \(invoice_id\) do nothing/);
  // 6. downstream of mark-paid is untouched: W22 receipt + onboarding / resume chains
  assert.ok(next(W16, 'Card auto-renew token to Vault (opt-in only)').includes('W22: payment received (Jonathan/KG + broker receipt)'));
});

test('one-tap SQL only uses columns and values that already exist in the migrations (no DDL needed)', () => {
  const mig = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^20261002_smc_/.test(f)).map((f) => read('supabase/migrations/' + f)).join('\n');
  const insert = node(W16, 'Tap: write the manual bank credit (idempotent)').parameters.query;
  const cols = /insert into public\.bank_credits \(([^)]*)\)/.exec(insert)[1].split(',').map((c) => c.trim());
  const table = /CREATE TABLE IF NOT EXISTS public\.bank_credits \(([\s\S]*?)\n\);/.exec(mig)[1];
  for (const c of cols) assert.ok(new RegExp('^\\s*' + c + '\\s', 'm').test(table) || new RegExp('ADD COLUMN IF NOT EXISTS ' + c + '\\b').test(mig), 'bank_credits.' + c);
  assert.match(table, /source\s+text NOT NULL CHECK \(source IN \([^)]*'manual'/);
  assert.match(mig, /CREATE UNIQUE INDEX IF NOT EXISTS bank_credits_external_uidx ON public\.bank_credits \(external_id\)/, 'ON CONFLICT (external_id) target');
  assert.match(insert, /on conflict \(external_id\)/);
  assert.match(mig, /smc_audit/); // the audit trigger covers bank_credits (who/when/why)
});

test('the console Payments page calls the one-tap webhook and is routed', () => {
  const page = read('src/pages/smc/Payments.tsx');
  assert.match(page, /Payment received/);
  assert.match(page, /"billing\/payment-received", \{ invoice_reference/);
  assert.match(read('src/App.tsx'), /path="\/console\/payments"/);
  assert.match(read('src/pages/smc/ConsoleLayout.tsx'), /\/console\/payments/);
  assert.doesNotMatch(page, /account number|branch code|BANK_/i);
});

/* ------------------------------------------------------------------ Paystack: built, OFF by default */
test('checkout webhook: Paystack off -> manual EFT whatever was asked; on -> the built Paystack path still works', async () => {
  const pricingRows = rows.map((r) => ({ ...r }));
  const ctx = { invoice: { ...invoice, due_at: null, credit_cents: 0, attempts: 0, email: 'broker@example.invalid', broker_id: 'b-1', cycle_id: null, billing_ref: '7' }, pricing: pricingRows, taken: [invoice.reference] };
  const name = 'Checkout: re-issue if tier changed, build Paystack request';
  const refs = { 'Checkout: POST /billing/checkout': { body: { invoice_reference: invoice.reference, method: 'card', autorenew_opt_in: true } } };
  const off = (await run(W16, name, { json: { ctx }, env: {}, refs }))[0].json;
  assert.equal(off.respond, 200);
  assert.equal(off.method, 'manual_eft');
  assert.equal(off.spec, null, 'no Paystack request is built');
  assert.equal(next(W16, 'Checkout: Paystack needed?', 1)[0], 'Respond: manual EFT reference');
  const on = (await run(W16, name, { json: { ctx }, env: { PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_synthetic_not_a_key' }, refs }))[0].json;
  assert.equal(on.method, 'card');
  assert.ok(on.spec && on.spec.path, 'Paystack initialize request is built when the flag is on');
});

test('Paystack webhook: ignored while off, verified when on (built and tested, behind the flag)', async () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'LV-0007-B-202610-P1', amount: 1, status: 'success', metadata: {}, customer: {} } });
  const sig = crypto.createHmac('sha512', 'sk_test_synthetic_not_a_key').update(body).digest('hex');
  const item = { json: { headers: { 'x-paystack-signature': sig }, body }, binary: { data: { data: Buffer.from(body).toString('base64') } } };
  const go = async (env) => {
    const fn = new AsyncFunction('$json', '$env', '$', '$input', '$getWorkflowStaticData', 'require', node(W16, 'Verify signature + map event').parameters.jsCode);
    return fn(item.json, env, () => ({}), { first: () => item, all: () => [item] }, () => ({}), require);
  };
  assert.deepEqual((await go({ PAYSTACK_SECRET_KEY: 'sk_test_synthetic_not_a_key' }))[0].json, { ok: false, reason: 'paystack_off' });
  const on = (await go({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_synthetic_not_a_key' }))[0].json;
  assert.equal(on.ok, true);
  assert.equal(on.ev.event, 'payment.received');
});

test('W25 only builds Paystack pages/plans when the flag is on; the checkout template carries the flag, not bank details', () => {
  assert.match(node(read('automation/W25.json') && JSON.parse(read('automation/W25.json')), 'Paystack page/plan requests').parameters.jsCode, /PAYSTACK_ENABLED \|\| 'false'\) !== 'true'\) return \[\]/);
  const html = read('billing/checkout/index.html');
  assert.match(html, /data-paystack-enabled="\{\{PAYSTACK_ENABLED\}\}"/);
  assert.match(html, /id="m-manual" value="manual_eft" checked/);
  assert.match(html, /class="method needs-paystack" for="m-eft" hidden/);
  assert.match(html, /class="method needs-paystack" for="m-card" hidden/);
  assert.doesNotMatch(html, /data-bank|bank-account|bank-branch|Account number|Branch code|\{\{BANK_/i);
  assert.match(html, /EFT, in advance, per 30-day cycle/);
  const js = read('billing/checkout/checkout.js');
  assert.match(js, /data-paystack-enabled'\) === 'true'/);
  assert.doesNotMatch(js, /data-bank|bank-account/i);
  assert.match(JSON.stringify(JSON.parse(read('automation/W25.json')).nodes.find((n) => n.name === 'Render tier cards, checkout, templates').parameters.jsCode), /PAYSTACK_ENABLED\}\}/);
});

/* ------------------------------------------------------------------ W17 / W18: built, OFF by default */
test('W17 and W18: the schedule is gated by a default-off flag; the manual (fixture) run is not', async () => {
  const cases = [[W17, 'Every 2 minutes', 'Flag: INCONTACT_ENABLED (off by default, NH-61)', 'Poll window', 'INCONTACT_ENABLED', 'Manual run (synthetic test)'],
    [W18, 'Nightly 02:30 SAST', 'Flag: STATEMENT_IMPORT_ENABLED (off by default, NH-61)', 'Read statement exports (inbox)', 'STATEMENT_IMPORT_ENABLED', 'Manual run (synthetic test)']];
  for (const [w, sched, gate, after, envName] of cases) {
    assert.deepEqual(next(w, sched), [gate]);
    assert.deepEqual(next(w, gate), [after]);
    const man = w.nodes.find((n) => n.type === 'n8n-nodes-base.manualTrigger').name;
    assert.ok(!next(w, man).includes(gate), 'manual run bypasses the flag');
    const item = { json: { tick: 1 } };
    const offOut = await new AsyncFunction('$json', '$env', '$', '$input', 'require', node(w, gate).parameters.jsCode)({}, {}, () => ({}), { all: () => [item] }, require);
    assert.deepEqual(offOut, [], envName + ' off -> the schedule does nothing');
    const onOut = await new AsyncFunction('$json', '$env', '$', '$input', 'require', node(w, gate).parameters.jsCode)({}, { [envName]: 'true' }, () => ({}), { all: () => [item] }, require);
    assert.equal(onOut.length, 1, envName + ' on -> runs');
  }
  // still built and fixture-tested
  assert.ok(fs.existsSync(path.join(ROOT, 'automation/tests/W17.test.mjs')) && fs.existsSync(path.join(ROOT, 'automation/tests/W18.test.mjs')));
});

/* ------------------------------------------------------------------ wording: no bank account details anywhere */
test('no bank account details in checkout, templates, portal, invoice/contract generators or env example', () => {
  const bad = /\b(account number|account #|acc #|branch code|account holder|BANK_NAME|BANK_ACCOUNT|BANK_BRANCH|First National|data-bank|\b\d{10,11}\b.*\b250655\b|63174286724|250655)/i;
  const files = ['billing/checkout/index.html', 'billing/checkout/checkout.js', 'src/components/dashboard/InvoiceGenerator.tsx', 'src/components/dashboard/ContractGenerator.tsx',
    'src/utils/contractToDocx.ts', 'automation/.env.example', 'src/pages/portal/Agreement.tsx', 'portal/spec/06-agreement-and-billing.md',
    ...fs.readdirSync(path.join(ROOT, 'deliverables/contracts-drafter')).filter((f) => /\.(md|json|txt|html)$/.test(f)).map((f) => 'deliverables/contracts-drafter/' + f)];
  for (const f of files) if (fs.existsSync(path.join(ROOT, f))) assert.doesNotMatch(read(f), bad, f);
  for (const f of ['automation/W16.json', 'automation/W19.json', 'automation/W25.json']) assert.doesNotMatch(read(f), /BANK_NAME|BANK_ACCOUNT|BANK_BRANCH|data-bank|\{\{BANK_/, f);
});

test('invoice keeps a short LV reference for recognition only (NH-26) and the invoice vars carry no account details', () => {
  const i = inv.buildInvoice({ broker: { id: 'b-1', billing_ref: '7' }, pricingRow: BRONZE, cycleStart: new Date('2026-10-05T00:00:00Z'), dueAt: null, existingReferences: [] });
  assert.match(i.reference, /^LV-0007-B-202610$/);
  assert.ok(i.reference.length <= 20);
  assert.doesNotMatch(JSON.stringify(require('./render').invoiceVars(i, BRONZE)), /account|branch|bank/i);
});
