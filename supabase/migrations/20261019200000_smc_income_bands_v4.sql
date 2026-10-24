-- /start/ v4 income brackets (Jono, 19 Oct 2026): R15k / R30k / R50k / R80k.
-- Widens leads_capture_v2_checks.income_band to accept the new codes (lt15k, 15k_30k, 30k_50k, 50k_80k, 80kplus, prefer_not)
-- AND keep the old ones (lt20k, 20k_40k, 40k_60k, 60k_100k, 100kplus), so existing rows and /start/ pages opened during the
-- deploy still validate. Every other condition is copied unchanged from 20261011020000_smc_02_core.sql. NOT VALID as before
-- (no scan of existing rows; new and updated rows are checked). Additive and re-runnable; lib/w39.mjs INCOME_DRAFT_BANDS_ON
-- depends on it (apply this BEFORE importing W39). Undo: supabase/migrations/undo/20261019200000_smc_income_bands_v4.undo.sql
BEGIN;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_capture_v2_checks;
ALTER TABLE public.leads ADD CONSTRAINT leads_capture_v2_checks CHECK (
          (lead_tier IS NULL    OR lead_tier IN ('A','B','C'))
      AND (product_interest IS NULL OR product_interest IN ('life_cover','wills'))
      AND (spend_band IS NULL   OR spend_band IN ('lt500','500_1000','1000_1500','1500_2500','2500plus','prefer_not'))
      AND (income_band IS NULL  OR income_band IN ('lt15k','15k_30k','30k_50k','50k_80k','80kplus','prefer_not',
                                                     'lt20k','20k_40k','40k_60k','60k_100k','100kplus'))
      AND (smoker IS NULL       OR smoker IN ('yes','no','prefer_not'))
      AND (smoker IS NULL       OR (smoker_question_text IS NOT NULL AND smoker_answered_at IS NOT NULL))
      AND (email_verified_via IS NULL OR email_verified_via IN ('link','code'))
      AND (licence_flag IS NULL OR licence_flag IN ('outside_licence','licence_check_needed'))
      AND (offer_status IS NULL OR offer_status IN ('offered','accepted','declined','expired','held'))
      AND (reasons IS NULL      OR reasons <@ ARRAY['life_cover','funeral_cover','retirement_planning','investments','disability','paying_too_much','other']::text[])
) NOT VALID;
COMMIT;
