
-- Relax source constraint on leads
ALTER TABLE public.leads 
  DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads 
  ADD CONSTRAINT leads_source_check 
  CHECK (source IN ('Broker Book', 'LV Campaign', 'Campaign Lead', 'Manual Load', 'website_form', 'referral', 'campaign', 'cold_call', 'other'));

-- Ensure admins can manage everything
DROP POLICY IF EXISTS "Admins can manage all leads" ON public.leads;
CREATE POLICY "Admins can manage all leads"
ON public.leads FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix user_roles policy to allow admins to see everything
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Ensure the current user has the admin role if they are an admin
-- (This is just in case, but usually handled by management)
