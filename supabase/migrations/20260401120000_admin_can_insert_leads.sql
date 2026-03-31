-- Allow admins to insert leads without requiring a broker_id
-- This is needed for the Marketing Hub prospector which runs in admin context

DROP POLICY IF EXISTS "Admins can insert leads" ON public.leads;

CREATE POLICY "Admins can insert leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
