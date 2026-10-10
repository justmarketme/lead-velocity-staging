// S7-20 local proof: "Couldn't reach them" can earn a goodwill replacement REQUEST, exactly like a no-show
// (agreement clause 7 + Schedule 3, Jonathan 10 Oct 2026). Runs supabase/migrations/20261010_smc_20_unreachable_replacements.sql
// on the REAL repo migration chain in a throwaway Postgres (never the live project): a `--network none` Docker container
// started and removed by this test, or native binaries (automation/tests/_localpg.mjs decides which exist). Skipped when
// neither does. Proves through the RPC, as a signed-in broker:
//   no-show request ok in the window | unreachable request ok | too_early / too_late / no proof path / wrong proof folder
//   ONE weekly counter of 3 across both kinds (2 no-show + 1 unreachable ok, the 4th of EITHER kind is weekly_max)
//   every row counts whatever its reason or status | a different Calendar Week starts a fresh count
//   the same meeting twice, or the same lead on a second meeting, is already_requested (and nothing is left half-written)
//   the smc_18 name still works (thin wrapper) | grants | the replacements / outcomes / lead_activities rows | the LEGACY comments
// Speed: _localpg.mjs runs one `docker exec` per migration file (about 4 minutes on a Windows laptop). Here the whole chain
// goes through ONE `docker exec` loop (about 1.5 minutes), and the whole scenario is ONE psql session.
// It does not use _localpg.applyRepoMigrations(): that picks the smc files with /^2026100\d_smc_/, which misses 20261010.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { localPgBackend, startLocalPg } from './_localpg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const STUB = join(ROOT, 'automation', 'tests', 'fixtures', 'pg-stub.sql');
const FILE = '20261010_smc_20_unreachable_replacements.sql';
const SQL = readFileSync(join(MIG, FILE), 'utf8');
const PG = localPgBackend();
const IMAGE = 'postgres:16-alpine';

// ------------------------------------------------------------------ static checks (no database needed)
test('S7-20 static: the migration is additive, gated, and uses the shared storage conventions', async (t) => {
  assert.match(SQL, /^-- NOT APPLIED\. DDL on this project is user-gated/m);
  assert.match(SQL, /Apply AFTER 20261006_smc_18_feedback_firewall\.sql/);
  assert.match(SQL, /^BEGIN;$/m); assert.match(SQL, /^COMMIT;$/m);
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /\bDROP\b|\bTRUNCATE\b|\bDELETE\b/i, 'additive: nothing is dropped or deleted');
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.smc_request_replacement\(uuid, text, text\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.smc_request_replacement\(uuid, text, text\) TO authenticated;/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.smc_request_noshow_replacement\(uuid, text\) FROM PUBLIC, anon;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.smc_request_noshow_replacement\(uuid, text\) TO authenticated;/);
  assert.match(SQL, /p_kind text DEFAULT 'no_show'/);
  assert.match(SQL, /ERRCODE = '22023'/);
  // the file is applied after smc_18 by name order, and is not picked up by an older helper's date pattern by accident
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.indexOf(FILE) > files.indexOf('20261006_smc_18_feedback_firewall.sql'));
  // the TypeScript rules (src/lib/smcRules.ts) and the SQL write the same values
  let rules;
  try { rules = await import(new URL('../../src/lib/smcRules.ts', import.meta.url)); } catch { t.diagnostic('smcRules.ts not importable on this Node; skipping the TS cross-check'); }
  if (rules) {
    for (const k of ['no_show', 'unreachable']) {
      for (const lit of [rules.REPLACEMENT_REASON[k], rules.REPLACEMENT_REASON_CODE[k], rules.PROOF_ACTIVITY[k]]) assert.ok(SQL.includes(`'${lit}'`), `${lit} in the SQL`);
    }
  }
});

// ------------------------------------------------------------------ throwaway Postgres
const FILE_RE = /^[\w.-]+$/;
const chainFiles = () => {
  const all = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(all.every((f) => FILE_RE.test(f)));
  const isSmc = (f) => /^202610\d\d_smc_/.test(f); // smc_01 .. smc_20 (not /^2026100\d_smc_/ as _localpg.mjs has it)
  return { legacy: all.filter((f) => !isSmc(f) && !f.startsWith('20260114094619')), smc: all.filter(isSmc) };
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Docker: our own container (named lv-test-pg-s720-*, removed by stop()); the chain goes in through one `docker exec`. */
function startDockerPg() {
  const name = `lv-test-pg-s720-${crypto.randomBytes(4).toString('hex')}`;
  const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26 };
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '--network', 'none', '--label', 'lv.test=throwaway',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', IMAGE], opts);
  const stop = () => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch { /* already gone */ } };
  const until = Date.now() + 90000;
  for (;;) {
    try { execFileSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }); break; }
    catch { if (Date.now() > until) { stop(); throw new Error('throwaway Postgres did not become ready'); } sleep(500); }
  }
  const sql = (text, extra = []) => execFileSync('docker', ['exec', '-i', name, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', ...extra, '-f', '-'], { ...opts, input: text });
  const applyChain = () => {
    const { legacy, smc } = chainFiles();
    execFileSync('docker', ['cp', MIG, `${name}:/mig`], opts);
    execFileSync('docker', ['cp', STUB, `${name}:/stub.sql`], opts);
    // Same order as _localpg.applyRepoMigrations: stub, legacy (failures deferred to one retry pass), then smc_*. Each file is its own psql -1.
    const script = [
      "P='psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1'",
      '$P -f /stub.sql || exit 11',
      "defer=''",
      `for f in ${legacy.join(' ')}; do $P -1 -f /mig/$f >/dev/null 2>&1 || defer="$defer $f"; done`,
      'for f in $defer; do $P -1 -f /mig/$f || { echo "FAILED $f" >&2; exit 12; }; done',
      `for f in ${smc.join(' ')}; do $P -1 -f /mig/$f >/dev/null || { echo "FAILED $f" >&2; exit 13; }; done`,
    ].join('\n');
    execFileSync('docker', ['exec', name, 'sh', '-c', script], opts);
  };
  return { backend: 'docker', sql, stop, applyChain };
}

/** Native binaries (Linux CI / sandbox): no per-file exec cost, so the plain per-file loop is fast enough. */
function startNativePg() {
  const pg = startLocalPg('native');
  const applyChain = () => {
    pg.file(STUB);
    const { legacy, smc } = chainFiles();
    const deferred = [];
    for (const f of legacy) { try { pg.file(join(MIG, f), ['-1']); } catch { deferred.push(f); } }
    for (const f of deferred) pg.file(join(MIG, f), ['-1']);
    for (const f of smc) pg.file(join(MIG, f), ['-1']);
  };
  return { backend: 'native', sql: pg.sql, stop: pg.stop, applyChain };
}

// ------------------------------------------------------------------ the scenario (one psql session)
// Every broker is its own scenario so the weekly counters never mix: 1 = the shared cap, 2 = last week's rows, 3 = every row
// counts, 4 = the same lead twice, 5 = the smc_18 name, 6 = the cap trigger. Offsets are minutes since the booked start:
// 11 .. 29 is inside the 10 .. 30 minute window, 8 is too early, 33 is too late.
const SCENARIO = String.raw`
SELECT id AS brand FROM public.brands WHERE code = 'SMC' \gset
SELECT public.smc_week_start(now()) AS wk \gset
CREATE TABLE pg_temp.res (n serial, label text, j jsonb);

CREATE FUNCTION pg_temp.seed_broker(k int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  u uuid := ('00000000-0000-4000-8000-0000000c200' || k)::uuid;
  b uuid := ('00000000-0000-4000-8000-0000000b200' || k)::uuid;
  c uuid := ('00000000-0000-4000-8000-0000000d200' || k)::uuid;
  v_brand uuid := (SELECT id FROM public.brands WHERE code = 'SMC');
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'synthetic.s720.' || k || '@example.com');
  INSERT INTO public.brokers (id, user_id, firm_name, contact_person, email, whatsapp_number, phone_number, status, brand_id, tier_code)
  VALUES (b, u, 'Synthetic S720 Practice ' || k || ' (TEST ONLY)', 'Synth Adviser ' || k, 'synthetic.s720.' || k || '@example.com', '+2760000210' || k, '+2760000210' || k, 'active', v_brand, 'SMC_BRONZE');
  INSERT INTO public.cycles (id, broker_id, brand_id, tier_code, cycle_no, price_zar, committed_leads, replacement_cap, media_share_zar, starts_at, ends_at, status)
  SELECT c, b, v_brand, p.tier_code, 1, p.price_zar, p.committed_leads, p.replacement_cap_cycle, p.media_share_zar, now() - interval '14 days', now() + interval '16 days', 'active'
    FROM public.pricing p WHERE p.tier_code = 'SMC_BRONZE';
END $$;

CREATE FUNCTION pg_temp.mk_lead(k int, n int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE l uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.leads (id, brand_id, broker_id, cycle_id, first_name, last_name, phone, is_synthetic, consent_at, consent_text, consent_source)
  VALUES (l, (SELECT id FROM public.brands WHERE code = 'SMC'), ('00000000-0000-4000-8000-0000000b200' || k)::uuid, ('00000000-0000-4000-8000-0000000d200' || k)::uuid,
          'Syn', 'Lead' || n, '+27600022' || lpad(n::text, 3, '0'), true, now(), 'synthetic consent', 'page');
  RETURN l;
END $$;

-- a booking that started mins_ago minutes ago (2-minute meetings: the no-overlap rule needs them spaced)
CREATE FUNCTION pg_temp.mk_booking(k int, p_lead uuid, mins_ago numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid := gen_random_uuid(); s timestamptz := now() - (mins_ago || ' minutes')::interval;
BEGIN
  INSERT INTO public.appointments (id, brand_id, broker_id, client_id, cycle_id, appointment_date, ends_at, status, method)
  VALUES (a, (SELECT id FROM public.brands WHERE code = 'SMC'), ('00000000-0000-4000-8000-0000000b200' || k)::uuid, p_lead,
          ('00000000-0000-4000-8000-0000000d200' || k)::uuid, s, s + interval '2 minutes', 'booked', 'phone');
  RETURN a;
END $$;

-- a request row already on file (any reason, any status), missed at the given time
CREATE FUNCTION pg_temp.mk_row(k int, n int, p_reason text, p_status text, missed timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE l uuid := pg_temp.mk_lead(k, n);
BEGIN
  INSERT INTO public.replacements (lead_id, cycle_id, broker_id, brand_id, reason, reason_code, missed_start_at, status)
  VALUES (l, ('00000000-0000-4000-8000-0000000d200' || k)::uuid, ('00000000-0000-4000-8000-0000000b200' || k)::uuid, (SELECT id FROM public.brands WHERE code = 'SMC'), p_reason, 'seed', missed, p_status);
END $$;

-- call the RPC as broker k's user. kind NULL = leave the argument out (the default); '<NULL>' = pass a real NULL; old = the smc_18 name
CREATE FUNCTION pg_temp.call(p_label text, k int, p_booking uuid, p_path text, p_kind text DEFAULT NULL, p_old boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN k = 0 THEN '00000000-0000-4000-8000-0000000c2999' ELSE '00000000-0000-4000-8000-0000000c200' || k END, false);
  BEGIN
    IF p_old THEN j := public.smc_request_noshow_replacement(p_booking, p_path);
    ELSIF p_kind IS NULL THEN j := public.smc_request_replacement(p_booking, p_path);
    ELSIF p_kind = '<NULL>' THEN j := public.smc_request_replacement(p_booking, p_path, NULL);
    ELSE j := public.smc_request_replacement(p_booking, p_path, p_kind);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    j := jsonb_build_object('error', SQLSTATE, 'msg', SQLERRM);
  END;
  INSERT INTO pg_temp.res (label, j) VALUES (p_label, j);
END $$;
CREATE FUNCTION pg_temp.proof(k int, n text) RETURNS text LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-0000000b200' || k || '/noshow-proof/' || n $$;

SELECT pg_temp.seed_broker(k) FROM generate_series(1, 6) k;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000c2999', 'synthetic.s720.nobroker@example.com');

-- ===== 1: the shared weekly counter (2 no-show + 1 unreachable fill it; the 4th of either kind is refused)
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 1), 11) AS a1 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 2), 14) AS a2 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 3), 17) AS a3 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 4), 20) AS a4 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 5), 23) AS a5 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 6), 26) AS a6 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 7), 29) AS a7 \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 8), 8) AS early \gset
SELECT pg_temp.mk_booking(1, pg_temp.mk_lead(1, 9), 33) AS late \gset

SELECT pg_temp.call('A1 no_show ok', 1, :'a1', pg_temp.proof(1, 'a1-noshow-1.jpg'), 'no_show');
SELECT pg_temp.call('A2 unreachable ok', 1, :'a2', pg_temp.proof(1, 'a2-unreachable-1.jpg'), 'unreachable');
SELECT pg_temp.call('A3 default kind is no_show', 1, :'a3', pg_temp.proof(1, 'a3-noshow-1.jpg'));
SELECT pg_temp.call('A4 4th unreachable over the cap', 1, :'a4', pg_temp.proof(1, 'a4-unreachable-1.jpg'), 'unreachable');
SELECT pg_temp.call('A5 4th no_show over the cap', 1, :'a5', pg_temp.proof(1, 'a5-noshow-1.jpg'), 'no_show');
SELECT pg_temp.call('A5b old name over the cap', 1, :'a5', pg_temp.proof(1, 'a5-noshow-2.jpg'), NULL, true);
SELECT pg_temp.call('dup same kind', 1, :'a1', pg_temp.proof(1, 'a1-noshow-2.jpg'), 'no_show');
SELECT pg_temp.call('dup other kind', 1, :'a1', pg_temp.proof(1, 'a1-unreachable-2.jpg'), 'unreachable');
SELECT pg_temp.call('dup old name', 1, :'a1', pg_temp.proof(1, 'a1-noshow-3.jpg'), NULL, true);
SELECT pg_temp.call('too early no_show', 1, :'early', pg_temp.proof(1, 'e-noshow.jpg'), 'no_show');
SELECT pg_temp.call('too early unreachable', 1, :'early', pg_temp.proof(1, 'e-unreachable.jpg'), 'unreachable');
SELECT pg_temp.call('too late no_show', 1, :'late', pg_temp.proof(1, 'l-noshow.jpg'), 'no_show');
SELECT pg_temp.call('too late unreachable', 1, :'late', pg_temp.proof(1, 'l-unreachable.jpg'), 'unreachable');
SELECT pg_temp.call('no proof path', 1, :'a6', NULL, 'unreachable');
SELECT pg_temp.call('proof in another broker folder', 1, :'a6', pg_temp.proof(2, 'x.jpg'), 'unreachable');
SELECT pg_temp.call('proof outside noshow-proof folder', 1, :'a6', '00000000-0000-4000-8000-0000000b2001/other/x.jpg', 'unreachable');
SELECT pg_temp.call('invalid kind', 1, :'a7', pg_temp.proof(1, 'a7-attended.jpg'), 'attended');
SELECT pg_temp.call('null kind', 1, :'a7', pg_temp.proof(1, 'a7-null.jpg'), '<NULL>');
SELECT pg_temp.call('another broker booking', 2, :'a7', pg_temp.proof(2, 'a7-other.jpg'), 'unreachable');
SELECT pg_temp.call('not a broker', 0, :'a7', pg_temp.proof(1, 'a7-nb.jpg'), 'unreachable');

-- ===== 2: a different Calendar Week starts a fresh count (three rows missed LAST week, claimed now)
SELECT pg_temp.mk_row(2, 20, 'no_show', 'due', :'wk'::timestamptz - interval '1 day');
SELECT pg_temp.mk_row(2, 21, 'uncontactable', 'approved', :'wk'::timestamptz - interval '3 days');
SELECT pg_temp.mk_row(2, 22, 'uncontactable', 'rejected', :'wk'::timestamptz - interval '6 days');
SELECT pg_temp.mk_booking(2, pg_temp.mk_lead(2, 23), 12) AS b1 \gset
SELECT pg_temp.call('B1 fresh week unreachable', 2, :'b1', pg_temp.proof(2, 'b1-unreachable.jpg'), 'unreachable');

-- ===== 3: every row in the week counts, whatever its reason or status (decided or not)
SELECT pg_temp.mk_row(3, 30, 'disqualified', 'approved', :'wk'::timestamptz + interval '1 minute');
SELECT pg_temp.mk_row(3, 31, 'uncontactable', 'rejected', :'wk'::timestamptz + interval '2 minutes');
SELECT pg_temp.mk_row(3, 32, 'no_show', 'due', :'wk'::timestamptz + interval '3 minutes');
SELECT pg_temp.mk_booking(3, pg_temp.mk_lead(3, 33), 12) AS c1 \gset
SELECT pg_temp.call('C1 three rows on file', 3, :'c1', pg_temp.proof(3, 'c1.jpg'), 'unreachable');

-- ===== 4: one live replacement per lead (replacements_one_per_lead): another meeting of the same lead is already_requested, nothing half-written
SELECT pg_temp.mk_lead(4, 40) AS dl \gset
SELECT pg_temp.mk_booking(4, :'dl', 13) AS d1 \gset
SELECT pg_temp.mk_booking(4, :'dl', 22) AS d2 \gset
SELECT pg_temp.call('D1 first meeting', 4, :'d1', pg_temp.proof(4, 'd1.jpg'), 'unreachable');
SELECT pg_temp.call('D2 same lead, other meeting', 4, :'d2', pg_temp.proof(4, 'd2.jpg'), 'no_show');

-- ===== 5: the smc_18 name still works (older portal build, WhatsApp) and means no_show
SELECT pg_temp.mk_booking(5, pg_temp.mk_lead(5, 50), 12) AS e1 \gset
SELECT pg_temp.call('E1 old name ok', 5, :'e1', pg_temp.proof(5, 'e1-noshow.jpg'), NULL, true);

-- ===== 6: the cap trigger (other writers, e.g. W13) counts both reasons together too: the 4th row of the week is over_cap
SELECT pg_temp.mk_row(6, 60, 'no_show', 'due', :'wk'::timestamptz + interval '1 minute');
SELECT pg_temp.mk_row(6, 61, 'uncontactable', 'due', :'wk'::timestamptz + interval '2 minutes');
SELECT pg_temp.mk_row(6, 62, 'no_show', 'due', :'wk'::timestamptz + interval '3 minutes');
SELECT pg_temp.mk_row(6, 63, 'uncontactable', 'due', :'wk'::timestamptz + interval '4 minutes');

SELECT 'RES ' || coalesce(jsonb_object_agg(label, j), '{}'::jsonb)::text FROM pg_temp.res;
SELECT 'ROWS_A ' || coalesce(jsonb_agg(jsonb_build_object('booking', r.booking_id, 'reason', r.reason, 'code', r.reason_code, 'proof', r.proof_path, 'status', r.status, 'cap', r.cap_position, 'over', r.over_cap, 'missed', r.missed_start_at IS NOT NULL, 'outcome', r.outcome_id IS NOT NULL) ORDER BY r.cap_position), '[]'::jsonb)::text FROM public.replacements r WHERE r.broker_id = '00000000-0000-4000-8000-0000000b2001';
SELECT 'OUT_A ' || coalesce(jsonb_object_agg(o.booking_id, jsonb_build_object('outcome', o.outcome, 'via', o.marked_via, 'unconfirmed', o.unconfirmed)), '{}'::jsonb)::text FROM public.outcomes o WHERE o.broker_id = '00000000-0000-4000-8000-0000000b2001';
SELECT 'ACT_A ' || coalesce(jsonb_agg(jsonb_build_object('type', la.activity_type, 'key', la.idempotency_key, 'kind', la.payload ->> 'kind', 'booking', la.payload ->> 'booking_id', 'workflow', la.workflow, 'actor', la.actor_type) ORDER BY la.idempotency_key), '[]'::jsonb)::text FROM public.lead_activities la WHERE la.broker_id = '00000000-0000-4000-8000-0000000b2001';
SELECT 'ROWS_B ' || coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'code', r.reason_code, 'cap', r.cap_position, 'over', r.over_cap)), '[]'::jsonb)::text FROM public.replacements r WHERE r.broker_id = '00000000-0000-4000-8000-0000000b2002' AND r.reason_code LIKE 'schedule3%';
SELECT 'OUT_D ' || coalesce(jsonb_object_agg(o.booking_id, o.outcome), '{}'::jsonb)::text FROM public.outcomes o WHERE o.broker_id = '00000000-0000-4000-8000-0000000b2004';
SELECT 'ROWS_E ' || coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'code', r.reason_code, 'booking', r.booking_id)), '[]'::jsonb)::text FROM public.replacements r WHERE r.broker_id = '00000000-0000-4000-8000-0000000b2005';
SELECT 'TRIG ' || coalesce(jsonb_agg(jsonb_build_object('cap', r.cap_position, 'over', r.over_cap) ORDER BY r.cap_position), '[]'::jsonb)::text FROM public.replacements r WHERE r.broker_id = '00000000-0000-4000-8000-0000000b2006';
SELECT 'IDS ' || jsonb_build_object('a1', :'a1', 'a2', :'a2', 'a3', :'a3', 'a4', :'a4', 'a5', :'a5', 'd1', :'d1', 'd2', :'d2', 'e1', :'e1')::text;
SELECT 'PRIV ' || jsonb_build_object(
  'new_anon', has_function_privilege('anon', 'public.smc_request_replacement(uuid,text,text)', 'EXECUTE'),
  'new_auth', has_function_privilege('authenticated', 'public.smc_request_replacement(uuid,text,text)', 'EXECUTE'),
  'old_anon', has_function_privilege('anon', 'public.smc_request_noshow_replacement(uuid,text)', 'EXECUTE'),
  'old_auth', has_function_privilege('authenticated', 'public.smc_request_noshow_replacement(uuid,text)', 'EXECUTE'),
  'old_def', pg_get_functiondef('public.smc_request_noshow_replacement(uuid,text)'::regprocedure))::text;
SELECT 'COMMENTS ' || jsonb_build_object(
  'pricing', col_description('public.pricing'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.pricing'::regclass AND attname = 'replacement_cap_cycle')),
  'cycles', col_description('public.cycles'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.cycles'::regclass AND attname = 'replacement_cap')),
  'reason', col_description('public.replacements'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.replacements'::regclass AND attname = 'reason')))::text;
`;

// ------------------------------------------------------------------ the database test
const weekStart = (ms) => { const l = new Date(ms + 2 * 3600e3); return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - ((l.getUTCDay() + 6) % 7) * 86400e3 - 2 * 3600e3; };

test('S7-20 local: couldn\'t-reach requests share the no-show window and ONE weekly counter of 3, on the real migration chain', { skip: !PG && 'no local Postgres (no binaries, no Docker postgres:16-alpine image)', timeout: 900000 }, async (t) => {
  // The scenario books meetings up to 35 minutes ago and counts by Calendar Week: do not run it across the Monday 00:00 SAST boundary.
  if (weekStart(Date.now() - 40 * 60e3) !== weekStart(Date.now() + 5 * 60e3)) return t.skip('a Calendar Week boundary (Monday 00:00 SAST) is inside the 40-minute window; run it again later');

  const pg = PG === 'docker' ? startDockerPg() : startNativePg();
  t.after(() => pg.stop());
  const t0 = Date.now();
  pg.applyChain();
  t.diagnostic(`migration chain applied in ${Math.round((Date.now() - t0) / 1000)} s (${pg.backend})`);

  // smc_20 again, then the scenario in the same session: re-running the migration converges (idempotent) and changes nothing.
  const out = pg.sql(SQL + '\n' + SCENARIO, ['-A', '-t']);
  const take = (tag) => {
    const line = out.split('\n').find((l) => l.startsWith(`${tag} `));
    assert.ok(line, `${tag} line in the output`);
    return JSON.parse(line.slice(tag.length + 1));
  };
  const R = take('RES'), ids = take('IDS');

  // ---- no-show and couldn't-reach requests are both accepted inside the window; the kind and the counter come back
  assert.deepEqual([R['A1 no_show ok'].ok, R['A1 no_show ok'].kind, R['A1 no_show ok'].used, R['A1 no_show ok'].max], [true, 'no_show', 1, 3]);
  assert.deepEqual([R['A2 unreachable ok'].ok, R['A2 unreachable ok'].kind, R['A2 unreachable ok'].used], [true, 'unreachable', 2]);
  assert.deepEqual([R['A3 default kind is no_show'].ok, R['A3 default kind is no_show'].kind, R['A3 default kind is no_show'].used], [true, 'no_show', 3], 'p_kind defaults to no_show');
  for (const k of ['A1 no_show ok', 'A2 unreachable ok', 'A3 default kind is no_show']) assert.match(R[k].replacement_id, /^[0-9a-f-]{36}$/);

  // ---- ONE counter: 2 no-show + 1 unreachable = 3, and the 4th of EITHER kind (or through the old name) is refused with used/max
  for (const [k, kind] of [['A4 4th unreachable over the cap', 'unreachable'], ['A5 4th no_show over the cap', 'no_show'], ['A5b old name over the cap', 'no_show']]) {
    assert.deepEqual(R[k], { ok: false, reason: 'weekly_max', used: 3, max: 3, kind }, k);
  }
  // ---- the same meeting twice, whatever the kind or the name
  for (const [k, kind] of [['dup same kind', 'no_show'], ['dup other kind', 'unreachable'], ['dup old name', 'no_show']]) assert.deepEqual(R[k], { ok: false, reason: 'already_requested', kind }, k);

  // ---- the proof window: too early (8 min) and too late (33 min) for both kinds
  assert.deepEqual(R['too early no_show'], { ok: false, reason: 'too_early', kind: 'no_show' });
  assert.deepEqual(R['too early unreachable'], { ok: false, reason: 'too_early', kind: 'unreachable' });
  assert.deepEqual(R['too late no_show'], { ok: false, reason: 'too_late', kind: 'no_show' });
  assert.deepEqual(R['too late unreachable'], { ok: false, reason: 'too_late', kind: 'unreachable' });

  // ---- bad calls raise (the portal shows "Not sent")
  for (const k of ['no proof path', 'proof in another broker folder', 'proof outside noshow-proof folder']) assert.equal(R[k].error, '22023', `${k}: ${R[k].msg}`);
  assert.equal(R['no proof path'].msg, 'proof missing');
  assert.deepEqual([R['invalid kind'].error, R['invalid kind'].msg], ['22023', 'unknown request kind']);
  assert.deepEqual([R['null kind'].error, R['null kind'].msg], ['22023', 'unknown request kind']);
  assert.deepEqual([R['another broker booking'].error, R['another broker booking'].msg], ['P0002', 'booking not found']);
  assert.deepEqual([R['not a broker'].error, R['not a broker'].msg], ['42501', 'not a SortMyCover broker']);

  // ---- a different Calendar Week starts a fresh count; every row of the week counts, whatever its reason or status
  assert.deepEqual([R['B1 fresh week unreachable'].ok, R['B1 fresh week unreachable'].used], [true, 1], 'three rows missed last week do not count this week');
  assert.deepEqual(take('ROWS_B'), [{ reason: 'uncontactable', code: 'schedule3_proof_unreachable', cap: 1, over: false }]);
  assert.deepEqual(R['C1 three rows on file'], { ok: false, reason: 'weekly_max', used: 3, max: 3, kind: 'unreachable' }, 'disqualified + rejected + due rows all count');

  // ---- one live replacement per lead: the second meeting is already_requested and its outcome is rolled back, not left behind
  assert.deepEqual([R['D1 first meeting'].ok, R['D1 first meeting'].kind], [true, 'unreachable']);
  assert.deepEqual(R['D2 same lead, other meeting'], { ok: false, reason: 'already_requested', kind: 'no_show' });
  assert.deepEqual(take('OUT_D'), { [ids.d1]: 'unreachable' }, 'no outcome row for the refused meeting');

  // ---- the smc_18 name is a thin wrapper that means no_show
  assert.deepEqual([R['E1 old name ok'].ok, R['E1 old name ok'].kind, R['E1 old name ok'].used], [true, 'no_show', 1]);
  assert.deepEqual(take('ROWS_E'), [{ reason: 'no_show', code: 'schedule3_proof', booking: ids.e1 }]);
  const priv = take('PRIV');
  assert.deepEqual([priv.new_anon, priv.new_auth, priv.old_anon, priv.old_auth], [false, true, false, true], 'anon cannot call either; authenticated can call both');
  assert.match(priv.old_def, /smc_request_replacement\(p_booking_id, p_proof_path, 'no_show'\)/);

  // ---- what was stored for broker 1: three requests (2 no-show, 1 unreachable), the right reason / reason_code, proof, outcome, timeline
  const rows = take('ROWS_A');
  assert.equal(rows.length, 3, 'only the three accepted requests were written');
  assert.deepEqual(rows.map((r) => [r.cap, r.over, r.status, r.missed, r.outcome]), [[1, false, 'due', true, true], [2, false, 'due', true, true], [3, false, 'due', true, true]]);
  const by = Object.fromEntries(rows.map((r) => [r.booking, r]));
  assert.deepEqual([by[ids.a1].reason, by[ids.a1].code], ['no_show', 'schedule3_proof']);
  assert.deepEqual([by[ids.a2].reason, by[ids.a2].code], ['uncontactable', 'schedule3_proof_unreachable']);
  assert.deepEqual([by[ids.a3].reason, by[ids.a3].code], ['no_show', 'schedule3_proof']);
  assert.ok(by[ids.a2].proof.startsWith('00000000-0000-4000-8000-0000000b2001/noshow-proof/') && by[ids.a2].proof.includes('unreachable'), 'the folder is the same for both kinds, the kind is in the file name');
  const outA = take('OUT_A');
  assert.deepEqual(Object.keys(outA).sort(), [ids.a1, ids.a2, ids.a3].sort(), 'refused requests (cap, window, duplicate) wrote no outcome');
  assert.deepEqual([outA[ids.a1].outcome, outA[ids.a2].outcome, outA[ids.a3].outcome], ['no_show', 'unreachable', 'no_show']);
  assert.ok(Object.values(outA).every((o) => o.via === 'portal' && o.unconfirmed === false));
  const acts = take('ACT_A');
  assert.deepEqual(acts.map((a) => [a.type, a.key, a.kind, a.workflow, a.actor]).sort(), [
    ['noshow_proof_sent', `portal:noshow_proof:${ids.a1}`, 'no_show', 'portal', 'broker'],
    ['noshow_proof_sent', `portal:noshow_proof:${ids.a3}`, 'no_show', 'portal', 'broker'],
    ['unreachable_proof_sent', `portal:unreachable_proof:${ids.a2}`, 'unreachable', 'portal', 'broker'],
  ].sort());

  // ---- the cap trigger (other writers) counts both reasons together: the 4th row of the Calendar Week is over_cap
  assert.deepEqual(take('TRIG'), [{ cap: 1, over: false }, { cap: 2, over: false }, { cap: 3, over: false }, { cap: 4, over: true }]);

  // ---- the old per-cycle cap is marked LEGACY in the schema
  const c = take('COMMENTS');
  assert.match(c.pricing, /^LEGACY .*drives nothing/); assert.match(c.cycles, /^LEGACY .*drives nothing/);
  assert.match(c.reason, /uncontactable/); assert.match(c.reason, /ONE weekly counter of 3/);
});
