ALTER TABLE public.broker_onboarding_responses
ADD COLUMN IF NOT EXISTS monthly_sales_target NUMERIC;
