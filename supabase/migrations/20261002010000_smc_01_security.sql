-- =============================================================================
-- 20261002010000_smc_01_security.sql  —  SortMyCover build, migration 1 of 5
-- *** APPLY ONLY AFTER NH-15 YES ***  (build/tasks.json NH-15; crm-gap §E, §D.1)
-- *** and only after NH-11 (live schema dump) has been diffed against this file ***
--
-- Owner: platform-architect (Head of Platform). Drafted 2026-10-02. NOT applied.
-- Purpose: close the pre-existing security / POPIA defects in the live CRM
-- (inventory §11 S1–S3, plus S10 found while drafting this file) BEFORE any
-- SortMyCover consumer row lands in the same database. Salesforce rule from my
-- five: admin vs broker is enforced in the database, never by the UI.
--
-- What this file changes in live behaviour (why it needs a human yes):
--   S1  broker_onboarding_responses / broker_analysis lose their USING (true)
--       policies. The public /onboarding form keeps INSERT; reads become
--       admin-only (+ the submitting broker reads their own response).
--       PRE-CHECK (runbook step 2): submit_broker_onboarding / submit_broker_analysis
--       are live-only RPCs (INV-F09). They must be SECURITY DEFINER or the public
--       form stops working after this migration.
--   S2  appointments / broker_notes "Admins can manage all …" USING (true) become
--       admin-only; the appointments policy that compared auth.uid() to
--       broker_id (wrong key) is replaced by the correct broker pattern (INV-A06).
--   S3  bucket admin-documents becomes private; the "Public Access" SELECT policy
--       is removed; the broker download policy is fixed (it compared the
--       document's own file_path to its own name instead of to the object name).
--   S10 (new, not in inventory §11) "Deny anonymous access to leads" and
--       "… to communications" (20260122114221) are PERMISSIVE policies with
--       USING (auth.uid() IS NOT NULL): they let ANY signed-in broker read EVERY
--       lead and every message. They are dropped; anon is denied by having no
--       policy plus the REVOKEs below. This is the fix that makes broker #2 safe.
--   ANON table privileges are revoked on every PII table (defence in depth;
--   RLS stays the primary control). Kept for anon, on purpose:
--     - INSERT on broker_onboarding_responses (public form),
--     - INSERT on broker_reset_requests (forgot-password request),
--     - EXECUTE on get_broker_invite_by_token / validate_admin_invite (SECURITY DEFINER RPCs).
--
-- Not SQL (see deliverables/platform-architect/security-runbook.md): password
-- rotation + untracking reset-admin.js / test-login.js (S6), edge-function auth
-- and Twilio/Meta signature checks (S4), browser Gemini key (S5), plain-text
-- security answers (S7, retired with magic links).
--
-- Idempotent: every DROP is IF EXISTS, every CREATE is guarded. Nothing the
-- legacy product reads (tables, columns, functions) is renamed or dropped;
-- only policies are replaced.
-- =============================================================================

-- No explicit BEGIN/COMMIT: the Supabase CLI applies each migration file atomically.

-- ---------------------------------------------------------------------------
-- S1  Prospect-broker readiness assessment (INV-T22, INV-T23)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access to responses" ON public.broker_onboarding_responses;
DROP POLICY IF EXISTS "Enable all access for dev"             ON public.broker_onboarding_responses;
DROP POLICY IF EXISTS "Service role full access to analysis"  ON public.broker_analysis;
DROP POLICY IF EXISTS "Enable all access for dev"             ON public.broker_analysis;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'broker_onboarding_responses'
                 AND policyname = 'smc_sec admins manage onboarding responses') THEN
    CREATE POLICY "smc_sec admins manage onboarding responses"
      ON public.broker_onboarding_responses FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'broker_onboarding_responses'
                 AND policyname = 'smc_sec broker reads own onboarding response') THEN
    -- broker_id on this table holds the submitting auth user id (see table comment in 20260223120000)
    CREATE POLICY "smc_sec broker reads own onboarding response"
      ON public.broker_onboarding_responses FOR SELECT TO authenticated
      USING (broker_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'broker_analysis'
                 AND policyname = 'smc_sec admins manage broker analysis') THEN
    CREATE POLICY "smc_sec admins manage broker analysis"
      ON public.broker_analysis FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.broker_onboarding_responses FROM anon;
REVOKE ALL ON public.broker_analysis FROM anon;

-- ---------------------------------------------------------------------------
-- S2  appointments + broker_notes (INV-T24, INV-T25)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all appointments"   ON public.appointments;
DROP POLICY IF EXISTS "Users can view their own appointments" ON public.appointments; -- auth.uid() = broker_id (wrong key)
DROP POLICY IF EXISTS "Admins can manage all notes"          ON public.broker_notes;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'appointments' AND policyname = 'smc_sec admins manage appointments') THEN
    CREATE POLICY "smc_sec admins manage appointments"
      ON public.appointments FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
  -- Broker read/update policies from 20260225220000 use the correct
  -- brokers.user_id = auth.uid() pattern and are kept. Re-create them only if absent.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'appointments' AND policyname = 'Brokers can see their appointments') THEN
    CREATE POLICY "Brokers can see their appointments"
      ON public.appointments FOR SELECT TO authenticated
      USING (broker_id IN (SELECT b.id FROM public.brokers b WHERE b.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'broker_notes' AND policyname = 'smc_sec admins manage notes') THEN
    CREATE POLICY "smc_sec admins manage notes"
      ON public.broker_notes FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- S3  Storage bucket admin-documents (INV-08): private + fixed broker download
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'admin-documents' AND public IS DISTINCT FROM false;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Brokers can download shared documents" ON storage.objects;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                 AND tablename = 'objects' AND policyname = 'smc_sec brokers download shared documents') THEN
    CREATE POLICY "smc_sec brokers download shared documents"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'admin-documents'
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1
            FROM public.admin_documents ad
            JOIN public.document_shares ds ON ds.document_id = ad.id
            JOIN public.brokers b          ON b.id = ds.broker_id
            WHERE ad.file_path = objects.name      -- was ad.file_path = ad.name (bug)
              AND b.user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- S10 Permissive "Deny anonymous" SELECT policies that granted every signed-in
--     user read access to all leads and all communications.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Deny anonymous access to leads"          ON public.leads;
DROP POLICY IF EXISTS "Deny anonymous access to communications" ON public.communications;

-- ---------------------------------------------------------------------------
-- Anon privileges on PII / internal tables (inventory §11; Supabase grants ALL
-- to anon by default and relies on RLS alone). Guarded per table because the
-- live database may lack some of them (NH-11).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','lead_activities','lead_conversations','communications','referrals',
    'appointments','broker_notes','brokers','profiles','user_roles',
    'admin_documents','document_shares','admin_invites','broker_invites',
    'broker_security_questions','ai_call_requests','notification_preferences',
    'scheduled_reports','report_history','sla_thresholds','sla_alerts',
    'message_templates','client_engagement_notes','call_coaching','system_logs'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- broker_reset_requests: anon keeps INSERT only (forgot-password request).
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.broker_reset_requests FROM anon;

