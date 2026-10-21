// Smoke test 21 Oct 2026 #4: a booking (and its lead) must be visible to the broker it is booked with, even when the
// client's email is not verified. Runs as a NON-admin broker under RLS (PGlite), first with the policies as live on
// 21 Oct (bug reproduced), then after supabase/migrations/20261021150300_smc_broker_sees_live_bookings.sql.
// Run: node --test tests/smc-broker-live-booking-rls.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/20261021150300_smc_broker_sees_live_bookings.sql', import.meta.url);
const undo = new URL('../supabase/migrations/undo/20261021150300_smc_broker_sees_live_bookings.undo.sql', import.meta.url);

const BRAND = 'b0000000-0000-4000-8000-000000000001';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // broker A (non-admin: roles {broker})
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // broker B
const userAdmin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const brokerA = '11111111-1111-4111-8111-111111111111';
const brokerB = '22222222-2222-4222-8222-222222222222';
// leads: phone booking with no email (like 8b5cc3b6 / f78b513d), cancelled, pending, requested, verified, legacy
const L = {
  phone: '30000000-0000-4000-8000-000000000001', cancelled: '30000000-0000-4000-8000-000000000002',
  pending: '30000000-0000-4000-8000-000000000003', requested: '30000000-0000-4000-8000-000000000004',
  verified: '30000000-0000-4000-8000-000000000005', legacy: '30000000-0000-4000-8000-000000000006',
  attended: '30000000-0000-4000-8000-000000000007',
};
const A = {
  phone: '40000000-0000-4000-8000-000000000001', cancelled: '40000000-0000-4000-8000-000000000002',
  pending: '40000000-0000-4000-8000-000000000003', requested: '40000000-0000-4000-8000-000000000004',
  verified: '40000000-0000-4000-8000-000000000005', attended: '40000000-0000-4000-8000-000000000007',
};

// Schema subset + helpers + the five policies exactly as pg_policies showed them live on 21 Oct 2026.
const LIVE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TYPE public.app_role AS ENUM ('admin', 'broker');
  CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
  CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
  CREATE TABLE public.brokers (id uuid PRIMARY KEY, user_id uuid NOT NULL, brand_id uuid);
  CREATE TABLE public.leads (id uuid PRIMARY KEY, brand_id uuid, broker_id uuid, email_verified boolean DEFAULT false, first_name text);
  CREATE TABLE public.appointments (id uuid PRIMARY KEY, client_id uuid NOT NULL, broker_id uuid, brand_id uuid, status text,
    allocated_at timestamptz, appointment_date timestamptz);
  CREATE TABLE public.outcomes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, lead_id uuid, broker_id uuid, brand_id uuid,
    outcome text, auto_marked boolean NOT NULL DEFAULT false, dispute_status text NOT NULL DEFAULT 'none');

  CREATE FUNCTION public.smc_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;
  CREATE FUNCTION public.smc_current_broker_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT b.id FROM public.brokers b WHERE b.user_id = auth.uid() LIMIT 1 $$;
  CREATE FUNCTION public.smc_lead_email_verified(p_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS $$
    SELECT coalesce((
      SELECT l.email_verified FROM public.leads l
       WHERE l.id = p_lead_id
         AND (   coalesce(nullif(current_setting('role', true), 'none'), session_user::text) NOT IN ('authenticated', 'anon')
              OR public.smc_is_admin()
              OR (l.broker_id IS NOT NULL AND l.broker_id = public.smc_current_broker_id()))
    ), false) $$;

  ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA public, auth TO authenticated;
  GRANT SELECT ON public.brokers, public.user_roles TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.leads, public.appointments, public.outcomes TO authenticated;

  CREATE POLICY "Admins have full access to leads" ON public.leads FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
    WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
  CREATE POLICY "Brokers can view their own leads" ON public.leads FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid()));
  CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
    USING ((brand_id IS NULL) OR smc_is_admin() OR (email_verified IS TRUE));

  CREATE POLICY "Brokers can see their appointments" ON public.appointments FOR SELECT
    USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
  CREATE POLICY "smc_sec admins manage appointments" ON public.appointments FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
    USING ((brand_id IS NULL) OR smc_is_admin() OR ((status <> 'pending_verification'::text) AND ((allocated_at IS NOT NULL) OR smc_lead_email_verified(client_id))));

  CREATE POLICY "smc admin all" ON public.outcomes FOR ALL TO authenticated USING (smc_is_admin()) WITH CHECK (smc_is_admin());
  CREATE POLICY "smc broker read own" ON public.outcomes FOR SELECT TO authenticated USING (broker_id = smc_current_broker_id());
  CREATE POLICY "smc broker mark own" ON public.outcomes FOR INSERT TO authenticated
    WITH CHECK ((broker_id = smc_current_broker_id()) AND (EXISTS (SELECT 1 FROM appointments a
      WHERE a.id = outcomes.booking_id AND a.broker_id = outcomes.broker_id AND a.client_id = outcomes.lead_id AND a.brand_id IS NOT NULL))
      AND (auto_marked = false));
  CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
    USING (smc_is_admin() OR smc_lead_email_verified(lead_id));
`;

async function seed(db) {
  await db.query(`INSERT INTO user_roles VALUES ($1,'broker'),($2,'broker'),($3,'admin')`, [userA, userB, userAdmin]);
  await db.query(`INSERT INTO brokers VALUES ($1,$2,$3),($4,$5,$3)`, [brokerA, userA, BRAND, brokerB, userB]);
  for (const [k, id] of Object.entries(L)) {
    await db.query(`INSERT INTO leads VALUES ($1,$2,NULL,$3,$4)`, [id, k === 'legacy' ? null : BRAND, k === 'verified', `Lead ${k}`]);
  }
  const appt = (id, lead, status, broker = brokerA) =>
    db.query(`INSERT INTO appointments VALUES ($1,$2,$3,$4,$5,NULL,now() + interval '1 day')`, [id, lead, broker, BRAND, status]);
  await appt(A.phone, L.phone, 'booked');
  await appt(A.cancelled, L.cancelled, 'cancelled');
  await appt(A.pending, L.pending, 'pending_verification');
  await db.query(`INSERT INTO appointments VALUES ($1,$2,NULL,$3,'requested',NULL,NULL)`, [A.requested, L.requested, BRAND]);
  await appt(A.verified, L.verified, 'booked', brokerB);
  await appt(A.attended, L.attended, 'attended');
}

async function as(db, user, fn) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await db.exec('SET ROLE authenticated');
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
const ids = async (db, sql, params = []) => (await db.query(sql, params)).rows.map((r) => r.id).sort();
const markOutcome = (db, booking, lead) => db.query(
  `INSERT INTO outcomes (booking_id, lead_id, broker_id, brand_id, outcome) VALUES ($1,$2,$3,$4,'attended') RETURNING id`,
  [booking, lead, brokerA, BRAND]);

test('#4 broker visibility: a live booking shows its booking, lead and outcome to that broker only', async () => {
  const db = new PGlite();
  try {
    await db.exec(LIVE);
    await seed(db);

    // --- before: the live policies hide the unverified phone booking (and its lead) from its own broker
    await as(db, userA, async () => {
      assert.deepEqual(await ids(db, `SELECT id FROM appointments WHERE id = $1`, [A.phone]), [], 'bug reproduced: booking hidden');
      assert.deepEqual(await ids(db, `SELECT id FROM leads WHERE id = $1`, [L.phone]), [], 'bug reproduced: lead hidden (blank brief)');
      await assert.rejects(markOutcome(db, A.phone, L.phone), /row-level security/, 'bug reproduced: outcome cannot be marked');
    });

    await db.exec(await readFile(migration, 'utf8'));
    await db.exec(await readFile(migration, 'utf8')); // re-runnable

    // --- after, as broker A (non-admin)
    await as(db, userA, async () => {
      assert.equal((await db.query(`SELECT public.smc_is_admin() AS a`)).rows[0].a, false, 'runs as a non-admin broker');
      assert.deepEqual(await ids(db, `SELECT id FROM appointments`), [A.phone, A.attended].sort(),
        'own live bookings only: not cancelled, not pending_verification, not the unassigned request, not broker B\'s');
      assert.deepEqual(await ids(db, `SELECT id FROM leads`), [L.phone, L.attended].sort(),
        'leads with a live booking with me; not the cancelled/pending/requested ones, not broker B\'s verified lead, not legacy rows');
      assert.equal((await db.query(`SELECT first_name FROM leads WHERE id = $1`, [L.phone])).rows[0].first_name, 'Lead phone', 'brief has the lead');
      const o = await markOutcome(db, A.phone, L.phone);
      assert.equal(o.rows.length, 1, 'outcome marked and read back (insert ... returning)');
      await assert.rejects(markOutcome(db, A.verified, L.verified), /row-level security/, 'cannot mark broker B\'s booking');
      assert.equal((await db.query(`UPDATE leads SET first_name = 'x' WHERE id = $1 RETURNING id`, [L.phone])).rows.length, 0,
        'SELECT only: no new write right on the lead');
    });

    // --- broker B sees none of A's bookings or leads, and still sees his own verified lead
    await as(db, userB, async () => {
      assert.deepEqual(await ids(db, `SELECT id FROM appointments`), [A.verified]);
      assert.deepEqual(await ids(db, `SELECT id FROM leads`), [L.verified], 'only the lead booked with B (none of A\'s)');
      assert.equal((await db.query(`SELECT public.smc_broker_has_live_booking($1) AS v`, [L.phone])).rows[0].v, false);
      assert.equal((await db.query(`SELECT public.smc_broker_has_live_booking($1) AS v`, [L.verified])).rows[0].v, true);
    });

    // --- admins unchanged: everything
    await as(db, userAdmin, async () => {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM appointments`)).rows[0].n, 6);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM leads`)).rows[0].n, 7);
    });

    // --- cancelling the booking takes the lead out of view again
    await db.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [A.phone]);
    await as(db, userA, async () => {
      assert.deepEqual(await ids(db, `SELECT id FROM leads WHERE id = $1`, [L.phone]), []);
    });

    // --- the undo file restores the live behaviour
    await db.query(`UPDATE appointments SET status = 'booked' WHERE id = $1`, [A.phone]);
    await db.exec(await readFile(undo, 'utf8'));
    await as(db, userA, async () => {
      assert.deepEqual(await ids(db, `SELECT id FROM appointments WHERE id = $1`, [A.phone]), []);
    });
  } finally {
    await db.close();
  }
});
