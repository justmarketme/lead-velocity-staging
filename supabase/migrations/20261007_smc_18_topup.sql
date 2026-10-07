-- SMC 18: top-ups (agreement clause 9; pricing.seed.json `topup`). NOT APPLIED: DDL on this project is user-gated.
-- A top-up is an invoices_smc row with kind 'add_on' for the broker's current cycle. W16 "Mark invoice paid + create cycle"
-- adds topup_leads to cycles.committed_leads when it flips to paid (no new cycle row). cycles.topup_leads keeps how many of
-- committed_leads were bought as top-ups, so the plan's own commitment stays readable (committed_leads - topup_leads).
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
COMMENT ON COLUMN public.cycles.topup_leads IS 'SMC 18: leads added to committed_leads by paid top-ups (W16).';
