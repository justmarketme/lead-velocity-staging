// The four console ads webhooks (automation/SUB-ads-console.json, logic in automation/ads/console-api.js).
// Walks the REAL Code nodes of the generated workflow with the Postgres node outputs faked and Graph mocked:
// nothing touches the network or a database. Run: node --test automation/tests/ads-console.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { codeNode, nodeRequire, lvViolations, ifBranch } from './_n8ncode.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const L = require(join(A, 'index.cjs')).adsConsole;
const WF = JSON.parse(readFileSync(join(A, 'SUB-ads-console.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const JWT_SECRET = 'j'.repeat(48);
const CONFIRM_SECRET = 'confirm-secret-0123456789abcdef';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(sub = ADMIN, over = {}) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600, ...over });
  return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const ENV = { SUPABASE_JWT_SECRET: JWT_SECRET, META_CONFIRM_SECRET: CONFIRM_SECRET, META_SYSTEM_USER_TOKEN: 'TOK_SECRET' };
const BRAND = { id: '33333333-3333-4333-8333-333333333333', code: 'SMC', business_id: 'B1', page_id: 'P1', ig_user_id: 'IG1', ad_account_id: '999', pixel_id: 'PX1', dataset_id: 'DS1' };
const CAMP_A = { id: 'CA', level: 'campaign', campaign_id: 'CA', name: 'SMC_A_LEADS-IF_ZA_c1', status: 'PAUSED', effective_status: 'PAUSED', daily_budget_zar: 20, spend_cap_zar: null, last_budget_change_at: null };
const AD1 = { id: 'AD1', level: 'ad', campaign_id: 'CA', name: 'C01_H1_vid-amb_20261015', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_zar: null };
const CTX = (o = {}) => ({ is_admin: true, brand: BRAND, obj: CAMP_A, shares: [{ broker_id: 'b1', share: 8492, starts_at: '2026-10-16T08:00:00Z' }], plan: null, spend_to_date: 0, cycle_end: new Date(Date.now() + 30 * 864e5).toISOString(), first_spend_date: null, ...o });

// ---- run the workflow's real Code nodes ($getWorkflowStaticData and fetch are provided here)
const SD = {};
async function run(name, { json = {}, refs = {}, env = ENV, fetchImpl } = {}) {
  const n = codeNode(WF, name);
  const fn = new AsyncFunction('$json', '$env', '$', '$getWorkflowStaticData', 'require', 'fetch', n.parameters.jsCode);
  const $ = (k) => { if (!(k in refs)) throw new Error(`$('${k}') not provided`); return { item: { json: refs[k] }, first: () => ({ json: refs[k] }) }; };
  const prev = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try { return (await fn(json, env, $, () => SD, nodeRequire, globalThis.fetch)).json; } finally { globalThis.fetch = prev; }
}
const PARSE = 'Parse request + verify caller (JWT)';
const DECIDE = 'Decide (admin, SMC target, caps, mint or verify token)';
const parse = (route, body, token = jwt()) => run(PARSE, { json: { route, headers: { Authorization: `Bearer ${token}` }, body } });
const decide = async (route, body, ctx = CTX(), env = ENV, token) => { const p = await parse(route, body, token); return { p, d: await run(DECIDE, { json: ctx, refs: { [PARSE]: p }, env }) }; };

function graphMock(handler = () => ({ body: { success: true } })) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push({ url, init }); const r = await handler(url, init, calls.length); return { ok: (r.status || 200) < 400, status: r.status || 200, headers: r.headers || {}, json: async () => r.body }; };
  return { fetchImpl, calls };
}
async function mint(body, ctx = CTX(), who = ADMIN) {
  const { d } = await decide('confirm', body, ctx, ENV, jwt(who));
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return d.body;
}
/** confirm -> apply through the real nodes; returns every intermediate so tests can look at the Graph calls. */
async function budgetFlow({ daily = 246.14, goLive = true, ctx = CTX(), applyCtx = ctx, graph = graphMock(), env = ENV, browserShare } = {}) {
  const c = await mint({ action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: daily, setSpendCap: true, goLive }, reason: 'go-live broker b1' }, ctx);
  const body = { campaign_id: 'CA', daily_budget_zar: daily, set_spend_cap: true, confirm_token: c.confirm_token, confirmed_by: ADMIN, go_live: goLive, go_live_share_zar: browserShare };
  const { p, d } = await decide('budget', body, applyCtx, env);
  return { c, p, d, graph, run: async () => {
    const claimed = await run('Claimed?', { json: { log_id: 'LOG1' }, refs: { [DECIDE]: d } });
    const applied = await run('Apply at Meta (system user token; ADS_DRY_RUN sends nothing)', { json: claimed, env, fetchImpl: graph.fetchImpl });
    const shaped = await run('Shape response + DB record', { json: applied });
    return { claimed, applied, shaped };
  } };
}

// ------------------------------------------------------------------------------------------------ structure
test('workflow: id, four webhooks, loader form only, one Postgres credential, error workflow', () => {
  assert.deepEqual(lvViolations(WF, 'smc-ads-console'), []);
  const paths = WF.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook').map((n) => n.parameters.path).sort();
  assert.deepEqual(paths, ['ads-ad-status', 'ads-budget', 'ads-campaign-status', 'ads-confirm']);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.webhook')) { assert.equal(n.parameters.httpMethod, 'POST'); assert.equal(n.parameters.responseMode, 'responseNode'); }
  const creds = new Set(WF.nodes.flatMap((n) => Object.values(n.credentials || {}).map((c) => c.name)));
  assert.deepEqual([...creds], ['LV Supabase - n8n_app (least privilege)']);
  assert.equal(WF.active, false);
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) assert.ok(!/META_SYSTEM_USER_TOKEN/.test(n.parameters.jsCode) || /Apply at Meta/.test(n.name), 'only the Apply node reads the Meta token');
  // every connection target exists
  const names = new Set(WF.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(WF.connections)) { assert.ok(names.has(from), from); for (const out of c.main) for (const l of out) assert.ok(names.has(l.node), `${from} -> ${l.node}`); }
  const rec = WF.nodes.find((n) => n.name.startsWith('Record result'));
  assert.equal(rec.onError, 'continueRegularOutput', 'a DB hiccup after the Meta write must still answer the console');
});

test('SQL: SMC brand pin, admin check, nonce claim before the call, ad cache update only when applied', () => {
  assert.match(L.SQL.context, /code = 'SMC'/); assert.match(L.SQL.context, /has_role\(\$1::uuid, 'admin'::public\.app_role\)/);
  assert.match(L.SQL.context, /JOIN b ON b\.id = ao\.brand_id/); assert.match(L.SQL.context, /c\.status IN \('active', 'extended'\)/);
  assert.match(L.SQL.claim, /ON CONFLICT \(nonce\) DO NOTHING/);
  assert.match(L.SQL.record, /\$2 = 'applied'/); assert.match(L.SQL.record, /kind|'ads_audit'/);
  const ctxNode = WF.nodes.find((n) => n.name.startsWith('Load context'));
  assert.equal(ctxNode.parameters.query, L.SQL.context);
  const mig = readFileSync(join(A, '..', 'supabase', 'migrations', '20261005170000_smc_17_ads_write_log.sql'), 'utf8');
  assert.match(mig, /nonce\s+text NOT NULL UNIQUE/); assert.match(mig, /smc_audit/);
});

// ------------------------------------------------------------------------------------------------ caller
test('auth: no / bad / expired JWT is 401; a non-admin user is 403 before anything else', async () => {
  const none = await run(PARSE, { json: { route: 'confirm', headers: {}, body: {} } });
  assert.equal(none.ok, false); assert.equal(none.status, 401);
  assert.equal((await parse('confirm', {}, jwt() + 'x')).status, 401);
  assert.equal((await parse('confirm', {}, jwt(ADMIN, { exp: 1 }))).status, 401);
  const body = { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' };
  const { d } = await decide('confirm', body, CTX({ is_admin: false, obj: AD1 }), ENV, jwt(OTHER));
  assert.equal(d.status, 403); assert.equal(d.body.code, 'NOT_ADMIN');
  const noSecret = await run(PARSE, { json: { route: 'confirm', headers: { authorization: `Bearer ${jwt()}` }, body }, env: { ...ENV, SUPABASE_JWT_SECRET: '' } });
  assert.equal(noSecret.body.code, 'AUTH_NOT_CONFIGURED');
});

test('confirmed_by / requested_by must be the signed-in user; reason is mandatory; unsupported actions refused', async () => {
  const base = { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' };
  assert.equal((await parse('confirm', { ...base, requested_by: OTHER })).status, 403);
  assert.equal((await parse('budget', { campaign_id: 'CA', daily_budget_zar: 100, confirm_token: 'x.y', confirmed_by: OTHER })).status, 403);
  assert.equal((await parse('confirm', { ...base, reason: 'x' })).body.code, 'AUDIT_WHY');
  assert.equal((await parse('confirm', { ...base, action: 'create_campaign_tree' })).body.code, 'UNSUPPORTED_ACTION');
  assert.equal((await parse('budget', { campaign_id: 'CA', daily_budget_zar: 100 })).body.code, 'CONFIRM_REQUIRED');
  assert.equal((await parse('budget', { campaign_id: 'CA', daily_budget_zar: -5, confirm_token: 'a.b' })).body.code, 'BUDGET_INVALID');
  assert.equal((await parse('ad-status', { ad_id: 'AD1', status: 'DELETED', confirm_token: 'a.b' })).body.code, 'BAD_INPUT');
});

// ------------------------------------------------------------------------------------------------ SortMyCover only
test('target must be a SortMyCover object in the ad cache; brand row must be complete; no brand, no token', async () => {
  const body = { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' };
  assert.equal((await decide('confirm', body, CTX({ obj: null }))).d.body.code, 'TARGET_NOT_FOUND');          // not SMC / not in cache
  assert.equal((await decide('confirm', body, CTX({ obj: { ...AD1, id: 'OTHER' } }))).d.body.code, 'TARGET_NOT_FOUND');
  assert.equal((await decide('confirm', body, CTX({ obj: CAMP_A }))).d.body.code, 'TARGET_NOT_FOUND');         // campaign id used as an ad
  assert.equal((await decide('confirm', body, CTX({ brand: null, obj: AD1 }))).d.body.code, 'BRAND_REQUIRED');
  assert.equal((await decide('confirm', body, CTX({ brand: { ...BRAND, code: 'CK' }, obj: AD1 }))).d.body.code, 'BRAND_NOT_SMC');
  assert.equal((await decide('confirm', body, CTX({ brand: { ...BRAND, ad_account_id: null }, obj: AD1 }))).d.body.code, 'ASSET_MISSING');
  assert.equal((await decide('confirm', body, CTX({ obj: AD1 }))).d.status, 200);
  const odd = await decide('confirm', { action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 100 }, reason: 'why not' }, CTX({ obj: { ...CAMP_A, name: 'Boosted post' } }));
  assert.equal(odd.d.body.code, 'BAD_TARGET');
});

// ------------------------------------------------------------------------------------------------ guardrails, server side
test('guardrails run at preview (no token minted) and report old/new/caps/projection', async () => {
  const ok = await mint({ action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 246.14, setSpendCap: true, goLive: true }, reason: 'go-live broker b1' });
  assert.ok(ok.confirm_token && ok.expires_at);
  assert.equal(ok.preview.daily_budget_old_zar, 20); assert.equal(ok.preview.daily_budget_new_zar, 246.14); assert.equal(ok.preview.cycle_cap_zar, 7384.35);
  assert.equal(ok.preview.billed_incl_vat_per_day_zar, 283.06); assert.equal(ok.preview.go_live_share_zar, 8492); assert.equal(ok.preview.projected_cycle_spend_zar, 7384.2);
  const bud = (daily, extra = {}, ctx) => decide('confirm', { action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: daily, setSpendCap: true, ...extra }, reason: 'testing guardrails' }, ctx || CTX()).then((x) => x.d);
  assert.equal((await bud(246.14)).body.code, 'STEP_LIMIT');                 // R20 -> R246 without go-live is a +1130% step
  assert.equal((await bud(10, {}, CTX({ obj: { ...CAMP_A, daily_budget_zar: 50 } }))).body.code, 'BUDGET_BELOW_MIN');
  assert.equal((await bud(400, { goLive: true })).body.code, 'DAILY_CAP');   // cap = R7,384.35 / 30 x 1.2 = R295.37
  const mid = CTX({ obj: { ...CAMP_A, daily_budget_zar: 246 }, spend_to_date: 5000, cycle_end: new Date(Date.now() + 20 * 864e5).toISOString() });
  assert.equal((await bud(250, {}, mid)).body.code, 'MONTHLY_CAP'); // 5,000 + 250 x 20 > R7,384
  const recent = CTX({ obj: { ...CAMP_A, daily_budget_zar: 200, last_budget_change_at: new Date(Date.now() - 3600e3).toISOString() } });
  assert.equal((await bud(230, {}, recent)).body.code, 'STEP_COOLDOWN');
  assert.equal((await bud(150, {}, recent)).status, 200);                    // decreases are never step-limited
  assert.equal((await bud(100, {}, CTX({ shares: [] }))).body.code, 'DAILY_CAP'); // no active broker: both caps are R0, so no raise
});

test('go-live: the share comes from the cycles row; a browser-sent share is ignored; only Campaign A; needs an active cycle', async () => {
  const f = await budgetFlow({ browserShare: 999999 });
  assert.equal(f.d.mode, 'apply'); assert.equal(f.d.plan.params.goLiveShareZar, 8492);
  const r = await f.run();
  assert.equal(r.shaped.status, 200); assert.equal(f.graph.calls.length, 1);
  const q = new URLSearchParams(f.graph.calls[0].init.body);
  assert.equal(q.get('daily_budget'), '24614'); assert.equal(q.get('spend_cap'), '738435');
  assert.ok(f.graph.calls[0].url.endsWith('/CA')); assert.equal(f.graph.calls[0].init.headers.authorization, 'Bearer TOK_SECRET');
  // two active brokers: the newest cycle's share is the go-live share
  const two = CTX({ obj: { ...CAMP_A, daily_budget_zar: 246.14 }, shares: [{ broker_id: 'b1', share: 8492, starts_at: '2026-10-01T00:00:00Z' }, { broker_id: 'b2', share: 12738, starts_at: '2026-11-01T00:00:00Z' }] });
  const m2 = await mint({ action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 615.35, setSpendCap: true, goLive: true }, reason: 'go-live broker b2' }, two);
  assert.equal(m2.preview.go_live_share_zar, 12738);
  // raise bigger than that broker's share is refused even with go_live
  const big = await decide('confirm', { action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 700, setSpendCap: true, goLive: true }, reason: 'too big' }, two);
  assert.ok(['GO_LIVE_EXCEEDS_SHARE', 'DAILY_CAP', 'MONTHLY_CAP'].includes(big.d.body.code), big.d.body.code);
  assert.equal((await decide('confirm', { action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 246, goLive: true }, reason: 'no cycle' }, CTX({ shares: [] }))).d.body.code, 'GO_LIVE_NO_ACTIVE_CYCLE');
  const b = CTX({ obj: { ...CAMP_A, id: 'CB', name: 'SMC_B_LEADS-WEB_ZA_c1' } });
  assert.equal((await decide('confirm', { action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 100, goLive: true }, reason: 'go-live on B' }, b)).d.body.code, 'TARGET_NOT_FOUND');
  const bb = CTX({ obj: { ...CAMP_A, id: 'CB', name: 'SMC_B_LEADS-WEB_ZA_c1' } });
  assert.equal((await decide('confirm', { action: 'set_campaign_budget', target: 'CB', params: { dailyBudgetZar: 100, goLive: true }, reason: 'go-live on B' }, bb)).d.body.code, 'GO_LIVE_ONLY_A');
});

test('caps are per broker cycle: spend counts from the cycle start, days run to the cycle end; no cycle uses the warm-up rules', async () => {
  assert.match(L.SQL.context, /AS spend_to_date/); assert.match(L.SQL.context, /min\(c\.starts_at\)/); assert.doesNotMatch(L.SQL.context, /date_trunc\('month'/);
  const bud = (daily, ctx, key = 'CA') => decide('confirm', { action: 'set_campaign_budget', target: key, params: { dailyBudgetZar: daily, setSpendCap: true }, reason: 'cycle caps' }, ctx).then((x) => x.d);
  // 5,000 spent this cycle, 20 days left: 250/day projects past the R7,384 cycle cap; a fresh cycle (spend counted from its start) allows R246.1
  const base = { obj: { ...CAMP_A, daily_budget_zar: 246 } };
  assert.equal((await bud(250, CTX({ ...base, spend_to_date: 5000, cycle_end: new Date(Date.now() + 20 * 864e5).toISOString() }))).body.code, 'MONTHLY_CAP');
  const fresh = await bud(246.1, CTX({ ...base, spend_to_date: 0, cycle_end: new Date(Date.now() + 29.5 * 864e5).toISOString() }));
  assert.equal(fresh.status, 200); assert.equal(fresh.body.preview.days_remaining, 30); assert.equal(fresh.body.preview.cycle_spend_zar, 0);
  // warm-up Reach has no cycle: R350 total over 7 days
  const W = { id: 'CW', level: 'campaign', campaign_id: 'CW', name: 'SMC_W_REACH_ZA_warmup', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget_zar: 50, last_budget_change_at: null };
  const day3 = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const wctx = (o) => CTX({ obj: W, shares: [], cycle_end: null, first_spend_date: day3, ...o });
  assert.equal((await bud(50, wctx({ spend_to_date: 150 }), 'CW')).status, 200);          // 150 + 50 x 4 = 350
  assert.equal((await bud(55, wctx({ spend_to_date: 150 }), 'CW')).body.code, 'MONTHLY_CAP'); // 150 + 55 x 4 = 370 > R350
});

// ------------------------------------------------------------------------------------------------ confirm token
test('two-step: nothing is sent at preview; apply sends once; token bound to server params, single use (DB claim), expiring', async () => {
  const f = await budgetFlow({ daily: 246.14 });
  assert.equal(f.graph.calls.length, 0, 'preview sends nothing');
  const r = await f.run();
  assert.equal(r.applied.applied.ok, true); assert.equal(f.graph.calls.length, 1);
  const rec = r.shaped.record;
  assert.equal(rec[0], 'LOG1'); assert.equal(rec[1], 'applied'); assert.equal(rec[5], 246.14); assert.equal(rec[6], 7384.35); assert.equal(rec[7], null);
  assert.match(rec[8], /^ads_write:set_campaign_budget:CA:/);
  const audit = JSON.parse(rec[2]).audit[0];
  assert.equal(audit.actor_uid, ADMIN); assert.equal(audit.requested_by, ADMIN); assert.equal(audit.reason, 'go-live broker b1'); assert.equal(audit.action, 'set_campaign_budget');
  assert.equal(JSON.parse(rec[10]).by, ADMIN);
  // claim lost (nonce already in ads_write_log): CONFIRM_REUSED, no Graph call
  const g2 = graphMock(); const f2 = await budgetFlow({ graph: g2 });
  const lost = await run('Claimed?', { json: {}, refs: { [DECIDE]: f2.d } });
  assert.equal(lost.status, 409); assert.equal(lost.body.code, 'CONFIRM_REUSED'); assert.equal(g2.calls.length, 0);
  assert.equal(ifBranch(WF, 'Token claimed?', { json: lost }), false);
  assert.equal(ifBranch(WF, 'Token claimed?', { json: await run('Claimed?', { json: { log_id: 'L' }, refs: { [DECIDE]: f2.d } }) }), true);
  // numbers changed after preview
  const c = await mint({ action: 'set_campaign_budget', target: 'CA', params: { dailyBudgetZar: 246.14, setSpendCap: true, goLive: true }, reason: 'go-live broker b1' });
  const swapped = await decide('budget', { campaign_id: 'CA', daily_budget_zar: 240, set_spend_cap: true, go_live: true, confirm_token: c.confirm_token, confirmed_by: ADMIN });
  assert.equal(swapped.d.body.code, 'CONFIRM_MISMATCH');
  // go_live flag flipped after preview
  const flip = await decide('budget', { campaign_id: 'CA', daily_budget_zar: 246.14, set_spend_cap: true, go_live: false, confirm_token: c.confirm_token, confirmed_by: ADMIN });
  assert.ok(['CONFIRM_MISMATCH', 'STEP_LIMIT'].includes(flip.d.body.code));
  // a token for another target
  const otherTarget = await decide('budget', { campaign_id: 'CA', daily_budget_zar: 246.14, set_spend_cap: true, go_live: true, confirm_token: c.confirm_token + 'x', confirmed_by: ADMIN });
  assert.equal(otherTarget.d.body.code, 'CONFIRM_INVALID');
  // shares changed between preview and apply: the cap in the bound params moved, so the token no longer matches
  const moved = await decide('budget', { campaign_id: 'CA', daily_budget_zar: 246.14, set_spend_cap: true, go_live: true, confirm_token: c.confirm_token, confirmed_by: ADMIN },
    CTX({ shares: [{ broker_id: 'b1', share: 8492, starts_at: 'a' }, { broker_id: 'b2', share: 12738, starts_at: 'b' }] }));
  assert.ok(['CONFIRM_MISMATCH', 'GO_LIVE_EXCEEDS_SHARE'].includes(moved.d.body.code), moved.d.body.code);
  // expired
  const realNow = Date.now; Date.now = () => realNow() + 16 * 60 * 1000;
  try { assert.equal((await decide('budget', { campaign_id: 'CA', daily_budget_zar: 246.14, set_spend_cap: true, go_live: true, confirm_token: c.confirm_token, confirmed_by: ADMIN }, CTX(), ENV, jwt())).d.body.code, 'CONFIRM_EXPIRED'); } finally { Date.now = realNow; }
  // an apply with no token / a token for the wrong action
  const pauseTok = (await mint({ action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' }, CTX({ obj: AD1 }))).confirm_token;
  assert.equal((await decide('ad-status', { ad_id: 'AD1', status: 'ACTIVE', confirm_token: pauseTok, confirmed_by: ADMIN }, CTX({ obj: AD1 }))).d.body.code, 'CONFIRM_MISMATCH');
});

test('pause / resume ad and campaign: confirm then apply, status cache updated, audit rows', async () => {
  for (const [route, action, obj, body, status] of [
    ['ad-status', 'pause_ad', AD1, { ad_id: 'AD1', status: 'PAUSED' }, 'PAUSED'],
    ['ad-status', 'resume_ad', { ...AD1, status: 'PAUSED', effective_status: 'PAUSED' }, { ad_id: 'AD1', status: 'ACTIVE' }, 'ACTIVE'],
    ['campaign-status', 'pause_campaign', CAMP_A, { campaign_id: 'CA', status: 'PAUSED' }, 'PAUSED'],
    ['campaign-status', 'resume_campaign', CAMP_A, { campaign_id: 'CA', status: 'ACTIVE' }, 'ACTIVE'],
  ]) {
    const ctx = CTX({ obj });
    const c = await mint({ action, target: obj.id, params: { status }, reason: `test ${action}` }, ctx);
    const { d } = await decide(route, { ...body, confirm_token: c.confirm_token, confirmed_by: ADMIN }, ctx);
    assert.equal(d.mode, 'apply', JSON.stringify(d));
    const graph = graphMock();
    const claimed = await run('Claimed?', { json: { log_id: 'L9' }, refs: { [DECIDE]: d } });
    const applied = await run('Apply at Meta (system user token; ADS_DRY_RUN sends nothing)', { json: claimed, fetchImpl: graph.fetchImpl });
    const shaped = await run('Shape response + DB record', { json: applied });
    assert.equal(shaped.status, 200); assert.equal(graph.calls.length, 1);
    assert.equal(new URLSearchParams(graph.calls[0].init.body).get('status'), status);
    assert.ok(graph.calls[0].url.endsWith(`/${obj.id}`));
    assert.equal(shaped.record[7], status); assert.equal(shaped.record[5], null);
    assert.equal(shaped.body.audit[0].action, action);
  }
  // a disapproved ad cannot be resumed
  const dis = await decide('confirm', { action: 'resume_ad', target: 'AD1', params: { status: 'ACTIVE' }, reason: 'try again' }, CTX({ obj: { ...AD1, status: 'PAUSED', effective_status: 'DISAPPROVED' } }));
  assert.equal(dis.d.body.code, 'BAD_TARGET');
});

// ------------------------------------------------------------------------------------------------ Meta side
test('Meta errors are surfaced, the token stays spent, rate-limit back-off persists across runs', async () => {
  const graph = graphMock(() => ({ status: 400, body: { error: { message: 'Invalid parameter', code: 100, fbtrace_id: 'F1' } } }));
  const f = await budgetFlow({ graph });
  const r = await f.run();
  assert.equal(r.shaped.body.ok, false); assert.equal(r.shaped.body.code, 'API_ERROR'); assert.equal(r.shaped.status, 502);
  assert.equal(r.shaped.record[1], 'failed'); assert.equal(r.shaped.record[5], null, 'ad cache untouched on failure');
  // usage >= 80% sets a back-off that the next webhook run honours before minting anything
  const hot = graphMock(() => ({ body: { success: true }, headers: { 'x-business-use-case-usage': JSON.stringify({ 1: [{ type: 'ads_management', call_count: 85, total_cputime: 1, total_time: 1, estimated_time_to_regain_access: 4 }] }) } }));
  const f2 = await budgetFlow({ graph: hot });
  const r2 = await f2.run();
  assert.equal(r2.shaped.status, 200);
  assert.ok(SD.metaBlockedUntil > Date.now(), 'Apply node stored the back-off');
  const blocked = await decide('confirm', { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' }, CTX({ obj: AD1 }));
  assert.equal(blocked.d.status, 429); assert.equal(blocked.d.body.code, 'RATE_LIMIT_BACKOFF'); assert.ok(blocked.d.body.retry_after_ms > 0);
  delete SD.metaBlockedUntil;
  // no system user token yet (no ad account): clear 503, nothing sent
  const g3 = graphMock(); const f3 = await budgetFlow({ graph: g3, env: { ...ENV, META_SYSTEM_USER_TOKEN: '' } });
  const r3 = await f3.run();
  assert.equal(r3.shaped.status, 503); assert.equal(r3.shaped.body.code, 'NO_TOKEN'); assert.equal(g3.calls.length, 0);
});

test('ADS_DRY_RUN: everything is validated and logged, nothing is sent, the cache is not touched', async () => {
  const env = { ...ENV, ADS_DRY_RUN: 'true' }; const graph = graphMock();
  const f = await budgetFlow({ env, graph }); const r = await f.run();
  assert.equal(r.shaped.status, 200); assert.equal(r.shaped.body.dry_run, true); assert.equal(graph.calls.length, 0);
  assert.equal(r.shaped.record[1], 'dry_run'); assert.equal(r.shaped.record[5], null);
});

test('no META_CONFIRM_SECRET: refuses to mint (503) rather than minting an unsigned token', async () => {
  const { d } = await decide('confirm', { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule' }, CTX({ obj: AD1 }), { ...ENV, META_CONFIRM_SECRET: '' });
  assert.equal(d.status, 503); assert.equal(d.body.code, 'CONFIRM_SECRET_MISSING');
});

test('console contract: the Ads screen payloads match what the webhooks read', () => {
  const ui = readFileSync(join(A, '..', 'src', 'pages', 'smc', 'Ads.tsx'), 'utf8');
  for (const hook of ['ads-confirm', 'ads-budget', 'ads-ad-status', 'ads-campaign-status']) assert.ok(ui.includes(`"${hook}"`), hook);
  for (const field of ['campaign_id', 'daily_budget_zar', 'set_spend_cap', 'confirm_token', 'confirmed_by', 'go_live', 'ad_id', 'requested_by', 'reason']) assert.ok(ui.includes(field), field);
});
