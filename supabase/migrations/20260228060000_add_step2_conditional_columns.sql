ALTER TABLE public.broker_onboarding_responses
ADD COLUMN IF NOT EXISTS current_lead_provider TEXT,
ADD COLUMN IF NOT EXISTS current_monthly_spend NUMERIC,
ADD COLUMN IF NOT EXISTS current_cpl NUMERIC,
ADD COLUMN IF NOT EXISTS current_conversion_rate TEXT;
