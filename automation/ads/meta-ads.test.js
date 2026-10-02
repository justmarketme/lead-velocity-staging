'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const M = require('./meta-ads.js');

const SECRET = 'test-secret-0123456789abcdef';
const hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Mock fetch: handler(url, init) -> {status, body, headers}. Records every call.
function mock(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const r = await handler(url, init, calls.length);
    return { ok: (r.status || 200) < 400, status: r.status || 200, headers: r.headers || {}, json: async () => r.body };
  };
  return { fetchImpl, calls };
}
function client(handler, extra = {}) {
  const m = mock(handler);
  let t = 1_000_000_000_000;
  const c = M.createClient({ token: 'TOK_SECRET', fetchImpl: m.fetchImpl, confirmSecret: SECRET, sleep: async () => {}, now: () => t, maxRetries: 3, ...extra });
  return { c, calls: m.calls, advance: (ms) => { t += ms; } };
}
const bucHeader = (pct, regainMin = 0) => ({ 'x-business-use-case-usage': JSON.stringify({ 123: [{ type: 'ads_insights', call_count: pct, total_cputime: 1, total_time: 2, estimated_time_to_regain_access: regainMin }] }) });
const tap = (c, over) => c.requestConfirm({ requestedBy: 'jonathan', reason: 'unit test', ...over });

test('usage header parsing and 80% back-off decision', () => {
  assert.equal(M.parseUsage(bucHeader(79)).pct, 79);
  assert.equal(M.decideBackoff(M.parseUsage(bucHeader(79))).backoff, false);
  const d80 = M.decideBackoff(M.parseUsage(bucHeader(80, 3)));
  assert.equal(d80.backoff, true);
  assert.equal(d80.waitMs, 3 * 60000); // Meta's own regain time wins over the 60 s default
  assert.equal(M.decideBackoff(M.parseUsage(bucHeader(80))).waitMs, 60000);
  assert.ok(M.decideBackoff(M.parseUsage(bucHeader(96))).waitMs >= 300000);
  assert.equal(M.parseUsage({ 'x-ad-account-usage': '{"acc_id_util_pct":91,"reset_time_duration":120}' }).pct, 91);
  assert.equal(M.parseUsage({ get: (n) => (n === 'x-app-usage' ? '{"call_count":85}' : null) }).pct, 85);
  assert.equal(M.parseUsage({}).pct, 0);
});

test('request sends token as Bearer header (never in URL), backs off after 80%, surfaces retryAfter when too long', async () => {
  const { c, calls } = client(() => ({ body: { ok: 1 }, headers: bucHeader(85, 10) }));
  await c.request('GET', 'me');
  assert.ok(!calls[0].url.includes('TOK_SECRET'));
  assert.equal(calls[0].init.headers.authorization, 'Bearer TOK_SECRET');
  await assert.rejects(() => c.request('GET', 'me'), (e) => e.code === 'RATE_LIMIT_BACKOFF' && e.retryAfterMs > 30000);
  assert.equal(calls.length, 1, 'no second HTTP call while backed off');
});

test('short back-off sleeps inline and then proceeds', async () => {
  const slept = [];
  const m = mock(() => ({ body: { ok: 1 }, headers: bucHeader(82, 0) }));
  let t = 0;
  const c = M.createClient({ token: 'T', fetchImpl: m.fetchImpl, sleep: async (ms) => { slept.push(ms); t += ms; }, now: () => t, confirmSecret: SECRET, maxInlineWaitMs: 120000 });
  await c.request('GET', 'a'); await c.request('GET', 'b');
  assert.deepEqual(slept, [60000]);
  assert.equal(m.calls.length, 2);
});

test('retries 5xx with exponential back-off, fails fast on 4xx, token redacted in errors', async () => {
  let n = 0;
  const { c, calls } = client(() => (++n < 3 ? { status: 500, body: { error: { message: 'boom TOK_SECRET', code: 2 } } } : { body: { id: '1' } }));
  assert.equal((await c.request('GET', 'x')).data.id, '1');
  assert.equal(calls.length, 3);
  const bad = client(() => ({ status: 400, body: { error: { message: 'bad TOK_SECRET', code: 100 } } }));
  await assert.rejects(() => bad.c.request('GET', 'x'), (e) => !e.message.includes('TOK_SECRET') && e.code === 'API_ERROR');
  assert.equal(bad.calls.length, 1);
});

test('batch chunks to <= 50 calls and keeps order', async () => {
  const { c, calls } = client((url, init) => {
    const params = new URLSearchParams(init.body);
    const arr = JSON.parse(params.get('batch'));
    return { body: arr.map((x, i) => (x.relative_url.endsWith('/7') ? { code: 400, body: JSON.stringify({ error: { message: 'no' } }) } : { code: 200, body: JSON.stringify({ id: x.relative_url }) })) };
  });
  const input = Array.from({ length: 120 }, (_, i) => ({ method: 'GET', relative_url: 'n/' + i }));
  const out = await c.batch(input);
  assert.deepEqual(calls.map((x) => JSON.parse(new URLSearchParams(x.init.body).get('batch')).length), [50, 50, 20]);
  assert.equal(out.length, 120);
  assert.equal(out[119].body.id, 'n/119');
  assert.equal(out[7].ok, false);
  assert.equal(out[8].ok, true);
});

test('confirm token: required, bound to params, single-use, expires, needs human', async () => {
  const { c, calls, advance } = client(() => ({ body: { success: true } }));
  const caps = { dailyCapZar: 500, monthlyCapZar: 12000 };
  const base = { campaignId: 'C1', dailyBudgetZar: 350, caps, goLive: true, currentDailyBudgetZar: 0 };
  await assert.rejects(() => c.setCampaignBudget(base), (e) => e.code === 'CONFIRM_REQUIRED');
  const p = { dailyBudgetZar: 350, setSpendCap: false, monthlyCapZar: 12000 };
  const t1 = tap(c, { action: 'set_campaign_budget', target: 'C1', params: p }).confirmToken;
  await assert.rejects(() => c.setCampaignBudget({ ...base, confirmToken: t1 }), (e) => e.code === 'CONFIRM_REQUIRED', 'confirmedBy missing');
  await assert.rejects(() => c.setCampaignBudget({ ...base, dailyBudgetZar: 351, confirmToken: t1, confirmedBy: 'jonathan' }), (e) => e.code === 'CONFIRM_MISMATCH');
  await assert.rejects(() => c.setCampaignBudget({ ...base, confirmToken: t1 + 'x', confirmedBy: 'jonathan' }), (e) => e.code === 'CONFIRM_INVALID');
  assert.equal(calls.length, 0, 'nothing sent before a valid confirm');
  const r = await c.setCampaignBudget({ ...base, confirmToken: t1, confirmedBy: 'jonathan' });
  assert.equal(r.ok, true);
  assert.equal(new URLSearchParams(calls[0].init.body).get('daily_budget'), '35000'); // rand -> cents
  await assert.rejects(() => c.setCampaignBudget({ ...base, confirmToken: t1, confirmedBy: 'jonathan' }), (e) => e.code === 'CONFIRM_REUSED');
  const t2 = tap(c, { action: 'set_campaign_budget', target: 'C1', params: p, ttlMs: 1000 }).confirmToken;
  advance(2000);
  await assert.rejects(() => c.setCampaignBudget({ ...base, confirmToken: t2, confirmedBy: 'jonathan' }), (e) => e.code === 'CONFIRM_EXPIRED');
  assert.throws(() => c.requestConfirm({ action: 'a', target: 't', reason: 'x y z' }), (e) => e.code === 'AUDIT_WHO');
  assert.throws(() => c.requestConfirm({ action: 'a', target: 't', requestedBy: 'j', reason: '' }), (e) => e.code === 'AUDIT_WHY');
});

test('write returns audit_log + ops.notifications rows with who/when/why', async () => {
  const { c } = client(() => ({ body: { success: true } }));
  const confirmToken = tap(c, { action: 'pause_ad', target: 'AD1', params: { status: 'PAUSED' }, reason: 'kill rule: R3,000 spent, 0 qualified' }).confirmToken;
  const r = await c.pauseAd({ adId: 'AD1', confirmToken, confirmedBy: 'kg' });
  assert.equal(r.audit[0].actor_uid, 'kg');
  assert.equal(r.audit[0].reason, 'kill rule: R3,000 spent, 0 qualified');
  assert.equal(r.audit[0].requested_by, 'jonathan');
  assert.equal(r.audit[0].action, 'pause_ad');
  assert.ok(r.audit[0].at);
  assert.equal(r.notifications[0].kind, 'ads_audit'); assert.equal(r.notifications[0].channel, 'console'); assert.equal(typeof r.notifications[0].body, 'object');
});

test('budget caps: daily cap, monthly cap (sum of media shares), minimum, 20% step and 48 h cooldown', () => {
  const { c } = client(() => ({ body: {} }));
  const caps = { dailyCapZar: 400, monthlyCapZar: 10500 };
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 401, caps }), (e) => e.code === 'DAILY_CAP');
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 360, caps }), (e) => e.code === 'MONTHLY_CAP'); // 360 x 30 = 10,800 > 10,500
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 350, caps, monthSpendToDateZar: 3000, daysRemaining: 25 }), (e) => e.code === 'MONTHLY_CAP'); // 3000 + 8750
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: 350, caps, monthSpendToDateZar: 3000, daysRemaining: 20 }));
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 1, caps }), (e) => e.code === 'BUDGET_BELOW_MIN');
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 350 }), (e) => e.code === 'CAP_MISSING');
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 300, currentDailyBudgetZar: 200, caps }), (e) => e.code === 'STEP_LIMIT');
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: 240, currentDailyBudgetZar: 200, caps }));
  const T0 = 1_000_000_000_000; // the mock clock
  assert.throws(() => c.checkBudget({ dailyBudgetZar: 240, currentDailyBudgetZar: 200, caps, lastChangeAt: new Date(T0 - 3600e3).toISOString() }), (e) => e.code === 'STEP_COOLDOWN');
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: 240, currentDailyBudgetZar: 200, caps, lastChangeAt: new Date(T0 - 72 * 3600e3).toISOString() }));
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: 350, currentDailyBudgetZar: 0, goLive: true, caps })); // go-live raise from R0
  assert.doesNotThrow(() => c.checkBudget({ dailyBudgetZar: 100, currentDailyBudgetZar: 350, caps })); // decreases are never step-limited
});

test('cap is enforced even with a valid token (nothing sent)', async () => {
  const { c, calls } = client(() => ({ body: {} }));
  const caps = { dailyCapZar: 300, monthlyCapZar: 10500 };
  const confirmToken = tap(c, { action: 'set_campaign_budget', target: 'C1', params: { dailyBudgetZar: 350, setSpendCap: false, monthlyCapZar: 10500 } }).confirmToken;
  await assert.rejects(() => c.setCampaignBudget({ campaignId: 'C1', dailyBudgetZar: 350, caps, confirmToken, confirmedBy: 'j', goLive: true }), (e) => e.code === 'DAILY_CAP');
  assert.equal(calls.length, 0);
});

test('naming convention C{concept}_{angle}_{format}_{date}', () => {
  assert.equal(M.buildAdName({ concept: 1, angle: 'H1', format: 'sta-amb', date: '2026-10-15' }), 'C01_H1_sta-amb_20261015');
  assert.equal(M.buildAdName({ concept: '02', angle: 'H3', format: 'vid-teal', date: new Date('2026-10-15T08:00:00Z') }), 'C02_H3_vid-teal_20261015');
  assert.deepEqual(M.parseAdName('C01_H1_sta-amb_20261015'), { concept: '01', angle: 'H1', format: 'sta-amb', date: '20261015' });
  assert.equal(M.parseAdName('my ad'), null);
  assert.throws(() => M.buildAdName({ concept: 1, angle: 'H_1', format: 'sta', date: '20261015' }), (e) => e.code === 'BAD_NAME');
  assert.throws(() => M.buildAdName({ concept: 1, angle: 'H1', format: 'Static', date: '20261015' }), (e) => e.code === 'BAD_NAME');
  assert.equal(M.campaignName({ key: 'A', objective: 'LEADS-IF', cycle: 1 }), 'SMC_A_LEADS-IF_ZA_c1');
  assert.equal(M.adsetName({ key: 'A' }), 'SMC_A_BROAD_ZA_35-50');
});

const SPEC = () => ({
  brand: { ad_account_id: '999', page_id: 'P1', ig_user_id: 'IG1' }, date: '20261015', cycle: 1,
  campaigns: [
    { key: 'A', objective_tag: 'LEADS-IF', special_ad_categories: [], adsets: [{ key: 'broad', name: 'SMC_A_BROAD_ZA_35-50', targeting: { geo_locations: { countries: ['ZA'] }, age_min: 35, age_max: 50 },
      ads: [
        { concept: 1, angle: 'H1', format: 'sta-amb', form_id: 'F1', creative: { primary_text: 'p', headline: 'h', description: 'd', image_hash: 'abc' } },
        { concept: 1, angle: 'H1', format: 'vid-amb', form_id: 'F1', creative: { video_id: 'V1', primary_text: 'p', headline: 'h' } },
        { concept: 2, angle: 'H3', format: 'vid-amb', form_id: 'F1', creative_id: 'EXISTING' }] }] },
    { key: 'B', objective_tag: 'LEADS-WEB', special_ad_categories: [], adsets: [{ key: 'b1', name: 'SMC_B_BROAD_ZA_35-50', ads: [] }] },
  ],
});

test('spec -> tree mapping: everything PAUSED at minimum budget, names by convention, 4 batched phases', async () => {
  const plan = M.planCampaignTree(SPEC());
  assert.equal(plan.campaigns.length, 2); assert.equal(plan.adsets.length, 2); assert.equal(plan.ads.length, 3);
  assert.ok([...plan.campaigns, ...plan.adsets, ...plan.ads].every((x) => x.body.status === 'PAUSED'));
  assert.equal(plan.campaigns[0].body.name, 'SMC_A_LEADS-IF_ZA_c1');
  assert.equal(plan.campaigns[0].body.objective, 'OUTCOME_LEADS');
  assert.equal(plan.campaigns[0].body.daily_budget, M.zarToMinor(20));
  assert.equal(plan.campaigns[0].body.bid_strategy, 'LOWEST_COST_WITHOUT_CAP');
  assert.equal(plan.adsets[0].body.optimization_goal, 'LEAD_GENERATION');
  assert.deepEqual(plan.ads.map((a) => a.body.name), ['C01_H1_sta-amb_20261015', 'C01_H1_vid-amb_20261015', 'C02_H3_vid-amb_20261015']);
  assert.equal(plan.ads[0].creativeBody.object_story_spec.link_data.call_to_action.type, 'LEARN_MORE');
  assert.equal(plan.ads[0].creativeBody.object_story_spec.link_data.call_to_action.value.lead_gen_form_id, 'F1');
  assert.ok(plan.ads[1].creativeBody.object_story_spec.video_data);
  assert.equal(plan.ads[2].creativeBody, undefined);

  let id = 0; const seen = [];
  const { c, calls } = client((url, init) => {
    const arr = JSON.parse(new URLSearchParams(init.body).get('batch'));
    return { body: arr.map((x) => { seen.push(x.relative_url); return { code: 200, body: JSON.stringify({ id: 'id' + (++id) }) }; }) };
  });
  const confirmToken = tap(c, { action: 'create_campaign_tree', target: 'act_999', params: { specHash: hex(JSON.stringify(SPEC())) } }).confirmToken;
  // spec hash uses stable key ordering inside the client, so mint with the client's own hash by calling through a wrapper:
  await assert.rejects(() => c.createCampaignTree(SPEC(), { confirmToken, confirmedBy: 'j' }), (e) => e.code === 'CONFIRM_MISMATCH'); // wrong hash -> refused
  assert.equal(calls.length, 0);
  // proper mint: params must carry the stable hash
  const stable = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => { a[x] = v[x]; return a; }, {}) : v));
  const tok = tap(c, { action: 'create_campaign_tree', target: 'act_999', params: { specHash: hex(stable(SPEC())) } }).confirmToken;
  const r = await c.createCampaignTree(SPEC(), { confirmToken: tok, confirmedBy: 'j' });
  assert.equal(r.result.campaigns.length, 2); assert.equal(r.result.ads.length, 3); assert.equal(r.result.creatives.length, 2);
  assert.equal(calls.length, 4); // campaigns, adsets, creatives, ads: one batch each
  assert.ok(seen.slice(0, 2).every((u) => u === 'act_999/campaigns'));
  const adBatch = JSON.parse(new URLSearchParams(calls[3].init.body).get('batch'));
  assert.equal(new URLSearchParams(adBatch[0].body).get('status'), 'PAUSED');
});

test('spec guards: special ad category must be explicit, no interest stacking, no Get-quote CTA, bad ad name', () => {
  const s1 = SPEC(); delete s1.campaigns[0].special_ad_categories;
  assert.throws(() => M.planCampaignTree(s1), (e) => e.code === 'SPECIAL_AD_CATEGORY_UNDECIDED');
  const s2 = SPEC(); s2.campaigns[0].adsets[0].targeting.flexible_spec = [{ interests: [] }];
  assert.throws(() => M.planCampaignTree(s2), (e) => e.code === 'INTEREST_TARGETING');
  const s3 = SPEC(); s3.campaigns[0].adsets[0].ads[0].creative.cta = { type: 'GET_QUOTE' };
  assert.throws(() => M.planCampaignTree(s3), (e) => e.code === 'BAD_CTA');
  const s4 = SPEC(); s4.campaigns[0].adsets[0].ads[0] = { name: 'Summer promo', creative_id: 'x' };
  assert.throws(() => M.planCampaignTree(s4), (e) => e.code === 'BAD_NAME');
});

test('insights: hourly guard, pagination, ad_metrics mapping', async () => {
  let page = 0;
  const { c, calls, advance } = client((url) => {
    page++;
    if (page === 1) return { body: { data: [{ ad_id: 'A1', ad_name: 'C01_H1_sta-amb_20261015', date_start: '2026-10-16', spend: '120.50', impressions: '1000', clicks: '30', actions: [{ action_type: 'lead', value: '5' }, { action_type: 'video_view', value: '300' }] }], paging: { next: 'https://graph.facebook.com/v23.0/next-page' } } };
    return { body: { data: [{ ad_id: 'A2', ad_name: 'x', date_start: '2026-10-16', spend: '0', impressions: '0', actions: [] }] } };
  });
  const r = await c.getInsights({ adAccountId: '999', level: 'ad', datePreset: 'last_3d' });
  assert.equal(r.rows.length, 2); assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes('act_999/insights') && calls[0].url.includes('time_increment=1'));
  await assert.rejects(() => c.getInsights({ adAccountId: '999', level: 'ad', datePreset: 'last_3d' }), (e) => e.code === 'TOO_SOON');
  await assert.rejects(() => c.getInsights({ adAccountId: '999', level: 'ad', datePreset: 'last_3d', lastFetchedAt: new Date(Date.now()).toISOString() }), (e) => e.code === 'TOO_SOON');
  advance(56 * 60000); page = 0;
  await c.getInsights({ adAccountId: '999', level: 'ad', datePreset: 'last_3d' });
  const rows = M.insightsToAdMetrics(r.rows, { brandId: 'b1' });
  assert.equal(rows[0].spend_zar, 120.5); assert.equal(rows[0].leads_raw, 5); assert.equal(rows[0].cpl, 24.1);
  assert.equal(rows[0].concept, '01'); assert.equal(rows[0].hook_rate, 0.3); assert.equal(rows[1].cpl, null);
  assert.equal(rows[0].placement, 'all'); assert.equal(M.insightsToAdMetrics([{ ad_id: 'A3', date_start: '2026-10-16', publisher_platform: 'instagram' }])[0].placement, 'instagram');
});

test('customer-list audience accepts hashed rows only', async () => {
  const { c, calls } = client(() => ({ body: { id: 'AUD1' } }));
  const schema = ['PHONE', 'EMAIL'];
  const tok = () => tap(c, { action: 'create_customer_list_audience', target: 'act_9', params: { name: 'SMC_EXC_leads_90d', rows: 1 } }).confirmToken;
  await assert.rejects(() => c.createCustomerListAudience({ adAccountId: '9', name: 'SMC_EXC_leads_90d', schema, hashedRows: [['27821234567', '']], confirmToken: tok(), confirmedBy: 'j' }), (e) => e.code === 'RAW_PII_REJECTED');
  assert.equal(calls.length, 0);
  const r = await c.createCustomerListAudience({ adAccountId: '9', name: 'SMC_EXC_leads_90d', schema, hashedRows: [[hex('27821234567'), '']], confirmToken: tok(), confirmedBy: 'j' });
  assert.equal(r.result.audience.id, 'AUD1');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes('AUD1/users'));
});

test('lookalike seed gate and ratio', async () => {
  const { c } = client(() => ({ body: { id: 'L1' } }));
  const mint = (ratio) => tap(c, { action: 'create_lookalike', target: 'act_9', params: { seedId: 'S1', ratio, country: 'ZA' } }).confirmToken;
  await assert.rejects(() => c.createLookalike('S1', 0.01, { adAccountId: '9', seedSize: 400, confirmToken: mint(0.01), confirmedBy: 'j' }), (e) => e.code === 'SEED_TOO_SMALL');
  await assert.rejects(() => c.createLookalike('S1', 0.5, { adAccountId: '9', seedSize: 4000, confirmToken: mint(0.5), confirmedBy: 'j' }), (e) => e.code === 'BAD_INPUT');
  const r = await c.createLookalike('S1', 0.01, { adAccountId: '9', seedSize: 1200, confirmToken: mint(0.01), confirmedBy: 'j' });
  assert.equal(r.result.id, 'L1');
});

test('leadgen form fails closed on unfilled placeholders and strips underscore keys', () => {
  const ok = { page_id: 'P1', _meta: { x: 1 }, name: 'F', questions: [{ type: 'FULL_NAME' }], privacy_policy: { url: 'https://sortmycover.co.za/privacy' } };
  const p = M.planLeadgenForm(ok);
  assert.equal(p.pageId, 'P1'); assert.equal(p._meta, undefined); assert.ok(!('_meta' in p.body));
  assert.throws(() => M.planLeadgenForm({ ...ok, custom_disclaimer: { body: 'share with {practice_name} (FSP {fsp_number})' } }), (e) => e.code === 'PLACEHOLDER_LEFT');
});

test('lead normalisation, webhook parsing, signature verification', () => {
  const lead = M.normalizeLead({ id: 'L1', created_time: 't', form_id: 'F', ad_id: 'A', ad_name: 'C01_H1_sta-amb_20261015', campaign_id: 'C', adset_id: 'S',
    field_data: [{ name: 'full_name', values: ['Test Person'] }, { name: 'phone_number', values: ['+27820000000'] }, { name: 'age_band', values: ['45-50'] }] });
  assert.equal(lead.full_name, 'Test Person'); assert.equal(lead.answers.age_band, '45-50'); assert.equal(lead.ad_parts.angle, 'H1');
  const hook = M.parseLeadgenWebhook({ entry: [{ id: 'P1', changes: [{ field: 'leadgen', value: { leadgen_id: '77', form_id: 'F', ad_id: 'A' } }, { field: 'other', value: {} }] }] });
  assert.equal(hook.length, 1); assert.equal(hook[0].page_id, 'P1');
  const raw = '{"a":1}', secret = 's3cret';
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(M.verifyWebhookSignature(raw, sig, secret), true);
  assert.equal(M.verifyWebhookSignature(raw + ' ', sig, secret), false);
  assert.equal(M.verifyWebhookSignature(raw, 'sha256=zz', secret), false);
  assert.equal(M.verifyWebhookSignature(raw, null, secret), false);
});

test('asset health: one batch, normalised statuses, urgent alerts, diff only reports new alerts', async () => {
  const { c, calls } = client((url, init) => {
    const arr = JSON.parse(new URLSearchParams(init.body).get('batch'));
    return { body: arr.map((x) => {
      const u = x.relative_url, ok = (b) => ({ code: 200, body: JSON.stringify(b) });
      if (u.startsWith('B1')) return ok({ verification_status: 'pending' });
      if (u.startsWith('P1')) return ok({ is_published: true, is_webhooks_subscribed: true });
      if (u.startsWith('IG1')) return ok({ id: 'IG1' });
      if (u.startsWith('act_9')) return ok({ account_status: 2, disable_reason: 1 });
      if (u.startsWith('W1/message_templates')) return ok({ data: [{ name: 'broker_intro_slots', status: 'APPROVED', category: 'UTILITY' }, { name: 'reminder_2h', status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' }] });
      if (u.startsWith('W1')) return ok({ account_review_status: 'APPROVED' });
      if (u.startsWith('PN1')) return ok({ quality_rating: 'YELLOW', messaging_limit_tier: 'TIER_250', name_status: 'APPROVED' });
      if (u.startsWith('PX1/dataset_quality')) return ok({ data: [{ event_name: 'Lead', event_match_quality: { composite_score: 5.2 } }] });
      if (u.startsWith('PX1')) return ok({ last_fired_time: '2000-01-01T00:00:00+0000' });
      return { code: 404, body: '{}' };
    }) };
  });
  const h = await c.getAssetHealth({ businessId: 'B1', pageId: 'P1', igUserId: 'IG1', wabaId: 'W1', phoneNumberId: 'PN1', adAccountId: '9', pixelId: 'PX1' });
  assert.equal(calls.length, 1);
  assert.equal(h.ad_account_status, 'DISABLED'); assert.equal(h.waba_quality, 'YELLOW'); assert.equal(h.bv_status, 'pending');
  assert.equal(h.template_status.counts.REJECTED, 1); assert.equal(h.emq, 5.2); assert.equal(h.severity, 'urgent');
  const codes = h.alerts.map((a) => a.code);
  for (const x of ['AD_ACCOUNT_DISABLED', 'WABA_QUALITY_YELLOW', 'TEMPLATE_REJECTED', 'EMQ_LOW', 'PIXEL_STALE']) assert.ok(codes.includes(x), x);
  const d = M.diffHealth(h, h); assert.equal(d.new_alerts.length, 0); assert.equal(d.urgent, false);
  const d2 = M.diffHealth({ waba_quality: 'GREEN', alerts: [] }, { waba_quality: 'YELLOW', alerts: [{ severity: 'warning', code: 'WABA_QUALITY_YELLOW' }] });
  assert.equal(d2.quality_drop, true); assert.equal(d2.urgent, true);
});

test('webhook subscribe uses a page token and requires a confirm token', async () => {
  const { c, calls } = client((url) => (url.includes('access_token') || url.includes('fields=access_token') ? { body: { access_token: 'PAGETOK' } } : { body: { success: true } }));
  await assert.rejects(() => c.subscribeLeadAdsWebhook('P1', 'APP1', {}), (e) => e.code === 'CONFIRM_REQUIRED');
  const confirmToken = tap(c, { action: 'subscribe_leadgen_webhook', target: 'P1', params: { appId: 'APP1', callbackUrl: null } }).confirmToken;
  await c.subscribeLeadAdsWebhook('P1', 'APP1', { confirmToken, confirmedBy: 'j' });
  assert.equal(calls[1].init.headers.authorization, 'Bearer PAGETOK');
  assert.ok(calls[1].url.endsWith('P1/subscribed_apps'));
});

test('qualifyLead backstop: bands, call preference, consent; key or label accepted', () => {
  const lead = (answers, consent_raw = 'Yes') => ({ answers, consent_raw });
  const good = { age_band: '45_50', budget_band: '1250plus', call_ok: 'yes' };
  assert.equal(M.qualifyLead(lead(good)).qualified, true);
  assert.equal(M.qualifyLead(lead({ age_band: '35-44', budget_band: 'R750-R1,250', call_ok: 'Yes' })).qualified, true);
  assert.deepEqual(M.qualifyLead(lead({ ...good, age_band: '51plus' })).reasons, ['age_band']);
  assert.deepEqual(M.qualifyLead(lead({ ...good, budget_band: '500_750' })).reasons, ['budget_band']);
  assert.deepEqual(M.qualifyLead(lead({ ...good, call_ok: 'no' })).reasons, ['call_ok']);
  assert.deepEqual(M.qualifyLead(lead(good, null)).reasons, ['no_consent']);
  assert.deepEqual(M.qualifyLead(lead(good, 'false')).reasons, ['no_consent']);
  assert.equal(M.specHash({ a: 1, b: 2 }), M.specHash({ b: 2, a: 1 }));
});

test('ad objects cache: three paged reads, minor units to ZAR, hourly guard, ids as text', async () => {
  const { c, calls } = client((url) => {
    if (url.includes('/campaigns')) return { body: { data: [{ id: 'C1', name: 'SMC_x', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '15000' }] } };
    if (url.includes('/adsets')) return { body: { data: [{ id: 'S1', name: 's', status: 'ACTIVE', campaign_id: 'C1' }] } };
    return { body: { data: [{ id: 'A1', name: 'C01_H1_sta-amb_20261015', status: 'PAUSED', effective_status: 'PENDING_REVIEW', campaign_id: 'C1', adset_id: 'S1', creative: { id: 'CR1', effective_object_story_id: 'P_1' } }] } };
  });
  const r = await c.getAdObjects({ adAccountId: '999', brandId: 'b1' });
  assert.equal(calls.length, 3);
  assert.deepEqual(r.rows.map((x) => x.level), ['campaign', 'adset', 'ad']);
  assert.equal(r.rows[0].daily_budget_zar, 150); assert.equal(r.rows[2].effective_status, 'PENDING_REVIEW'); assert.equal(r.rows[2].effective_object_story_id, 'P_1');
  assert.equal(r.rows[2].adset_id, 'S1'); assert.equal(r.rows[0].brand_id, 'b1');
  await assert.rejects(() => c.getAdObjects({ adAccountId: '999', brandId: 'b1' }), (e) => e.code === 'TOO_SOON');
});
