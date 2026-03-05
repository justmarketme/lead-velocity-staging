-- Fix: "new row violates row-level security policy for table broker_invites"
-- Ensure admins can INSERT (and SELECT/UPDATE/DELETE) on broker_invites.
-- Uses same has_role pattern as user_roles and other admin tables.

DROP POLICY IF EXISTS "Admins can manage broker invites" ON public.broker_invites;
DROP POLICY IF EXISTS "Admins can insert broker invites" ON public.broker_invites;

-- Single policy: admins can do everything (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage broker invites"
ON public.broker_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
