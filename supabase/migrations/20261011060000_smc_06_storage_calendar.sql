-- =============================================================================
-- 20261011060000_smc_06_storage_calendar.sql  --  CRM nurture chain, file 6 of 8: intro-media bucket + Outlook calendar tokens
-- Carried over from the reviewed smc_09 (broker-media bucket), smc_13 section 2 (Microsoft refresh token in Vault) and smc_18
-- (ms-oauth edge function), unchanged in behaviour. Google Calendar comes later (calendar_provider already allows 'google').
--   broker-media   private bucket: headshot (intro card photo), intro voice / video takes (W23), no-show / unreachable proof
--   Vault wrappers W04/W05 read the refresh token (only while calendar_status = 'ok'); ms-oauth stores it, W04/W20 set status;
--                  Disconnect deletes the broker's tokens. The token VALUE lives only in vault.secrets; brokers.calendar_token_ref
--                  holds the NAME (CHECK in file 02).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storage: private bucket broker-media (brokers write under <brokers.id>/ only; admins and n8n_app read)
-- -----------------------------------------------------------------------------
DO $mig$
DECLARE
  b constant text := 'broker-media';
  own constant text := $p$bucket_id = 'broker-media' AND (storage.foldername(name))[1] = public.smc_current_broker_id()::text$p$;
  -- no-show / unreachable proof is evidence for Lead Velocity's 48-h dispute window: the broker may add it, never change or remove it
  own_mutable constant text := $p$bucket_id = 'broker-media' AND (storage.foldername(name))[1] = public.smc_current_broker_id()::text AND (storage.foldername(name))[2] IS DISTINCT FROM 'noshow-proof'$p$;
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'smc_06: no storage schema here (plain Postgres) - skipped';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (b, b, false, 52428800,
          ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mp4','audio/mpeg','audio/webm'])
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker read own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker insert own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker update own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media broker delete own" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media admin read all" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "smc broker-media n8n_app read" ON storage.objects';

  EXECUTE format('CREATE POLICY "smc broker-media broker read own" ON storage.objects FOR SELECT TO authenticated USING (%s)', own);
  EXECUTE format('CREATE POLICY "smc broker-media broker insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (%s)', own);
  EXECUTE format('CREATE POLICY "smc broker-media broker update own" ON storage.objects FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', own_mutable, own_mutable);
  EXECUTE format('CREATE POLICY "smc broker-media broker delete own" ON storage.objects FOR DELETE TO authenticated USING (%s)', own_mutable);
  EXECUTE $q$CREATE POLICY "smc broker-media admin read all" ON storage.objects FOR SELECT TO authenticated
            USING (bucket_id = 'broker-media' AND public.smc_is_admin())$q$;

  -- n8n_app (file 05): read-only, this bucket only. On hosted Supabase storage.objects belongs to supabase_storage_admin, so the
  -- grant may be refused: non-fatal (n8n can always read through the Storage API with the service key).
  BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO n8n_app';
    EXECUTE 'GRANT SELECT ON storage.objects TO n8n_app';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'smc_06: could not grant storage read to n8n_app (%): use the Storage API / service key from n8n', SQLERRM;
  END;
  EXECUTE $q$CREATE POLICY "smc broker-media n8n_app read" ON storage.objects FOR SELECT TO n8n_app
            USING (bucket_id = 'broker-media')$q$;
  RAISE NOTICE 'smc_06: bucket % private, 6 policies in place', b;
END
$mig$;

-- -----------------------------------------------------------------------------
-- 2. Microsoft Graph refresh token in Vault, through SECURITY DEFINER wrappers (no vault grants to any API role)
-- -----------------------------------------------------------------------------
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
  -- a new name per connect (Graph rotates refresh tokens); Disconnect removes all of this broker's
  v_name := 'ms_refresh_' || p_broker_id::text || '_' || extract(epoch FROM clock_timestamp())::bigint;
  PERFORM vault.create_secret(p_refresh_token, v_name);
  -- the previous refresh tokens of this broker are dead once a new one is stored: forget them
  DELETE FROM vault.secrets WHERE name LIKE 'ms_refresh\_' || p_broker_id::text || '\_%' AND name <> v_name;
  PERFORM set_config('smc.source', 'edge', true);
  PERFORM set_config('smc.reason', 'calendar connected', true);
  UPDATE public.brokers b
     SET calendar_token_ref     = v_name,
         ms_tenant_id           = coalesce(nullif(p_tenant_id, ''), b.ms_tenant_id),
         calendar_scopes        = coalesce(nullif(p_scopes, ''), b.calendar_scopes),
         calendar_provider      = 'outlook',
         calendar_mode          = 'oauth',
         calendar_status        = 'ok',
         calendar_status_at     = now(),
         calendar_status_detail = NULL,
         calendar_connected_at  = coalesce(b.calendar_connected_at, now())
   WHERE b.id = p_broker_id;
  RETURN v_name;
END $$;
COMMENT ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text) IS
  'SMC (ms-oauth callback): stores the Microsoft Graph refresh token in Vault, sets calendar_token_ref (name), tenant, scopes, status ok.';

CREATE OR REPLACE FUNCTION public.smc_vault_ms_refresh(p_broker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.decrypted_secret
    FROM public.brokers b
    JOIN vault.decrypted_secrets s ON s.name = b.calendar_token_ref
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL AND b.calendar_status = 'ok'
     AND left(s.name, 48) = 'ms_refresh_' || b.id::text || '_'   -- only his own token, whatever the row points at
   LIMIT 1
$$;
COMMENT ON FUNCTION public.smc_vault_ms_refresh(uuid) IS
  'SMC (W04 graph_token): decrypted refresh token, only while brokers.calendar_status = ''ok''. n8n_app only.';

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
  'SMC (W04 / ms-oauth): calendar_status ok | needs_reconnect | blocked_admin_consent (accepts connected/disconnected/error/consent_pending) + detail.';

-- Disconnect = forget the token, not just flip a flag. The edge function derives p_broker_id from the verified JWT, never the body.
CREATE OR REPLACE FUNCTION public.smc_ms_disconnect(p_broker_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.brokers b WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL) THEN
    RAISE EXCEPTION 'smc_ms_disconnect: unknown SMC broker' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('smc.source', 'portal', true);
  PERFORM set_config('smc.reason', 'calendar disconnected by broker', true);
  DELETE FROM vault.secrets WHERE name LIKE 'ms_refresh\_' || p_broker_id::text || '\_%';
  UPDATE public.brokers b
     SET calendar_token_ref     = NULL,
         calendar_status        = 'needs_reconnect',
         calendar_status_at     = now(),
         calendar_status_detail = jsonb_build_object('reported', 'disconnected', 'at', now())
   WHERE b.id = p_broker_id;
  RETURN 'needs_reconnect';
END $$;
COMMENT ON FUNCTION public.smc_ms_disconnect(uuid) IS
  'SMC (ms-oauth edge function): broker taps Disconnect. Deletes his Microsoft refresh tokens from Vault, clears calendar_token_ref, status needs_reconnect.';

REVOKE ALL ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                       public.smc_vault_ms_refresh(uuid),
                       public.smc_set_calendar_status(uuid, text, jsonb),
                       public.smc_ms_disconnect(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                          public.smc_vault_ms_refresh(uuid),
                          public.smc_set_calendar_status(uuid, text, jsonb),
                          public.smc_ms_disconnect(uuid) TO n8n_app;
-- the ms-oauth edge function runs as service_role: it stores, sets status and disconnects, but never reads a token
GRANT EXECUTE ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                          public.smc_set_calendar_status(uuid, text, jsonb),
                          public.smc_ms_disconnect(uuid) TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.smc_vault_ms_refresh(uuid) FROM service_role';
  END IF;
END $$;
