// W14 weekly reports acceptance test. Offline, zero dependencies: node --test automation/tests/W14.test.mjs
// Runs the Code nodes *from the exported automation/W14.json* in a sandbox against synthetic payloads produced by
// facts.w14_broker_report() on the analytics fixture (automation/tests/fixtures/w14-payloads.json). No network, no database, no real person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const WF = JSON.parse(readFileSync(join(here, '..', 'W14.json'), 'utf8'));
const FX = JSON.parse(readFileSync(join(here, 'fixtures', 'w14-payloads.json'), 'utf8'));
const tpl = (n) => JSON.parse(readFileSync(join(here, '..', 'templates', `${n}.json`), 'utf8'));
const SQL_FILE = readFileSync(join(here, '..', '..', 'analytics', 'W14-broker-payload.sql'), 'utf8');
const node = (name) => { const n = WF.nodes.find((x) => x.name === name); assert.ok(n, `node ${name} exists`); return n; };

function runCode(name, { input = [], refs = {} } = {}) {
  const wrap = (arr) => ({ all: () => arr.map((j) => ({ json: j })), first: () => ({ json: arr[0] }) });
  const ctx = vm.createContext({ $input: wrap(input), $: (n) => { assert.ok(refs[n], `test supplies $('${n}')`); return wrap(refs[n]); }, $env: {} });
  const out = vm.runInContext(`(function () {\n${node(name).parameters.jsCode}\n})()`, ctx);
  return JSON.parse(JSON.stringify(out.map((i) => i.json)));
}
const strings = (o, acc = []) => { if (typeof o === 'string') acc.push(o); else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, acc); return acc; };

// ---------------------------------------------------------------- the workflow file
test('W14.json: structure, standard nodes, connections resolve, credentials by name, no secrets', () => {
  assert.equal(WF.active, false, 'exported inactive');
  const names = WF.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length, 'unique node names');
  for (const n of WF.nodes) assert.match(n.type, /^n8n-nodes-base\./, `${n.name}: standard node type`);
  for (const [from, c] of Object.entries(conns())) {
    assert.ok(names.includes(from), `connection source ${from}`);
    for (const out of c.main) for (const t of out) assert.ok(names.includes(t.node), `${from} -> ${t.node}`);
  }
  for (const n of WF.nodes.filter((x) => x.credentials)) for (const c of Object.values(n.credentials)) { assert.equal(c.id, null, 'credential by name only'); assert.ok(c.name); }
  const text = JSON.stringify(WF);
  assert.doesNotMatch(text, /EAA[A-Za-z0-9]{20,}|sk-ant-|Bearer [A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{20,}/, 'no tokens in the file');
  assert.match(text, /\$env\.PHONE_NUMBER_ID/, 'phone number id comes from $env');
});
function conns() { return WF.connections; }

test('W14.json: schedule, payload SQL, store and send follow the spec', () => {
  const cron = (n) => node(n).parameters.rule.interval[0].expression;
  assert.equal(cron('Daily 23:00 generate'), '0 23 * * *');
  assert.equal(cron('Daily 07:00 send'), '0 7 * * *');
  assert.equal(cron('Sunday 23:00 Lead Velocity weekly'), '0 23 * * 0');
  assert.equal(WF.settings.timezone, 'Africa/Johannesburg');
  const q = node('Build payloads').parameters.query;
  assert.match(q, /facts\.w14_broker_report\(/); assert.match(q, /facts\.w14_hold\(/); assert.match(q, /facts\.w14_reconcile\(/);
  assert.match(SQL_FILE, /create or replace function facts\.w14_broker_report/, 'the SQL the node calls is the analytics file');
  const store = node('Store report').parameters.query;
  assert.match(store, /insert into public\.report_history/); assert.match(store, /report_data/); assert.match(store, /sent_wa_at is null/, 'a sent report is never overwritten');
  assert.match(node('Store held report and alert').parameters.query, /'held'/);
  assert.match(node('Build Lead Velocity payload').parameters.query, /facts\.w14_lv_payload\(\)/);
  assert.match(node('Store Lead Velocity weekly').parameters.query, /lv_weekly/);
  assert.match(node('WhatsApp send').parameters.url, /graph\.facebook\.com/);
});

test('W14.json: keep-or-skip lets a weekly through only on Monday sends; other editions always', () => {
  const rows = [{ edition: 'weekly', send_is_monday: false }, { edition: 'weekly', send_is_monday: true }, { edition: 'midcycle', send_is_monday: false }, { edition: 'cycle_end', send_is_monday: false }];
  const kept = runCode('Keep or skip edition', { input: rows });
  assert.deepEqual(kept.map((r) => `${r.edition}:${r.send_is_monday}`), ['weekly:true', 'midcycle:false', 'cycle_end:false']);
});

// ---------------------------------------------------------------- payload shape (the same payload the portal reads)
const SECTIONS = ['s1_one_line', 's2_progress', 's3_meetings', 's4_quality', 's5_notice', 's6_roi', 's7_ask', 's8_cycle', 'wa'];
for (const key of ['weekly_close_rate', 'weekly_no_close_rate', 'midcycle', 'cycle_end']) {
  test(`payload ${key}: section shape and figures`, () => {
    const p = FX[key];
    assert.equal(p.schema, 'broker_report/1');
    for (const s of SECTIONS) assert.ok(s in p, `${s} present`);
    assert.equal(typeof p.s1_one_line, 'string');
    for (const f of ['delivered', 'booked', 'attended', 'show_rate', 'verified']) for (const k of ['v', 'target', 'last']) assert.ok(k in p.s2_progress[f], `s2_progress.${f}.${k}`);
    assert.ok(Number.isInteger(p.s2_progress.booked.v), 'booked.v is a count');
    assert.ok(Number.isInteger(p.s2_progress.booked.last), 'booked.last is a count (I-20), not the 0.60 rate of the old example');
    assert.ok(p.s2_progress.booked.last >= 0);
    assert.ok(['green', 'amber', 'red', 'grey'].includes(p.s2_progress.show_rate.light));
    // 10 Oct 2026: goodwill, 3 requests a calendar week (LGSA 7.2): the payload has no replacement cap and no traffic light
    assert.deepEqual(Object.keys(p.s2_progress.replacements).sort(), ['last_used', 'used']);
    assert.deepEqual(Object.keys(p.s3_meetings).sort(), ['last_week', 'next_week', 'todos']);
    assert.deepEqual(Object.keys(p.s3_meetings.todos).sort(), ['followups_due', 'not_reached', 'unmarked']);
    for (const k of ['avg_rating', 'ratings_given', 'mix', 'themes', 'lead_pulse']) assert.ok(k in p.s4_quality);
    assert.ok(Array.isArray(p.s5_notice));
    assert.ok(p.s7_ask === null || (p.s7_ask.code && p.s7_ask.text && p.s7_ask.button && p.s7_ask.deep_link), 'one ask or none');
    assert.equal(typeof p.s8_cycle.line, 'string');
  });
}

test('s6_roi is {shown:false} and nothing else when no close rate is set', () => {
  assert.deepEqual(FX.weekly_no_close_rate.s6_roi, { shown: false });
  for (const k of ['midcycle', 'cycle_end']) assert.deepEqual(FX[k].s6_roi, { shown: false });
  assert.doesNotMatch(JSON.stringify(FX.weekly_no_close_rate), /policies_reported|tracking_to|close_rate/, 'policies never leak outside s6 (FAIS)');
});

test('s6_roi is {shown:false} in every payload; no policies or close-rate figure is stored (compliance review 4)', () => {
  for (const [k, p] of Object.entries(FX)) {
    if (!p || !p.s1_one_line) continue;
    assert.deepEqual(p.s6_roi, { shown: false }, k);
    assert.doesNotMatch(JSON.stringify(p), /policies_reported|tracking_to|meetings_to_policies|"close_rate"/, k);
  }
});

test('s8_cycle.line says "no lock-in" (I-30f); "no contract" and "guarantee" appear nowhere', () => {
  for (const [k, p] of Object.entries(FX)) {
    if (!p.s8_cycle) continue;
    assert.match(p.s8_cycle.line, /No lock-in\./, k);
    assert.doesNotMatch(JSON.stringify(p), /no contract|guarantee/i, k);
  }
  assert.doesNotMatch(SQL_FILE.split('\n').filter((l) => /cycle_line :=/.test(l)).join(''), /No contract/);
});

test('no second-person claim text: no promises or invented outcomes addressed to "you"', () => {
  const CLAIM = /\byou(?:'ll| will| are going to)\s+(?:get|earn|make|write|close|sell|win|receive|see|gain)\b|\bwe (?:promise|guarantee|will deliver)\b|\bguarantee/i;
  for (const [k, p] of Object.entries(FX)) {
    if (!p.schema) continue;
    const text = strings({ ...p, s3_meetings: undefined }).join(' | ');
    assert.doesNotMatch(text, CLAIM, `${k}: ${text.match(CLAIM)}`);
  }
});

test('banned words (R03/R11): no cost, jargon or other advisers in the payload', () => {
  const banned = /(spen[dt]|\bcpl\b|\bcpc\b|\bctr\b|cost per|margin|creative|campaign|adset|\bemq\b|\bcapi\b|attribution|\broas\b|cheapest|\bbest\b)/i;
  for (const [k, p] of Object.entries(FX)) if (p.schema) assert.doesNotMatch(strings({ ...p, s3_meetings: undefined, broker: undefined }).join(' | '), banned, k);
});

// ---------------------------------------------------------------- WhatsApp template build
const rowFor = (p) => ({ report_id: 'r-1', broker_id: 'b-1', cycle_id: p.cycle.id, edition: p.edition, payload: p, wa_to: '27600009998' });
const bodyVars = (name) => { const t = tpl(name); const b = t.components.find((c) => c.type === 'BODY'); return b.example.body_text[0].length; };
const buttons = (name) => (tpl(name).components.find((c) => c.type === 'BUTTONS') || { buttons: [] }).buttons.length;
const nameOf = { weekly_close_rate: 'broker_weekly', midcycle: 'broker_midcycle', cycle_end: 'broker_cycle_end' };

for (const [key, expect] of Object.entries(nameOf)) {
  test(`WhatsApp build ${key}: approved template ${expect}, parameter and button counts match, six lines, no names`, () => {
    const p = FX[key]; assert.ok(p.s7_ask || key !== 'weekly_close_rate');
    const [m] = runCode('Build WhatsApp template', { input: [rowFor(p)] });
    assert.equal(m.template, expect);
    const comps = m.payload.template.components;
    assert.equal(comps[0].parameters.length, bodyVars(expect), 'body parameters = template variables');
    assert.equal(comps.length - 1, buttons(expect), 'url buttons = template buttons');
    for (const prm of comps[0].parameters) { assert.doesNotMatch(prm.text, /\n|\s{2,}/, 'no newline or run of spaces'); assert.ok(prm.text.length > 0 && prm.text.length <= 1000); }
    const lines = tpl(expect).components.find((c) => c.type === 'BODY').text.split('\n').length;
    assert.ok(lines <= 6 + 1, `${expect} body is short (${lines} lines)`);
    const names = [...(p.s3_meetings.last_week || []), ...(p.s3_meetings.next_week || [])].flatMap((x) => [x.first_name, x.full_name].filter(Boolean));
    const sent = JSON.stringify(m.payload);
    for (const n of names) if (n.length > 2) assert.ok(!sent.includes(n), `no lead name "${n}" in the WhatsApp message (POPIA)`);
    assert.equal(m.payload.to, '27600009998'); assert.equal(m.payload.messaging_product, 'whatsapp');
  });
}

test('WhatsApp build: no ask this week uses broker_weekly_noask (5 variables, one button); an ask uses broker_weekly with the deep link', () => {
  const noAsk = structuredClone(FX.weekly_close_rate); noAsk.s7_ask = null; delete noAsk.wa.v6;
  const [a] = runCode('Build WhatsApp template', { input: [rowFor(noAsk)] });
  assert.equal(a.template, 'broker_weekly_noask'); assert.equal(a.payload.template.components[0].parameters.length, 5);
  assert.equal(a.payload.template.components.length, 2);
  const [b] = runCode('Build WhatsApp template', { input: [rowFor(FX.weekly_close_rate)] });
  assert.equal(b.template, 'broker_weekly');
  const btn = b.payload.template.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].text);
  assert.match(btn[0], /^ask\/rp_\d{4}w\d{2}$/); assert.match(btn[1], /^r\/rp_\d{4}w\d{2}$/);
});

test('WhatsApp build: a payload with a missing wa value fails loudly instead of sending a blank', () => {
  const bad = structuredClone(FX.weekly_close_rate); delete bad.wa.v3;
  assert.throws(() => runCode('Build WhatsApp template', { input: [rowFor(bad)] }), /wa\.v3 missing/);
});
