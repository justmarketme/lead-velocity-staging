-- smc_19: quiz budget collapses to three bands (consent-and-privacy.md CP 1.4): Under R750 / R750-R1,499 / R1,500 or more.
-- FILE ONLY: never applied by an agent to a live database.
-- New code '750_1499' qualifies; only 'lt750' fails. '1500_plus' keeps its priority tag (premium_1500).
-- Older codes '750_1250', '1250plus', '1250_1499' stay valid for historic leads (all qualifying).
-- Budget codes now: lt750 | 750_1499 | 1500_plus  (+ legacy 750_1250 | 1250plus | 1250_1499)

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_smc_checks;
ALTER TABLE public.leads ADD CONSTRAINT leads_smc_checks CHECK (
      (origin IS NULL        OR origin IN ('page','lead_ad','ctwa','comment','dm','manual'))
  AND (consent_mode IS NULL  OR consent_mode IN ('named','generic'))
  AND (line_type IS NULL     OR line_type IN ('mobile','landline','voip','unknown'))
  AND (call_number_line_type IS NULL OR call_number_line_type IN ('mobile','landline','voip','unknown'))
  AND (age_band IS NULL      OR age_band IN ('lt35','35_44','45_50','51plus'))
  AND (budget_band IS NULL   OR budget_band IN ('lt750','750_1499','1500_plus','750_1250','1250plus','1250_1499'))
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
