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
// SUB-w26-runner, SUB-ads-budget and SUB-visit-beacon were retired 20 Oct 2026 with the ops / ads / billing layers (D5).
const FILES = { 'SUB-whatsapp-send.json': 'smc-whatsapp-send', 'SUB-capi-send.json': 'smc-capi-send' };
const NOW = Date.parse('2026-10-03T10:00:00Z');

for (const [f, id] of Object.entries(FILES)) {
  test(`${f}: id ${id}, inactive, errorWorkflow smc-w22, lv-automation only, one Postgres credential, SQL matches the schema`, { skip: !existsSync(join(A, f)) && 'not built yet' }, () => {
    const wf = load(f);
    assert.deepEqual(lvViolations(wf, id), []);
    assert.equal(wf.active, false);
    const pgCreds = new Set(wf.nodes.filter((n) => n.type === 'n8n-nodes-base.postgres').map((n) => n.credentials?.postgres?.name));
    assert.deepEqual([...pgCreds], [PG_CRED]);
    const bad = checkSql(workflowSql(wf));
    assert.deepEqual(bad, []);
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code' && !/W22 signal/.test(x.name))) assert.match(n.parameters.jsCode, /require\('lv-automation'\)\.(sub(WhatsappSend|CapiSend)|waProvider)\b/, `${n.name} loads its lib`);
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
  // + the Graph response shape a waiting caller reads (messages[0].id / body.messages[0].id), 2026-10-11
  assert.deepEqual(r, { ok: true, external_id: 'dry:w19:cycle_end:c1', error: null, messages: [{ id: 'dry:w19:cycle_end:c1' }], body: { messages: [{ id: 'dry:w19:cycle_end:c1' }] } });
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
  assert.match(rec.parameters.query, /WHERE \$13::boolean\s+AND NOT EXISTS/); // $13 = record (false: the caller logs it, 2026-10-11)
  assert.doesNotMatch(rec.parameters.options.queryReplacement, /variables|payload/);
  // I-50b: legacy communications.recipient_contact is NOT NULL -> the recipient in E.164 (+ digits) as $12.
  assert.match(rec.parameters.query, /recipient_contact, lead_id[\s\S]*'system', \$1, \$12, /);
  assert.doesNotMatch(rec.parameters.query, /\$1, NULL, /);
  assert.match(rec.parameters.options.queryReplacement, /'\+' \+ String\(L\.to/);
  const order = (name) => Object.entries(WA.connections).find(([, c]) => c.main.flat().some((x) => x.node === name))?.[0];
  assert.equal(order('Graph POST /messages'), 'Provider is twilio?');
  assert.equal(order('Provider is twilio?'), 'Claimed and a live send?');
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

test('capi-send: CTWA (default) sends ctwa_clid + WABA id only, with no consent gate and no hashed data (Jono, 18 Oct)', async () => {
  const c = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_ctwa', lead_id: 'l1', action_source: 'business_messaging', ctwa_clid: 'CLID' },
    { ...leadRow, consent_ads_at: null, waba_id: 'WABA1' });
  assert.equal(c.action, 'send');
  assert.deepEqual(c.body.data[0].user_data, { ctwa_clid: 'CLID', whatsapp_business_account_id: 'WABA1' });
  assert.doesNotMatch(JSON.stringify(c.body), /"ph"|"fn"|"ln"|"country"|"external_id"|"client_ip_address"|"fbc"/);
  assert.equal(c.body.data[0].messaging_channel, 'whatsapp');
  assert.equal(c.log.clid_only, true);
});

test('capi-send: business messaging uses Meta\'s messaging names (Lead -> LeadSubmitted, Qualified -> QualifiedLead); capi_log keeps ours', async () => {
  for (const [ours, meta] of [['Lead', 'LeadSubmitted'], ['Qualified', 'QualifiedLead']]) {
    const c = await capiBuild({ event_name: ours, event_id: `evt_l1_${ours.toLowerCase()}`, lead_id: 'l1', action_source: 'business_messaging', ctwa_clid: 'CLID' }, { ...leadRow, consent_ads_at: null });
    assert.equal(c.action, 'send', ours);
    assert.equal(c.body.data[0].event_name, meta);
    assert.equal(c.body.data[0].action_source, 'business_messaging');
    assert.deepEqual(c.body.data[0].user_data, { ctwa_clid: 'CLID', whatsapp_business_account_id: 'W' });
    assert.equal(c.log.event_name, ours, 'capi_log dedupe key is our stage name'); assert.equal(c.log.meta_event_name, meta);
  }
  // offline and web events keep our names (Meta: custom CRM stage names are free form)
  const o = await capiBuild({ event_name: 'Qualified', event_id: 'evt_l1_qualified', lead_id: 'l1', action_source: 'system_generated' }, leadRow);
  assert.equal(o.body.data[0].event_name, 'Qualified'); assert.equal(o.log.meta_event_name, undefined);
});

test('capi-send: a stage with no business-messaging name (Schedule, Attended, GoodFit) is skipped for a CTWA lead, never posted to fail', async () => {
  for (const ev of ['Schedule', 'Attended', 'GoodFit']) {
    const c = await capiBuild({ event_name: ev, event_id: `evt_l1_${ev.toLowerCase()}`, lead_id: 'l1', action_source: 'business_messaging', ctwa_clid: 'CLID' }, leadRow);
    assert.equal(c.action, 'skip', ev); assert.equal(c.reason, 'no_messaging_event_type'); assert.equal(c.body, undefined);
  }
});

test('capi-send: Qualified and GoodFit offline (system_generated): consent gate, CRM source, GoodFit value = the 1-5 rating in ZAR custom_data', async () => {
  const q = await capiBuild({ event_name: 'Qualified', event_id: 'evt_l1_qualified', lead_id: 'l1', action_source: 'system_generated', event_time: '2026-10-19T08:00:00Z' }, leadRow);
  assert.equal(q.action, 'send'); assert.match(q.url, /\/DS\/events$/);
  assert.equal(q.body.data[0].event_id, 'evt_l1_qualified'); assert.equal(q.body.data[0].event_time, Date.parse('2026-10-19T08:00:00Z') / 1000);
  assert.equal(q.body.data[0].custom_data.event_source, 'crm'); assert.equal(q.body.data[0].custom_data.lead_event_source, 'SortMyCover');
  const g = await capiBuild({ event_name: 'GoodFit', event_id: 'evt_l1_goodfit', lead_id: 'l1', action_source: 'system_generated', value: 5 }, leadRow, { CAPI_TEST_EVENT_CODE: 'TEST93801' });
  assert.equal(g.action, 'send'); assert.equal(g.body.data[0].event_name, 'GoodFit');
  assert.equal(g.body.data[0].custom_data.value, 5); assert.equal(g.body.data[0].custom_data.currency, 'ZAR');
  assert.equal(g.body.test_event_code, 'TEST93801');
  for (const ev of ['Qualified', 'GoodFit']) {
    const s = await capiBuild({ event_name: ev, event_id: `evt_l1_${ev.toLowerCase()}`, lead_id: 'l1', action_source: 'system_generated' }, { ...leadRow, consent_ads_at: null });
    assert.equal(s.reason, 'capi_skipped_no_consent', ev);
  }
});

test('capi-send: CAPI_CTWA_CLID_ONLY=false restores the consent gate and hashed user data for CTWA', async () => {
  const off = { CAPI_CTWA_CLID_ONLY: 'false' };
  const input = { event_name: 'Lead', event_id: 'evt_l1_ctwa', lead_id: 'l1', action_source: 'business_messaging', ctwa_clid: 'CLID' };
  const gated = await capiBuild(input, { ...leadRow, consent_ads_at: null }, off);
  assert.equal(gated.action, 'skip'); assert.equal(gated.reason, 'capi_skipped_no_consent');
  const full = await capiBuild(input, leadRow, off);
  assert.equal(full.action, 'send');
  assert.match(full.body.data[0].user_data.ph[0], /^[a-f0-9]{64}$/);
  assert.equal(full.body.data[0].user_data.ctwa_clid, 'CLID');
});

test('capi-send: web and Instant Form events keep the consent gate whatever the CTWA flag', async () => {
  for (const env of [{}, { CAPI_CTWA_CLID_ONLY: 'true' }]) {
    const web = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_lead', lead_id: 'l1', action_source: 'website' }, { ...leadRow, consent_ads_at: null }, env);
    assert.equal(web.reason, 'capi_skipped_no_consent');
    const form = await capiBuild({ event_name: 'Lead', event_id: 'evt_l1_form', lead_id: 'l1', action_source: 'system_generated' }, { ...leadRow, consent_ads_at: null }, env);
    assert.equal(form.reason, 'capi_skipped_no_consent');
  }
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
