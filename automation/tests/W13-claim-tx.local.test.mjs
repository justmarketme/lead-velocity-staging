// I-45m local proof: the W13 "Record request" node (automation/W13.json) is ONE implicit transaction (two statements in one
// query string, queryBatching left at the default 'single'), so pg_advisory_xact_lock serialises requests per broker and
// Calendar Week (clause 7.2: max 3). ux-sprint-1 2026-10-07: was a per-cycle claim cap. clause 7 (Jonathan 10 Oct 2026):
// the counter is shared by BOTH kinds of request (no-show and "Couldn't reach them"); reason / reason_code are parameters.
// Runs the REAL node SQL, concurrently, against the REAL migration chain in a throwaway Postgres (automation/tests/_localpg.mjs:
// native binaries, else a `--network none` Docker container; never the live project). Skipped when neither exists.
// The SQL is sent as ONE simple-protocol query string with the $n parameters inlined as literals, as n8n's Postgres node does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg, applyRepoMigrations, makeQuery } from './_localpg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W13 = JSON.parse(readFileSync(join(ROOT, 'automation', 'W13.json'), 'utf8'));
const PG = localPgBackend();
const nd = (prefix) => { const n = W13.nodes.find((x) => x.name.startsWith(prefix)); assert.ok(n, `W13 node ${prefix}`); return n; };
const node = nd('Record request');

test('W13 record-request node: static shape = one query string, two statements, batching single; kind and reason_code are parameters 9 and 10', () => {
  const opt = node.parameters.options || {};
  assert.ok(opt.queryBatching === undefined || opt.queryBatching === 'single', `queryBatching must be default/single, got ${opt.queryBatching}`);
  const stmts = node.parameters.query.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 2, 'lock + insert');
  assert.match(stmts[0], /^SELECT pg_advisory_xact_lock\(hashtext\('w13:week:' \|\| \$4::text \|\| ':' \|\| public\.smc_week_start\(\$6::timestamptz\)::text\)\)$/);
  assert.ok(!/\bCOMMIT\b|\bBEGIN\b/i.test(node.parameters.query), 'no hand-rolled txn control');
  // clause 7 (Jonathan 10 Oct 2026): the kind is a parameter (was the literals 'no_show' / 'schedule3_proof')
  const body = node.parameters.query.replace(/--[^\n]*/g, '');
  assert.match(body, /\$9::text, \$10::text/);
  assert.doesNotMatch(body, /'no_show'|'uncontactable'|'schedule3_proof/);
  assert.match(opt.queryReplacement, /\$json\.proof_at, \$json\.reason, \$json\.reason_code\] \}\}$/);
});

test('W13 request SQL on a real Postgres (real migrations): max 3 per broker-week for BOTH kinds combined, one per booking, next week fresh, no partial write', { skip: !PG && 'no local Postgres (no binaries, no Docker postgres:16-alpine image)', timeout: 900000 }, async (t) => {
  const pg = startLocalPg(PG);
  t.after(() => pg.stop());
  applyRepoMigrations(pg);
  const q = makeQuery(pg);
  const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const fill = (sql, params) => sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
  const NO_SHOW = { reason: 'no_show', reason_code: 'schedule3_proof' };
  const UNREACH = { reason: 'uncontactable', reason_code: 'schedule3_proof_unreachable' };

  // The node SQL with the n8n parameter list [lead, booking, cycle, broker, brand, missed_start, proof_path, proof_at, reason, reason_code].
  const claimAsync = async (b, bk, kind, i = 0) => {
    const r = await pg.sqlAsync(fill(node.parameters.query, [bk.lead, bk.id, b.cyc, b.broker, brand, bk.start, 'whatsapp-media:m' + i, new Date(Date.parse(bk.start) + 12 * 60_000).toISOString(), kind.reason, kind.reason_code]), ['-At', '-F', '|']);
    return { err: r.err, stderr: r.stderr, rows: r.stdout.split('\n').filter(Boolean) }; // the void lock row prints as an empty line
  };

  // ---- synthetic seed: one brand, brokers with a cycle each, leads + real bookings (replacements.booking_id is an FK to appointments)
  const uuid = () => crypto.randomUUID();
  const brand = uuid();
  q(`INSERT INTO public.brands (id, code, name) VALUES ('${brand}', 'SYNTH', 'Synthetic')`);
  const tier = q('SELECT tier_code FROM public.pricing ORDER BY sort_order LIMIT 1')[0][0];
  const mkBroker = (i) => {
    const user = uuid(), broker = uuid(), cyc = uuid();
    q(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'synthetic-broker-${i}@example.test')`);
    q(`INSERT INTO public.brokers (id, user_id, firm_name, contact_person) VALUES ('${broker}', '${user}', 'Synthetic FSP', 'Synthetic')`);
    q(`INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
       VALUES ('${cyc}', '${broker}', '${brand}', '${tier}', 1, 1000, 20, 9, 0, now(), now() + interval '30 days', 'active')`);
    return { broker, cyc };
  };
  let n = 0;
  const WEEK = Date.parse('2026-10-13T09:00:00+02:00'); // a Tuesday; the Calendar Week is Mon 12 - Sun 18 Oct (SAST)
  const NEXT_WEEK = Date.parse('2026-10-19T09:00:00+02:00'); // Monday 00:00 SAST starts a new one
  // a booking per call: its own lead and a distinct start (unique per broker), method teams | phone
  const mkBooking = (b, startMs, method = 'teams') => {
    const lead = uuid(), id = uuid(); n++;
    q(`INSERT INTO public.leads (id, first_name, last_name, phone) VALUES ('${lead}', 'Synthetic', 'L${n}', '+27000000${String(n).padStart(3, '0')}')`);
    const start = new Date(startMs).toISOString();
    q(`INSERT INTO public.appointments (id, broker_id, client_id, brand_id, cycle_id, appointment_date, ends_at, status, method)
       VALUES ('${id}', '${b.broker}', '${lead}', '${brand}', '${b.cyc}', '${start}', '${new Date(startMs + 30 * 60_000).toISOString()}', 'booked', '${method}')`);
    return { id, lead, start };
  };
  const count = (b) => q(`SELECT count(*) FROM public.replacements WHERE broker_id = '${b.broker}'`)[0][0];
  const reasons = (b) => q(`SELECT reason, reason_code, status, cap_position, over_cap FROM public.replacements WHERE broker_id = '${b.broker}' ORDER BY cap_position`).map((r) => r.join('|'));
  const H = 3600_000;

  // ---- (1) concurrent, mixed kinds: 8 requests from broker A (4 of each kind) + 5 from broker B, same week: 3 each, never more
  const A = mkBroker(1), B = mkBroker(2);
  const jobs = [];
  for (let i = 0; i < 8; i++) { jobs.push(claimAsync(A, mkBooking(A, WEEK + i * H), i % 2 ? UNREACH : NO_SHOW, i)); if (i < 5) jobs.push(claimAsync(B, mkBooking(B, WEEK + i * H), i % 2 ? NO_SHOW : UNREACH, i)); }
  for (const r of await Promise.all(jobs)) assert.equal(r.err, null, r.stderr);
  assert.equal(count(A), '3', 'clause 7.2: max 3 per Calendar Week for both kinds together, whatever replacement_cap says');
  assert.equal(count(B), '3', 'per broker: independent lock');
  for (const b of [A, B]) {
    for (const row of reasons(b)) { const [reason, code, status, , over] = row.split('|'); assert.deepEqual([reason === 'no_show' ? code : null, reason === 'uncontactable' ? code : null].filter(Boolean).length, 1); assert.deepEqual([status, over], ['due', 'f']); assert.ok(['no_show|schedule3_proof', 'uncontactable|schedule3_proof_unreachable'].includes(`${reason}|${code}`), row); }
    assert.deepEqual(q(`SELECT cap_position FROM public.replacements WHERE broker_id = '${b.broker}' ORDER BY cap_position`).map((r) => r[0]), ['1', '2', '3'], 'the smc_replacements_cap trigger counts both kinds: positions 1..3');
  }

  // ---- (2) deterministic: 2 no-shows + 1 unreachable = 3 (the 4th request of EITHER kind gets no row); the stored pair follows the parameters
  const C = mkBroker(3);
  const c = [0, 1, 2, 3, 4].map((i) => mkBooking(C, WEEK + i * H));
  for (const [i, kind] of [[0, NO_SHOW], [1, NO_SHOW], [2, UNREACH]]) { const r = await claimAsync(C, c[i], kind, i); assert.equal(r.err, null, r.stderr); assert.equal(r.rows.length, 1, `request ${i + 1} recorded`); assert.equal(r.rows[0].split('|').at(-1), String(i + 1), 'used_after'); }
  assert.deepEqual(reasons(C), ['no_show|schedule3_proof|due|1|f', 'no_show|schedule3_proof|due|2|f', 'uncontactable|schedule3_proof_unreachable|due|3|f']);
  q(`UPDATE public.replacements SET status = 'rejected', note = 'declined' WHERE broker_id = '${C.broker}' AND cap_position = 1`); // a declined request still counts
  for (const [i, kind] of [[3, NO_SHOW], [4, UNREACH]]) { const r = await claimAsync(C, c[i], kind, i); assert.equal(r.err, null, r.stderr); assert.equal(r.rows.length, 0, `4th request (${kind.reason}) is refused: no row`); }
  assert.equal(count(C), '3');
  // reverse mix on broker D: 2 unreachable + 1 no-show, then the 4th of either kind refused
  const D2 = mkBroker(4);
  const d = [0, 1, 2, 3, 4].map((i) => mkBooking(D2, WEEK + i * H, 'phone'));
  for (const [i, kind] of [[0, UNREACH], [1, UNREACH], [2, NO_SHOW], [3, UNREACH], [4, NO_SHOW]]) { const r = await claimAsync(D2, d[i], kind, i); assert.equal(r.err, null, r.stderr); }
  assert.deepEqual(reasons(D2).map((x) => x.split('|')[0]), ['uncontactable', 'uncontactable', 'no_show']);

  // ---- (3) next Calendar Week starts fresh for both kinds; the same booking twice (even as the other kind) at once gives one row
  const fresh = [mkBooking(C, NEXT_WEEK), mkBooking(C, NEXT_WEEK + H)];
  assert.equal((await claimAsync(C, fresh[0], UNREACH)).rows.length, 1, 'Monday: a new week, unreachable');
  assert.equal((await claimAsync(C, fresh[1], NO_SHOW)).rows.length, 1, 'Monday: a new week, no-show');
  const bk = mkBooking(A, NEXT_WEEK + 2 * H);
  const dup = await Promise.all([NO_SHOW, UNREACH, NO_SHOW, UNREACH].map((k, i) => claimAsync(A, bk, k, i)));
  for (const r of dup) assert.equal(r.err, null, r.stderr);
  assert.equal(q(`SELECT count(*) FROM public.replacements WHERE booking_id = '${bk.id}'`)[0][0], '1', 'one request per booking, whichever kind asks');
  assert.equal(count(A), '4', 'Monday: a new week');

  // ---- (4) no partial write / no leaked lock: a malformed request errors, writes nothing, releases the advisory lock
  const bad = await pg.sqlAsync(fill(node.parameters.query, ['not-a-uuid', mkBooking(A, NEXT_WEEK + 3 * H).id, A.cyc, A.broker, brand, new Date(NEXT_WEEK).toISOString(), 'p', new Date(NEXT_WEEK).toISOString(), NO_SHOW.reason, NO_SHOW.reason_code]), ['-At']);
  assert.ok(bad.err, 'bad request errors');
  assert.equal(count(A), '4', 'failed request wrote nothing');
  assert.equal(q(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'`)[0][0], '0', 'xact lock released on rollback');
  // the reason CHECK still guards the parameter: a kind the table does not allow is rejected, not stored
  const wrong = await claimAsync(A, mkBooking(A, NEXT_WEEK + 4 * H), { reason: 'didnt_buy', reason_code: 'x' });
  assert.ok(wrong.err, 'reason is checked by the table (never "didn\'t buy")');
  assert.equal(count(A), '4');

  // ---- (5) the other W13 SQL that changed, on the same data: "Request context" (method + the shared count) and "Escalate + timeline" (kind-driven)
  const ctxSql = nd('Request context').parameters.query.trim().replace(/;$/, '');
  const ctx = (broker, at) => JSON.parse(q(`SELECT row_to_json(t) FROM (${fill(ctxSql, [broker, at, '+27000000000', 'wamid.X'])}) t`)[0][0]);
  const phoneBk = mkBooking(C, NEXT_WEEK + 5 * H, 'phone');
  const proofAt = new Date(Date.parse(phoneBk.start) + 15 * 60_000).toISOString();
  const cx = ctx(C.broker, proofAt);
  assert.deepEqual([cx.booking_id, cx.method, cx.used_this_week, cx.already_requested], [phoneBk.id, 'phone', 2, false], 'method comes back; the count is both kinds of the Calendar Week (1 unreachable + 1 no-show already)');
  const cxDone = ctx(C.broker, new Date(Date.parse(fresh[0].start) + 15 * 60_000).toISOString());
  assert.deepEqual([cxDone.booking_id, cxDone.already_requested], [fresh[0].id, true], 'a booking that already has a request says so (any status)');
  // one open request per lead (replacements_one_per_lead): a second booking of the same lead reports already_requested instead of dropping the proof
  const second = (() => { const id = uuid(); const start = new Date(NEXT_WEEK + 6 * H).toISOString(); q(`INSERT INTO public.appointments (id, broker_id, client_id, brand_id, cycle_id, appointment_date, ends_at, status, method) VALUES ('${id}', '${C.broker}', '${fresh[0].lead}', '${brand}', '${C.cyc}', '${start}', '${new Date(NEXT_WEEK + 6.5 * H).toISOString()}', 'booked', 'teams')`); return { id, start }; })();
  assert.equal(ctx(C.broker, new Date(Date.parse(second.start) + 15 * 60_000).toISOString()).already_requested, true, 'same lead, other booking: one open request per lead');

  const esc = nd('Escalate (console decides)').parameters.query;
  const rep = q(`SELECT id, booking_id, lead_id, cycle_id, broker_id FROM public.replacements WHERE broker_id = '${C.broker}' AND reason = 'uncontactable' LIMIT 1`)[0];
  for (const [kind, k] of [['unreachable', { activity_type: 'unreachable_proof_sent', idem_prefix: 'w13:unreachable_proof' }], ['no_show', { activity_type: 'noshow_proof_sent', idem_prefix: 'w13:noshow_proof' }]]) {
    const run = () => pg.sql(fill(esc, [brand, rep[0], rep[2], rep[4], `esc_kind=replacement_request; ${kind}`, rep[3], rep[1], k.activity_type, `${k.idem_prefix}:${rep[1]}`]), ['-At']);
    run(); run(); // the second run is a no-op (ON CONFLICT on the idempotency key)
    assert.equal(q(`SELECT count(*) FROM public.lead_activities WHERE activity_type = '${k.activity_type}' AND idempotency_key = '${k.idem_prefix}:${rep[1]}'`)[0][0], '1', `${kind}: one timeline row per kind + booking`);
  }
  assert.equal(q(`SELECT count(*) FROM public.escalations WHERE note LIKE 'esc_kind=replacement_request;%'`)[0][0], '4', 'the escalation insert is not idempotency-keyed (W13 only reaches it once per recorded request)');
});
