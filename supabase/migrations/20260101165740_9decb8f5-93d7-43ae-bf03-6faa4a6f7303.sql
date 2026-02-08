-- Fix: Convert RESTRICTIVE policies to PERMISSIVE for leads table
-- With PERMISSIVE policies, access is only granted when at least one policy matches
-- Anonymous users will have no matching policy and be denied access

-- Drop existing restrictive SELECT policies on leads
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Brokers can view their own leads" ON public.leads;

-- Recreate as PERMISSIVE policies (default behavior)
CREATE POLICY "Admins can view all leads" 
ON public.leads 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Brokers can view their own leads" 
ON public.leads 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM brokers 
  WHERE brokers.id = leads.broker_id 
  AND brokers.user_id = auth.uid()
));

-- Also fix referrals table with the same pattern
DROP POLICY IF EXISTS "Admins can view all referrals" ON public.referrals;
DROP POLICY IF EXISTS "Brokers can view referrals from their leads" ON public.referrals;

CREATE POLICY "Admins can view all referrals" 
ON public.referrals 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Brokers can view referrals from their leads" 
ON public.referrals 
FOR SELECT 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM leads 
  JOIN brokers ON leads.broker_id = brokers.id 
  WHERE leads.id = referrals.parent_lead_id 
  AND brokers.user_id = auth.uid()
));