// Local proof (crm-nurture, 2026-10-11): the W13 "Claim replacement" node (automation/W13.json) is ONE implicit transaction (two
// statements in one query string, queryBatching left at the default 'single'), so pg_advisory_xact_lock serialises a broker's
// requests per Calendar Week; and the routing triggers never over-deliver a CRM lead order. Runs the REAL node SQL and the REAL
// migration chain, concurrently, on the live-schema mirror in a throwaway Postgres (Docker --network none or native binaries;
// never the live DB). Skipped when neither backend exists. Each claim is one simple-protocol query = what n8n/pg-promise sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';
import * as R from '../lib/w13.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const W13 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W13.json'), 'utf8'));
const node = W13.nodes.find((n) => n.name.startsWith('Claim replacement'));
const BACKEND = localPgBackend();

test('W13 claim node: static shape = one query string, two statements (week lock + claim), batching single', () => {
  assert.ok(node, 'claim node exists');
  const opt = node.parameters.options || {};
  assert.equal(opt.queryBatching, 'single', 'pinned to single: lock and count in one transaction');
  const stmts = node.parameters.query.replace(/--[^\n]*/g, '').split(/;\s*\n/).map((s) => s.trim().replace(/;$/, '')).filter(Boolean);
  assert.equal(stmts.length, 2, 'lock + claim');
  assert.match(stmts[0], /^SELECT pg_advisory_xact_lock\(hashtextextended\('w13:week:' \|\| \$5::uuid::text \|\| ':' \|\| to_char\(public\.smc_week_start\(COALESCE\(\$10::timestamptz, \$9::timestamptz\)\) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'\), 0\)\)$/);
  assert.ok(!/\bCOMMIT\b|\bBEGIN\b/i.test(node.parameters.query), 'no hand-rolled txn control');
  // the portal RPC uses the very same key expression, so both paths exclude each other
  const mig = readFileSync(join(ROOT, 'supabase', 'migrations', '20261011030000_smc_03_orders_outcomes.sql'), 'utf8');
  assert.match(mig, /pg_advisory_xact_lock\(hashtextextended\('w13:week:' \|\| v_broker::text \|\| ':' \|\| to_char\(public\.smc_week_start\(a\.appointment_date\) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'\), 0\)\)/);
});

test('W13 claim SQL + routing triggers concurrently on the live-schema mirror: weekly max 3, one per lead, no partial write, no over-delivery', { skip: !BACKEND && 'no local Postgres (Docker or native binaries)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(BACKEND);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const fill = (sql, params) => sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));

  const uuid = () => crypto.randomUUID();
  const brand = q("SELECT id FROM public.brands WHERE code = 'SMC'")[0][0];
  const user = uuid(), broker = uuid(), order = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-claim-broker@example.test')`);
  // routing_on needs the FSP number, practice, adviser and intro card (brokers_smc_routing_ready, 2026-10-11)
  const READY = `fsp_number, intro_card_url`; const readyVals = `'12345', 'https://media.sortmycover.co.za/intro/synthetic/card.png'`;
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, ${READY}) VALUES ('${broker}', '${user}', 'Synthetic FSP', 'Synthetic', 'synthetic-claim-broker@example.test', 'active', '${brand}', true, ${readyVals})`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${order}', '${broker}', 'synthetic SMC order', 30, 'paid', now(), '${brand}')`);
  let n = 0;
  const mkLead = (routed = true) => {
    const id = uuid(); n += 1;
    // email verified (2026-10-11: a lead counts at email verified + attendance confirmed; section 4 covers the unverified order)
    q(`INSERT INTO public.leads (id, phone, first_name, source, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at, email, email_verified, email_verified_at, email_verified_via)
       VALUES ('${id}', '+27600007${String(n).padStart(3, '0')}', 'Synthetic', 'Search Lead', '${brand}', ${routed ? `'${broker}'` : 'NULL'}, now(), 'consent', 'ctwa', now(), 'synthetic${n}@example.test', true, now(), 'link')`);
    return id;
  };
  // Delivered = booked + attendance confirmed (agreement 5.2): a confirmed appointment counts the lead on the order.
  let slot = 0;
  const deliver = (lead, b = broker) => { slot += 1; q(`INSERT INTO public.appointments (broker_id, client_id, appointment_date, ends_at, status, brand_id, method, confirmed_at)
       VALUES ('${b}', '${lead}', '2026-09-01T06:00:00Z'::timestamptz + interval '${slot} hours', '2026-09-01T06:30:00Z'::timestamptz + interval '${slot} hours', 'confirmed', '${brand}', 'teams', now())`); };
  const monday = '2026-10-12T10:00:00+02:00'; // a Monday in SAST
  const claimAsync = (lead, extra = {}) => pg.query(fill(node.parameters.query,
    [lead, null, null, order, broker, brand, extra.reason || 'no_show', extra.code || 'no_show', extra.at || new Date().toISOString(), extra.missed || monday]));

  // ---- (0) the lock key the SQL computes = lib/w13 weekLockKey (same SAST week boundary in every session)
  const sqlKey = q(`SELECT 'w13:week:${broker}:' || to_char(public.smc_week_start('2026-10-14T23:30:00+02:00'::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI')`)[0][0];
  assert.equal(sqlKey, R.weekLockKey(broker, '2026-10-14T23:30:00+02:00'));
  assert.equal(R.weekStart('2026-10-18T23:59:00+02:00'), '2026-10-11T22:00:00.000Z', 'Sunday 23:59 SAST is still that week');
  assert.equal(R.weekStart('2026-10-19T00:00:00+02:00'), '2026-10-18T22:00:00.000Z', 'Monday 00:00 SAST starts the next');

  // ---- (1) 8 delivered leads, 8 concurrent claims for missed appointments in ONE Calendar Week: exactly 3 open
  const leads = Array.from({ length: 8 }, () => mkLead());
  assert.equal(q(`SELECT count(*) FROM public.lead_order_items WHERE order_id = '${order}'`)[0][0], '0', 'routing reserves, it does not count');
  assert.equal(q(`SELECT count(*) FROM public.leads WHERE lead_order_id = '${order}' AND order_state = 'attached'`)[0][0], '8', 'routing reserved a place for every lead');
  for (const l of leads) deliver(l);
  assert.equal(q(`SELECT count(*) FROM public.lead_order_items WHERE order_id = '${order}'`)[0][0], '8', 'confirmed attendance counted every lead on the order');
  const res = await Promise.all(leads.map((l) => claimAsync(l)));
  for (const r of res) assert.equal(r.err, null, r.stderr);
  const tally = Object.fromEntries(q(`SELECT status, count(*) FROM public.replacements WHERE broker_id = '${broker}' GROUP BY 1`));
  assert.deepEqual(tally, { due: '3' }, 'exactly 3 requests opened; nothing written past the maximum');
  assert.equal(res.filter((r) => /\|refused\|weekly_max\|/.test(r.stdout)).length, 5, 'the other 5 come back as refused rows (Jonathan alerted)');
  assert.deepEqual(q(`SELECT cap_position FROM public.replacements WHERE broker_id = '${broker}' ORDER BY 1`).flat(), ['1', '2', '3'], 'positions contiguous: no gap from a lost race');
  assert.equal(q(`SELECT count(DISTINCT lead_order_id) FROM public.replacements WHERE broker_id = '${broker}' AND lead_order_id = '${order}'`)[0][0], '1', 'linked to the lead order');
  // the next Calendar Week opens again
  const nextWeek = await claimAsync(leads[7], { missed: '2026-10-19T09:00:00+02:00' });
  assert.equal(nextWeek.err, null, nextWeek.stderr);
  assert.match(nextWeek.stdout, /\|due\|/);

  // ---- (2) the same lead claimed 5x at once in a fresh week: one live row only (one per lead)
  const one = mkLead(); deliver(one);
  const dup = await Promise.all(Array.from({ length: 5 }, () => claimAsync(one, { missed: '2026-10-26T09:00:00+02:00' })));
  for (const r of dup) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE lead_id = '${one}'`)[0][0], '1', 'one row for one lead');
  assert.equal(dup.filter((r) => /\|due\|/.test(r.stdout)).length, 1, 'only one caller opened it; the others no-op');

  // ---- (3) no partial write / no leaked lock: a claim with a reason outside the agreed rule fails and writes nothing
  const bad = await claimAsync(mkLead(), { reason: 'disqualified', code: 'nofit_criteria', missed: '2026-11-02T09:00:00+02:00' });
  assert.ok(bad.err && /reason|check/i.test(bad.stderr), 'disqualified is not a replacement reason');
  assert.equal(q("SELECT count(*) FROM public.replacements WHERE missed_start_at >= '2026-11-02'")[0][0], '0', 'failed claim wrote nothing');
  assert.equal(q("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'")[0][0], '0', 'xact lock released on rollback');

  // ---- (4) capacity: 10 leads routed concurrently to a broker whose order has room for 3 -> 3 reserved, 7 held, never more;
  //          the 3 then confirm concurrently -> exactly 3 counted
  const user2 = uuid(), broker2 = uuid(), order2 = uuid();
  q(`INSERT INTO auth.users (id, email) VALUES ('${user2}', 'synthetic-cap-broker@example.test')`);
  q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, status, brand_id, routing_on, ${READY}) VALUES ('${broker2}', '${user2}', 'Synthetic Two', 'Synthetic', 'synthetic-cap-broker@example.test', 'active', '${brand}', true, ${readyVals})`);
  q(`INSERT INTO public.lead_orders (id, broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${order2}', '${broker2}', 'synthetic small order', 3, 'paid', now(), '${brand}')`);
  const ins = await Promise.all(Array.from({ length: 10 }, (_, i) => pg.query(
    `INSERT INTO public.leads (id, phone, first_name, source, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at)
     VALUES ('${uuid()}', '+27600006${String(i).padStart(3, '0')}', 'Cap', 'Search Lead', '${brand}', '${broker2}', now(), 'consent', 'ctwa', now()) RETURNING broker_id`)));
  for (const r of ins) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.leads WHERE lead_order_id = '${order2}' AND order_state = 'attached'`)[0][0], '3', 'never over-reserved');
  assert.equal(q(`SELECT count(*) FROM public.lead_order_items WHERE order_id = '${order2}'`)[0][0], '0', 'nothing counted at hand-over');
  assert.equal(q(`SELECT count(*) FROM public.leads WHERE phone LIKE '+27600006%' AND broker_id = '${broker2}'`)[0][0], '3');
  assert.equal(q("SELECT count(*) FROM public.leads WHERE phone LIKE '+27600006%' AND broker_id IS NULL AND routing_reason = 'held_no_open_order'")[0][0], '7', 'the rest are held, stored, not handed over');
  assert.deepEqual(q(`SELECT open, remaining FROM public.smc_order_capacity WHERE lead_order_id = '${order2}'`)[0], ['f', '0']);
  const routed = q(`SELECT id FROM public.leads WHERE broker_id = '${broker2}' ORDER BY id`).flat();
  const conf = await Promise.all(routed.map((l, i) => pg.query(`INSERT INTO public.appointments (broker_id, client_id, appointment_date, ends_at, status, brand_id, method, confirmed_at)
     VALUES ('${broker2}', '${l}', '2026-09-05T06:00:00Z'::timestamptz + interval '${i * 2} hours', '2026-09-05T06:30:00Z'::timestamptz + interval '${i * 2} hours', 'confirmed', '${brand}', 'teams', now()) RETURNING id`)));
  for (const r of conf) assert.equal(r.err, null, r.stderr);
  // 2026-10-11: attendance confirmed but the emails are not verified yet -> nothing counted; the 3 verifications arrive at once
  assert.equal(q(`SELECT count(*) FROM public.lead_order_items WHERE order_id = '${order2}'`)[0][0], '0', 'confirmed attendance alone counts nothing (email not verified)');
  const ver = await Promise.all(routed.map((l) => pg.query(`UPDATE public.leads SET email = 'cap-' || left(id::text, 8) || '@example.test', email_verified = true, email_verified_at = now(), email_verified_via = 'code' WHERE id = '${l}' RETURNING id`)));
  for (const r of ver) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.lead_order_items WHERE order_id = '${order2}'`)[0][0], '3', 'the 3 confirmed + verified leads are counted, never more');
  assert.deepEqual(q(`SELECT counted, reserved, counted_toward_order FROM public.smc_order_capacity WHERE lead_order_id = '${order2}'`)[0], ['3', '0', '3']);

  // ---- (5) FAIS disclosure: no broker without an FSP number gets routing on, and no lead is ever introduced to one
  const broker3 = uuid();
  const noFsp = await pg.query(`INSERT INTO public.brokers (id, firm_name, contact_person, email, status, brand_id, routing_on, intro_card_url)
     VALUES ('${broker3}', 'No FSP Practice', 'Synthetic', 'synthetic-nofsp@example.test', 'active', '${brand}', true, 'https://media.sortmycover.co.za/x.png')`);
  assert.ok(noFsp.err && /brokers_smc_routing_ready/.test(noFsp.stderr), 'routing_on refused without an FSP number');
  q(`INSERT INTO public.brokers (id, firm_name, contact_person, email, status, brand_id, routing_on) VALUES ('${broker3}', 'No FSP Practice', 'Synthetic', 'synthetic-nofsp@example.test', 'active', '${brand}', false)`);
  q(`INSERT INTO public.lead_orders (broker_id, title, lead_count, status, paid_at, brand_id) VALUES ('${broker3}', 'order of a broker without FSP', 5, 'paid', now(), '${brand}')`);
  const held = uuid();
  q(`INSERT INTO public.leads (id, phone, first_name, source, brand_id, broker_id, routed_at, consent_text, consent_source, consent_at)
     VALUES ('${held}', '+27600005001', 'Held', 'Search Lead', '${brand}', '${broker3}', now(), 'consent', 'ctwa', now())`);
  assert.deepEqual(q(`SELECT coalesce(broker_id::text, 'none'), routing_reason FROM public.leads WHERE id = '${held}'`)[0], ['none', 'held_broker_not_ready'], 'held, never introduced');
});
