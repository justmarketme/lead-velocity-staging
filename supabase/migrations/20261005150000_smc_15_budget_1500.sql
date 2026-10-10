-- smc_15: split the top budget answer "R1,250+" into "R1,250-R1,499" and "R1,500+" (Jonathan-approved).
-- FILE ONLY: never applied by an agent to a live database.
-- Rules (canonical): R750-R1,250, R1,250-R1,499 and R1,500+ ALL qualify. R1,500+ is a PRIORITY TAG only:
-- never a disqualifier, never a routing filter. The old code '1250plus' stays valid for historic leads
-- (qualifying, labelled "R1,250+ (before split)").
-- Budget codes now: lt750 | 750_1250 | 1250plus (legacy) | 1250_1499 | 1500_plus

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_smc_checks;
ALTER TABLE public.leads ADD CONSTRAINT leads_smc_checks CHECK (
      (origin IS NULL        OR origin IN ('page','lead_ad','ctwa','comment','dm','manual'))
  AND (consent_mode IS NULL  OR consent_mode IN ('named','generic'))
  AND (line_type IS NULL     OR line_type IN ('mobile','landline','voip','unknown'))
  AND (call_number_line_type IS NULL OR call_number_line_type IN ('mobile','landline','voip','unknown'))
  AND (age_band IS NULL      OR age_band IN ('lt35','35_44','45_50','51plus'))
  AND (budget_band IS NULL   OR budget_band IN ('lt750','750_1250','1250plus','1250_1499','1500_plus'))
  AND (method_pref IS NULL   OR method_pref IN ('teams','zoom','meet','whatsapp_call','phone'))
  AND (alt_purpose IS NULL   OR alt_purpose IN ('reach_fallback'))
  AND (best_time IS NULL     OR best_time IN ('mornings','lunchtime','afternoons','evenings','any'))
  AND (email_status IS NULL  OR email_status IN ('unchecked','mx_ok','delivered','bounced','corrected'))
  AND (email_purpose IS NULL OR email_purpose IN ('meeting_invite'))
  AND (stage IS NULL OR stage IN ('new','disclosed','verified','qualified','booked','confirmed',
                                  'attended','no_show','dispositioned','unbooked_closed',
                                  'opted_out','replacement_due','disqualified'))
  AND (brand_id IS NULL OR first_message_at IS NULL OR broker_id IS NOT NULL)
  AND (brand_id IS NULL OR (consent_at IS NOT NULL AND consent_text IS NOT NULL AND consent_source IS NOT NULL))
);

-- Derived priority tag, queryable and index-friendly. Never used in routing or qualification.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS premium_1500 boolean GENERATED ALWAYS AS (COALESCE(budget_band = '1500_plus', false)) STORED;
COMMENT ON COLUMN public.leads.premium_1500 IS 'Priority tag (budget R1,500+). Display/analysis only: never a disqualifier, never a routing filter.';
