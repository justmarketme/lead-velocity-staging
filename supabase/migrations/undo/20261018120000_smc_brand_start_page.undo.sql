ALTER TABLE public.lead_activities DROP CONSTRAINT IF EXISTS lead_activities_smc_checks;
ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_smc_checks CHECK (
      (workflow IS NULL   OR workflow ~ '^(W(0[1-9]|[12][0-9]|3[0-5])|console|portal)$')
  AND (actor_type IS NULL OR actor_type IN ('system','admin','broker','lead'))
  AND (lead_id IS NOT NULL OR broker_id IS NOT NULL)
) NOT VALID;
ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_start_page_check;
ALTER TABLE public.brands DROP COLUMN IF EXISTS start_page;
