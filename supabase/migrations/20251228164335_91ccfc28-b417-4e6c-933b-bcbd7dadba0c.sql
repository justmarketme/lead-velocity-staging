-- Fix 1: Remove overly permissive policy on admin_invites
-- The "Anyone can validate invite tokens" policy exposes all invite data
DROP POLICY IF EXISTS "Anyone can validate invite tokens" ON public.admin_invites;

-- Instead, we already have a secure validate_admin_invite function (SECURITY DEFINER)
-- that handles token validation without exposing the table data

-- Fix 2: Remove the overly broad authentication policy on leads
-- This policy allows ANY authenticated user to access ALL leads
DROP POLICY IF EXISTS "Require authentication for leads access" ON public.leads;

-- The existing role-based policies are sufficient:
-- - "Admins can view all leads" 
-- - "Admins can manage all leads"
-- - "Admins can delete leads"
-- - "Brokers can view their own leads"
-- - "Brokers can insert their own leads"
-- - "Brokers can update their own leads"