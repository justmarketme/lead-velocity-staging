// S7-07 local proof: W14 generated from the SYNTHETIC CYCLE (supabase/seed/smc_synthetic.sql) on the REAL migration
// chain in a throwaway Postgres (_localpg.mjs; never the live project, never staging), then the three surfaces checked
// against that one stored row, and the one-ask button exercised end to end:
//   analytics layer (apply-analytics.sh order) -> W14 "Build payloads" (SQL: facts.w14_broker_report + w14_hold + w14_reconcile) -> "Keep or skip edition" (Code)
//   -> "Store report" (SQL) -> public.reports view (what Reports.tsx reads) -> "Build WhatsApp template" (Code, the
//   6-liner) + scripts/build-broker-report-email.mjs renderEmail/renderPrint (email + PDF) -> one-ask deep link ->
//   public.smc_report_ask_done as the broker (marks once; another broker cannot).
// Nothing is sent: the WhatsApp node only builds the Graph body; the email renderer only builds HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import { runCode, evalParam } from './_n8ncode.mjs';
import { renderEmail, renderPrint, visibleText } from '../../scripts/build-broker-report-email.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W14 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W14.json'), 'utf8'));
const TSX = readFileSync(join(ROOT, 'src', 'pages', 'portal', 'Reports.tsx'), 'utf8');
const nd = (name) => { const n = W14.nodes.find((x) => x.name === name); assert.ok(n, `W14 node ${name}`); return n; };
const PG = localPgBackend();
const BROKER = '00000000-0000-4000-8000-0000000b0001';       // the seed's fictional broker
const BROKER_USER = '00000000-0000-4000-8000-00000000b001';
const pct = (v) => `${Math.round(v * 100)}%`;

test('S7-07 local: W14 from the synthetic cycle; WhatsApp 6-liner, Reports tab and email show the same numbers; one-ask works', { skip: !PG && 'no local Postgres (no binaries, no Docker postgres:16-alpine image)', timeout: 600000 }, async (t) => {
  const pg = startLocalPg(PG);
  t.after(() => pg.stop());
  const q = makeQuery(pg);
  applyRepoMigrations(pg);
  // the analytics layer, exactly as W26 step 12 / automation/vps/apply-analytics.sh applies it (one transaction, same order)
  const order = readFileSync(join(ROOT, 'automation', 'vps', 'apply-analytics.sh'), 'utf8').match(/^FILES=\(([^)]*)\)/m)[1].trim().split(/\s+/);
  assert.deepEqual(order, ['params.sql', 'watchlist.sql', 'kill-scale.sql', 'W14-broker.sql', 'W14-lv.sql']);
  pg.sql(order.map((f) => readFileSync(join(ROOT, 'analytics', f), 'utf8')).join('\n;\n'), ['-1']);
  pg.sql("SET smc.allow_synthetic = 'on';\n" + readFileSync(join(ROOT, 'supabase', 'seed', 'smc_synthetic.sql'), 'utf8'));

  // ---- (1) generate: the real "Build payloads" query, rows as JSON
  const buildSql = nd('Build payloads').parameters.query.trim().replace(/;\s*$/, '');
  // The facts views (the console to-dos w14_reconcile ties the report to) hide is_synthetic rows unless the session opts
  // in (smc_04_facts); the payload reads the raw tables. A synthetic run must opt in, or the to-do check holds the report.
  const SYN = "SET smc.include_synthetic = 'on';\n";
  const rows = JSON.parse(q(`${SYN}SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (\n${buildSql}\n) x`)[0][0]);
  const gen = rows.find((r) => r.broker_id === BROKER);
  assert.ok(gen, `synthetic broker generated (got ${rows.map((r) => r.broker_id)})`);
  assert.equal(gen.errored, false, JSON.stringify(gen.payload).slice(0, 300));
  assert.deepEqual(gen.failed_checks, [], 'w14_reconcile: every number reconciles: ' + JSON.stringify(q(`${SYN}SELECT * FROM facts.w14_reconcile('${BROKER}') r WHERE NOT r.ok`)));
  assert.equal(gen.hold, false, 'not held');
  const P = gen.payload;
  assert.equal(P.schema, 'broker_report/1');
  // force the Monday branch of "Keep or skip edition" (the generator runs Sunday 23:00 for a Monday send)
  const kept = await runCode(W14, 'Keep or skip edition', { items: [{ ...gen, send_is_monday: true }] });
  assert.equal(kept.length, 1);
  const stored = q(nd('Store report').parameters.query, evalParam(W14, 'Store report', 'options.queryReplacement', { json: kept[0].json }));
  assert.equal(stored.length, 1, 'one report_history row');
  const reportId = stored[0][0];

  // ---- (2) the Reports tab reads public.reports.payload_json for that row (no figures of its own)
  const viewP = JSON.parse(q(`SELECT payload_json FROM public.reports WHERE id = '${reportId}'`)[0][0]);
  assert.deepEqual(viewP, P, 'Reports tab payload === generated payload');
  for (const f of ['s2.delivered.v', 's2.delivered.committed', 's2.booked.v', 's2.attended.v', 's2.show_rate.v', 's2.replacements.used', 's2.replacements.cap']) assert.ok(TSX.includes(f), `Reports.tsx renders ${f}`);
  const s2 = viewP.s2_progress;

  // ---- (3) the WhatsApp 6-liner from the same stored row
  const [due] = q(`SELECT id::text, broker_id::text, cycle_id::text, edition, report_data FROM public.report_history WHERE id = '${reportId}'`);
  const [wa] = (await runCode(W14, 'Build WhatsApp template', { items: [{ report_id: due[0], broker_id: due[1], cycle_id: due[2], edition: due[3], payload: JSON.parse(due[4]), wa_to: '27600000099' }] })).map((i) => i.json);
  const body = wa.payload.template.components.find((c) => c.type === 'body').parameters.map((x) => x.text);
  if (P.edition === 'weekly') assert.equal(body.length, P.s7_ask ? 6 : 5, `${wa.template}: the 6-liner (5 without an ask)`);
  const waText = body.join(' | ');

  // ---- (4) email + PDF-print from the same row
  const opts = { portalUrl: 'https://portal.example.invalid', reportId };
  const email = visibleText(renderEmail(viewP, opts));
  const print = visibleText(renderPrint(viewP, opts));
  const nums = { delivered: s2.delivered.v, committed: s2.delivered.committed, booked: s2.booked.v, show_rate: pct(s2.show_rate.v) };
  for (const [k, v] of Object.entries(nums)) {
    assert.ok(waText.includes(String(v)), `WhatsApp shows ${k}=${v}: ${waText}`);
    assert.ok(email.includes(String(v)), `email shows ${k}=${v}`);
    assert.ok(print.includes(String(v)), `PDF shows ${k}=${v}`);
  }
  for (const v of [s2.attended.v, s2.replacements.used, s2.replacements.cap]) { assert.ok(email.includes(String(v))); assert.ok(print.includes(String(v))); }

  // ---- (5) one-ask: same deep link in WhatsApp and email; the tap (portal RPC) marks it once, owner only
  if (P.s7_ask) {
    const btn = wa.payload.template.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].text);
    assert.equal(btn[0], P.s7_ask.deep_link);
    assert.ok(renderEmail(viewP, opts).includes(`https://portal.example.invalid/${P.s7_ask.deep_link}`), 'email button = same link');
    assert.equal(q(`SELECT ask FROM public.report_history WHERE id = '${reportId}'`)[0][0], P.s7_ask.code);
    const other = '00000000-0000-4000-8000-0000000c0999';
    q(`INSERT INTO auth.users (id, email) VALUES ('${other}', 'synthetic.other@example.com')`);
    assert.throws(() => q(`SELECT set_config('request.jwt.claim.sub', '${other}', false); SELECT public.smc_report_ask_done('${reportId}')`), /not found or not yours/);
    q(`SELECT set_config('request.jwt.claim.sub', '${BROKER_USER}', false); SELECT public.smc_report_ask_done('${reportId}')`);
    const first = q(`SELECT ask_done_at FROM public.reports WHERE id = '${reportId}'`)[0][0];
    assert.ok(first, 'ask marked done');
    q(`SELECT set_config('request.jwt.claim.sub', '${BROKER_USER}', false); SELECT public.smc_report_ask_done('${reportId}')`);
    assert.equal(q(`SELECT ask_done_at FROM public.reports WHERE id = '${reportId}'`)[0][0], first, 'second tap keeps the first time');
  } else {
    assert.equal(wa.template, 'broker_weekly_noask');
  }
  t.diagnostic(`edition=${P.edition} template=${wa.template} ask=${P.s7_ask && P.s7_ask.code} delivered=${nums.delivered}/${nums.committed} booked=${nums.booked} show=${nums.show_rate}`);
});
