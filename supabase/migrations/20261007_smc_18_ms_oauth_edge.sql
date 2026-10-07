-- SMC 18: Microsoft calendar connect via the ms-oauth edge function (authorization code + PKCE).
-- The edge function runs as service_role; the vault / status wrappers from migration 13 were granted to n8n_app only.
-- Nothing else changes: the refresh token still lives only in Supabase Vault (brokers.calendar_token_ref holds the NAME),
-- and W04/W05 keep reading it through smc_vault_ms_refresh() while calendar_status = 'ok'.
-- Idempotent.

GRANT EXECUTE ON FUNCTION public.smc_vault_store_ms_refresh(uuid, text, text, text),
                          public.smc_set_calendar_status(uuid, text, jsonb) TO service_role;

-- Disconnect = forget the token, not just flip a flag. Deletes the Vault secret(s) for this broker, clears the
-- reference, and sets needs_reconnect so W04 offers no slots until he reconnects.
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
  'SMC 18 (ms-oauth edge function): broker taps Disconnect. Deletes his Microsoft refresh token from Vault, clears calendar_token_ref, status needs_reconnect. service_role / n8n_app only.';

REVOKE ALL ON FUNCTION public.smc_ms_disconnect(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_ms_disconnect(uuid) TO service_role, n8n_app;
