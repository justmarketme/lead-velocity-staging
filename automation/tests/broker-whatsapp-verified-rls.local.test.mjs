// 24 Oct 2026 (Mark's first real lead): a click-to-WhatsApp lead that consented (leads.verified_at) and was routed to an adviser,
// with no email and no booking, must be visible to THAT adviser's portal login, with its whole timeline (including the rows
// written before routing, broker_id NULL), and to nobody else. Runs as non-admin brokers under RLS in a throwaway local
// Postgres (never the live project): first with the policies as live on 24 Oct 2026 (bug reproduced), then after
// supabase/migrations/20261024150000_smc_broker_sees_whatsapp_verified_leads.sql, then after its undo file.
// Skipped when no local Postgres backend exists (automation/tests/_localpg.mjs).
// Run: node --test automation/tests/broker-whatsapp-verified-rls.local.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPgBackend, startLocalPg } from './_localpg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20261024150000_smc_broker_sees_whatsapp_verified_leads.sql');
const UNDO = join(ROOT, 'supabase', 'migrations', 'undo', '20261024150000_smc_broker_sees_whatsapp_verified_leads.undo.sql');
const PASTE = join(ROOT, 'docs', 'APPLY-LIVE-20261024-broker-visibility.sql');
const PG = localPgBackend();

const BRAND = 'b0000000-0000-4000-8000-000000000001';
const uMark = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // the real adviser (non-admin)
const uOther = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // another broker
const uAdmin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bMark = '11111111-1111-4111-8111-111111111111';
const bOther = '22222222-2222-4222-8222-222222222222';
const L = {
  wa: '30000000-0000-4000-8000-000000000001',        // CTWA: consented (verified_at), routed to Mark, no email, no booking  <- Cassiem
  unverified: '30000000-0000-4000-8000-000000000002', // routed to Mark, never consented
  unrouted: '30000000-0000-4000-8000-000000000003',   // consented, not routed yet
  otherWa: '30000000-0000-4000-8000-000000000004',    // consented, routed to the other broker
  email: '30000000-0000-4000-8000-000000000005',      // email-verified, routed to Mark (the old path, unchanged)
};

// The tables and policies the broker portal reads, as pg_policies showed them live on 24 Oct 2026
// (files 05 / 08 / 20261013210000 / 20261021150300 applied).
const LIVE = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE n8n_app;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin', 'broker');
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE TABLE public.brokers (id uuid PRIMARY KEY, user_id uuid NOT NULL, brand_id uuid);
CREATE TABLE public.leads (id uuid PRIMARY KEY, brand_id uuid, broker_id uuid, email_verified boolean DEFAULT false,
  verified_at timestamptz, first_name text, phone text);
CREATE TABLE public.appointments (id uuid PRIMARY KEY, client_id uuid NOT NULL, broker_id uuid, brand_id uuid, status text, allocated_at timestamptz);
CREATE TABLE public.outcomes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, lead_id uuid, broker_id uuid, brand_id uuid, outcome text);
CREATE TABLE public.lead_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, brand_id uuid, broker_id uuid,
  agent_id uuid, activity_type text, occurred_at timestamptz DEFAULT now());
CREATE TABLE public.communications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, brand_id uuid, broker_id uuid, body text);

CREATE FUNCTION public.smc_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;
CREATE FUNCTION public.smc_current_broker_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT b.id FROM public.brokers b WHERE b.user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.smc_lead_email_verified(p_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT l.email_verified FROM public.leads l WHERE l.id = p_lead_id
     AND (coalesce(nullif(current_setting('role', true), 'none'), session_user::text) NOT IN ('authenticated', 'anon')
          OR public.smc_is_admin() OR (l.broker_id IS NOT NULL AND l.broker_id = public.smc_current_broker_id()))), false) $$;
CREATE FUNCTION public.smc_broker_has_live_booking(p_lead_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.client_id = p_lead_id AND a.brand_id IS NOT NULL
     AND a.broker_id IS NOT NULL AND a.broker_id = public.smc_current_broker_id()
     AND a.status IN ('booked', 'confirmed', 'rescheduled', 'attended', 'no_show')) $$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO authenticated, n8n_app;
GRANT SELECT ON public.brokers, public.user_roles TO authenticated;
GRANT SELECT ON public.leads, public.appointments, public.outcomes, public.lead_activities, public.communications TO authenticated;

CREATE POLICY "Admins have full access to leads" ON public.leads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Brokers can view their own leads" ON public.leads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM brokers WHERE brokers.id = leads.broker_id AND brokers.user_id = auth.uid()));
CREATE POLICY "smc broker sees verified leads only" ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR smc_is_admin() OR email_verified IS TRUE OR smc_broker_has_live_booking(id));

CREATE POLICY "Brokers can see their appointments" ON public.appointments FOR SELECT
  USING (broker_id IN (SELECT brokers.id FROM brokers WHERE brokers.user_id = auth.uid()));
CREATE POLICY "smc_sec admins manage appointments" ON public.appointments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "smc broker sees verified bookings only" ON public.appointments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR smc_is_admin() OR (status <> 'pending_verification' AND (allocated_at IS NOT NULL OR smc_lead_email_verified(client_id)))
         OR (status IN ('booked','confirmed','rescheduled','attended','no_show') AND broker_id IS NOT NULL AND broker_id = smc_current_broker_id()));

CREATE POLICY "smc admin all" ON public.outcomes FOR ALL TO authenticated USING (smc_is_admin());
CREATE POLICY "smc broker read own" ON public.outcomes FOR SELECT TO authenticated USING (broker_id = smc_current_broker_id());
CREATE POLICY "smc broker sees verified outcomes only" ON public.outcomes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (smc_is_admin() OR smc_lead_email_verified(lead_id) OR smc_broker_has_live_booking(lead_id));

CREATE POLICY "Admins can view all activities" ON public.lead_activities FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agents can view their own activities" ON public.lead_activities FOR SELECT TO authenticated USING (agent_id = auth.uid());
CREATE POLICY "smc broker read own timeline" ON public.lead_activities FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND broker_id = smc_current_broker_id());
CREATE POLICY "smc broker sees verified timelines only" ON public.lead_activities AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR smc_is_admin() OR lead_id IS NULL OR smc_lead_email_verified(lead_id));

CREATE POLICY "smc broker read own messages" ON public.communications FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND broker_id = smc_current_broker_id());
CREATE POLICY "smc broker sees verified messages only" ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR smc_is_admin() OR lead_id IS NULL OR smc_lead_email_verified(lead_id));

INSERT INTO user_roles VALUES ('${uMark}','broker'),('${uOther}','broker'),('${uAdmin}','admin');
INSERT INTO brokers VALUES ('${bMark}','${uMark}','${BRAND}'),('${bOther}','${uOther}','${BRAND}');
INSERT INTO leads (id, brand_id, broker_id, email_verified, verified_at, first_name, phone) VALUES
  ('${L.wa}', '${BRAND}', '${bMark}', false, now() - interval '6 hours', 'Cassiem', '+27710000495'),
  ('${L.unverified}', '${BRAND}', '${bMark}', false, NULL, 'Never', '+27710000001'),
  ('${L.unrouted}', '${BRAND}', NULL, false, now(), 'Floating', '+27710000002'),
  ('${L.otherWa}', '${BRAND}', '${bOther}', false, now(), 'Theirs', '+27710000003'),
  ('${L.email}', '${BRAND}', '${bMark}', true, NULL, 'Emailed', '+27710000004');
-- Cassiem's real timeline shape: consent + page visits BEFORE routing carry broker_id NULL; routing and after carry Mark.
INSERT INTO lead_activities (lead_id, brand_id, broker_id, activity_type, occurred_at) VALUES
  ('${L.wa}', '${BRAND}', NULL, 'ctwa_consent', now() - interval '6 hours'),
  ('${L.wa}', '${BRAND}', NULL, 'start_page_adviser', now() - interval '6 hours' + interval '40 seconds'),
  ('${L.wa}', '${BRAND}', '${bMark}', 'adviser_disclosed', now() - interval '6 hours' + interval '48 seconds'),
  ('${L.wa}', '${BRAND}', '${bMark}', 'routed', now() - interval '6 hours' + interval '49 seconds'),
  ('${L.wa}', '${BRAND}', '${bMark}', 'nurture_sent', now() - interval '4 hours'),
  ('${L.otherWa}', '${BRAND}', NULL, 'ctwa_consent', now()),
  ('${L.otherWa}', '${BRAND}', '${bOther}', 'routed', now()),
  ('${L.unverified}', '${BRAND}', '${bMark}', 'routed', now());
`;

test('WhatsApp-verified, routed, unbooked lead: visible to its adviser with the whole timeline, to nobody else (local Postgres)', { skip: !PG && 'no local Postgres backend' }, () => {
  const pg = startLocalPg(PG);
  try {
    pg.sql(LIVE);
    const as = (uid, q) => pg.sql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);\n${q}`, ['-At']).trim()
      .split('\n').filter((x) => x && x !== uid);
    const leads = (uid) => as(uid, `SELECT first_name FROM public.leads ORDER BY first_name;`);
    const timeline = (uid, lead) => as(uid, `SELECT activity_type FROM public.lead_activities WHERE lead_id = '${lead}' ORDER BY occurred_at;`);

    // --- before (live on 24 Oct 2026): Mark cannot see Cassiem or her timeline; only the email-verified lead
    assert.deepEqual(leads(uMark), ['Emailed'], 'bug reproduced: the WhatsApp-verified lead is hidden from its own adviser');
    assert.deepEqual(timeline(uMark, L.wa), [], 'bug reproduced: no timeline');

    // --- apply: the paste file Jonathan runs equals the repo migration; both re-runnable
    pg.file(PASTE);
    pg.file(MIGRATION);

    // --- Mark: Cassiem now visible, with the full journey including the pre-routing rows; still no unverified / other / unrouted lead
    assert.deepEqual(leads(uMark), ['Cassiem', 'Emailed'], 'consented + routed to me: visible; never-consented, unrouted and other broker\'s: not');
    assert.deepEqual(timeline(uMark, L.wa), ['ctwa_consent', 'start_page_adviser', 'adviser_disclosed', 'routed', 'nurture_sent'],
      'the whole journey from the consent tap, including rows written before routing');
    assert.deepEqual(as(uMark, `SELECT phone FROM public.leads WHERE id = '${L.wa}';`), ['+27710000495'], 'the WhatsApp number is readable for the portal card');
    assert.deepEqual(timeline(uMark, L.otherWa), [], 'another broker\'s lead timeline stays hidden (pre-routing rows included)');
    assert.deepEqual(timeline(uMark, L.unverified), [], 'a lead that never consented stays hidden even though it is routed to me');

    // --- the other broker: only his own consented lead; nothing of Mark's
    assert.deepEqual(leads(uOther), ['Theirs']);
    assert.deepEqual(timeline(uOther, L.wa), [], 'Mark\'s lead timeline is invisible to another broker');
    assert.deepEqual(timeline(uOther, L.otherWa), ['ctwa_consent', 'routed']);
    assert.deepEqual(as(uOther, `SELECT public.smc_lead_verified('${L.wa}') AS v;`), ['f'], 'the helper answers false to a broker who is not the lead\'s');
    assert.deepEqual(as(uOther, `SELECT public.smc_lead_routed_to_me('${L.wa}') AS v;`), ['f']);

    // --- admin: everything, unchanged
    assert.deepEqual(leads(uAdmin), ['Cassiem', 'Emailed', 'Floating', 'Never', 'Theirs']);

    // --- reading only: no new write right
    assert.throws(() => as(uMark, `UPDATE public.leads SET first_name = 'x' WHERE id = '${L.wa}';`), /permission denied/);

    // --- undo restores the live 24 Oct behaviour
    pg.file(UNDO);
    assert.deepEqual(leads(uMark), ['Emailed'], 'undo: hidden again');
    assert.deepEqual(timeline(uMark, L.wa), []);
  } finally {
    pg.stop();
  }
});
