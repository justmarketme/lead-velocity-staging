'use strict';
// I-33a (Vault only through the migration-08 wrappers) and I-30e (portal POST /billing-autorenew).
// Run: node --test automation/billing/autorenew.test.js   Offline; synthetic secrets only.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const autorenew = require('./autorenew');

const ROOT = path.join(__dirname, '..', '..');
execFileSync(process.execPath, [path.join(__dirname, 'build-workflows.mjs')], { stdio: 'pipe' });
const wf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'automation', id + '.json'), 'utf8'));
const node = (w, name) => { const n = w.nodes.find((x) => x.name === name); assert.ok(n, 'node missing: ' + name); return n; };
const next = (w, name, out = 0) => ((w.connections[name] || { main: [] }).main[out] || []).map((c) => c.node);

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789'; // synthetic, >= 32 chars
const USER = '11111111-2222-4333-8444-555555555555';
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims = {}, { secret = SECRET, alg = 'HS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u({ alg, typ: 'JWT' });
  const p = b64u({ sub: USER, aud: 'authenticated', role: 'authenticated', exp: now + 600, ...claims });
  const sig = alg === 'none' ? '' : crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + sig;
}

// ---------- I-33a
test('I-33a: no generated billing workflow queries the vault schema directly', () => {
  for (const id of ['W16', 'W17', 'W18', 'W19', 'W25']) {
    const raw = fs.readFileSync(path.join(ROOT, 'automation', id + '.json'), 'utf8');
    assert.doesNotMatch(raw, /\bvault\.(create_secret|secrets|decrypted_secrets|update_secret)/, id);
  }
});
test('I-33a: W16 stores the card token via smc_vault_store_paystack_auth (opt-in, params in order)', () => {
  const n = node(wf('W16'), 'Card auto-renew token to Vault (opt-in only)');
  assert.match(n.parameters.query, /select public\.smc_vault_store_paystack_auth\(\$1::uuid, nullif\(\$2, ''\), nullif\(\$3, ''\)\)/);
  assert.match(n.parameters.options.queryReplacement, /broker_id.*authorization_code.*customer_code/);
  assert.match(n.parameters.query, /SET LOCAL smc\.source = 'n8n'/);
});
test('I-33a: W16 plan mode stores the subscription via smc_vault_store_paystack_sub', () => {
  const n = node(wf('W16'), 'Card auto-renew on (Paystack plan mode)');
  assert.match(n.parameters.query, /select public\.smc_vault_store_paystack_sub\(nullif\(\$1, ''\), nullif\(\$2, ''\), nullif\(\$3, ''\)\)/);
  assert.match(n.parameters.options.queryReplacement, /customer_code.*subscription_code.*email_token/);
});
test('I-33a: W19 cycle end reads the token only via smc_vault_paystack_auth_code(broker)', () => {
  const n = node(wf('W19'), 'Cycle end: open invoice + card token');
  assert.match(n.parameters.query, /public\.smc_vault_paystack_auth_code\(b\.id\) as authorization_code/);
  assert.doesNotMatch(n.parameters.query, /card_autorenew then/); // the wrapper owns the opt-in check
});

// ---------- I-30e workflow shape
test('I-30e: W19 has POST /billing-autorenew with a responder on every branch', () => {
  const w = wf('W19');
  const hook = node(w, 'Portal: POST /billing-autorenew');
  assert.equal(hook.parameters.path, 'billing-autorenew');
  assert.equal(hook.parameters.httpMethod, 'POST');
  assert.equal(hook.parameters.responseMode, 'responseNode');
  assert.equal(hook.parameters.options.allowedOrigins, 'https://app.leadvelocity.co.za');
  assert.deepEqual(next(w, hook.name), ['Autorenew: verify broker JWT + body']);
  assert.deepEqual(next(w, 'Autorenew: verify broker JWT + body'), ['Autorenew: caller ok?']);
  assert.deepEqual(next(w, 'Autorenew: caller ok?', 0), ['Autorenew off as n8n_app + timeline row']);
  assert.deepEqual(next(w, 'Autorenew: caller ok?', 1), ['Autorenew: respond error (reason only)']);
  assert.deepEqual(next(w, 'Autorenew off as n8n_app + timeline row'), ['Autorenew: respond']);
  assert.deepEqual(next(w, 'Autorenew: switched off just now?', 0).sort(), ['Autorenew: WhatsApp confirmation (template)', 'W22: card auto-renew off (disable Paystack plan if any)']);
  assert.deepEqual(next(w, 'Autorenew: WhatsApp confirmation (template)'), ['WhatsApp: broker_autorenew_off']);
  // portal posts to `${VITE_N8N_WEBHOOK_BASE}/billing-autorenew` with { on: false }
  const portal = fs.readFileSync(path.join(ROOT, 'src/pages/portal/Agreement.tsx'), 'utf8');
  assert.match(portal, /postWebhook\("billing-autorenew", \{ on: false \}\)/);
});
test('I-30e: the update runs as the billing connection, broker from JWT sub, guarded, with one timeline row', () => {
  const n = node(wf('W19'), 'Autorenew off as n8n_app + timeline row');
  const q = n.parameters.query;
  assert.equal(n.credentials.postgres.name, 'Supabase CRM (Postgres, billing role)');
  assert.equal(n.parameters.options.queryReplacement, '={{ [$json.user_id] }}'); // nothing from the body
  assert.match(q, /where user_id = \$1::uuid and brand_id is not null/);
  assert.match(q, /set card_autorenew = false from b where x\.id = b\.id and x\.card_autorenew returning/);
  assert.match(q, /insert into public\.lead_activities \(brand_id, broker_id, cycle_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key\)/);
  assert.match(q, /'W19', 'broker', 'card_autorenew\.disabled'/);
  assert.match(q, /from b join u on u\.id = b\.id/); // timeline only when the flag actually changed
  assert.match(q, /SET LOCAL smc\.reason = 'W19 card auto-renew off/);
  for (const line of q.split('\n')) { const c = line.indexOf('--'); if (c >= 0) assert.doesNotMatch(line.slice(c), /\$\d/, 'placeholder in comment: ' + line); }
  assert.ok(!/\bvault\./.test(q));
});

// ---------- I-30e request parsing
test('parse: valid broker JWT + { on:false } -> user id from sub', () => {
  const r = autorenew.parseAutorenewRequest({ headers: { Authorization: 'Bearer ' + jwt() }, body: { on: false } }, { jwtSecret: SECRET });
  assert.deepEqual(r, { ok: true, user_id: USER });
});
test('parse: refusals (missing, malformed, wrong secret, alg none, expired, anon, on:true, bad body, no secret)', () => {
  const p = (headers, body = { on: false }, opt = { jwtSecret: SECRET }) => autorenew.parseAutorenewRequest({ headers, body }, opt);
  assert.deepEqual(p({}), { ok: false, status: 401, reason: 'missing' });
  assert.equal(p({ authorization: 'Token abc' }).reason, 'malformed');
  assert.equal(p({ authorization: 'Bearer ' + jwt({}, { secret: 'another-secret-0123456789abcdef0123456789' }) }).reason, 'bad_signature');
  assert.equal(p({ authorization: 'Bearer ' + jwt({}, { alg: 'none' }) }).reason, 'alg');
  assert.equal(p({ authorization: 'Bearer ' + jwt({ exp: Math.floor(Date.now() / 1000) - 120 }) }).reason, 'expired');
  assert.equal(p({ authorization: 'Bearer ' + jwt({ role: 'anon', aud: 'anon' }) }).reason, 'role');
  const on = p({ authorization: 'Bearer ' + jwt() }, { on: true });
  assert.deepEqual(on, { ok: false, status: 400, reason: 'opt_in_via_checkout' }); // opt-in only at checkout
  assert.equal(p({ authorization: 'Bearer ' + jwt() }, { on: 'false' }).reason, 'bad_body');
  assert.equal(p({ authorization: 'Bearer ' + jwt() }, null).reason, 'bad_body');
  assert.deepEqual(p({ authorization: 'Bearer ' + jwt() }, { on: false }, { jwtSecret: undefined }), { ok: false, status: 500, reason: 'not_configured' });
});
test('generated Code node bundle runs: verifies the JWT with $env.SUPABASE_JWT_SECRET', () => {
  const n = node(wf('W19'), 'Autorenew: verify broker JWT + body');
  const run = (headers, body) => new Function('$json', '$env', 'require', n.parameters.jsCode)({ headers, body }, { SUPABASE_JWT_SECRET: SECRET }, require)[0].json;
  assert.deepEqual(run({ authorization: 'Bearer ' + jwt() }, { on: false }), { ok: true, user_id: USER });
  assert.equal(run({ authorization: 'Bearer ' + jwt({}, { alg: 'none' }) }, { on: false }).status, 401);
  assert.match(n.parameters.jsCode, /autorenew\.js sha256:[0-9a-f]{12}/);
  assert.match(n.parameters.jsCode, /lead-token\.js sha256:[0-9a-f]{12}/);
});

// ---------- I-30e confirmation
test('confirm: template exists in automation/templates and the params fit it', () => {
  const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'automation/templates', autorenew.TEMPLATE + '.json'), 'utf8'));
  const body = t.components.find((c) => c.type === 'BODY').text;
  const vars = new Set(body.match(/\{\{\d+\}\}/g));
  const m = autorenew.confirmMessage({ broker_id: 'b1', whatsapp_number: '+27820000000', contact_person: 'Test Broker' });
  assert.equal(m.template.name, t.name);
  assert.equal(m.template.body.length, vars.size);
  assert.equal(m.template.body[0], 'Test');
  for (const v of m.template.body) { assert.doesNotMatch(v, /[\n\t]| {4}/); assert.doesNotMatch(v, /R\s?\d/); } // no amounts, no newlines
  const urlButtons = (t.components.find((c) => c.type === 'BUTTONS') || { buttons: [] }).buttons.filter((b) => b.type === 'URL');
  assert.equal(m.template.buttons.length, urlButtons.length);
  assert.equal(autorenew.confirmMessage({ whatsapp_number: '' }), null);
  assert.equal(autorenew.confirmMessage({ whatsapp_number: '+27820000000' }).template.body[0], 'there');
});
test('response: 200 off (changed or already off), 403 when the JWT user has no SMC broker row', () => {
  assert.deepEqual(autorenew.responseBody({ broker_id: 'b1', changed: true }), { status: 200, body: { ok: true, card_autorenew: false, changed: true } });
  assert.deepEqual(autorenew.responseBody({ broker_id: 'b1', changed: false }).body.changed, false);
  assert.equal(autorenew.responseBody({ broker_id: null }).status, 403);
});

// fix wave 4 (compliance-qa review 4 §2g): the T-3/T-1 reminder states the card amount and how to switch it off.
test('renewal reminder: card on states the amount (invoice, else pricing) and the portal off-switch', () => {
  const on = autorenew.renewalReminderText({ action: 'remind_t3', open_ref: 'SMC-TEST1', card_autorenew: true, open_amount_excl_vat: 7500, open_vat_zar: null, price_zar: 9999 });
  assert.match(on, /ends in 3 days/);
  assert.match(on, /we will charge R7,500 excl\. VAT to your card at cycle end/);
  assert.match(on, /switch it off any time in the portal: \/s\/billing/);
  const fromPricing = autorenew.renewalReminderText({ action: 'remind_t1', open_ref: null, card_autorenew: true, price_zar: 12000 });
  assert.match(fromPricing, /R12,000 excl\. VAT/);
  const off = autorenew.renewalReminderText({ action: 'remind_t1', open_ref: 'SMC-TEST2', card_autorenew: false, open_amount_excl_vat: 7500 });
  assert.match(off, /Card auto-renew: off\.$/);
  assert.doesNotMatch(off, /charge/);
  const w19 = fs.readFileSync(path.join(ROOT, 'automation', 'W19.json'), 'utf8');
  assert.match(w19, /renewalReminderText/);
  assert.match(w19, /open_amount_excl_vat/);
});
