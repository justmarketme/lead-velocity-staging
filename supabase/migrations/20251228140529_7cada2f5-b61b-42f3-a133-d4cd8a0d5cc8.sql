-- Add restrictive policy to require authentication for all leads access
CREATE POLICY "Require authentication for leads access"
ON public.leads
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);