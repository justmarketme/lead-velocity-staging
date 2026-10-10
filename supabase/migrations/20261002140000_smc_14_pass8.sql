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
