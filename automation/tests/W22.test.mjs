// W22 Alerts acceptance test (4C.2). Offline: node --test automation/tests/W22.test.mjs
// Runs the Code nodes *from the exported automation/W22.json* in a sandbox, and (when Postgres 16
// binaries are on the machine) the dedupe / delivery-log / escalation SQL on a throwaway cluster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WF = JSON.parse(readFileSync(join(here, '..', 'W22.json'), 'utf8'));
const MD = readFileSync(join(here, '..', 'W22.md'), 'utf8');
const node = (name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, `node ${name} exists`); return n; };

// ---- sandbox runner for an n8n Code node (runOnceForAllItems)
function runCode(name, { input = [], refs = {}, env = {}, nowIso = '2026-10-02T08:00:00Z', staticData = {} } = {}) {
  const NOW = Date.parse(nowIso);
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const ctx = vm.createContext({
    $input: wrap(input), $: (n) => { assert.ok(refs[n], `test supplies $('${n}')`); return wrap(refs[n]); },
    $env: env, $getWorkflowStaticData: () => staticData, require, Buffer, URL, Date: FakeDate,
  });
  const out = vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx);
  return JSON.parse(JSON.stringify(out.map((i) => i.json))); // leave the sandbox realm
}

// ---------------------------------------------------------------- structure
test('W22.json: structure, standard node types, connections resolve, no secrets', () => {
  assert.equal(WF.name, 'W22 Alerts');
  assert.equal(WF.active, false, 'exported inactive; activated on the target n8n only');
  const names = new Set(WF.nodes.map((n) => n.name));
  assert.equal(names.size, WF.nodes.length, 'unique node names');
  for (const n of WF.nodes) {
    assert.match(n.type, /^n8n-nodes-base\./, `${n.name} uses a standard node type`);
    for (const c of Object.values(n.credentials || {})) {
      assert.deepEqual(Object.keys(c).sort(), ['id', 'name'], `${n.name} credential by reference only`);
    }
  }
  for (const [from, { main }] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), `connection source ${from}`);
    for (const outs of main) for (const l of outs) assert.ok(names.has(l.node), `connection target ${l.node}`);
  }
  const triggers = WF.nodes.filter((n) => /Trigger|webhook/i.test(n.type)).map((n) => n.name);
  const targets = new Set(Object.values(WF.connections).flatMap((c) => c.main.flat().map((l) => l.node)));
  for (const n of WF.nodes) {
    if (triggers.includes(n.name) || n.type === 'n8n-nodes-base.stickyNote') continue;
    assert.ok(targets.has(n.name), `${n.name} is reachable`);
  }
  const raw = JSON.stringify(WF);
  const secretish = /sk-ant-|sk_(live|test)_[A-Za-z0-9]{10}|EAA[A-Za-z0-9]{40}|AC[0-9a-f]{32}|BEGIN [A-Z ]*PRIVATE KEY|sb_secret_|eyJhbGci/;
  assert.doesNotMatch(raw, secretish, 'no secret values in the export');
  assert.doesNotMatch(raw, /\+27\d{9}/, 'no phone numbers in the export');
  for (const t of ['scheduleTrigger', 'executeWorkflowTrigger', 'webhook', 'errorTrigger']) {
    assert.ok(WF.nodes.some((n) => n.type === `n8n-nodes-base.${t}`), `has ${t}`);
  }
  assert.equal(node('Uptime monitor callback').parameters.authentication, 'headerAuth', 'monitor callback is authenticated');
});

test('W22.md threshold table and the Evaluate node agree', () => {
  const js = node('Evaluate thresholds').parameters.jsCode;
  const codeMetrics = [...js.matchAll(/^\s{2}([a-z_0-9]+): \{ key: '([a-z_]+)'/gm)].map((m) => [m[1], m[2]]);
  assert.ok(codeMetrics.length >= 10);
  for (const [metric, key] of codeMetrics) {
    assert.match(MD, new RegExp(`\\| \`${key}\` \\| \`${metric}\``), `W22.md row for ${key}/${metric}`);
  }
  for (const k of ['template_rejected', 'failed_debit', 'fsca_mismatch', 'guardrail_trip', 'flow_ping_fail', 'uptime_down', 'waba_quality', 'token_expiring']) {
    assert.match(MD, new RegExp('`' + k + '`'), `W22.md documents ${k}`);
  }
});

// ---------------------------------------------------------------- thresholds
test('Evaluate thresholds: gates and limits from 3.4 / 6.3', () => {
  const rows = [
    { metric: 'raw_cpl_zar', scope: 'campaign:A', value: 260, context: { spend_zar: 3200 } },   // fires
    { metric: 'raw_cpl_zar', scope: 'campaign:B', value: 400, context: { spend_zar: 1200 } },   // gated: < R3,000 spend
    { metric: 'cost_per_qualified_zar', scope: 'campaign:A', value: 450, context: { days_live: 10 } }, // gated: < 14 d
    { metric: 'cost_per_qualified_zar', scope: 'campaign:C', value: 401, context: '{"days_live":15}' }, // fires
    { metric: 'show_rate_14d', scope: 'broker:mark', value: 0.4, n: 10 },                       // fires
    { metric: 'show_rate_14d', scope: 'broker:x', value: 0.0, n: 1 },                           // gated: n < 8
    { metric: 'first_message_sla_breaches', scope: 'global', value: 1, context: { worst_seconds: 95 } },
    { metric: 'leads_last_hour', scope: 'global', value: 25, context: { baseline_hourly_median_7d: 4 } }, // spike
    { metric: 'leads_last_hour', scope: 'global', value: 12, context: { baseline_hourly_median_7d: 1 } }, // < 20 floor
    { metric: 'secret_days_to_expiry', scope: 'secret:MS_CLIENT_SECRET', value: 20 },             // amber
    { metric: 'secret_days_to_expiry', scope: 'secret:X', value: 5 },                            // red
    { metric: 'secret_days_to_expiry', scope: 'secret:Y', value: 90 },                           // nothing
    { metric: 'backup_hours_since_success', scope: 'global', value: 9999 },
    { metric: 'restore_test_days_since', scope: 'global', value: 12 },                           // fine
    { metric: 'qualify_rate', scope: 'campaign:A', value: null, context: { spend_zar: 5000 } },  // null skipped
    { metric: 'not_a_metric', scope: 'global', value: 1 },
  ];
  const out = runCode('Evaluate thresholds', { input: rows });
  const got = out.map((s) => `${s.signal_key}|${s.scope}|${s.severity}`).sort();
  assert.deepEqual(got, [
    'backup_stale|global|red', 'cpl_kill_raw|campaign:A|red', 'cpql_kill|campaign:C|red', 'first_msg_sla|global|red',
    'intake_spike|global|red', 'show_rate_low|broker:mark|red', 'token_expiring|secret:MS_CLIENT_SECRET|amber', 'token_expiring|secret:X|red',
  ]);
  assert.match(out.find((s) => s.signal_key === 'cpl_kill_raw').what, /R260/);
});

// ---------------------------------------------------------------- normalise
test('Normalise inbound signal: own shape, raw Meta/Paystack, monitor, error trigger, ack, unknown', () => {
  const out = runCode('Normalise inbound signal', { input: [
    { signal_key: 'fsca_mismatch', scope: 'broker:mark', what: 'FSP not found' },
    { field: 'message_template_status_update', value: { event: 'REJECTED', message_template_name: 'reminder_24h' } },
    { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_name: 'x' } },
    { field: 'phone_number_quality_update', value: { event: 'FLAGGED', current_limit: 'TIER_1K' } },
    { field: 'account_update', value: { event: 'ACCOUNT_RESTRICTION' } },
    { event: 'invoice.payment_failed', data: { subscription_code: 'SUB_x' } },
    { body: { monitor: 'api.leadvelocity.co.za', state: 'down', since: '2026-10-02T01:00:00Z' } },
    { body: { monitor: 'go.leadvelocity.co.za', state: 'up', duration: '300' } },
    { execution: { lastNodeExecuted: 'Send' }, workflow: { name: 'W06 First touch' } },
    { execution: {}, workflow: { name: 'W14 Reports' } },
    { type: 'ack', notification_id: 42, acked_by: 'kg' },
    { hello: 'world' },
  ] });
  const by = (k) => out.filter((s) => s.signal_key === k);
  assert.equal(by('fsca_mismatch')[0].severity, 'red');
  assert.equal(by('template_rejected').length, 1, 'APPROVED is not an alert');
  assert.equal(by('waba_quality')[0].always_send, true);
  assert.equal(by('waba_restriction')[0].always_send, true);
  assert.equal(by('failed_debit')[0].always_send, true);
  assert.equal(by('uptime_down')[0].always_send, true, 'api down = VPS down = always-send');
  assert.equal(by('uptime_recovered')[0].severity, 'amber');
  assert.deepEqual(by('workflow_failed').map((s) => s.severity), ['red', 'amber'], 'W06 is critical, W14 is not');
  assert.equal(out.find((s) => s.kind === 'ack').notification_id, '42');
  assert.equal(by('unknown_signal').length, 1, 'unreadable input becomes amber, never dropped');
  assert.equal(out.length, 11, 'APPROVED produces nothing at all (12 inputs, 11 outputs)');
  assert.ok(by('unknown_signal').every((s) => s.severity === 'amber'));
});

test('Normalise: W27 meta_asset_health is a registered red signal, never unknown_signal (I-26)', () => {
  const w27 = { signal_key: 'meta_asset_health', scope: 'brand:b1', severity: 'red', what: 'Meta asset health: AD_ACCOUNT_DISABLED',
    impact: 'Ads, WhatsApp or lead capture may be affected', first_action: 'Open the console Ads screen', since: '2026-10-02T08:00:00Z', source: 'W27' };
  const out = runCode('Normalise inbound signal', { input: [w27, { signal_key: 'meta_asset_health' }] });
  assert.equal(out.filter((s) => s.signal_key === 'unknown_signal').length, 0);
  assert.equal(out[0].severity, 'red');
  assert.equal(out[0].scope, 'brand:b1', 'producer scope wins');
  assert.equal(out[1].scope, 'brand:unknown', 'registry default fills a bare payload');
  assert.ok(out[1].first_action && out[1].impact, 'defaults fill missing fields');
  // Policy: red, held in DND (not in the 6.8b always-send set), deduped per brand
  const night = runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T21:30:00Z', input: out });
  assert.deepEqual(night.map((o) => o.status), ['held_dnd', 'held_dnd']);
  assert.equal(night[0].dedupe_key, 'meta_asset_health|brand:b1|red');
  const day = runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T08:00:00Z', input: [out[0]] });
  assert.equal(day[0].status, 'sending');
  assert.equal(day[0].primary_partner, 'jonathan');
  assert.match(MD, /\| `meta_asset_health` \|/, 'W22.md documents meta_asset_health');
});

// ---------------------------------------------------------------- registered producer kinds (exact list)
const REGISTERED_KINDS = ['broker_dsr_erase', 'dsar_due', 'dsar_erased', 'dsar_overdue', 'dsar_received', 'meta_asset_health', 'ms_client_secret_invalid', 'w34_monthly_report', 'w34_retention_failure'];
test('PRODUCER_SIGNALS: the registered kinds are exactly this list, each documented in W22.md', () => {
  const code = node('Normalise inbound signal').parameters.jsCode;
  const block = code.slice(code.indexOf('const PRODUCER_SIGNALS = {'), code.indexOf('\n};', code.indexOf('const PRODUCER_SIGNALS = {')));
  const keys = [...block.matchAll(/^  ([a-z0-9_]+): \{/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, REGISTERED_KINDS);
  for (const k of keys) assert.match(MD, new RegExp(`\\| \`${k}\` \\|`), `${k} row in W22.md`);
});

test('W20 ms_client_secret_invalid (I-41i): red, both phones, app-wide scope, deduped, held in DND; W20 emits it', () => {
  const W20 = readFileSync(join(here, '..', 'W20.json'), 'utf8');
  assert.match(W20, /"name": "Raise alert \(W22, MS callback\)"/, 'W20 raises it through Execute Workflow (W22 producer contract, section 3)');
  const lib = readFileSync(join(here, '..', 'lib', 'w20-ms.mjs'), 'utf8');
  assert.match(lib, /SECRET_ALERT_KIND = 'ms_client_secret_invalid'/);
  const w20 = { signal_key: 'ms_client_secret_invalid', scope: 'ms_app:broker_connect', severity: 'red', source: 'W20',
    what: 'Microsoft rejected the broker-connect app credentials (AADSTS7000222)', since: '2026-10-02T08:00:00Z', codes: ['AADSTS7000222'] };
  const out = runCode('Normalise inbound signal', { input: [w20, { signal_key: 'ms_client_secret_invalid' }] });
  assert.equal(out.filter((s) => s.signal_key === 'unknown_signal').length, 0);
  assert.deepEqual(out.map((s) => [s.severity, s.scope, s.source]), [['red', 'ms_app:broker_connect', 'W20'], ['red', 'ms_app:broker_connect', 'W20']]);
  assert.match(out[0].what, /AADSTS7000222/, 'producer text wins');
  assert.ok(out[1].impact && out[1].first_action, 'registry defaults fill a bare payload');
  const day = runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T08:00:00Z', input: out });
  assert.equal(day.length, 1, 'two brokers hitting it in one run -> one alert (same dedupe key)');
  assert.deepEqual([day[0].status, day[0].to, day[0].dedupe_key], ['sending', 'jonathan,kg', 'ms_client_secret_invalid|ms_app:broker_connect|red']);
  const env = { OPS_WHATSAPP_JONATHAN: '+27000000001', OPS_WHATSAPP_KG: '+27000000002', OPS_EMAIL: 'ops@example.test' };
  const fan = runCode('Expand recipients', { env, input: [{ notification_id: '9', ...day[0] }] }).map((o) => `${o.channel}:${o.who}`);
  assert.deepEqual(fan, ['whatsapp:jonathan', 'whatsapp:kg', 'email:ops'], 'both phones + email copy');
  assert.equal(runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T21:30:00Z', input: [out[0]] })[0].status, 'held_dnd', 'not in the 6.8b always-send set');
});

// ---------------------------------------------------------------- W34 POPIA kinds (I-38b)
const W34_KINDS = ['dsar_received', 'dsar_due', 'dsar_overdue', 'dsar_erased', 'w34_retention_failure', 'w34_monthly_report']; // broker_dsr_erase goes via the shared WhatsApp sender, not W22 (I-39f)
const w34 = (kind, extra = {}) => ({ kind, workflow: 'W34', to: ['jonathan'], severity: 'amber', message: `${kind} msg`, ...extra });

test('W34 kinds: every kind W34.json emits is registered in W22 and documented in W22.md', () => {
  const W34 = readFileSync(join(here, '..', 'W34.json'), 'utf8');
  const emitted = [...new Set([...W34.matchAll(/kind: (?:[\w.]+ \? )?'([a-z0-9_]+)'(?: : '([a-z0-9_]+)')?, workflow: 'W34'/g)].flatMap((m) => m.slice(1).filter(Boolean)))].sort();
  assert.deepEqual(emitted, [...W34_KINDS].sort(), 'W34 emits exactly the seven I-38b kinds');
  const code = node('Normalise inbound signal').parameters.jsCode;
  for (const k of W34_KINDS) {
    assert.match(code, new RegExp(`\\b${k}: \\{`), `${k} in PRODUCER_SIGNALS`);
    assert.match(MD, new RegExp(`\\| \`${k}\` \\|`), `${k} row in W22.md`);
  }
});

test('W34 kinds: severity, IO recipient, scope; never unknown_signal (I-38b)', () => {
  const env = { W34_IO_RECIPIENT: 'kg' };
  const out = runCode('Normalise inbound signal', { env, input: [
    w34('dsar_received', { dsr_id: 'd1', deep_link: 'https://app.example.test/compliance/dsr/d1' }),
    w34('dsar_due'),
    w34('dsar_overdue', { to: ['jonathan', 'kg'], severity: 'red' }),
    w34('dsar_erased', { dsr_id: 'd1', severity: 'info' }),
    w34('dsar_erased', { dsr_id: 'd2', severity: 'red' }),
    w34('broker_dsr_erase', { to_broker_id: 'b1', severity: 'info', first_name: 'Thandi' }),
    w34('w34_retention_failure', { severity: 'red' }),
    w34('w34_monthly_report', { severity: 'info' }),
  ] });
  assert.equal(out.length, 8);
  assert.equal(out.filter((s) => s.signal_key === 'unknown_signal').length, 0);
  const g = (i) => [out[i].signal_key, out[i].severity, out[i].scope, out[i].recipients.join()];
  assert.deepEqual(g(0), ['dsar_received', 'amber', 'dsr:d1', 'kg']);
  assert.equal(out[0].notify_now, true);
  assert.match(out[0].first_action, /compliance\/dsr\/d1/);
  assert.deepEqual(g(1), ['dsar_due', 'amber', 'dsr:clock', 'kg']);
  assert.deepEqual(g(2), ['dsar_overdue', 'red', 'dsr:clock', 'jonathan,kg'], 'overdue: both phones');
  assert.deepEqual(g(3), ['dsar_erased', 'amber', 'dsr:d1', 'kg']);
  assert.equal(out[3].info, true);
  assert.deepEqual(g(4), ['dsar_erased', 'red', 'dsr:d2', 'kg'], 'erased late = red to the IO');
  assert.deepEqual(g(5), ['broker_dsr_erase', 'amber', 'broker:b1', 'broker:b1']);
  assert.deepEqual(g(6), ['w34_retention_failure', 'red', 'w34:nightly', 'jonathan,kg']);
  assert.deepEqual(g(7), ['w34_monthly_report', 'amber', 'w34:monthly', 'jonathan']);
  assert.ok(out.every((s) => s.kind === 'signal' && s.source === 'W34'));
  // IO falls back to jonathan when unset or not a partner
  for (const e of [{}, { W34_IO_RECIPIENT: 'someone@else' }]) {
    assert.equal(runCode('Normalise inbound signal', { env: e, input: [w34('dsar_due')] })[0].recipients.join(), 'jonathan');
  }

  // Policy at 10:00 SAST
  const pol = runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T08:00:00Z', input: out });
  const st = (i) => [pol[i].status, pol[i].to];
  assert.deepEqual(st(0), ['sending', 'kg'], 'dsar_received goes straight to the IO');
  assert.deepEqual(st(1), ['amber_to_pulse', 'kg']);
  assert.deepEqual(st(2), ['sending', 'jonathan,kg']);
  assert.deepEqual(st(3), ['amber_to_pulse', 'kg']);
  assert.deepEqual(st(4), ['sending', 'kg']);
  assert.deepEqual(st(5), ['amber_to_pulse', 'broker:b1']);
  assert.deepEqual(st(6), ['sending', 'jonathan,kg']);
  assert.deepEqual(st(7), ['amber_to_pulse', 'jonathan']);
  assert.match(pol[5].payload, /Thandi/, 'broker notice keeps the first name only');
  // night: the IO alert waits for 07:00 like any non-always-send item
  assert.equal(runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T21:30:00Z', input: [out[0]] })[0].status, 'held_dnd');
  // a non-W34 signal keeps the default recipients
  assert.equal(runCode('Policy: severity, DND, redaction', { input: [sig('fsca_mismatch')] })[0].to, 'jonathan,kg');

  // Fan-out: IO only; broker rows have no ops phone
  const env2 = { OPS_WHATSAPP_JONATHAN: '+27000000001', OPS_WHATSAPP_KG: '+27000000002', OPS_EMAIL: 'ops@example.test' };
  const fan = (n) => runCode('Expand recipients', { env: env2, input: [{ notification_id: '5', ...n }] }).map((o) => `${o.channel}:${o.who}`);
  assert.deepEqual(fan({ status: 'sending', severity: 'amber', to: 'kg' }), ['whatsapp:kg']);
  assert.deepEqual(fan({ status: 'sending', severity: 'red', to: 'jonathan,kg' }), ['whatsapp:jonathan', 'whatsapp:kg', 'email:ops']);
  assert.deepEqual(fan({ status: 'sending', severity: 'amber', to: 'broker:b1' }), []);
  // DND release keeps the stored recipient
  const [rel] = runCode('Escalation policy', { nowIso: '2026-10-03T05:00:00Z', input: [row({ status: 'held_dnd', first_sent_at: null, to: 'kg', severity: 'amber' })] });
  assert.equal(rel.recipients.join(), 'kg');
});

// ---------------------------------------------------------------- policy (DND, always-send, amber, redaction)
const sig = (k, extra = {}) => ({ kind: 'signal', signal_key: k, scope: 'global', severity: 'red', what: `${k} happened`, impact: 'i', first_action: 'a', since: '2026-10-02T08:00:00Z', ...extra });

test('Policy: daytime red sends to both; amber goes to the pulse; in-run duplicates collapse', () => {
  const out = runCode('Policy: severity, DND, redaction', { nowIso: '2026-10-02T08:00:00Z', // 10:00 SAST
    input: [sig('fsca_mismatch'), sig('fsca_mismatch'), sig('restore_test_overdue', { severity: 'amber' })] });
  assert.equal(out.length, 2);
  assert.equal(out[0].status, 'sending');
  assert.equal(out[0].dedupe_key, 'fsca_mismatch|global|red');
  assert.equal(out[0].since_label, '10:00', 'SAST label');
  assert.equal(out[1].status, 'amber_to_pulse');
});

test('Policy: DND 22:00-07:00 SAST holds red except the always-send set', () => {
  const night = '2026-10-02T21:30:00Z'; // 23:30 SAST
  const out = runCode('Policy: severity, DND, redaction', { nowIso: night,
    input: ['cpl_kill_raw', 'template_rejected', 'guardrail_trip', 'waba_restriction', 'failed_debit', 'uptime_down', 'vps_down'].map((k) => sig(k)) });
  const st = Object.fromEntries(out.map((o) => [o.signal_key, o.status]));
  assert.deepEqual(st, { cpl_kill_raw: 'held_dnd', template_rejected: 'held_dnd', guardrail_trip: 'sending', waba_restriction: 'sending', failed_debit: 'sending', uptime_down: 'sending', vps_down: 'sending' });
  // boundaries: 21:59 SAST sends, 22:00 holds, 06:59 holds, 07:00 sends
  const at = (iso) => runCode('Policy: severity, DND, redaction', { nowIso: iso, input: [sig('cpl_kill_raw')] })[0].status;
  assert.equal(at('2026-10-02T19:59:00Z'), 'sending');
  assert.equal(at('2026-10-02T20:00:00Z'), 'held_dnd');
  assert.equal(at('2026-10-03T04:59:00Z'), 'held_dnd');
  assert.equal(at('2026-10-03T05:00:00Z'), 'sending');
});

test('Policy: PII is masked and template params are single-line', () => {
  const [o] = runCode('Policy: severity, DND, redaction', { input: [sig('guardrail_trip', {
    what: 'Lead +27 82 123 4567 (lerato.m@gmail.com)\nsaid ID 8001015009087', scope: 'conversation:c1' })] });
  assert.doesNotMatch(o.what, /123 4567|lerato\.m@|8001015009087|\n/);
  assert.match(o.what, /\[id-redacted\]/);
  assert.doesNotMatch(o.payload, /lerato\.m@gmail\.com|8001015009087/);
  assert.equal(o.primary_partner, 'jonathan');
  const [p] = runCode('Policy: severity, DND, redaction', { input: [sig('failed_debit')] });
  assert.equal(p.primary_partner, 'kg', '6.8a: KG primary for payments');
});

// ---------------------------------------------------------------- escalation
const row = (extra) => ({ id: '7', notification_id: '7', signal_key: 'cpl_kill_raw', severity: 'red', always_send: false, status: 'sent',
  escalation_level: 0, first_sent_at: '2026-10-02T06:00:00Z', acked_at: null, what: 'CPL high', primary_partner: 'jonathan', ...extra });

test('Escalation: 2 h -> other partner, 4 h -> voice to both, acked stops, DND pauses non-always-send', () => {
  const t = (nowIso, r) => runCode('Escalation policy', { nowIso, input: [row(r)] });
  assert.deepEqual(t('2026-10-02T07:59:00Z', {}), [], 'under 2 h nothing');
  const e1 = t('2026-10-02T08:00:00Z', {})[0];
  assert.deepEqual([e1.decision, e1.escalation_level, e1.recipients.join()], ['escalate_resend', 1, 'kg']);
  assert.match(e1.what, /^ESCALATED/);
  assert.equal(t('2026-10-02T08:00:00Z', { primary_partner: 'kg' })[0].recipients.join(), 'jonathan');
  assert.deepEqual(t('2026-10-02T09:59:00Z', { escalation_level: 1 }), [], 'level 1 waits for 4 h');
  const e2 = t('2026-10-02T10:00:00Z', { escalation_level: 1 })[0];
  assert.deepEqual([e2.decision, e2.recipients.join()], ['escalate_call', 'jonathan,kg']);
  assert.deepEqual(t('2026-10-02T10:00:00Z', { escalation_level: 1, acked_at: '2026-10-02T09:00:00Z' }), [], 'acked stops escalation');
  // night: sent 19:00 SAST, 23:30 SAST now -> non-always-send waits, always-send escalates
  const nightRow = { first_sent_at: '2026-10-02T17:00:00Z' };
  assert.deepEqual(t('2026-10-02T21:30:00Z', nightRow), []);
  assert.equal(t('2026-10-02T21:30:00Z', { ...nightRow, always_send: true })[0].decision, 'escalate_resend');
});

test('Escalation: held_dnd released at 07:00 SAST, not before', () => {
  const held = row({ status: 'held_dnd', first_sent_at: null });
  assert.deepEqual(runCode('Escalation policy', { nowIso: '2026-10-03T04:55:00Z', input: [held] }), []);
  const [r] = runCode('Escalation policy', { nowIso: '2026-10-03T05:00:00Z', input: [held] });
  assert.deepEqual([r.decision, r.recipients.join(), r.released_from_dnd], ['send_now', 'jonathan,kg', true]);
});

// ---------------------------------------------------------------- fan-out
test('Expand recipients: WhatsApp per partner + one email for red; voice TwiML has no injected markup', () => {
  const env = { OPS_WHATSAPP_JONATHAN: '+27000000001', OPS_WHATSAPP_KG: '+27000000002', OPS_EMAIL: 'ops@example.test', CONSOLE_URL: 'https://app.example.test' };
  const out = runCode('Expand recipients', { env, input: [{ notification_id: '9', status: 'sending', severity: 'red', what: 'W', since_label: '10:00', impact: 'I', first_action: 'A' }] });
  assert.deepEqual(out.map((o) => `${o.channel}:${o.who}`), ['whatsapp:jonathan', 'whatsapp:kg', 'email:ops']);
  assert.deepEqual(out[0].params, ['W', '10:00', 'I', 'A']);
  assert.equal(out[0].link_path, 'alerts/9');
  const resend = runCode('Expand recipients', { env, input: [{ id: '9', decision: 'escalate_resend', recipients: ['kg'], severity: 'red', what: 'ESCALATED W', escalation_level: 1 }] });
  assert.deepEqual(resend.map((o) => `${o.channel}:${o.who}:${o.escalation_level}`), ['whatsapp:kg:1'], 'no second email on escalation');
  const call = runCode('Expand recipients', { env, input: [{ id: '9', decision: 'escalate_call', recipients: ['jonathan', 'kg'], what: 'x</Say><Dial>+1</Dial>', escalation_level: 2 }] });
  assert.equal(call.length, 2);
  assert.ok(call.every((c) => c.channel === 'voice' && !/<Dial>/.test(c.twiml)));
  assert.deepEqual(runCode('Expand recipients', { env: {}, input: [{ notification_id: '1', status: 'sending', severity: 'red' }] }), [], 'no numbers configured -> nothing sent');
});

// ---------------------------------------------------------------- Flow ping round trip
test('Flow ping: encrypted request decrypts with the private key; response judged with the flipped IV', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const appSecret = crypto.randomBytes(16).toString('hex');
  const env = { FLOW_ENDPOINT_URL: 'https://api.example.test/flow', FLOW_PUBLIC_KEY: publicKey.replace(/\n/g, '\\n'), META_APP_SECRET: appSecret };
  const [req] = runCode('Build Flow ping', { env });
  assert.equal(req.skip, false);
  assert.equal(req.signature, 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.body).digest('hex'));
  // Simulated endpoint doing what Meta's reference endpoint does
  const b = JSON.parse(req.body);
  const aes = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(b.encrypted_aes_key, 'base64'));
  const iv = Buffer.from(b.initial_vector, 'base64');
  const enc = Buffer.from(b.encrypted_flow_data, 'base64');
  const d = crypto.createDecipheriv('aes-128-gcm', aes, iv); d.setAuthTag(enc.subarray(-16));
  const plain = JSON.parse(Buffer.concat([d.update(enc.subarray(0, -16)), d.final()]).toString());
  assert.deepEqual(plain, { version: '3.0', action: 'ping' });
  const respond = (obj) => { const c = crypto.createCipheriv('aes-128-gcm', aes, Buffer.from(iv.map((x) => ~x & 0xff)));
    return Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]).toString('base64'); };
  const judge = (res) => runCode('Judge Flow ping', { input: [res], refs: { 'Build Flow ping': [req] } })[0];
  assert.equal(judge({ statusCode: 200, body: respond({ data: { status: 'active' } }) }).failing, false);
  assert.equal(judge({ statusCode: 200, body: respond({ data: { status: 'down' } }) }).failing, true);
  assert.equal(judge({ statusCode: 421, body: '' }).reason, 'http_421');
  assert.equal(judge({ statusCode: 200, body: 'garbage' }).reason, 'decrypt_failed');
  const sigOut = runCode('Flow ping signal', { input: [{ reverted: 1 }], refs: { 'Judge Flow ping': [{ failing: true, reason: 'http_502' }] } });
  assert.equal(sigOut[0].signal_key, 'flow_ping_fail');
  assert.match(sigOut[0].impact, /reverted to list/);
  assert.deepEqual(runCode('Flow ping signal', { input: [{ reverted: 0 }], refs: { 'Judge Flow ping': [{ failing: false }] } }), []);
  assert.equal(runCode('Build Flow ping', { env: {} })[0].skip, true, 'no Flow configured -> skip, not alert');
});

test('Uptime + WABA + DNS judges', () => {
  const targets = runCode('Uptime targets', { env: { N8N_PUBLIC_URL: 'https://api.example.test/', CONSOLE_URL: 'https://app.example.test', CONSUMER_DOMAIN: 'sortmycover.example' } });
  assert.deepEqual(targets.map((t) => t.target), ['api', 'app', 'consumer']);
  const up = runCode('Judge uptime', { input: [{ statusCode: 200 }, { statusCode: 502 }, {}], refs: { 'Uptime targets': targets } });
  assert.deepEqual(up.map((s) => `${s.scope}:${s.always_send}`), ['target:app:false', 'target:consumer:false']);
  const apiDown = runCode('Judge uptime', { input: [{ statusCode: 0 }], refs: { 'Uptime targets': [targets[0]] } });
  assert.equal(apiDown[0].always_send, true);
  const st = {};
  assert.deepEqual(runCode('Judge WABA health', { input: [{ quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K' }], staticData: st }), []);
  const drop = runCode('Judge WABA health', { input: [{ quality_rating: 'YELLOW', messaging_limit_tier: 'TIER_1K' }], staticData: st });
  assert.equal(drop[0].signal_key, 'waba_quality');
  const tier = runCode('Judge WABA health', { input: [{ quality_rating: 'YELLOW', messaging_limit_tier: 'TIER_250' }], staticData: st });
  assert.equal(tier[0].signal_key, 'waba_restriction');
  assert.equal(runCode('Judge WABA health', { input: [{ error: { code: 190 } }] })[0].signal_key, 'token_invalid');
  const checks = runCode('DNS checks');
  const dns = runCode('Judge email auth', { input: [{ Answer: [{ data: '"v=DMARC1; p=quarantine"' }] }, { Answer: [] }, {}], refs: { 'DNS checks': checks } });
  assert.deepEqual(dns.map((s) => s.scope), ['dns:dkim1', 'dns:dkim2']);
  assert.ok(dns.every((s) => s.severity === 'amber'));
});

// ---------------------------------------------------------------- SQL on a throwaway Postgres (skipped if unavailable)
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/local/pgsql/bin'].find((d) => existsSync(join(d, 'initdb')));
test('SQL: DDL, dedupe 24 h, delivery log, escalation query, Flow revert (real Postgres)', { skip: !PGBIN && 'no Postgres binaries on this machine' }, (t) => {
  const isRoot = process.getuid && process.getuid() === 0;
  const as = (cmd, args, opts = {}) => execFileSync(isRoot ? 'runuser' : cmd, isRoot ? ['-u', 'postgres', '--', cmd, ...args] : args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  const dir = mkdtempSync(join(tmpdir(), 'w22pg-'));
  chmodSync(dir, 0o777);
  const port = String(55000 + Math.floor(Math.random() * 900));
  const data = join(dir, 'data');
  as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
  t.after(() => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); });
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const psql = (sql, params = []) => {
    const q = sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
    const f = join(dir, `q${crypto.randomBytes(4).toString('hex')}.sql`); writeFileSync(f, q); chmodSync(f, 0o644);
    return as('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\x1f', '-f', f])
      .trim().split('\n').filter(Boolean).map((l) => l.split('\x1f'));
  };
  const ddl = MD.match(/```sql\n([\s\S]*?)```/)[1];
  psql(ddl);
  psql("CREATE TABLE brands (brand_id text PRIMARY KEY, booking_ui text); INSERT INTO brands VALUES ('sortmycover', 'flow');");

  const dedupe = node('Dedupe 24 h + write ops.notifications').parameters.query;
  const p = ['fsca_mismatch|broker:mark|red', 'fsca_mismatch', 'broker:mark', 'red', false, 'sending', 'W20', 'FSP, not found', 'i', 'a', '10:00', 'jonathan', '{"x":1}'];
  const first = psql(dedupe, p);
  assert.equal(first.length, 1); assert.equal(first[0][1], 'sending'); assert.equal(first[0][9], 'f');
  const second = psql(dedupe, p);
  assert.equal(second[0][1], 'suppressed'); assert.equal(second[0][9], 't');
  assert.equal(psql(`SELECT seen_count FROM ops.notifications WHERE id = ${first[0][0]}`)[0][0], '2');
  const amber = psql(dedupe, ['fsca_mismatch|broker:mark|amber', 'fsca_mismatch', 'broker:mark', 'amber', false, 'amber_to_pulse', 'W20', 'w', 'i', 'a', '10:00', 'jonathan', '{}']);
  assert.equal(amber[0][1], 'amber_to_pulse', 'different severity = different key');
  assert.equal(psql(`SELECT "to" FROM ops.notifications WHERE id = ${first[0][0]}`)[0][0], 'jonathan,kg', 'no recipient -> both partners');
  const io = psql(dedupe, ['dsar_received|dsr:d1|amber', 'dsar_received', 'dsr:d1', 'amber', false, 'sending', 'W34', 'w', 'i', 'a', '10:00', 'jonathan', '{}', 'kg'])[0];
  assert.equal(io[10], 'kg', 'I-38b: the IO recipient is stored and returned');
  psql(`UPDATE ops.notifications SET created_at = now() - interval '25 hours' WHERE id = ${first[0][0]}`);
  const again = psql(dedupe, p)[0];
  assert.equal(again[1], 'sending', 'after 24 h the same signal may notify again');
  const id = again[0];

  const log = node('Log delivery').parameters.query;
  psql(log, [id, 'whatsapp', 'jonathan', 0, 200]);
  psql(log, [id, 'email', 'ops', 0, 202]);
  let r = psql(`SELECT status, escalation_level, first_sent_at IS NOT NULL, jsonb_array_length(channel_log) FROM ops.notifications WHERE id = ${id}`)[0];
  assert.deepEqual(r, ['sent', '0', 't', '2']);
  psql(log, [id, 'whatsapp', 'kg', 0, 500]);
  assert.equal(psql(`SELECT status FROM ops.notifications WHERE id = ${id}`)[0][0], 'sent', 'one failed recipient does not undo a sent row');

  const due = node('Due escalations').parameters.query;
  assert.equal(psql(due).length, 0);
  psql(`UPDATE ops.notifications SET first_sent_at = now() - interval '2 hours 1 minute' WHERE id = ${id}`);
  assert.deepEqual(psql(due).map((x) => x[0]), [id]);
  psql(log, [id, 'whatsapp', 'kg', 1, 200]);
  assert.deepEqual(psql(`SELECT status, escalation_level FROM ops.notifications WHERE id = ${id}`)[0], ['escalated', '1']);
  psql(node('Record ack').parameters.query, [id, 'jonathan']);
  assert.equal(psql(due).length, 0, 'acked rows leave the escalation queue');
  psql(dedupe, ['cpl_kill_raw|global|red', 'cpl_kill_raw', 'global', 'red', false, 'held_dnd', 'W22.sweep', 'w', 'i', 'a', '23:30', 'jonathan', '{}']);
  assert.ok(psql(due).some((x) => x[6] === 'held_dnd'), 'held rows are offered for release');

  const revert = node('Revert booking_ui if failing').parameters.query;
  assert.equal(psql(revert, [false])[0][0], '0');
  assert.equal(psql(revert, [true])[0][0], '1');
  assert.equal(psql("SELECT booking_ui FROM brands")[0][0], 'list');

  psql("INSERT INTO ops.secret_inventory (name, holder, stored_in, rotate_every_days, expires_at) VALUES ('MS_CLIENT_SECRET', 'Entra app', '.env', 180, now() + interval '5 days')");
  const metrics = psql('SELECT metric, scope, round(value) FROM ops.w22_metrics ORDER BY metric');
  assert.deepEqual(metrics.map((m) => m[0]), ['backup_hours_since_success', 'restore_test_days_since', 'secret_days_to_expiry']);
  assert.equal(metrics[0][2], '9999', 'never backed up = alert');
});

// ---------------------------------------------------------------- I-36b: console approvals stuck in 'sending'
test('Stuck approvals: wired on the 5-min sweep, signal is amber when re-queued and red when given up', () => {
  const sweep = WF.connections['Every 5 min - threshold sweep'].main[0].map((l) => l.node);
  assert.ok(sweep.includes('Re-queue stuck approvals'), 'runs on the 5-min sweep');
  assert.equal(WF.connections['Re-queue stuck approvals'].main[0][0].node, 'Judge stuck approvals');
  assert.equal(WF.connections['Judge stuck approvals'].main[0][0].node, 'Collect signals');
  const q = node('Re-queue stuck approvals').parameters.query;
  assert.match(q, /kind = 'approval' AND status = 'sending' AND updated_at < now\(\) - interval '10 minutes'/);
  assert.match(q, /FOR UPDATE SKIP LOCKED/, 'never fights W32\'s claim');
  assert.deepEqual(runCode('Judge stuck approvals', { input: [] }), [], 'nothing stuck = no signal');
  const amber = runCode('Judge stuck approvals', { input: [{ id: 'a', status: 'queued', attempts: 1 }] });
  assert.equal(amber.length, 1);
  assert.deepEqual([amber[0].signal_key, amber[0].severity, amber[0].scope], ['approval_stuck', 'amber', 'ops.notifications:approval']);
  const red = runCode('Judge stuck approvals', { input: [{ id: 'a', status: 'queued', attempts: 2 }, { id: 'b', status: 'send_failed', attempts: 3 }] });
  assert.equal(red.length, 1, 'one signal per sweep, not per row');
  assert.equal(red[0].severity, 'red');
  assert.match(red[0].what, /2 console approval\(s\).*1 re-queued, 1 gave up/);
});

test('SQL: stuck approvals re-queue once per sweep, attempts + 1, max 3 then send_failed (real Postgres)', { skip: !PGBIN && 'no Postgres binaries on this machine' }, (t) => {
  const isRoot = process.getuid && process.getuid() === 0;
  const as = (cmd, args) => execFileSync(isRoot ? 'runuser' : cmd, isRoot ? ['-u', 'postgres', '--', cmd, ...args] : args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const dir = mkdtempSync(join(tmpdir(), 'w22pg-')); chmodSync(dir, 0o777);
  const port = String(55000 + Math.floor(Math.random() * 900)); const data = join(dir, 'data');
  as(join(PGBIN, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  as(join(PGBIN, 'pg_ctl'), ['-D', data, '-o', `-k ${dir} -c listen_addresses='' -p ${port}`, '-w', '-l', join(dir, 'log'), 'start']);
  t.after(() => { try { as(join(PGBIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']); } catch {} rmSync(dir, { recursive: true, force: true }); });
  const psql = (sql) => {
    const f = join(dir, `q${crypto.randomBytes(4).toString('hex')}.sql`); writeFileSync(f, sql); chmodSync(f, 0o644);
    return as('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-f', f]).trim().split('\n').filter(Boolean);
  };
  psql(MD.match(/```sql\n([\s\S]*?)```/)[1]);
  const ins = (status, ago, kind = 'approval') => psql(`INSERT INTO ops.notifications (kind, "to", dedupe_key, signal_key, severity, status, updated_at)
    VALUES ('${kind}', 'console', 'k', 's', 'amber', '${status}', now() - interval '${ago}') RETURNING id`)[0];
  const stuck = ins('sending', '11 minutes');
  const fresh = ins('sending', '5 minutes');
  const alert = ins('sending', '1 hour', 'alert');
  const q = node('Re-queue stuck approvals').parameters.query;
  assert.deepEqual(psql(q), [`${stuck}|queued|1`], 'only the approval row older than 10 min');
  assert.deepEqual(psql(q), [], 're-queued once: the row is queued now, not sending');
  const st = (id) => psql(`SELECT status, payload->>'requeue_attempts' FROM ops.notifications WHERE id = ${id}`)[0];
  assert.equal(st(fresh), 'sending|'); assert.equal(st(alert), 'sending|', 'W22 alerts are not touched');
  for (const n of [2, 3]) { // W32 claims it again and it sticks again
    psql(`UPDATE ops.notifications SET status = 'sending', updated_at = now() - interval '11 minutes' WHERE id = ${stuck}`);
    assert.deepEqual(psql(q), [`${stuck}|queued|${n}`]);
  }
  psql(`UPDATE ops.notifications SET status = 'sending', updated_at = now() - interval '11 minutes' WHERE id = ${stuck}`);
  assert.deepEqual(psql(q), [`${stuck}|send_failed|3`], 'after 3 re-queues: send_failed, attempts stay at 3');
  assert.deepEqual(psql(q), []);
});

// I-47g: nothing serves /webhook/w22-alert, so W30/W31/W23 hand alerts to W22 by Execute Workflow smc-w22 (CONTRACTS.md
// "Sub-workflow interfaces"). Each "<name>: W22 signal" Code node is run for real and its item fed to Normalise inbound signal.
test('I-47g: W30/W31/W23 alerts reach W22 by Execute Workflow smc-w22 with a readable own-shape signal (never unknown_signal)', async () => {
  const { runCode: runN8n } = await import('./_n8ncode.mjs');
  const refs = { 'Action ctx': { esc: { kind: 'human_handoff', to: ['Jonathan'] }, platform: 'facebook' }, 'Parse sentiment': { ad_id: '120200000000001', sentiment: 'negative', flag_media_buyer: true },
    'Finalise DM': { esc: { kind: 'dm_handoff', to: ['Jonathan'] }, channel: 'messenger' }, 'Compose rejection': { broker_id: 'b1', reject_code: 'too_long', take_id: 't1' },
    'Verify broker JWT (approve)': { sub: 'b1', body: { take_id: 't1' } } };
  const json = { reason: 'signature_mismatch', id: 'esc-1', ref_id: '120200000000001', execution: { lastNodeExecuted: 'X', error: { message: 'boom' } } };
  let seen = 0;
  for (const f of ['W30', 'W31', 'W23']) {
    const w = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', `${f}.json`), 'utf8'));
    const raw = JSON.stringify(w);
    assert.doesNotMatch(raw, /w22-alert|OPS_ALERT_WEBHOOK|W22 Internal Webhook/, `${f}: no alert webhook left`);
    for (const sig of w.nodes.filter((n) => / W22 signal$/.test(n.name))) {
      const target = sig.name.replace(/: W22 signal$/, '');
      const ex = w.nodes.find((n) => n.name === target);
      assert.equal(ex.type, 'n8n-nodes-base.executeWorkflow', `${f} ${target}`);
      assert.equal(ex.parameters.workflowId.value, 'smc-w22'); assert.equal(ex.parameters.workflowId.mode, 'id');
      assert.deepEqual(w.connections[sig.name].main[0].map((l) => l.node), [target]);
      const item = (await runN8n(w, sig.name, { json, refs, env: { CONSOLE_URL: 'https://console.example' } })).json;
      assert.ok(!('kind' in item), `${f} ${sig.name}: no 'kind' (W22 reads it as ack / W34 shape)`);
      const out = runCode('Normalise inbound signal', { input: [item] });
      assert.equal(out.length, 1); assert.equal(out[0].signal_key, item.signal_key, `${f} ${sig.name}`);
      assert.notEqual(out[0].signal_key, 'unknown_signal'); assert.ok(['red', 'amber'].includes(out[0].severity)); assert.equal(out[0].source, f);
      seen++;
    }
  }
  assert.equal(seen, 10, 'W30 x4, W31 x2, W23 x4');
});
