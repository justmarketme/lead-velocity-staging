-- Fix 1: Add policy to deny anonymous access to leads table (contains PII: email, phone)
CREATE POLICY "Deny anonymous access to leads"
ON public.leads
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Fix 2: Add policy to deny anonymous access to communications table (contains messages, recordings)
CREATE POLICY "Deny anonymous access to communications"
ON public.communications
FOR SELECT
USING (auth.uid() IS NOT NULL);