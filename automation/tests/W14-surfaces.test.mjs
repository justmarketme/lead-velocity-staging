// S7-07 offline proofs (local synthetic fixtures; no network, no database): node --test automation/tests/W14-surfaces.test.mjs
// (1) W14 builds the weekly report from the synthetic cycle payload; (2) WhatsApp 6-liner, portal Reports tab and
// email/PDF carry the same numbers from ONE payload; (3) the one-ask button is handled end to end in code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderEmail, renderPrint, visibleText } from '../../scripts/build-broker-report-email.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, '..', '..', ...p), 'utf8');
const WF = JSON.parse(read('automation', 'W14.json'));
const FX = JSON.parse(read('automation', 'tests', 'fixtures', 'w14-payloads.json'));
const SQL = read('analytics', 'W14-broker-payload.sql');
const TSX = read('src', 'pages', 'portal', 'Reports.tsx');
const APP = read('src', 'App.tsx');
const code = (n) => WF.nodes.find((x) => x.name === n).parameters.jsCode;
const run = (name, input) => { const w = (a) => ({ all: () => a.map((j) => ({ json: j })) });
  return JSON.parse(JSON.stringify(vm.runInContext(`(function(){\n${code(name)}\n})()`, vm.createContext({ $input: w(input) })).map((i) => i.json))); };
const opts = { portalUrl: 'https://portal.example.invalid', reportId: 'r-1' };
const p = FX.weekly_close_rate;
const pct = (v) => `${Math.round(v * 100)}%`;
const row = { report_id: 'r-1', broker_id: 'b-1', cycle_id: p.cycle.id, edition: p.edition, payload: p, wa_to: '27600009998' };

test('(1) W14: the weekly payload is generated from the synthetic cycle and flows into store + send nodes', () => {
  assert.equal(p.schema, 'broker_report/1'); assert.equal(p.edition, 'weekly');
  assert.match(p.cycle.id, /^0000/, 'synthetic cycle id');
  assert.match(WF.nodes.find((n) => n.name === 'Build payloads').parameters.query, /facts\.w14_broker_report\(/);
  assert.match(SQL, /create or replace function facts\.w14_broker_report/);
  assert.match(WF.nodes.find((n) => n.name === 'Store report').parameters.query, /report_data/);
  assert.equal(run('Build WhatsApp template', [row])[0].template, 'broker_weekly');
});

test('(2a) one computation: payload.wa is built in SQL from the same figures as s2_progress', () => {
  const wa = SQL.slice(SQL.indexOf("when 'midcycle'")); // weekly branch uses n.delivered / n.booked / n.show_rate-style variables
  assert.match(SQL, /'v2', format\('%s of %s \(target %s by now, last week %s\)', n\.delivered, c\.committed_leads, pace, w\.delivered\)/);
  assert.ok(wa.length > 0);
  const s2 = p.s2_progress;
  assert.ok(p.wa.v2.startsWith(`${s2.delivered.v} of ${s2.delivered.committed} (target ${s2.delivered.target} by now, last week ${s2.delivered.last})`), p.wa.v2);
  assert.ok(p.wa.v3.startsWith(`${s2.booked.v} (last week ${s2.booked.last})`), p.wa.v3);
  assert.ok(p.wa.v4.startsWith(`${pct(s2.show_rate.v)} (target ${pct(s2.show_rate.target)}, last week ${pct(s2.show_rate.last)})`), p.wa.v4);
});

for (const key of ['weekly_close_rate', 'weekly_no_close_rate']) {
  test(`(2b) ${key}: WhatsApp message, email and PDF-print HTML show the payload's numbers`, () => {
    const q = FX[key], s2 = q.s2_progress;
    const sent = run('Build WhatsApp template', [{ ...row, payload: q, cycle_id: q.cycle.id }])[0];
    const waText = sent.payload.template.components[0].parameters.map((x) => x.text).join(' | ');
    assert.ok(waText.includes(String(s2.delivered.v)) && waText.includes(String(s2.delivered.committed)) && waText.includes(String(s2.booked.v)) && waText.includes(pct(s2.show_rate.v)), waText);
    for (const [label, html] of [['email', renderEmail(q, opts)], ['print/PDF', renderPrint(q, opts)]]) {
      const t = visibleText(html);
      assert.ok(t.includes(q.s1_one_line.replace(/\s+/g, ' ')) || t.includes(String(s2.delivered.v)), `${label} carries the one-liner or delivered`);
      for (const n of [`${s2.delivered.v}`, `${s2.delivered.committed}`, `${s2.booked.v}`, `${s2.attended.v}`, pct(s2.show_rate.v)]) assert.ok(t.includes(n), `${label} shows ${n}`);
      assert.ok(t.includes(String(s2.replacements.used)) && t.includes(String(s2.replacements.cap)), `${label} shows replacements`);
    }
  });
}

test('(2c) portal Reports tab reads the same payload and computes no figures of its own', () => {
  // ux-sprint-1 (crm-ux-synthesis S4): "delivered of committed" and the replacement counter moved into the shared
  // CycleCard (one query for Today, My leads and Reports; clause 5.2 delivered, clause 7.2 weekly requests), so the
  // page no longer prints s2.delivered / s2.replacements itself. The weekly figures still come from the payload.
  assert.match(TSX, /<CycleCard \/>/, 'section 2 is the shared CycleCard');
  for (const f of ['s2.booked.v', 's2.attended.v', 's2.show_rate.v', 'p.s1_one_line']) assert.ok(TSX.includes(`{${f}}`) || TSX.includes(`${f}`), f);
  assert.match(TSX, /smcDb\.from\("reports"\)\.select\("\*"\)/, 'one reports row feeds the page');
  assert.doesNotMatch(TSX, /\.reduce\(|\.filter\([^)]*attended|\/ *s2\.attended/, 'no recomputed rates');
  assert.ok(TSX.includes('p.s1_one_line'));
});

test('(3a) one-ask: every code the SQL selector can emit has a portal destination (no fall-through to /broker/start)', () => {
  const codes = [...SQL.matchAll(/then '([a-z_]+)'(?:\s|$)/g)].map((m) => m[1]);
  const emitted = [...SQL.matchAll(/when '([a-z_]+)' then jsonb_build_object\('code'/g)].map((m) => m[1]);
  assert.ok(emitted.length >= 7, `found ${emitted}`); assert.ok(codes.length > 0);
  const map = TSX.slice(TSX.indexOf('ASK_ROUTE'), TSX.indexOf('const light'));
  // ux-sprint-1 (agreement clause 8.4): asks that collect outcome data (close rate, follow-ups) are retired in the
  // portal: never routed, never shown. Every other code still needs a destination.
  const retired = ['add_close_rate', 'followup_due'];
  for (const c of retired) {
    assert.ok(map.includes(`"${c}"`) && /RETIRED_ASKS = new Set/.test(map), `${c} is listed in RETIRED_ASKS`);
    assert.doesNotMatch(map, new RegExp(`\\b${c}:`), `${c} has no route`);
  }
  assert.match(TSX, /!RETIRED_ASKS\.has\(p\.s7_ask\.code\)/, 'a retired ask is never shown');
  for (const c of emitted.filter((x) => !retired.includes(x))) assert.match(map, new RegExp(`\\b${c}:`), `ASK_ROUTE covers ${c}`);
});

test('(3b) one-ask: WhatsApp "Do it now" and email button carry the same deep link; portal resolves it; the tap marks it done', () => {
  const btn = run('Build WhatsApp template', [row])[0].payload.template.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].text);
  assert.equal(btn[0], p.s7_ask.deep_link); assert.match(btn[0], /^ask\/rp_\d{4}w\d{2}$/);
  const html = renderEmail(p, opts);
  assert.ok(html.includes(`https://portal.example.invalid/${p.s7_ask.deep_link}`), 'email button href');
  assert.match(APP, /path="\/ask\/:key" element=\{<SmcReportLink ask \/>\}/); assert.match(APP, /path="\/r\/:key"/);
  assert.match(APP, /\/broker\/reports\?wk=\$\{encodeURIComponent\(key/);
  assert.match(TSX, /params\.get\("wk"\)/); assert.match(TSX, /params\.get\("ask"\) === "1"/);
  assert.match(TSX, /smc_report_ask_done/); assert.match(TSX, /onClick=\{doAsk\}/);
  assert.equal(String(p.week).toLowerCase().replace('-', ''), btn[0].replace('ask/rp_', ''), 'week key resolves to this report');
  const fn = read('supabase', 'migrations', '20261002_smc_06_pass2.sql');
  assert.match(fn, /SET ask_done_at = coalesce\(ask_done_at, now\(\)\)[\s\S]{0,200}broker_id = public\.smc_current_broker_id\(\)/, 'only the owner can mark it, once');
});

test('(3c) no ask this week: no ask button anywhere', () => {
  const q = structuredClone(p); q.s7_ask = null; delete q.wa.v6;
  const m = run('Build WhatsApp template', [{ ...row, payload: q }])[0];
  assert.equal(m.template, 'broker_weekly_noask');
  assert.ok(!renderEmail(q, opts).includes('/ask/'));
});
