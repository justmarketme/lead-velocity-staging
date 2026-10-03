// SUB-*.json sub-workflows (LOCAL-STAGING §7, I-48f/g/h/i): the Code nodes run as n8n runs them (_n8ncode.mjs),
// their SQL is checked against the migrations (_sqlcheck.mjs), and the structure rules of I-46c hold.
// Run: node --test automation/tests/SUB.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCode, lvViolations, PG_CRED } from './_n8ncode.mjs';
import { workflowSql, checkSql } from './_sqlcheck.mjs';

const A = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));
const FILES = { 'SUB-whatsapp-send.json': 'smc-whatsapp-send', 'SUB-capi-send.json': 'smc-capi-send', 'SUB-w26-runner.json': 'smc-w26', 'SUB-ads-budget.json': 'smc-ads-budget' };
const NOW = Date.parse('2026-10-03T10:00:00Z');

for (const [f, id] of Object.entries(FILES)) {
  test(`${f}: id ${id}, inactive, errorWorkflow smc-w22, lv-automation only, one Postgres credential, SQL matches the schema`, { skip: !existsSync(join(A, f)) && 'not built yet' }, () => {
    const wf = load(f);
    assert.deepEqual(lvViolations(wf, id), []);
    assert.equal(wf.active, false);
    const pgCreds = new Set(wf.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres').map((n) => n.credentials?.postgres?.name));
    assert.deepEqual([...pgCreds], [PG_CRED]);
    assert.deepEqual(checkSql(workflowSql(wf)), []);
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && !/W22 signal/.test(x.name))) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.sub(WhatsappSend|CapiSend|W26|AdsBudget)\b/, `${n.name} loads its lib`);
    assert.ok(wf.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflowTrigger' || n.type === 'n8n-nodes-base.webhook'), 'has an entry point');
  });
}

// ------------------------------------------------------------------ smc-whatsapp-send
const WA = load('SUB-whatsapp-send.json');
const DECIDE = 'Decide (suppression, allow-list, window, template, dry run)';
const approved = (name) => ({ items: [{ name, status: 'APPROVED' }] });
const tplIn = { to: '+27 82 000 0001', template: { name: 'broker_cycle_end', body: ['Silver', '1 Nov', '20', '20', '6', '4.5', '-'], buttons: ['renew/cy_1', 'r/cy_1'] }, broker_id: '00000000-0000-0000-0000-0000000000b1', idempotency_key: 'w19:cycle_end:c1' };
async function decide(input, ctx, env = {}) {
  const n = await runCode(WA, 'Normalise input', { json: input });
  return (await runCode(WA, DECIDE, { json: ctx, env, refs: { 'Normalise input': n.json } })).json;
}

test('whatsapp-send: §7 shape normalises (digits only, idempotency_key -> correlation, template body -> variables)', async () => {
  const n = (await runCode(WA, 'Normalise input', { json: tplIn })).json;
  assert.equal(n.valid, true);
  assert.equal(n.to, '27820000001');
  assert.equal(n.correlation, 'w19:cycle_end:c1');
  assert.equal(n.kind, 'template');
  assert.equal(n.variables.length, 7);
  const bad = (await runCode(WA, 'Normalise input', { json: { to: '27820000001', kind: 'text' } })).json;
  assert.equal(bad.valid, false);
  assert.ok(bad.missing.includes('correlation') && bad.missing.includes('text'));
});

test('whatsapp-send: suppressed number is skipped before anything else', async () => {
  const d = await decide(tplIn, { brand_id: 'b', suppressed: true, template_status: approved('broker_cycle_end') });
  assert.equal(d.action, 'skip'); assert.equal(d.reason, 'suppressed');
});

test('whatsapp-send: the Load context SQL hashes the digits-only number with smc_hash_contact', () => {
  const n = WA.nodes.find((x) => x.name.startsWith('Load context'));
  assert.match(n.parameters.query, /mobile_hash = public\.smc_hash_contact\(\$3\)/);
  assert.match(n.parameters.options.queryReplacement, /\$json\.to/);
});

test('whatsapp-send: free text only inside the 24-h window (last inbound broker/client)', async () => {
  const input = { to: '27820000001', kind: 'text', text: 'Hi', broker_id: 'b1', correlation: 'c-text' };
  const inside = await decide(input, { last_inbound_at: new Date(Date.now() - 2 * 3600e3).toISOString() });
  assert.equal(inside.action, 'send'); assert.equal(inside.payload.type, 'text');
  const outside = await decide(input, { last_inbound_at: new Date(Date.now() - 25 * 3600e3).toISOString() });
  assert.equal(outside.action, 'skip'); assert.equal(outside.reason, 'outside_24h_window');
  const never = await decide(input, { last_inbound_at: null });
  assert.equal(never.reason, 'outside_24h_window');
});

test('whatsapp-send: WHATSAPP_TEST_RECIPIENTS allow-list (staging)', async () => {
  const ctx = { template_status: approved('broker_cycle_end') };
  const blocked = await decide(tplIn, ctx, { WHATSAPP_TEST_RECIPIENTS: '27820000009, +27 82 000 0008' });
  assert.equal(blocked.reason, 'not_allow_listed');
  const listed = await decide(tplIn, ctx, { WHATSAPP_TEST_RECIPIENTS: '27820000009,+27820000001' });
  assert.equal(listed.action, 'send');
});

test('whatsapp-send: DRY_RUN_SENDS short-circuits with external_id dry:<correlation>, and the result is ok', async () => {
  const d = await decide(tplIn, { template_status: approved('broker_cycle_end') }, { DRY_RUN_SENDS: 'true' });
  assert.equal(d.action, 'dry'); assert.equal(d.external_id, 'dry:w19:cycle_end:c1'); assert.equal(d.payload, undefined);
  const r = (await runCode(WA, 'Result', { json: {}, refs: { [DECIDE]: d } })).json;
  assert.deepEqual(r, { ok: true, external_id: 'dry:w19:cycle_end:c1', error: null });
});

test('whatsapp-send: template must be approved in brands.template_status; else text in window or email fallback', async () => {
  const pending = { items: [{ name: 'broker_cycle_end', status: 'PENDING' }] };
  const d = await decide(tplIn, { template_status: pending });
  assert.equal(d.reason, 'template_not_approved'); assert.equal(d.email_fallback, true);
  const withText = await decide({ ...tplIn, reminder: { text: 'Your renewal offer is ready.' } }, { template_status: pending, last_inbound_at: new Date(Date.now() - 3600e3).toISOString() });
  assert.equal(withText.action, 'send'); assert.equal(withText.sent_as, 'text');
});

test('whatsapp-send: parameter counts are checked and buttons land on the dynamic positions', async () => {
  const d = await decide(tplIn, { template_status: approved('broker_cycle_end') });
  assert.equal(d.action, 'send');
  assert.equal(d.payload.template.name, 'broker_cycle_end');
  assert.deepEqual(d.payload.template.components.filter((c) => c.type === 'button').map((c) => [c.index, c.parameters[0].text]), [['0', 'renew/cy_1'], ['1', 'r/cy_1']]);
  const noBtn = await decide({ ...tplIn, template: { ...tplIn.template, buttons: [] } }, { template_status: approved('broker_cycle_end') });
  assert.equal(noBtn.reason, 'param_count_mismatch', 'a dynamic URL button without a value is refused');
  const short = await decide({ ...tplIn, template: { ...tplIn.template, body: ['x'] } }, { template_status: approved('broker_cycle_end') });
  assert.equal(short.reason, 'param_count_mismatch');
  const unknown = await decide({ ...tplIn, template: { name: 'no_such_template', body: [] } }, { template_status: approved('no_such_template') });
  assert.equal(unknown.reason, 'unknown_template');
  const L = (await import('../lib/sub-whatsapp-send.mjs'));
  const shape = { total_buttons: 3, dynamic: [{ index: 1, kind: 'url' }, { index: 2, kind: 'quick_reply' }] };
  assert.deepEqual(L.mapButtons(shape, ['pay/abc', { payload: 'later' }]), [null, { url: 'pay/abc' }, { quick_reply: 'later' }]);
});

test('whatsapp-send: duplicate correlation sends nothing; the row is claimed before the Graph call; body never logged', async () => {
  const d = await decide(tplIn, { duplicate: true, template_status: approved('broker_cycle_end') });
  assert.equal(d.action, 'duplicate');
  const rec = WA.nodes.find((n) => n.name.startsWith('Record communications row'));
  assert.match(rec.parameters.query, /WHERE NOT EXISTS/);
  assert.doesNotMatch(rec.parameters.options.queryReplacement, /variables|payload/);
  // I-50b: legacy communications.recipient_contact is NOT NULL -> the recipient in E.164 (+ digits) as $12.
  assert.match(rec.parameters.query, /recipient_contact, lead_id[\s\S]*'system', \$1, \$12, /);
  assert.doesNotMatch(rec.parameters.query, /\$1, NULL, /);
  assert.match(rec.parameters.options.queryReplacement, /'\+' \+ String\(L\.to/);
  const order = (name) => Object.entries(WA.connections).find(([, c]) => c.main.flat().some((x) => x.node === name))?.[0];
  assert.equal(order('Graph POST /messages'), 'Claimed and a live send?');
  const http = WA.nodes.find((n) => n.name === 'Graph POST /messages');
  assert.equal(http.credentials.httpHeaderAuth.name, 'WhatsApp Cloud API (system user)');
  assert.match(http.parameters.url, /\$env\.META_GRAPH_VERSION/);
});

// ------------------------------------------------------------------ smc-capi-send
const CA = load('SUB-capi-send.json');
const BUILD = 'Build event (consent gate, no email, dry run)';
const leadRow = { found: true, consent_ads_at: '2026-10-01T08:00:00Z', phone: '0821234567', first_name: 'Lerato', last_name: 'M', fbc: 'fb.1.x', fbp: null, client_ip: '196.0.0.1', client_user_agent: 'UA', lead_brand_id: 'br1', pixel_id: 'PIX', dataset_id: 'DS', waba_id: 'W', duplicate: false };
async function capiBuild(input, ctx, env = {}) {
  const n = await runCode(CA, 'Normalise input', { json: input });
  return (await runCode(CA, BUILD, { json: ctx, env, refs: { 'Normalise input': n.json } })).json;
}

test('capi-send: consent gate first (no consent_ads_at -> capi_skipped_no_consent)', async () => {
  const b = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_lead', lead_id: 'l1' }, { ...leadRow, consent_ads_at: null });
  assert.equal(b.action, 'skip'); assert.equal(b.reason, 'capi_skipped_no_consent');
});

test('capi-send: never sends email, hashes inside, uses META_GRAPH_VERSION and the website pixel', async () => {
  const b = await capiBuild({ event_name: 'Schedule', event_id: 'evt_l1_schedule', lead_id: 'l1', user: { phone: '27820000000', email: 'lerato@example.com', em: 'x' } }, { ...leadRow, email: 'lerato@example.com' }, { META_GRAPH_VERSION: 'v23.0' });
  assert.equal(b.action, 'send');
  const ud = b.body.data[0].user_data;
  assert.equal(ud.em, undefined);
  assert.doesNotMatch(JSON.stringify(b.body), /lerato@example\.com|example\.com/);
  assert.match(ud.ph[0], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(b.body), /0821234567|27821234567/);
  assert.equal(b.url, 'https://graph.facebook.com/v23.0/PIX/events');
  assert.equal(b.body.access_token, undefined, 'token comes from the credential, never the body');
});

test('capi-send: CTWA routes to the dataset with ctwa_clid; offline events are system_generated', async () => {
  const c = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_ctwa', lead_id: 'l1', action_source: 'business_messaging', ctwa_clid: 'CLID' }, leadRow);
  assert.match(c.url, /\/DS\/events$/); assert.equal(c.body.data[0].user_data.ctwa_clid, 'CLID'); assert.equal(c.body.data[0].messaging_channel, 'whatsapp');
  const o = await capiBuild({ event_name: 'Attended', event_id: 'evt_l1_attended', lead_id: 'l1', value: 4 }, leadRow);
  assert.equal(o.body.data[0].action_source, 'system_generated'); assert.equal(o.body.data[0].custom_data.value, 4);
});

test('capi-send: dedupe via capi_log, and a dry run writes nothing (dedupe skip on dry run)', async () => {
  const dup = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_lead', lead_id: 'l1' }, { ...leadRow, duplicate: true });
  assert.equal(dup.action, 'duplicate');
  const dry = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_lead', lead_id: 'l1' }, leadRow, { DRY_RUN_SENDS: 'true' });
  assert.equal(dry.action, 'dry'); assert.equal(dry.body, undefined);
  // the only writers (claim + update) sit behind "Send?" (action === 'send')
  const send = CA.nodes.find((n) => n.name === 'Send?');
  assert.match(send.parameters.conditions.conditions[0].leftValue, /action === 'send'/);
  assert.deepEqual(CA.connections['Send?'].main[0].map((x) => x.node), ['Claim capi_log (unique event_id + event_name)']);
  assert.equal(CA.connections['Send?'].main[1], undefined, 'dry / skip / duplicate end here');
  assert.match(CA.nodes.find((n) => n.name.startsWith('Claim capi_log')).parameters.query, /ON CONFLICT \(event_id, event_name\) DO NOTHING/);
  // I-50a: capi_log.id is bigint identity; the claim status must satisfy the CHECK (no 'sending').
  assert.match(CA.nodes.find((n) => n.name === 'Update capi_log').parameters.query, /WHERE id = \$1::bigint/);
  assert.doesNotMatch(CA.nodes.find((n) => n.name.startsWith('Claim capi_log')).parameters.query, /'sending'/);
});

test('capi-send: CAPI_TEST_EVENT_CODE goes in the body and the evidence line carries no identifiers', async () => {
  const b = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_lead', lead_id: 'l1' }, leadRow, { CAPI_TEST_EVENT_CODE: 'TEST123' });
  assert.equal(b.body.test_event_code, 'TEST123');
  const ev = (await runCode(CA, 'Evidence line (S7-11 / S7-14)', { json: {}, env: { CAPI_TEST_EVENT_CODE: 'TEST123' }, refs: { [BUILD]: b } })).json;
  const j = JSON.parse(ev.line);
  assert.deepEqual(Object.keys(j), ['ts', 'event_name', 'event_id', 'test_event_code']);
  const w = CA.nodes.find((n) => n.name === 'Append evidence file');
  assert.match(w.parameters.fileName, /CAPI_EVIDENCE_PATH \|\| '\/data\/evidence\/capi-test-events\.jsonl'/);
  assert.equal(w.parameters.options.append, true);
  assert.equal(CA.settings.saveDataSuccessExecution, 'none');
});

test('capi-send: usage header >= 80% or failure raises W22', async () => {
  const L = await import('../lib/sub-capi-send.mjs');
  const r = L.interpret({ statusCode: 200, body: { events_received: 1 }, headers: { 'x-business-use-case-usage': JSON.stringify({ '1': [{ call_count: 85, total_time: 10 }] }) } });
  assert.equal(r.ok, true); assert.equal(r.usage_pct, 85);
  const f = L.interpret({ statusCode: 400, body: { error: { message: 'bad', fbtrace_id: 'T' } } });
  assert.equal(f.ok, false); assert.equal(f.fbtrace_id, 'T');
});

// ------------------------------------------------------------------ smc-w26
import { createHmac } from 'node:crypto';
const W26 = load('SUB-w26-runner.json');
const VERIFY = 'Verify HMAC (X-LV-Timestamp / X-LV-Signature)';
const SECRET = 'x'.repeat(40);
const signed = (body, { ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) => {
  const raw = JSON.stringify(body);
  return { headers: { 'x-lv-timestamp': String(ts), 'x-lv-signature': 'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex') }, body };
};
const verify = async (req, env = { INTERNAL_HMAC_SECRET: SECRET }) => (await runCode(W26, VERIFY, { json: req, env }))[0].json;

test('w26: provision.sh notify() signature verifies (same string-to-sign as provision.sh: "<ts>.<body>")', async () => {
  const body = { step: 13, name: 'ready', ok: true, vps: '203.0.113.7' };
  const v = await verify(signed(body));
  assert.equal(v.ok, true); assert.deepEqual(v.body, body);
  const sh = readFileSync(join(A, 'vps/provision.sh'), 'utf8');
  assert.match(sh, /printf '%s\.%s' "\$ts" "\$body" \| openssl dgst -sha256 -hmac "\$INTERNAL_HMAC_SECRET"/);
  assert.match(sh, /X-LV-Signature: sha256=\$sig/);
});

test('w26: wrong secret, tampered body, stale timestamp, missing secret -> rejected (401 branch)', async () => {
  const body = { step: 13, name: 'ready', ok: true, vps: 'v' };
  assert.equal((await verify(signed(body, { secret: 'y'.repeat(40) }))).reason, 'bad_signature');
  const s = signed(body); s.body = { ...body, ok: false };
  assert.equal((await verify(s)).reason, 'bad_signature');
  assert.equal((await verify(signed(body, { ts: Math.floor(Date.now() / 1000) - 600 }))).reason, 'outside_replay_window');
  assert.equal((await verify(signed(body), {})).reason, 'no_secret');
  assert.equal((await verify({ headers: {}, body })).reason, 'missing_signature');
  assert.deepEqual(W26.connections['Signature valid?'].main[1].map((x) => x.node), ['Respond 401']);
});

test('w26: ok:false -> W22 workflow_failed with the step; ready -> conditional update (onboarded + pending go-live row)', async () => {
  const f = (await runCode(W26, 'Route status', { refs: { [VERIFY]: { body: { step: 7, name: 'restore', ok: false, vps: 'v' } } } })).json;
  assert.equal(f.action, 'failed');
  const sg = (await runCode(W26, 'Alert ops: W22 signal (provision step failed)', { refs: { 'Route status': f } })).json;
  assert.equal(sg.signal_key, 'workflow_failed'); assert.match(sg.what, /step 7 \(restore\)/);
  const r = (await runCode(W26, 'Route status', { refs: { [VERIFY]: { body: { step: 13, name: 'ready', ok: true, vps: 'v' } } } })).json;
  assert.equal(r.action, 'ready');
  const q = W26.nodes.find((n) => n.name.startsWith('Mark ready_for_go_live')).parameters.query;
  assert.match(q, /br\.status = 'onboarded'/);
  assert.match(q, /signal_key IN \('go_live_vps_gate', 'go_live_pending'\)/);
  assert.match(q, /'go_live', 'jonathan', 'whatsapp', 'W26', 'queued', 'go_live_ready'/);
  assert.match(q, /INSERT INTO ops\.proposals \(source, faculty[^)]*\)\s+SELECT 'manual', 'build'/);
});

test('w26: first payment does not require onboarded, opens GATE-VPS once, or skips to readiness when VPS_HOST is set', async () => {
  const n = (await runCode(W26, 'Normalise first payment', { json: { op: 'first_payment', broker_id: 'b1', cycle_id: 'c1' } })).json;
  assert.equal(n.valid, true);
  const gate = (await runCode(W26, 'Plan go-live signal (GATE-VPS or readiness)', { json: n })).json;
  assert.equal(gate.signal_key, 'go_live_vps_gate'); assert.equal(gate.dedupe_key, 'go_live:go_live_vps_gate:b1');
  const ready = (await runCode(W26, 'Plan go-live signal (GATE-VPS or readiness)', { json: n, env: { VPS_HOST: '203.0.113.7' } })).json;
  assert.equal(ready.signal_key, 'go_live_pending');
  const q = W26.nodes.find((n) => n.name.startsWith('Record go_live notification')).parameters.query;
  assert.doesNotMatch(q, /onboarded/);
  assert.match(q, /WHERE NOT EXISTS \(SELECT 1 FROM ops\.notifications x WHERE x\.dedupe_key = \$3\)/);
  assert.doesNotMatch(JSON.stringify(W26.nodes.filter((x) => x.type !== 'n8n-nodes-base.stickyNote')), /metaAds|setCampaignBudget|hostinger\.com\/api|unpause|paused = false/i, 'never provisions, spends or unpauses');
});

// ------------------------------------------------------------------ smc-ads-budget
const AB = load('SUB-ads-budget.json');
test('ads-budget: every raise / lower becomes a proposal (faculty media, source ads_budget) + approval outbox row', async () => {
  const n = (await runCode(AB, 'Normalise input', { json: { op: 'raise', broker_id: 'b1', cycle_id: 'c1', amount_zar: 4500, reason: 'resumed' } })).json;
  assert.equal(n.valid, true);
  const p = (await runCode(AB, 'Build proposal + approval row', { json: n })).json;
  assert.equal(p.proposal.faculty, 'media'); assert.equal(p.proposal.source, 'ads_budget'); assert.equal(p.proposal.cost_zar, 4500);
  assert.deepEqual({ ...p.notification, payload: undefined }, { kind: 'approval', recipient: 'jonathan', channel: 'console', source: 'ads_budget', status: 'queued', ref_table: 'proposals', dedupe_key: 'ads_budget:b1:c1:raise', payload: undefined });
  assert.notEqual(p.notification.source, 'console', 'W32 consumes only source=console rows as decisions');
  assert.equal(p.notification.payload.daily_budget_zar, 150);
  // §7 shape (W16/W19 today) is accepted too
  const s7 = (await runCode(AB, 'Normalise input', { json: { action: 'lower', broker_id: 'b1', media_share_zar: 3000 } })).json;
  assert.equal(s7.valid, true); assert.equal(s7.op, 'lower'); assert.equal(s7.amount_zar, 3000);
  const lower = (await runCode(AB, 'Build proposal + approval row', { json: s7 })).json;
  assert.equal(lower.proposal.cost_zar, 0);
  const bad = (await runCode(AB, 'Normalise input', { json: { op: 'raise', broker_id: 'b1', amount_zar: 0 } })).json;
  assert.equal(bad.valid, false);
  // I-49f: W19's cycle-end shape (amount_zar 0 + media_share_zar) means "lower this broker's share to 0" = pause spend,
  // never an invalid/dropped call and never a R0 proposal.
  const w19 = (await runCode(AB, 'Normalise input', { json: { op: 'lower', action: 'lower', broker_id: 'b1', cycle_id: 'c1', amount_zar: 0, media_share_zar: 3000, reason: 'cycle_not_renewed' } })).json;
  assert.equal(w19.valid, true); assert.equal(w19.amount_zar, 3000); assert.equal(w19.target_zar, 0); assert.equal(w19.mode, 'pause');
  const pause = (await runCode(AB, 'Build proposal + approval row', { json: w19 })).json;
  assert.match(pause.proposal.title, /^Pause the Meta spend for broker b1: remove its R3000 media share \(about R100\/day\), target R0/);
  assert.equal(pause.proposal.cost_zar, 0); assert.equal(pause.notification.payload.target_zar, 0); assert.equal(pause.notification.payload.mode, 'pause');
  assert.equal(pause.notification.dedupe_key, 'ads_budget:b1:c1:lower');
  // a lower with its own amount is a plain reduction; raise keeps mode 'raise'
  assert.equal((await runCode(AB, 'Normalise input', { json: { op: 'lower', broker_id: 'b1', amount_zar: 1000, media_share_zar: 3000 } })).json.mode, 'reduce');
  assert.equal(n.mode, 'raise'); assert.equal(n.target_zar, null);
});

test('ads-budget: never calls the Meta write path; the sticky note documents alternative (b)', () => {
  const codeText = AB.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').map((n) => JSON.stringify(n.parameters)).join('\n');
  assert.doesNotMatch(codeText, /metaAds|setCampaignBudget|graph\.facebook\.com/);
  assert.ok(!AB.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest'));
  const note = AB.nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote').parameters.content;
  assert.match(note, /Alternative \(b\)/); assert.match(note, /decrease-only/);
});
