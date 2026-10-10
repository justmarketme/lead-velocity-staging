-- smc_17: ads write log + single-use confirm-token ledger for the console ads webhooks (automation/SUB-ads-console.json).
-- FILE ONLY: never applied by an agent to a live database.
-- One row per CONFIRMED write attempt (budget, pause, resume). The unique `nonce` is the confirm token's nonce: the webhook inserts the
-- row BEFORE it calls Meta, so a token can be used once even across separate n8n runs (CONFIRM_REUSED on conflict).
-- The smc_audit trigger copies every insert/update into audit_log (who / when / why / diff).
-- Needs smc_16 (ads_launch_plan) for the caps; reads brands, ad_objects, cycles, brokers, ad_metrics.

CREATE TABLE IF NOT EXISTS public.ads_write_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce          text NOT NULL UNIQUE,
  brand_id       uuid REFERENCES public.brands(id),
  action         text NOT NULL CHECK (action IN ('set_campaign_budget','pause_ad','resume_ad','pause_campaign','resume_campaign')),
  target         text NOT NULL,                     -- Meta campaign / ad id (SortMyCover objects only)
  params         jsonb NOT NULL,                    -- the server-normalised parameters the token was bound to
  before         jsonb,
  requested_by   uuid,
  confirmed_by   uuid NOT NULL,
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 3),
  status         text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','applied','dry_run','failed')),
  result         jsonb,
  error_code     text,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_write_log_target_idx ON public.ads_write_log (target, created_at DESC);
COMMENT ON TABLE public.ads_write_log IS 'SMC: confirmed Meta ad writes (console). nonce = confirm token nonce (single use). Written only by the ads console webhooks.';

ALTER TABLE public.ads_write_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_write_log FROM anon;
GRANT SELECT ON public.ads_write_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ads_write_log TO n8n_app;
DROP POLICY IF EXISTS "smc admin read" ON public.ads_write_log;
CREATE POLICY "smc admin read" ON public.ads_write_log FOR SELECT TO authenticated USING (public.smc_is_admin());
DROP POLICY IF EXISTS "smc n8n_app rw" ON public.ads_write_log;
CREATE POLICY "smc n8n_app rw" ON public.ads_write_log FOR ALL TO n8n_app USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS smc_touch_updated_at ON public.ads_write_log;
CREATE TRIGGER smc_touch_updated_at BEFORE UPDATE ON public.ads_write_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS smc_audit ON public.ads_write_log;
CREATE TRIGGER smc_audit AFTER INSERT OR UPDATE ON public.ads_write_log FOR EACH ROW EXECUTE FUNCTION public.smc_audit();
