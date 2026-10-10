-- SMC 18: top-ups (agreement clause 9; pricing.seed.json `topup`). NOT APPLIED: DDL on this project is user-gated.
-- A top-up is an invoices_smc row with kind 'add_on' for the broker's current cycle. W16 "Mark invoice paid + create cycle"
-- adds topup_leads to cycles.committed_leads when it flips to paid (no new cycle row). cycles.topup_leads keeps how many of
-- committed_leads were bought as top-ups, so the plan's own commitment stays readable (committed_leads - topup_leads).
-- REFUNDS (Jonathan, 2026-10-10): a top-up lead that is not delivered is credited or refunded at the Effective Lead Price of the
-- broker's tier (price_zar / the plan's own committed_leads; Pilot = its stated per-lead price), NOT at the top-up price. That is
-- the same rate as the plan's own leads, so the credit rate must use the plan's commitment (committed_leads - topup_leads): dividing
-- the plan price by the total would spread the top-up leads into the plan price and under-credit. The one place the money is
-- computed is automation/billing/invoice.js shortfallCreditCents, fed by pricing.effectiveLeadPriceZar (pricing.seed.json).
ALTER TABLE public.invoices_smc ADD COLUMN IF NOT EXISTS topup_leads integer;
ALTER TABLE public.invoices_smc ADD COLUMN IF NOT EXISTS topup_starts_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_smc_topup_chk') THEN
    ALTER TABLE public.invoices_smc ADD CONSTRAINT invoices_smc_topup_chk
      CHECK ((kind = 'add_on') = (topup_leads IS NOT NULL) AND (topup_leads IS NULL OR (topup_leads > 0 AND cycle_id IS NOT NULL)));
  END IF;
END $$;
-- One open top-up per broker at a time (W16 G refuses a second; this makes it hold under a race too).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_smc_one_open_topup ON public.invoices_smc (broker_id) WHERE kind = 'add_on' AND status = 'issued';
COMMENT ON COLUMN public.invoices_smc.topup_leads IS 'SMC 18: kind add_on only: Qualified Leads bought as a top-up (>= pricing.seed.json topup.min_leads).';
COMMENT ON COLUMN public.invoices_smc.topup_starts_at IS 'SMC 18: earliest delivery start (request + topup.notice_days); later if payment clears after it.';

ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS topup_leads integer NOT NULL DEFAULT 0 CHECK (topup_leads >= 0);
COMMENT ON COLUMN public.cycles.topup_leads IS 'SMC 18: leads added to committed_leads by paid top-ups (W16). The plan''s own commitment is committed_leads - topup_leads; the Effective Lead Price (and so the refund rate for any undelivered lead, top-up or not) is price_zar / that.';

-- The shortfall credit cap. Migration 02 capped shortfall_credit_zar at price_zar ("liability capped at cycle price"). Top-up leads are paid
-- ON TOP of the plan price and an undelivered one is credited at the Effective Lead Price, so with that cap an undelivered top-up could
-- never be credited in full. The cap becomes what the broker paid toward the cycle's leads: price_zar + topup_leads x the plan's
-- Effective Lead Price (whole rand, as shortfallCreditCents). Idempotent: drops the migration-02 check by its definition (it is unnamed),
-- then adds the named one once. For a cycle with no top-ups the cap is price_zar exactly, as before.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.cycles'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%shortfall_credit_zar <= price_zar%'
  LOOP
    EXECUTE format('ALTER TABLE public.cycles DROP CONSTRAINT %I', c);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cycles'::regclass AND conname = 'cycles_shortfall_credit_cap') THEN
    ALTER TABLE public.cycles ADD CONSTRAINT cycles_shortfall_credit_cap
      CHECK (shortfall_credit_zar IS NULL OR shortfall_credit_zar <= price_zar + topup_leads * round(price_zar / NULLIF(committed_leads - topup_leads, 0)));
  END IF;
END $$;
COMMENT ON CONSTRAINT cycles_shortfall_credit_cap ON public.cycles IS 'SMC 18: credit never exceeds what was paid toward the cycle''s leads: price_zar + topup_leads x the plan''s Effective Lead Price.';
