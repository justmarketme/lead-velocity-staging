-- =============================================================================
-- 20261002140000_smc_14_pass8.sql  —  SortMyCover build, migration 14: integration pass 8 (I-22)
-- Owner: platform-architect. Drafted 2026-10-03. NOT applied (NH-11 / NH-15 still gate 01-14).
-- Additive and idempotent, same conventions as 01-13.
--   1. brokers.media_share_pct (I-22): the broker's share (0-100) of the shared Meta media budget that W26 raises
--      at go-live (6.1 step 5). Nullable: NULL = not set, W26 falls back to pricing.media_share_zar for the tier.
--      A percentage, never a rand figure; rand amounts stay in pricing / cycles.media_share_zar (3.6).
-- Inventory line extended: INV-T03 (brokers).
-- =============================================================================

ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS media_share_pct numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brokers_media_share_pct_check' AND conrelid = 'public.brokers'::regclass) THEN
    ALTER TABLE public.brokers ADD CONSTRAINT brokers_media_share_pct_check
      CHECK (media_share_pct IS NULL OR (media_share_pct >= 0 AND media_share_pct <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.brokers.media_share_pct IS 'SMC 6.1 step 5: broker''s percentage (0-100) of the shared media budget; NULL = fall back to pricing.media_share_zar. Written by the console/W26 only.';

-- SAFETY REWRITE (2026-10-10 review): the comment above says media_share_pct is written by the console/W26 only, but neither
-- smc_brokers_guard (08) nor smc_brokers_guard_pass7 (13) listed it, and the LIVE policy "Brokers can update their own profile"
-- has no column limit: a broker could set his own share of the shared Meta media budget. Same function as smc_13, plus the money
-- column and the two tenant/provider fields a broker must not edit directly. Re-asserts the trigger so it stays attached.
CREATE OR REPLACE FUNCTION public.smc_brokers_guard_pass7()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR OLD.brand_id IS NULL THEN
    RETURN NEW;   -- n8n/service connections, SECURITY DEFINER RPCs, legacy rows (legacy rows: smc_brokers_guard blocks brand_id changes)
  END IF;
  IF auth.uid() IS NULL OR public.smc_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.verified_credentials   IS DISTINCT FROM OLD.verified_credentials
  OR NEW.calendar_status_detail IS DISTINCT FROM OLD.calendar_status_detail
  OR NEW.calendar_status_at     IS DISTINCT FROM OLD.calendar_status_at
  OR NEW.calendar_scopes        IS DISTINCT FROM OLD.calendar_scopes
  OR NEW.media_share_pct        IS DISTINCT FROM OLD.media_share_pct
  OR NEW.ms_tenant_id           IS DISTINCT FROM OLD.ms_tenant_id
  OR NEW.calendar_provider      IS DISTINCT FROM OLD.calendar_provider THEN
    RAISE EXCEPTION 'smc: brokers cannot change verified credentials, calendar connection state or media share'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS smc_brokers_guard_pass7 ON public.brokers;
CREATE TRIGGER smc_brokers_guard_pass7 BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.smc_brokers_guard_pass7();
