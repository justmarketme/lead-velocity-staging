-- Fix critical security issues by removing overly permissive policies

-- 1. Remove dangerous leads policies that allow ANY authenticated user access
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can delete leads" ON public.leads;

-- 2. Remove dangerous lead_activities policies
DROP POLICY IF EXISTS "Authenticated users can view activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Authenticated users can insert activities" ON public.lead_activities;

-- 3. Add missing restrictive policies for lead_activities
-- Only admins and the assigned agent can view activities
CREATE POLICY "Admins can view all activities" ON public.lead_activities
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can view their own activities" ON public.lead_activities
FOR SELECT USING (agent_id = auth.uid());

-- Only the assigned agent can create their own activities
CREATE POLICY "Agents can create their own activities" ON public.lead_activities
FOR INSERT WITH CHECK (agent_id = auth.uid());

-- Only admins can create activities for others
CREATE POLICY "Admins can create any activities" ON public.lead_activities
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Add missing admin delete policy for leads (only admins should delete)
CREATE POLICY "Admins can delete leads" ON public.leads
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));