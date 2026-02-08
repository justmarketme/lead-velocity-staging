-- Fix all RLS policies to target authenticated users only
-- This ensures anonymous users are completely denied access

-- ============ BROKERS TABLE ============
DROP POLICY IF EXISTS "Admins can manage all brokers" ON public.brokers;
DROP POLICY IF EXISTS "Admins can view all brokers" ON public.brokers;
DROP POLICY IF EXISTS "Brokers can update their own profile" ON public.brokers;
DROP POLICY IF EXISTS "Brokers can view their own profile" ON public.brokers;

CREATE POLICY "Admins can manage all brokers" 
ON public.brokers FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all brokers" 
ON public.brokers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Brokers can update their own profile" 
ON public.brokers FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Brokers can view their own profile" 
ON public.brokers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- ============ ADMIN_INVITES TABLE ============
DROP POLICY IF EXISTS "Admins can view all invites" ON public.admin_invites;
DROP POLICY IF EXISTS "Admins can create invites" ON public.admin_invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.admin_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.admin_invites;

CREATE POLICY "Admins can view all invites" 
ON public.admin_invites FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create invites" 
ON public.admin_invites FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invites" 
ON public.admin_invites FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invites" 
ON public.admin_invites FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ USER_ROLES TABLE ============
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" 
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" 
ON public.user_roles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ PROFILES TABLE ============
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;

CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile" 
ON public.profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" 
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any profile" 
ON public.profiles FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ LEAD_ACTIVITIES TABLE ============
DROP POLICY IF EXISTS "Agents can view their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can view all activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Agents can create their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can create any activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can update activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Admins can delete activities" ON public.lead_activities;

CREATE POLICY "Agents can view their own activities" 
ON public.lead_activities FOR SELECT TO authenticated
USING (agent_id = auth.uid());

CREATE POLICY "Admins can view all activities" 
ON public.lead_activities FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents can create their own activities" 
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Admins can create any activities" 
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update activities" 
ON public.lead_activities FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete activities" 
ON public.lead_activities FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ LEADS TABLE ============
DROP POLICY IF EXISTS "Admins can manage all leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Brokers can view their own leads" ON public.leads;
DROP POLICY IF EXISTS "Brokers can insert their own leads" ON public.leads;
DROP POLICY IF EXISTS "Brokers can update their own leads" ON public.leads;

CREATE POLICY "Admins can manage all leads" 
ON public.leads FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Brokers can view their own leads" 
ON public.leads FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM brokers 
  WHERE brokers.id = leads.broker_id 
  AND brokers.user_id = auth.uid()
));

CREATE POLICY "Brokers can insert their own leads" 
ON public.leads FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM brokers 
  WHERE brokers.id = leads.broker_id 
  AND brokers.user_id = auth.uid()
));

CREATE POLICY "Brokers can update their own leads" 
ON public.leads FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM brokers 
  WHERE brokers.id = leads.broker_id 
  AND brokers.user_id = auth.uid()
));

-- ============ REFERRALS TABLE ============
DROP POLICY IF EXISTS "Admins can manage all referrals" ON public.referrals;
DROP POLICY IF EXISTS "Admins can view all referrals" ON public.referrals;
DROP POLICY IF EXISTS "Brokers can view referrals from their leads" ON public.referrals;

CREATE POLICY "Admins can manage all referrals" 
ON public.referrals FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Brokers can view referrals from their leads" 
ON public.referrals FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM leads 
  JOIN brokers ON leads.broker_id = brokers.id 
  WHERE leads.id = referrals.parent_lead_id 
  AND brokers.user_id = auth.uid()
));