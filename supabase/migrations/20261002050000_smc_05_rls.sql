-- =============================================================================
-- 20261002050000_smc_05_rls.sql  —  SortMyCover build, migration 5 of 5: access control
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 pending).
-- Salesforce rule from my five: admin vs broker in the database, audit on every write.
-- Role model reused as-is (inventory §3 / INV-F01, F02, A06): app_role admin|broker,
-- has_role(), brokers.user_id = auth.uid(). Wrapped as smc_is_admin() / smc_current_broker_id().
--
--   admin (authenticated + has_role admin) : full access to every SMC table
--   broker (authenticated, brokers.user_id) : own rows only (broker_id = smc_current_broker_id());
--                                             no writes to SMC leads/bookings fields — outcomes,
--                                             media and e-sign go through their own tables / RPCs
--   n8n_app (Postgres login for n8n, NH-09) : SMC tables only, SMC rows only on shared legacy
--                                             tables (brand_id IS NOT NULL); no DELETE anywhere;
--                                             erasure only via smc_erase_lead(); never the service key
--   facts_reader ("Ask the data", 6A2 #4)   : SELECT on facts.* only, 5 s statement timeout
--   anon                                    : nothing
-- Roles are created NOLOGIN; enabling login + password is a manual step (security-runbook.md),
-- so no secret is ever in a migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Roles
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    CREATE ROLE n8n_app NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'facts_reader') THEN
    CREATE ROLE facts_reader NOLOGIN NOINHERIT;
  END IF;
END $$;
ALTER ROLE facts_reader SET statement_timeout = '5s';
ALTER ROLE n8n_app SET statement_timeout = '30s';
COMMENT ON ROLE n8n_app IS 'SMC: n8n workflows (W01–W35). Least privilege: SMC tables / SMC rows only. Login enabled manually (runbook).';
COMMENT ON ROLE facts_reader IS 'SMC: read-only facts.* for "Ask the data" (6A2 #4).';

GRANT USAGE ON SCHEMA public TO n8n_app;
GRANT USAGE ON SCHEMA ops TO authenticated, n8n_app;
GRANT USAGE ON SCHEMA facts TO facts_reader, n8n_app;
REVOKE ALL ON SCHEMA ops FROM anon;
REVOKE ALL ON SCHEMA facts FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Generic policy set for every NEW SortMyCover table:
--    RLS on · anon nothing · admin all · n8n_app read/insert/update (no delete)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.brands','public.pricing','public.cycles','public.outcomes','public.replacements',
    'public.invoices_smc','public.bank_credits','public.webhook_events','public.audit_log',
    'public.ad_metrics','public.comments','public.escalations','public.insights','public.lead_pulse',
    'public.capi_log','public.suppression','public.dsr_requests','public.retention_log',
    'public.incidents','public.obligations','public.broker_media',
    'ops.pulses','ops.proposals','ops.signals','ops.notifications','ops.optimisation_memos',
    'ops.costs','ops.quality_grades'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %s TO n8n_app', t);

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = t AND policyname = 'smc admin all') THEN
      EXECUTE format('CREATE POLICY "smc admin all" ON %s FOR ALL TO authenticated USING (public.smc_is_admin()) WITH CHECK (public.smc_is_admin())', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = t AND policyname = 'smc n8n_app rw') THEN
      EXECUTE format('CREATE POLICY "smc n8n_app rw" ON %s FOR ALL TO n8n_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. audit_log is append-only for everyone (Salesforce / POPIA accountability).
--    Rows are written only by the SECURITY DEFINER trigger smc_audit().
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated, n8n_app, anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM service_role';
  END IF;
END $$;
DROP POLICY IF EXISTS "smc admin all"  ON public.audit_log;
DROP POLICY IF EXISTS "smc n8n_app rw" ON public.audit_log;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'smc admin read audit') THEN
    CREATE POLICY "smc admin read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.smc_is_admin());
  END IF;
END $$;
-- retention_log: append-only as well (evidence of W34 deletions)
REVOKE UPDATE, DELETE, TRUNCATE ON public.retention_log FROM authenticated, n8n_app;

-- -----------------------------------------------------------------------------
-- 3. Broker policies on new tables (own rows only)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- pricing: any signed-in user may read the tiers (they are on the public website anyway; W25)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pricing' AND policyname = 'smc signed-in read pricing') THEN
    CREATE POLICY "smc signed-in read pricing" ON public.pricing FOR SELECT TO authenticated USING (true);
  END IF;
  -- cycles, invoices, replacements: read own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cycles' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.cycles FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoices_smc' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.invoices_smc FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'replacements' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.replacements FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  -- outcomes: the broker marks his own meetings (portal buttons = WhatsApp buttons, 4.12a)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outcomes' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.outcomes FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outcomes' AND policyname = 'smc broker mark own') THEN
    CREATE POLICY "smc broker mark own" ON public.outcomes FOR INSERT TO authenticated
      WITH CHECK (
        broker_id = public.smc_current_broker_id()
        AND EXISTS (SELECT 1 FROM public.appointments a
                     WHERE a.id = outcomes.booking_id AND a.broker_id = outcomes.broker_id
                       AND a.client_id = outcomes.lead_id AND a.brand_id IS NOT NULL)
        AND auto_marked = false
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outcomes' AND policyname = 'smc broker correct own') THEN
    CREATE POLICY "smc broker correct own" ON public.outcomes FOR UPDATE TO authenticated
      USING (broker_id = public.smc_current_broker_id() AND dispute_status = 'none')
      WITH CHECK (broker_id = public.smc_current_broker_id() AND dispute_status = 'none');
  END IF;
  -- broker_media: own takes (upload, re-record); approval stays with admin
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broker_media' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.broker_media FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broker_media' AND policyname = 'smc broker add own') THEN
    CREATE POLICY "smc broker add own" ON public.broker_media FOR INSERT TO authenticated
      WITH CHECK (broker_id = public.smc_current_broker_id() AND approved_at IS NULL AND is_current = false);
  END IF;
END $$;
-- lead_pulse: aggregates only reach brokers (W35) → no broker row policy on purpose.

-- -----------------------------------------------------------------------------
-- 4. Shared legacy tables extended for SMC: n8n_app sees SMC rows only;
--    brokers cannot write SMC lead / booking rows directly.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.leads, public.appointments, public.communications,
                                public.lead_activities, public.brokers, public.report_history,
                                public.message_templates, public.admin_documents TO n8n_app;
GRANT SELECT ON public.sla_thresholds, public.profiles, public.user_roles TO n8n_app;
GRANT SELECT ON public.conversations, public.bookings, public.reports, public.v_cycle_progress TO n8n_app, authenticated;
REVOKE ALL ON public.conversations, public.bookings, public.reports, public.v_cycle_progress FROM anon;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','appointments','communications','lead_activities','brokers',
                           'report_history','message_templates','admin_documents','sla_thresholds'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'smc n8n_app brand rows') THEN
      EXECUTE format('CREATE POLICY "smc n8n_app brand rows" ON public.%I FOR ALL TO n8n_app USING (brand_id IS NOT NULL) WITH CHECK (brand_id IS NOT NULL)', t);
    END IF;
  END LOOP;

  -- n8n_app reads admin profiles only (Jonathan/KG notification numbers, 6.8b)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'smc n8n_app admin profiles') THEN
    CREATE POLICY "smc n8n_app admin profiles" ON public.profiles FOR SELECT TO n8n_app
      USING (public.has_role(user_id, 'admin'::public.app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'smc n8n_app read roles') THEN
    CREATE POLICY "smc n8n_app read roles" ON public.user_roles FOR SELECT TO n8n_app USING (true);
  END IF;

  -- Brokers keep SELECT on own leads/appointments (existing policies) but may not insert
  -- or update SortMyCover rows: lead fields belong to the workflows, outcomes go to `outcomes`.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'smc restrict broker writes on brand rows (update)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (update)" ON public.leads AS RESTRICTIVE
      FOR UPDATE TO authenticated USING (brand_id IS NULL OR public.smc_is_admin()) WITH CHECK (brand_id IS NULL OR public.smc_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'smc restrict broker writes on brand rows (insert)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (insert)" ON public.leads AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK (brand_id IS NULL OR public.smc_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'smc restrict broker writes on brand rows (update)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (update)" ON public.appointments AS RESTRICTIVE
      FOR UPDATE TO authenticated USING (brand_id IS NULL OR public.smc_is_admin()) WITH CHECK (brand_id IS NULL OR public.smc_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'smc restrict broker writes on brand rows (insert)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (insert)" ON public.appointments AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK (brand_id IS NULL OR public.smc_is_admin());
  END IF;

  -- Broker reads: own SMC timeline events, own reports, own agreements/invoices PDFs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_activities' AND policyname = 'smc broker read own timeline') THEN
    CREATE POLICY "smc broker read own timeline" ON public.lead_activities FOR SELECT TO authenticated
      USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_history' AND policyname = 'smc broker read own reports') THEN
    CREATE POLICY "smc broker read own reports" ON public.report_history FOR SELECT TO authenticated
      USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_documents' AND policyname = 'smc broker read own documents') THEN
    CREATE POLICY "smc broker read own documents" ON public.admin_documents FOR SELECT TO authenticated
      USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Brokers may edit their own profile row (existing policy), but not the fields
--    that decide money, routing or go-live (Salesforce field-level security).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.brand_id IS NULL OR auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;   -- legacy rows, n8n/service connections and admins are not restricted here
  END IF;
  IF NEW.status            IS DISTINCT FROM OLD.status
  OR NEW.brand_id          IS DISTINCT FROM OLD.brand_id
  OR NEW.tier_code         IS DISTINCT FROM OLD.tier_code
  OR NEW.ref_code          IS DISTINCT FROM OLD.ref_code
  OR NEW.user_id           IS DISTINCT FROM OLD.user_id
  OR NEW.current_cycle_id  IS DISTINCT FROM OLD.current_cycle_id
  OR NEW.approved_live_by  IS DISTINCT FROM OLD.approved_live_by
  OR NEW.approved_live_at  IS DISTINCT FROM OLD.approved_live_at
  OR NEW.fsp_verified_at   IS DISTINCT FROM OLD.fsp_verified_at
  OR NEW.fsp_check         IS DISTINCT FROM OLD.fsp_check
  OR NEW.routing_on        IS DISTINCT FROM OLD.routing_on
  OR NEW.routing_rules     IS DISTINCT FROM OLD.routing_rules
  OR NEW.consent_mode      IS DISTINCT FROM OLD.consent_mode
  OR NEW.paystack_customer_code IS DISTINCT FROM OLD.paystack_customer_code
  OR NEW.calendar_token_ref IS DISTINCT FROM OLD.calendar_token_ref
  OR NEW.intro_card_url    IS DISTINCT FROM OLD.intro_card_url
  OR NEW.intro_voice_url   IS DISTINCT FROM OLD.intro_voice_url
  OR NEW.intro_video_url   IS DISTINCT FROM OLD.intro_video_url THEN
    RAISE EXCEPTION 'smc: brokers cannot change status, tier, routing, consent mode, FSP verification, go-live, billing or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_guard ON public.brokers;
CREATE TRIGGER smc_brokers_guard BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard();

-- -----------------------------------------------------------------------------
-- 6. Portal RPCs (Close: one tap) — the only broker write paths besides outcomes/media
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_mark_report_opened(p_report_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.report_history
     SET opened_portal_at = coalesce(opened_portal_at, now())
   WHERE id = p_report_id AND brand_id IS NOT NULL
     AND broker_id = public.smc_current_broker_id();
$$;

CREATE OR REPLACE FUNCTION public.smc_sign_document(p_document_id uuid, p_signed_by_name text, p_doc_sha256 text,
                                                    p_signer_ip text, p_user_agent text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('smc.source', 'portal', true);
  PERFORM set_config('smc.reason', 'e-sign', true);
  UPDATE public.admin_documents
     SET signed_at = now(), signed_by_name = p_signed_by_name, doc_sha256 = p_doc_sha256,
         signer_ip = p_signer_ip, signed_user_agent = p_user_agent
   WHERE id = p_document_id AND brand_id IS NOT NULL AND signed_at IS NULL
     AND broker_id = public.smc_current_broker_id()
     AND kind IN ('agreement','authorisation_letter','addendum');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'smc_sign_document: not found, not yours, or already signed' USING ERRCODE = '42501';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Function privileges (Supabase grants EXECUTE on public functions to anon by default)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_erase_lead(uuid, text, text, uuid) TO n8n_app;
REVOKE ALL ON FUNCTION public.smc_watchlist(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_watchlist(boolean) TO authenticated;   -- admin check inside
REVOKE ALL ON FUNCTION public.smc_mark_report_opened(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_mark_report_opened(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_sign_document(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_sign_document(uuid, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id(), public.smc_hash_contact(text) TO authenticated, n8n_app;

-- -----------------------------------------------------------------------------
-- 8. facts: read-only for facts_reader and n8n_app (advisor); nobody else
-- -----------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA facts TO facts_reader, n8n_app;
REVOKE ALL ON ALL TABLES IN SCHEMA facts FROM anon, authenticated;
REVOKE ALL ON FUNCTION facts.lead_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION facts.lead_key(uuid), facts.include_synthetic(), facts.sa_date(timestamptz) TO facts_reader, n8n_app;
REVOKE ALL ON ALL TABLES IN SCHEMA smc_private FROM PUBLIC;
