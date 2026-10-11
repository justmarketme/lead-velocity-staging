-- =============================================================================
-- 20261011050000_smc_05_access.sql  --  CRM nurture chain, file 5 of 8: who may read and write the SortMyCover rows
-- Trimmed from the reviewed smc_05 / 07 / 08 / 13 / 14 / 19 (incl. every 2026-10-10 SAFETY REWRITE that still applies).
--   admin   (authenticated + has_role admin) : everything SortMyCover
--   broker  (authenticated, brokers.user_id) : own rows only; cannot write SortMyCover lead / booking rows directly and cannot
--                                              change the fields that decide routing, consent, disclosure or calendar state
--   n8n_app (NOLOGIN until a human enables it) : SortMyCover tables, and only brand rows (brand_id IS NOT NULL) of the shared
--                                              CRM tables; no DELETE anywhere except the 72-h thread cache; read-only on orders
--   anon    : nothing
-- The reporting role facts_reader of the original chain is not created (no facts schema).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Role (no password in SQL; enabling LOGIN is a manual step)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_app') THEN
    CREATE ROLE n8n_app NOLOGIN NOINHERIT;
  END IF;
END $$;
ALTER ROLE n8n_app SET statement_timeout = '30s';
COMMENT ON ROLE n8n_app IS 'SMC: the n8n nurture workflows. Least privilege: SortMyCover tables / brand rows only. Login enabled manually.';
GRANT USAGE ON SCHEMA public TO n8n_app;
-- The live CRM policies on leads / lead_orders / appointments ... are written for PUBLIC and call has_role(auth.uid(), ...), so
-- every role that reads those tables needs EXECUTE on auth.uid() (Postgres checks it even when another policy already passes).
-- Hosted Supabase may refuse grants in schema auth: then this warns instead of failing (verify after apply with
-- has_function_privilege('n8n_app','auth.uid()','EXECUTE'); fallback = connect n8n with a role that already has it).
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA auth TO n8n_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.uid() TO n8n_app';
  EXCEPTION WHEN insufficient_privilege OR undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'smc_05: could not grant auth.uid() to n8n_app (%). See CRM-NURTURE-SCHEMA.md (gate G4).', SQLERRM;
  END;
END $$;

-- -----------------------------------------------------------------------------
-- 1. New SortMyCover tables: RLS on, anon nothing, admin all, n8n_app read/insert/update (no delete)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.brands','public.webhook_events','public.outcomes','public.replacements','public.suppression',
    'public.escalations','public.broker_media','public.incidents','public.capi_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon', t);
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

-- wa_threads: n8n only (DELETE = the 72-h expiry purge)
REVOKE ALL ON public.wa_threads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_threads TO n8n_app;
DROP POLICY IF EXISTS "smc n8n_app rw" ON public.wa_threads;
CREATE POLICY "smc n8n_app rw" ON public.wa_threads FOR ALL TO n8n_app USING (true) WITH CHECK (true);

-- lead_offers: admins read (decisions are workflow-written), n8n_app read/insert/update
REVOKE ALL ON public.lead_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_offers TO n8n_app;
DROP POLICY IF EXISTS "smc n8n_app rw" ON public.lead_offers;
CREATE POLICY "smc n8n_app rw" ON public.lead_offers FOR ALL TO n8n_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "smc admin all" ON public.lead_offers;
CREATE POLICY "smc admin all" ON public.lead_offers FOR SELECT TO authenticated USING (public.smc_is_admin());

-- -----------------------------------------------------------------------------
-- 2. audit_log is append-only for everyone; rows come only from the SECURITY DEFINER triggers (smc_audit, live fn_audit)
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated, n8n_app, anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM service_role';
  END IF;
END $$;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'smc admin read audit') THEN
    CREATE POLICY "smc admin read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.smc_is_admin());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Broker policies on the new tables (own rows only)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'replacements' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.replacements FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
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
      WITH CHECK (broker_id = public.smc_current_broker_id() AND dispute_status = 'none'
                  -- the row must still describe one of HIS SortMyCover bookings (no retargeting booking_id / lead_id)
                  AND EXISTS (SELECT 1 FROM public.appointments a
                               WHERE a.id = outcomes.booking_id AND a.broker_id = outcomes.broker_id
                                 AND a.client_id = outcomes.lead_id AND a.brand_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broker_media' AND policyname = 'smc broker read own') THEN
    CREATE POLICY "smc broker read own" ON public.broker_media FOR SELECT TO authenticated
      USING (broker_id = public.smc_current_broker_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broker_media' AND policyname = 'smc broker add own') THEN
    CREATE POLICY "smc broker add own" ON public.broker_media FOR INSERT TO authenticated
      WITH CHECK (broker_id = public.smc_current_broker_id() AND approved_at IS NULL AND is_current = false);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Shared CRM tables: n8n_app sees SortMyCover rows only; brokers cannot write SortMyCover lead / booking rows
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.leads, public.appointments, public.communications, public.lead_activities, public.brokers TO n8n_app;
GRANT SELECT ON public.lead_orders, public.lead_order_items TO n8n_app;   -- read-only: attaching is done by the routing triggers (file 03)
GRANT SELECT ON public.bookings, public.smc_order_capacity TO n8n_app, authenticated;
REVOKE ALL ON public.bookings, public.smc_order_capacity FROM anon;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','appointments','communications','lead_activities','brokers'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'smc n8n_app brand rows') THEN
      EXECUTE format('CREATE POLICY "smc n8n_app brand rows" ON public.%I FOR ALL TO n8n_app USING (brand_id IS NOT NULL) WITH CHECK (brand_id IS NOT NULL)', t);
    END IF;
    -- RESTRICTIVE twin: several live CRM policies have no TO clause (they apply to PUBLIC, so to n8n_app too) and trust
    -- has_role(auth.uid(), ...); auth.uid() reads a session setting any role can set. Without this an n8n_app session could
    -- claim an admin's uid and reach legacy CRM rows.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'smc n8n_app brand rows only') THEN
      EXECUTE format('CREATE POLICY "smc n8n_app brand rows only" ON public.%I AS RESTRICTIVE FOR ALL TO n8n_app USING (brand_id IS NOT NULL) WITH CHECK (brand_id IS NOT NULL)', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_orders' AND policyname = 'smc n8n_app brand orders only') THEN
    CREATE POLICY "smc n8n_app brand orders only" ON public.lead_orders AS RESTRICTIVE FOR ALL TO n8n_app USING (brand_id IS NOT NULL) WITH CHECK (brand_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_order_items' AND policyname = 'smc n8n_app brand order items only') THEN
    CREATE POLICY "smc n8n_app brand order items only" ON public.lead_order_items AS RESTRICTIVE FOR ALL TO n8n_app
      USING (EXISTS (SELECT 1 FROM public.lead_orders o WHERE o.id = lead_order_items.order_id AND o.brand_id IS NOT NULL))
      WITH CHECK (EXISTS (SELECT 1 FROM public.lead_orders o WHERE o.id = lead_order_items.order_id AND o.brand_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_orders' AND policyname = 'smc n8n_app brand orders') THEN
    CREATE POLICY "smc n8n_app brand orders" ON public.lead_orders FOR SELECT TO n8n_app USING (brand_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_order_items' AND policyname = 'smc n8n_app brand order items') THEN
    CREATE POLICY "smc n8n_app brand order items" ON public.lead_order_items FOR SELECT TO n8n_app
      USING (EXISTS (SELECT 1 FROM public.lead_orders o WHERE o.id = lead_order_items.order_id AND o.brand_id IS NOT NULL));
  END IF;

  -- Brokers keep SELECT on their own leads/appointments (existing CRM policies) but may not insert or update SortMyCover rows:
  -- lead fields belong to the workflows, outcomes go to `outcomes`. Legacy rows (brand_id NULL) are unaffected.
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
  -- The LIVE policy "Allow authenticated users to insert broker profile" (auth.uid() = user_id) would let any signed-in user insert
  -- a brokers row already enrolled in SortMyCover. Legacy inserts (brand_id NULL, routing off) are unaffected.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'brokers' AND policyname = 'smc restrict broker self-insert') THEN
    CREATE POLICY "smc restrict broker self-insert" ON public.brokers AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.smc_is_admin() OR (brand_id IS NULL AND routing_on IS NOT TRUE AND fsp_number IS NULL AND licence_categories IS NULL
                  AND verified_credentials IS NULL AND calendar_token_ref IS NULL AND calendar_status IS NULL AND calendar_mode IS NULL
                  AND ms_tenant_id IS NULL AND intro_card_url IS NULL AND intro_voice_url IS NULL AND intro_video_url IS NULL
                  AND next_free_slot_at IS NULL AND onboarding_progress = '{}'::jsonb));
  END IF;
  -- The LIVE policy "Agents can create their own activities" (agent_id = auth.uid()) would let a broker insert timeline rows for ANY
  -- lead carrying brand_id / broker_id / workflow. Only SECURITY DEFINER RPCs, n8n_app and admins write SortMyCover timeline rows.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_activities' AND policyname = 'smc restrict broker writes on brand rows (insert)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (insert)" ON public.lead_activities AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK ((brand_id IS NULL AND broker_id IS NULL AND workflow IS NULL AND idempotency_key IS NULL) OR public.smc_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_activities' AND policyname = 'smc restrict broker writes on brand rows (update)') THEN
    CREATE POLICY "smc restrict broker writes on brand rows (update)" ON public.lead_activities AS RESTRICTIVE
      FOR UPDATE TO authenticated USING (brand_id IS NULL OR public.smc_is_admin()) WITH CHECK (brand_id IS NULL OR public.smc_is_admin());
  END IF;
  -- Broker reads his own SortMyCover timeline (bookings, reminders, outcomes of his leads)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_activities' AND policyname = 'smc broker read own timeline') THEN
    CREATE POLICY "smc broker read own timeline" ON public.lead_activities FOR SELECT TO authenticated
      USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Field-level guard on brokers. Brokers keep editing their own profile as today (live policy "Brokers can update their
--    own profile" has no column limit); this trigger removes only the fields that decide routing, consent, disclosure,
--    calendar connection and approved media. Legacy rows: only the SortMyCover enrolment fields are locked (a legacy broker
--    cannot promote himself into the SortMyCover pool); every legacy column stays writable exactly as today.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_brokers_guard()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- decide on current_user FIRST (n8n_app / service / SECURITY DEFINER paths never call auth.uid())
  IF current_user NOT IN ('authenticated','anon') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'smc: no session' USING ERRCODE = '42501';   -- an API role without a user never edits a broker row
  END IF;
  IF public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  -- Fields only Lead Velocity (admin / workflows) sets, on EVERY row (a legacy broker cannot pre-load them before an admin
  -- enrols him: once routing is switched on they would reach consumers).
  IF NEW.brand_id               IS DISTINCT FROM OLD.brand_id
  OR NEW.routing_on             IS DISTINCT FROM OLD.routing_on
  OR NEW.consent_mode           IS DISTINCT FROM OLD.consent_mode
  OR NEW.licence_categories     IS DISTINCT FROM OLD.licence_categories
  OR NEW.verified_credentials   IS DISTINCT FROM OLD.verified_credentials
  OR NEW.calendar_provider      IS DISTINCT FROM OLD.calendar_provider
  OR NEW.ms_tenant_id           IS DISTINCT FROM OLD.ms_tenant_id
  OR NEW.calendar_token_ref     IS DISTINCT FROM OLD.calendar_token_ref
  OR NEW.calendar_mode          IS DISTINCT FROM OLD.calendar_mode
  OR NEW.calendar_status        IS DISTINCT FROM OLD.calendar_status
  OR NEW.calendar_connected_at  IS DISTINCT FROM OLD.calendar_connected_at
  OR NEW.calendar_scopes        IS DISTINCT FROM OLD.calendar_scopes
  OR NEW.calendar_status_at     IS DISTINCT FROM OLD.calendar_status_at
  OR NEW.calendar_status_detail IS DISTINCT FROM OLD.calendar_status_detail
  OR NEW.next_free_slot_at      IS DISTINCT FROM OLD.next_free_slot_at
  OR NEW.intro_card_url         IS DISTINCT FROM OLD.intro_card_url
  OR NEW.intro_voice_url        IS DISTINCT FROM OLD.intro_voice_url
  OR NEW.intro_video_url        IS DISTINCT FROM OLD.intro_video_url
  OR NEW.onboarding_progress    IS DISTINCT FROM OLD.onboarding_progress THEN
    RAISE EXCEPTION 'smc: brokers cannot change routing, consent, licence, verification, calendar connection or approved media fields'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.brand_id IS NULL THEN
    IF NEW.fsp_number IS DISTINCT FROM OLD.fsp_number THEN
      RAISE EXCEPTION 'smc: the FSP number is set during SortMyCover onboarding' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;   -- every legacy column stays writable exactly as today
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'smc: brokers cannot change their SortMyCover status' USING ERRCODE = '42501';
  END IF;
  -- The names the consent text and the WhatsApp disclosure carry ("{practice} (FSP n)", the adviser) and the number lead
  -- notifications go to: editable during onboarding (portal Profile), frozen once Lead Velocity switches routing on.
  IF OLD.routing_on AND (
       NEW.firm_name       IS DISTINCT FROM OLD.firm_name
    OR NEW.fsp_number      IS DISTINCT FROM OLD.fsp_number
    OR NEW.contact_person  IS DISTINCT FROM OLD.contact_person
    OR NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number) THEN
    RAISE EXCEPTION 'smc: practice name, FSP number, adviser and WhatsApp number are locked while you receive leads; ask Lead Velocity to change them'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_guard ON public.brokers;
CREATE TRIGGER smc_brokers_guard BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard();

-- -----------------------------------------------------------------------------
-- 6. Portal events -> the stamped timeline (the portal Calendar page records availability changes). Types are whitelisted;
--    identity comes from the session, never the payload. (The onboarding-funnel side effects of the original are not kept.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smc_portal_event(p_type text, p_step text DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb, p_event_id uuid DEFAULT gen_random_uuid())
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_broker uuid := public.smc_current_broker_id();
  v_brand  uuid;
BEGIN
  IF v_broker IS NULL THEN
    RAISE EXCEPTION 'smc_portal_event: not a broker' USING ERRCODE = '42501';
  END IF;
  IF p_type NOT IN ('step.completed','step.skipped','fsp.submitted','calendar.fallback_chosen','card.approved',
                    'support.message','profile.saved','availability.saved','outcome.marked') THEN
    RAISE EXCEPTION 'smc_portal_event: unknown type %', p_type USING ERRCODE = '22023';
  END IF;
  IF (p_payload IS NOT NULL AND length(p_payload::text) > 4000) OR length(coalesce(p_step, '')) > 100 THEN
    RAISE EXCEPTION 'smc_portal_event: payload too large' USING ERRCODE = '22023';
  END IF;
  SELECT b.brand_id INTO v_brand FROM public.brokers b WHERE b.id = v_broker;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'smc_portal_event: not a SortMyCover broker' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.lead_activities (brand_id, broker_id, workflow, actor_type, activity_type, payload, occurred_at, idempotency_key)
  VALUES (v_brand, v_broker, 'portal', 'broker', p_type,
          jsonb_build_object('event_id', p_event_id, 'type', p_type, 'broker_id', v_broker, 'step', p_step,
                             'occurred_at', now(), 'payload', coalesce(p_payload, '{}'::jsonb)),
          now(), 'portal:' || p_event_id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN p_event_id;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Function privileges (Supabase grants EXECUTE on public functions to PUBLIC/anon by default)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.smc_brokers_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.smc_portal_event(text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_portal_event(text, text, jsonb, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id(), public.smc_hash_contact(text), public.smc_week_start(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smc_is_admin(), public.smc_current_broker_id(), public.smc_hash_contact(text), public.smc_week_start(timestamptz) TO authenticated, n8n_app;
