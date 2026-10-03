-- =============================================================================
-- 20261002_smc_11_pass5.sql  —  SortMyCover build, migration 11: integration pass 5
-- Owner: platform-architect. Drafted 2026-10-02. NOT applied (NH-11 / NH-15 still gate 01–11).
-- Additive and idempotent, same conventions as 01–10. Nothing else is in this file.
--   I-37g ops.notifications.attempts — send attempts counter (W22/W32 retry logic).
--   I-35i smc_vault_paystack_sub_token(broker_id) — W19 reads the Paystack subscription email token from Vault
--         to disable a Plan when the broker switches auto-renew off (extends 08 §1 wrappers; n8n_app only).
-- =============================================================================

-- 1. I-37g
ALTER TABLE ops.notifications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_attempts_nonneg'
                  AND conrelid = 'ops.notifications'::regclass) THEN
    ALTER TABLE ops.notifications ADD CONSTRAINT notifications_attempts_nonneg CHECK (attempts >= 0);
  END IF;
END $$;
COMMENT ON COLUMN ops.notifications.attempts IS 'SMC I-37g: delivery attempts so far (incremented by the sender; 0 = not tried).';

-- 2. I-35i — the subscription email token is needed to call Paystack "disable subscription".
-- Returns the token whatever card_autorenew says (switching auto-renew off is exactly when it is needed);
-- NULL when the broker has no stored Plan token. Never exposed to the API roles.
CREATE OR REPLACE FUNCTION public.smc_vault_paystack_sub_token(p_broker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.decrypted_secret
    FROM public.brokers b
    JOIN vault.decrypted_secrets s ON s.name = b.paystack_subscription_token_ref
   WHERE b.id = p_broker_id AND b.brand_id IS NOT NULL
   LIMIT 1
$$;
COMMENT ON FUNCTION public.smc_vault_paystack_sub_token(uuid) IS
  'SMC I-35i (W19 auto-renew off): decrypted Paystack subscription email token for disabling the Plan. n8n_app only.';
REVOKE ALL ON FUNCTION public.smc_vault_paystack_sub_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smc_vault_paystack_sub_token(uuid) TO n8n_app;
