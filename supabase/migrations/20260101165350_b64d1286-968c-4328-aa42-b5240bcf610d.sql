-- Fix security issue: Add base permissive policies requiring authentication
-- This ensures unauthenticated users cannot access sensitive data

-- For leads table: Add permissive policy requiring authentication as base access control
CREATE POLICY "Require authentication for leads" 
ON public.leads 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- For referrals table: Add permissive policy requiring authentication as base access control  
CREATE POLICY "Require authentication for referrals" 
ON public.referrals 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);