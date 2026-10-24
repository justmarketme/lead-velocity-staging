// Smoke test 21 Oct 2026: #20 (admin read on the compliance-evidence bucket) and #43 (unschedule the failing legacy
// pg_cron job). Each migration runs on PGlite with a small stand-in for the Supabase storage / pg_cron schema: the bug is
// reproduced first, then the file is applied twice (re-runnable) and the result checked.
// Run: node --test tests/smc-ops-migrations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const file = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const userAdmin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const userBroker = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('#20 compliance-evidence: admins can read the evidence files; brokers and anon still cannot', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.user_roles (user_id uuid, role text);
      CREATE FUNCTION public.smc_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
        AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
      GRANT SELECT ON storage.objects TO authenticated, anon;
      INSERT INTO storage.buckets VALUES ('compliance-evidence', false), ('broker-media', false);
      INSERT INTO storage.objects (bucket_id, name) VALUES
        ('compliance-evidence','f688380e/fsca-1.png'), ('compliance-evidence','f688380e/fsca-2.png'),
        ('compliance-evidence','f688380e/fsca-3.png'), ('broker-media','f688380e/ads/a.png');
    `);
    await db.query(`INSERT INTO public.user_roles VALUES ($1,'admin'),($2,'broker')`, [userAdmin, userBroker]);
    const count = async (role, user) => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
      await db.exec(`SET ROLE ${role}`);
      try {
        return (await db.query(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'compliance-evidence'`)).rows[0].n;
      } finally { await db.exec('RESET ROLE'); }
    };

    assert.equal(await count('authenticated', userAdmin), 0, 'bug reproduced: admin sees 0 of 3 evidence files');

    const sql = await file('20261021150100_compliance_evidence_admin_read.sql');
    await db.exec(sql);
    await db.exec(sql);

    assert.equal(await count('authenticated', userAdmin), 3, 'admin reads all evidence files');
    assert.equal(await count('authenticated', userBroker), 0, 'a broker reads none');
    assert.equal(await count('anon'), 0, 'anon reads none');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userAdmin]);
    await db.exec('SET ROLE authenticated');
    try {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'broker-media'`)).rows[0].n, 0,
        'the new policy covers compliance-evidence only');
    } finally { await db.exec('RESET ROLE'); }
    const pol = (await db.query(`SELECT cmd, roles::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects'`)).rows;
    assert.deepEqual(pol, [{ cmd: 'SELECT', roles: '{authenticated}' }], 'one read policy, no write policy');
  } finally {
    await db.close();
  }
});

test('#20 / #43 migrations are no-ops where the storage / pg_cron schema is absent', async () => {
  const db = new PGlite();
  try {
    await db.exec(await file('20261021150100_compliance_evidence_admin_read.sql'));
    await db.exec(await file('20261021150200_unschedule_legacy_appointment_reminders.sql'));
  } finally {
    await db.close();
  }
});

test('#43 pg_cron: send-daily-appointment-reminders is unscheduled; the SMC jobs stay', async () => {
  const db = new PGlite();
  try {
    // stand-in for pg_cron's catalogue (cron.job) and cron.unschedule(bigint), which deletes the job row
    await db.exec(`
      CREATE SCHEMA cron;
      CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
      CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
      BEGIN
        DELETE FROM cron.job WHERE jobid = job_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job %', job_id; END IF;
        RETURN true;
      END $$;
      INSERT INTO cron.job (jobname, schedule, command) VALUES
        ('send-daily-appointment-reminders', '0 7 * * *', 'select net.http_post(...)'),
        ('smc-voice-callback-tick', '*/5 * * * *', 'select 1'),
        ('einstein-kb-refresh', '17 */3 * * *', 'select 1'),
        ('smc-appointment-request-sweep', '*/10 * * * *', 'select 1');
    `);
    const names = async () => (await db.query(`SELECT jobname FROM cron.job ORDER BY jobid`)).rows.map((r) => r.jobname);
    assert.ok((await names()).includes('send-daily-appointment-reminders'), 'bug reproduced: the failing job is scheduled');

    const sql = await file('20261021150200_unschedule_legacy_appointment_reminders.sql');
    await db.exec(sql);
    await db.exec(sql); // second run: job already gone, no error

    assert.deepEqual(await names(), ['smc-voice-callback-tick', 'einstein-kb-refresh', 'smc-appointment-request-sweep']);
  } finally {
    await db.close();
  }
});
