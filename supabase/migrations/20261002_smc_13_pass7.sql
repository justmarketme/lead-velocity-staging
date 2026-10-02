-- =============================================================================
-- 20261002_smc_13_pass7.sql  —  SortMyCover build, migration 13: integration pass 7 (I-40b)
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–13).
-- Additive and idempotent, same conventions as 01–12.
--   1. ops.proposals.decided_via (optimisation/sql-additions.sql; W32 Decide writes it).
--   2. Microsoft Graph refresh token in Vault through n8n_app-only SECURITY DEFINER wrappers (same pattern as
--      the Paystack wrappers, 08 §1), plus smc_set_calendar_status() for W20 (I-40c /ms/callback).
--      calendar_status keeps the vocabulary already in use since 06 (W20, portal Calendar/Start):
--      ok | needs_reconnect | blocked_admin_consent. The RPC also accepts the I-40b names and maps them:
--      connected → ok, disconnected / error → needs_reconnect, consent_pending → blocked_admin_consent;
--      the original word and any detail go to calendar_status_detail (needs_human: pick one vocabulary).
-- Inventory lines extended: INV-T03 (brokers), 0.3 #4 (Graph consent fallback).
-- =============================================================================

-- 1. decided_via
ALTER TABLE ops.proposals ADD COLUMN IF NOT EXISTS decided_via text;
COMMENT ON COLUMN ops.proposals.decided_via IS 'SMC: where the decision was taken (console | whatsapp | email); written by W32 Decide and the console RPC.';

-- 2. calendar connection metadata (token VALUE stays in Vault; the row holds the secret NAME only)
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS calendar_scopes         text,
  ADD COLUMN IF NOT EXISTS calendar_status_at      timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_status_detail  jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_calendar_token_ref_name'
                  AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_calendar_token_ref_name CHECK (
          (calendar_token_ref IS NULL OR calendar_token_ref ~ '^ms_refresh_[0-9a-f-]{36}_[0-9]+$')   -- Vault NAME, never a token
      AND (calendar_status_detail IS NULL OR jsonb_typeof(calendar_status_detail) = 'object'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.smc_vault_store_ms_refresh(p_broker_id uuid, p_refresh_token text,
                                                             p_tenant_id text DEFAULT NULL, p_scopes text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_broker_id IS NULL OR coalesce(p_refresh_token, '') = '' THEN
    RAISE EXCEPTION 'smc_vault_store_ms_refresh: broker and refresh token required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brokers b WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL) THEN
    RAISE EXCEPTION 'smc_vault_store_ms_refresh: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  -- a new name per connect (Graph rotates refresh tokens); the previous secret stays until W34 key hygiene removes it
  v_name := 'ms_refresh_' || p_broker_id::text || '_' || extract(epoch FROM clock_timestamp())::bigint;
  PERFORM vault.create_secret(p_refresh_token, v_name);
  UPDATE public.brokers b
     SET calendar_token_ref    = v_name,
         ms_tenant_id          = coalesce(nullif(p_tenant_id, ''), b.ms_tenant_id),
         calendar_scopes       = coalesce(nullif(p_scopes, ''), b.calendar_scopes),
         calendar_provider     = 'outlook',
         calendar_mode         = 'oauth',
         calendar_status       = 'ok',
         calendar_status_at    = now(),
         calendar_status_detail = NULL,
         calendar_connected_at = coalesce(b.calendar_connected_at, now())
   WHERE b.id = p_broker_id;
  RETURN v_name;
END $$;
COMMENT ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text) IS
  'SMC I-40b (W20 /ms/callback): stores the Microsoft Graph refresh token in Vault, sets calendar_token_ref (name), tenant, scopes, status ok. n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_vault_ms_refresh(p_broker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.decrypted_secret
    FROM public.brokers b
    JOIN vault.decrypted_secrets s ON s.name = b.calendar_token_ref
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL AND b.calendar_status = 'ok'
   LIMIT 1
$$;
COMMENT ON FUNCTION public.smc_vault_ms_refresh(uuid) IS
  'SMC I-40b (W04/W05/W20 Graph calls): decrypted refresh token, only while brokers.calendar_status = ''ok'' (connected). n8n_app only.';

CREATE OR REPLACE FUNCTION public.smc_set_calendar_status(p_broker_id uuid, p_status text, p_detail jsonb DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  v_status := CASE p_status
    WHEN 'ok' THEN 'ok' WHEN 'connected' THEN 'ok'
    WHEN 'needs_reconnect' THEN 'needs_reconnect' WHEN 'disconnected' THEN 'needs_reconnect' WHEN 'error' THEN 'needs_reconnect'
    WHEN 'blocked_admin_consent' THEN 'blocked_admin_consent' WHEN 'consent_pending' THEN 'blocked_admin_consent'
  END;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'smc_set_calendar_status: status must be connected, disconnected, consent_pending or error' USING ERRCODE = '22023';
  END IF;
  IF p_detail IS NOT NULL AND jsonb_typeof(p_detail) <> 'object' THEN
    RAISE EXCEPTION 'smc_set_calendar_status: detail must be a JSON object' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('smc.source', 'n8n', true);
  PERFORM set_config('smc.reason', 'calendar ' || p_status, true);
  UPDATE public.brokers b
     SET calendar_status        = v_status,
         calendar_status_at     = now(),
         calendar_status_detail = coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('reported', p_status),
         calendar_connected_at  = CASE WHEN v_status = 'ok' THEN coalesce(b.calendar_connected_at, now()) ELSE b.calendar_connected_at END
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smc_set_calendar_status: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  RETURN v_status;
END $$;
COMMENT ON FUNCTION public.smc_set_calendar_status(uuid, text, jsonb) IS
  'SMC I-40b (W20): set calendar_status (ok | needs_reconnect | blocked_admin_consent; accepts connected/disconnected/error/consent_pending) + detail. n8n_app only.';

REVOKE ALL ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                       public.smc_vault_ms_refresh(uuid),
                       public.smc_set_calendar_status(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                          public.smc_vault_ms_refresh(uuid),
                          public.smc_set_calendar_status(uuid, text, jsonb) TO n8n_app;

-- =============================================================================
-- 3. I-41d / R5-02 — the lead pulse never reaches the broker by name (W35, FAQ-25, knowledge/faq.md).
--    Option chosen: exclude pulse rows from the broker read policies (W35 keeps writing broker_id).
--    Why: the broker's aggregate pulse (W14-broker.sql pulse_up / pulse_n, facts.fact_lead.lead_pulse*) is read by
--    n8n_app / admin from public.lead_pulse by cycle_id, never through the broker's RLS, so it is unaffected; keeping
--    broker_id on the activity rows keeps admin per-broker facts and the POPIA erase cascade unchanged, while a
--    NULL broker_id would still leave lead_id on a row joined to the broker's own lead.
--    (a) timeline: "smc broker read own timeline" (05 §4) re-created without lead_pulse / lead_pulse_line / any W35 row.
--    (b) communications: the legacy "Brokers can view their communications" (20260114101603) also exposed the
--        pulse tap / one-line answer (W07 stores it with metadata.route = 'W35') and W35's reply (whose words
--        differ for up / down). A RESTRICTIVE SELECT policy hides W35 rows from every non-admin API caller.
-- =============================================================================
DROP POLICY IF EXISTS "smc broker read own timeline" ON public.lead_activities;
CREATE POLICY "smc broker read own timeline" ON public.lead_activities FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND broker_id = public.smc_current_broker_id()
         AND coalesce(activity_type, '') NOT IN ('lead_pulse', 'lead_pulse_line')
         AND coalesce(workflow, '') <> 'W35');
COMMENT ON POLICY "smc broker read own timeline" ON public.lead_activities IS
  'SMC (05, re-created 13 I-41d): broker reads own SMC timeline rows EXCEPT lead pulse rows (lead_pulse, lead_pulse_line, workflow W35): aggregate only, never by name.';

DROP POLICY IF EXISTS "smc hide lead pulse from brokers" ON public.communications;
CREATE POLICY "smc hide lead pulse from brokers" ON public.communications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.smc_is_admin()
         OR (coalesce(workflow, '') <> 'W35' AND coalesce(metadata->>'route', '') <> 'W35'
             AND coalesce(template_name, '') <> 'lead_pulse'));
COMMENT ON POLICY "smc hide lead pulse from brokers" ON public.communications IS
  'SMC 13 I-41d: lead pulse ask, answer (W07 route W35) and W35 replies are never readable by a broker; admins and n8n_app unaffected.';

-- =============================================================================
-- 4. I-41k — brokers.verified_credentials (W23 reads it via to_jsonb(b)->'verified_credentials').
-- =============================================================================
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS verified_credentials jsonb;
COMMENT ON COLUMN public.brokers.verified_credentials IS
  'SMC I-41k: JSON array of strings: designations / credentials Lead Velocity has verified (FSP register result, etc.); the only identity claims an intro script may use word for word (conversation/guardrail.mjs I-2, automation/media/intro-script.mjs). Admin-set; NULL = none.';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_smc_verified_credentials_array'
                  AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_smc_verified_credentials_array
      CHECK (verified_credentials IS NULL OR jsonb_typeof(verified_credentials) = 'array');
  END IF;
END $$;

-- 5. Field-level guard for the columns added in 13 (smc_brokers_guard in 08 §12 predates them).
--    A broker may not self-declare credentials, nor plant an admin-consent link / calendar state on his own row.
CREATE OR REPLACE FUNCTION public.smc_brokers_guard_pass7()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR OLD.brand_id IS NULL THEN
    RETURN NEW;   -- n8n/service connections, SECURITY DEFINER RPCs, legacy rows (same order as 08 §12)
  END IF;
  IF auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.verified_credentials   IS DISTINCT FROM OLD.verified_credentials
  OR NEW.calendar_status_detail IS DISTINCT FROM OLD.calendar_status_detail
  OR NEW.calendar_status_at     IS DISTINCT FROM OLD.calendar_status_at
  OR NEW.calendar_scopes        IS DISTINCT FROM OLD.calendar_scopes THEN
    RAISE EXCEPTION 'smc: brokers cannot change verified credentials or calendar connection state'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_guard_pass7 ON public.brokers;
CREATE TRIGGER smc_brokers_guard_pass7 BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard_pass7();
