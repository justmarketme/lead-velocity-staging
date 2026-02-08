-- Remove overly permissive policies that allow any authenticated user to see all data
-- The existing role-based RESTRICTIVE policies are sufficient

DROP POLICY IF EXISTS "Require authentication for leads" ON public.leads;
DROP POLICY IF EXISTS "Require authentication for referrals" ON public.referrals;

-- Add explicit admin DELETE policy for admin_invites (info-level fix)
CREATE POLICY "Admins can delete invites" 
ON public.admin_invites 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));