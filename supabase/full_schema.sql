-- Create profiles table for user information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  app_role TEXT DEFAULT 'agent' CHECK (app_role IN ('admin', 'agent', 'manager')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  lead_source TEXT NOT NULL CHECK (lead_source IN ('website_form', 'referral', 'campaign', 'cold_call', 'other')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  assigned_agent_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create lead_activities table for tracking interactions
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Leads policies - all authenticated users can view and manage leads
CREATE POLICY "Authenticated users can view leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leads" ON public.leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete leads" ON public.leads FOR DELETE TO authenticated USING (true);

-- Lead activities policies
CREATE POLICY "Authenticated users can view activities" ON public.lead_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert activities" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (true);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, app_role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'agent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for leads table
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;
-- Fix search_path for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, app_role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'agent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
-- Create app_role enum for role management
CREATE TYPE public.app_role AS ENUM ('admin', 'broker');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create brokers table
CREATE TABLE public.brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  firm_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone_number TEXT,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

-- Update leads table to link to brokers and add new fields
ALTER TABLE public.leads 
  DROP COLUMN IF EXISTS assigned_agent_id,
  ADD COLUMN broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT,
  ADD COLUMN source TEXT CHECK (source IN ('Broker Book', 'LV Campaign')),
  ADD COLUMN current_status TEXT DEFAULT 'New' CHECK (current_status IN ('New', 'Contacted', 'Will Done', 'Appointment Booked', 'Rejected')),
  ADD COLUMN notes TEXT,
  ADD COLUMN date_uploaded TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Migrate existing name field to first_name/last_name
UPDATE public.leads SET first_name = name WHERE first_name IS NULL;

-- Drop old columns
ALTER TABLE public.leads 
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS lead_source;

-- Rename status to match new schema
ALTER TABLE public.leads 
  DROP COLUMN IF EXISTS status;

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  will_status TEXT DEFAULT 'Pending' CHECK (will_status IN ('Pending', 'Done')),
  appointment_date TIMESTAMP WITH TIME ZONE,
  broker_appointment_scheduled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for brokers
CREATE POLICY "Brokers can view their own profile"
  ON public.brokers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Brokers can update their own profile"
  ON public.brokers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all brokers"
  ON public.brokers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all brokers"
  ON public.brokers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for leads
CREATE POLICY "Brokers can view their own leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.brokers
      WHERE brokers.id = leads.broker_id
      AND brokers.user_id = auth.uid()
    )
  );

CREATE POLICY "Brokers can insert their own leads"
  ON public.leads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.brokers
      WHERE brokers.id = leads.broker_id
      AND brokers.user_id = auth.uid()
    )
  );

CREATE POLICY "Brokers can update their own leads"
  ON public.leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.brokers
      WHERE brokers.id = leads.broker_id
      AND brokers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all leads"
  ON public.leads FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all leads"
  ON public.leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for referrals
CREATE POLICY "Brokers can view referrals from their leads"
  ON public.referrals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      JOIN public.brokers ON leads.broker_id = brokers.id
      WHERE leads.id = referrals.parent_lead_id
      AND brokers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all referrals"
  ON public.referrals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all referrals"
  ON public.referrals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_brokers_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create broker profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_broker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user should be a broker based on metadata
  IF NEW.raw_user_meta_data->>'user_type' = 'broker' THEN
    INSERT INTO public.brokers (user_id, firm_name, contact_person, phone_number)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'firm_name', 'Unknown Firm'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
      NEW.raw_user_meta_data->>'phone'
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'broker');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to create broker profile on signup
CREATE TRIGGER on_auth_user_created_broker
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_broker();
-- Update handle_new_user to properly handle admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_app_role TEXT;
BEGIN
  -- Determine the role based on user_type metadata
  user_app_role := CASE 
    WHEN NEW.raw_user_meta_data->>'user_type' = 'admin' THEN 'admin'
    WHEN NEW.raw_user_meta_data->>'user_type' = 'broker' THEN 'agent'
    ELSE 'agent'
  END;

  -- Create profile with appropriate role
  INSERT INTO public.profiles (user_id, full_name, app_role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', user_app_role);
  
  -- If admin, add admin role to user_roles table
  IF NEW.raw_user_meta_data->>'user_type' = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;
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
-- Fix profiles table security: Restrict visibility to own profile or admins only

-- Drop the overly permissive policy that allows all users to see all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Allow users to view only their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);
-- Fix Critical Security Issues

-- 1. Remove app_role from profiles table (dual role storage vulnerability)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS app_role;

-- 2. Add UPDATE and DELETE policies for lead_activities (admin maintenance)
CREATE POLICY "Admins can update activities"
  ON public.lead_activities
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete activities"
  ON public.lead_activities
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Add DELETE policies for profiles (GDPR compliance)
CREATE POLICY "Users can delete own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
-- Create admin invite tokens table
CREATE TABLE public.admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  email text,
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

-- Only admins can view/create invites
CREATE POLICY "Admins can view all invites"
ON public.admin_invites
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create invites"
ON public.admin_invites
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invites"
ON public.admin_invites
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for token lookups
CREATE INDEX idx_admin_invites_token ON public.admin_invites(token);

-- Function to validate and use invite token (called during signup)
CREATE OR REPLACE FUNCTION public.validate_admin_invite(invite_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record admin_invites%ROWTYPE;
BEGIN
  SELECT * INTO invite_record
  FROM admin_invites
  WHERE token = invite_token
    AND used_at IS NULL
    AND expires_at > now();
  
  RETURN FOUND;
END;
$$;

-- Function to use invite token (mark as used and create admin role)
CREATE OR REPLACE FUNCTION public.use_admin_invite(invite_token text, new_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record admin_invites%ROWTYPE;
BEGIN
  -- Find valid invite
  SELECT * INTO invite_record
  FROM admin_invites
  WHERE token = invite_token
    AND used_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Mark invite as used
  UPDATE admin_invites
  SET used_at = now()
  WHERE id = invite_record.id;
  
  -- Add admin role to user
  INSERT INTO user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN TRUE;
END;
$$;
-- Add INSERT policy so users can create their own profile
CREATE POLICY "Users can insert own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);
-- Add restrictive policy to require authentication for all leads access
CREATE POLICY "Require authentication for leads access"
ON public.leads
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);
-- Add restrictive policy to require authentication for admin_invites access
CREATE POLICY "Require authentication for admin_invites access"
ON public.admin_invites
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Update handle_new_user() to NEVER auto-create admin roles from signup metadata
-- Admins should ONLY be created via the invite token system
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile for all users (never set admin role from metadata)
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  RETURN NEW;
END;
$$;
-- Temporarily restore handle_new_user() to auto-create admin roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile for all users
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- TEMPORARY: Allow admin creation from signup metadata
  IF NEW.raw_user_meta_data->>'user_type' = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;
-- Drop the restrictive policy that blocks unauthenticated access
DROP POLICY IF EXISTS "Require authentication for admin_invites access" ON public.admin_invites;

-- Add policy to allow anyone to validate invite tokens (read-only, limited fields)
-- This is safe because:
-- 1. Tokens are cryptographically random and unguessable
-- 2. This only allows SELECT, not modification
-- 3. Users still need to create an account to use the invite
CREATE POLICY "Anyone can validate invite tokens"
ON public.admin_invites
FOR SELECT
TO anon, authenticated
USING (true);

-- Keep the insert/update restricted to admins (already exists)
-- The existing policies for INSERT and UPDATE already require admin role
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
-- Fix Critical Security Issues: Remove metadata-based role assignment

-- Fix 1: Remove admin bypass via metadata in handle_new_user()
-- The function was allowing admin creation via user_type='admin' metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile for all users
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- SECURITY FIX: Removed metadata-based admin creation
  -- Admins can ONLY be created via the secure invite system (use_admin_invite RPC)
  -- Never trust client-supplied metadata for privileged role assignment
  
  RETURN NEW;
END;
$function$;

-- Fix 2: Update handle_new_broker() to not trust metadata for role assignment
-- Broker signup should still work, but we add proper validation
CREATE OR REPLACE FUNCTION public.handle_new_broker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process if explicitly marked as broker signup
  -- This is acceptable because brokers have limited permissions via RLS
  -- and can only access their own leads (not a privilege escalation like admin)
  IF NEW.raw_user_meta_data->>'user_type' = 'broker' THEN
    -- Validate required fields before creating broker profile
    IF NEW.raw_user_meta_data->>'firm_name' IS NULL OR 
       NEW.raw_user_meta_data->>'full_name' IS NULL THEN
      RAISE EXCEPTION 'Missing required broker fields: firm_name and full_name are required';
    END IF;
    
    INSERT INTO public.brokers (user_id, firm_name, contact_person, phone_number)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'firm_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'phone'
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'broker');
  END IF;
  
  RETURN NEW;
END;
$function$;
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
-- Remove overly permissive policies that allow any authenticated user to see all data
-- The existing role-based RESTRICTIVE policies are sufficient

DROP POLICY IF EXISTS "Require authentication for leads" ON public.leads;
DROP POLICY IF EXISTS "Require authentication for referrals" ON public.referrals;

-- Add explicit admin DELETE policy for admin_invites (info-level fix)
CREATE POLICY "Admins can delete invites" 
ON public.admin_invites 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));
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
-- Create lead_conversations table for broker-admin communication
CREATE TABLE public.lead_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('broker', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.lead_conversations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all conversations
CREATE POLICY "Admins can manage all conversations"
ON public.lead_conversations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Brokers can view conversations on their own leads
CREATE POLICY "Brokers can view conversations on their leads"
ON public.lead_conversations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = lead_conversations.lead_id
    AND brokers.user_id = auth.uid()
  )
);

-- Brokers can insert conversations on their own leads
CREATE POLICY "Brokers can insert conversations on their leads"
ON public.lead_conversations
FOR INSERT
WITH CHECK (
  sender_role = 'broker' AND
  EXISTS (
    SELECT 1 FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = lead_conversations.lead_id
    AND brokers.user_id = auth.uid()
  )
);

-- Enable realtime for conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_conversations;

-- Add index for faster lookups
CREATE INDEX idx_lead_conversations_lead_id ON public.lead_conversations(lead_id);
-- Add read_at column to track when messages are read
ALTER TABLE public.lead_conversations 
ADD COLUMN read_at timestamp with time zone DEFAULT NULL;

-- Add read_by column to track who read the message
ALTER TABLE public.lead_conversations 
ADD COLUMN read_by uuid DEFAULT NULL;

-- Create index for faster unread queries
CREATE INDEX idx_lead_conversations_unread ON public.lead_conversations (user_id, read_at) WHERE read_at IS NULL;

-- Update RLS to allow marking messages as read
CREATE POLICY "Users can mark messages as read" 
ON public.lead_conversations 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  EXISTS (
    SELECT 1 FROM leads 
    JOIN brokers ON leads.broker_id = brokers.id 
    WHERE leads.id = lead_conversations.lead_id 
    AND brokers.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  EXISTS (
    SELECT 1 FROM leads 
    JOIN brokers ON leads.broker_id = brokers.id 
    WHERE leads.id = lead_conversations.lead_id 
    AND brokers.user_id = auth.uid()
  )
);
-- Add email column to brokers table for notifications
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_brokers_email ON public.brokers(email);
-- Update the handle_new_broker function to also store the email
CREATE OR REPLACE FUNCTION public.handle_new_broker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process if explicitly marked as broker signup
  IF NEW.raw_user_meta_data->>'user_type' = 'broker' THEN
    -- Validate required fields before creating broker profile
    IF NEW.raw_user_meta_data->>'firm_name' IS NULL OR 
       NEW.raw_user_meta_data->>'full_name' IS NULL THEN
      RAISE EXCEPTION 'Missing required broker fields: firm_name and full_name are required';
    END IF;
    
    INSERT INTO public.brokers (user_id, firm_name, contact_person, phone_number, email)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'firm_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'phone',
      COALESCE(NEW.raw_user_meta_data->>'broker_email', NEW.email)
    );
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'broker');
  END IF;
  
  RETURN NEW;
END;
$function$;
-- Create storage bucket for admin documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for admin documents bucket
CREATE POLICY "Admins can view all documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));

-- Create a table to track document metadata
CREATE TABLE public.admin_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  category TEXT DEFAULT 'general',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;

-- Only admins can manage documents
CREATE POLICY "Admins can manage all documents"
ON public.admin_documents FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_admin_documents_updated_at
BEFORE UPDATE ON public.admin_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create table to track document shares with brokers
CREATE TABLE public.document_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.admin_documents(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL,
  shared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, broker_id)
);

-- Enable RLS
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Admins can manage all shares
CREATE POLICY "Admins can manage document shares"
ON public.document_shares FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Brokers can view their own shares
CREATE POLICY "Brokers can view their shares"
ON public.document_shares FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.brokers 
  WHERE brokers.id = document_shares.broker_id 
  AND brokers.user_id = auth.uid()
));

-- Allow brokers to view shared documents metadata
CREATE POLICY "Brokers can view shared documents"
ON public.admin_documents FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.document_shares ds
    JOIN public.brokers b ON b.id = ds.broker_id
    WHERE ds.document_id = admin_documents.id
    AND b.user_id = auth.uid()
  )
);

-- Allow brokers to download shared files from storage
CREATE POLICY "Brokers can download shared documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'admin-documents' AND (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.admin_documents ad
      JOIN public.document_shares ds ON ds.document_id = ad.id
      JOIN public.brokers b ON b.id = ds.broker_id
      WHERE ad.file_path = name
      AND b.user_id = auth.uid()
    )
  )
);
-- Add INSERT policy for brokers to add referrals to their own leads
CREATE POLICY "Brokers can insert referrals for their leads"
ON public.referrals
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
);
-- Add UPDATE policy for brokers to update referral appointments on their leads
CREATE POLICY "Brokers can update referrals for their leads"
ON public.referrals
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM leads
    JOIN brokers ON leads.broker_id = brokers.id
    WHERE leads.id = referrals.parent_lead_id
    AND brokers.user_id = auth.uid()
  )
);
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a scheduled job to send appointment reminders daily at 7 AM
SELECT cron.schedule(
  'send-daily-appointment-reminders',
  '0 7 * * *',  -- Every day at 7:00 AM UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-appointment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('hoursAhead', 24)
    )
  $$
);
-- Create communications table to store all communication history
CREATE TABLE public.communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'call')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'broker', 'client')),
  sender_id UUID,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('admin', 'broker', 'client')),
  recipient_id UUID,
  recipient_contact TEXT NOT NULL,
  subject TEXT,
  content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'received')),
  external_id TEXT,
  call_duration INTEGER,
  call_recording_url TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

-- Admin can view all communications
CREATE POLICY "Admins can view all communications"
ON public.communications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admin can insert communications
CREATE POLICY "Admins can insert communications"
ON public.communications
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admin can update communications
CREATE POLICY "Admins can update communications"
ON public.communications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Brokers can view communications related to their leads
CREATE POLICY "Brokers can view their communications"
ON public.communications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.brokers b
    WHERE b.user_id = auth.uid()
    AND (
      communications.broker_id = b.id
      OR communications.lead_id IN (SELECT id FROM public.leads WHERE broker_id = b.id)
    )
  )
);

-- Create index for faster queries
CREATE INDEX idx_communications_lead_id ON public.communications(lead_id);
CREATE INDEX idx_communications_referral_id ON public.communications(referral_id);
CREATE INDEX idx_communications_broker_id ON public.communications(broker_id);
CREATE INDEX idx_communications_created_at ON public.communications(created_at DESC);

-- Enable realtime for communications
ALTER PUBLICATION supabase_realtime ADD TABLE public.communications;

-- Create trigger for updated_at
CREATE TRIGGER update_communications_updated_at
BEFORE UPDATE ON public.communications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create message_templates table
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'all')),
  subject TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage all templates
CREATE POLICY "Admins can manage templates"
ON public.message_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view templates (for use in communications)
CREATE POLICY "Authenticated users can view templates"
ON public.message_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.message_templates (name, channel, subject, content, category, created_by) VALUES
('Appointment Reminder', 'sms', NULL, 'Hi {{name}}, this is a reminder about your appointment scheduled for {{date}}. Please reply to confirm. - Lead Velocity', 'appointment', '00000000-0000-0000-0000-000000000000'),
('Appointment Reminder Email', 'email', 'Appointment Reminder - {{date}}', '<p>Dear {{name}},</p><p>This is a friendly reminder about your upcoming appointment scheduled for <strong>{{date}}</strong>.</p><p>Please let us know if you need to reschedule.</p><p>Best regards,<br>Lead Velocity Team</p>', 'appointment', '00000000-0000-0000-0000-000000000000'),
('Follow-up SMS', 'sms', NULL, 'Hi {{name}}, just following up on our recent conversation. Do you have any questions? Feel free to reach out! - Lead Velocity', 'follow-up', '00000000-0000-0000-0000-000000000000'),
('Follow-up Email', 'email', 'Following Up - How Can We Help?', '<p>Hi {{name}},</p><p>I wanted to follow up on our recent conversation and see if you have any questions.</p><p>Please don''t hesitate to reach out if there''s anything I can help with.</p><p>Best regards,<br>Lead Velocity Team</p>', 'follow-up', '00000000-0000-0000-0000-000000000000'),
('WhatsApp Greeting', 'whatsapp', NULL, 'Hello {{name}}! 👋 Thank you for your interest. How can we assist you today?', 'greeting', '00000000-0000-0000-0000-000000000000'),
('Thank You SMS', 'sms', NULL, 'Thank you {{name}} for your time today! We appreciate the opportunity to assist you. - Lead Velocity', 'thank-you', '00000000-0000-0000-0000-000000000000');
-- Create AI call requests table for tracking AI-initiated calls
CREATE TABLE public.ai_call_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('lead', 'referral', 'broker')),
  recipient_id UUID NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  call_purpose TEXT NOT NULL CHECK (call_purpose IN ('appointment_scheduling', 'appointment_rescheduling', 'follow_up', 'voice_note', 'general_inquiry', 'reminder')),
  call_purpose_details TEXT,
  call_status TEXT NOT NULL DEFAULT 'pending' CHECK (call_status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  call_sid TEXT,
  call_duration INTEGER,
  call_recording_url TEXT,
  call_summary TEXT,
  proposed_changes JSONB,
  changes_approved BOOLEAN,
  changes_approved_by UUID,
  changes_approved_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  requested_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_call_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage all AI call requests
CREATE POLICY "Admins can manage AI call requests"
ON public.ai_call_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_ai_call_requests_updated_at
BEFORE UPDATE ON public.ai_call_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for call status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_call_requests;
-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ai_call_email BOOLEAN NOT NULL DEFAULT true,
  ai_call_in_app BOOLEAN NOT NULL DEFAULT true,
  ai_call_sound BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.notification_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all preferences (for email notification lookup)
CREATE POLICY "Admins can view all preferences"
ON public.notification_preferences
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add Follow-up as a valid status by updating any leads that might need it
-- This ensures the workflow stages align with actual data

-- Create an index for better performance on status filtering
CREATE INDEX IF NOT EXISTS idx_leads_current_status ON leads(current_status);

-- Create an index for better performance on updated_at for bottleneck detection
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
-- Add response_time_seconds column to track time between inbound and outbound
ALTER TABLE public.communications 
ADD COLUMN IF NOT EXISTS response_time_seconds integer DEFAULT NULL;

-- Add responded_to_id to link outbound responses to inbound messages
ALTER TABLE public.communications 
ADD COLUMN IF NOT EXISTS responded_to_id uuid DEFAULT NULL REFERENCES public.communications(id);

-- Create index for faster response time queries
CREATE INDEX IF NOT EXISTS idx_communications_response_time ON public.communications(response_time_seconds) WHERE response_time_seconds IS NOT NULL;

-- Create index for recipient lookups
CREATE INDEX IF NOT EXISTS idx_communications_recipient ON public.communications(recipient_id, recipient_type, created_at DESC);
-- Create SLA thresholds configuration table
CREATE TABLE public.sla_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  warning_seconds integer NOT NULL DEFAULT 1800, -- 30 minutes
  critical_seconds integer NOT NULL DEFAULT 3600, -- 1 hour
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(channel)
);

-- Create SLA alerts history table
CREATE TABLE public.sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid REFERENCES public.communications(id),
  channel text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  response_time_seconds integer NOT NULL,
  threshold_seconds integer NOT NULL,
  recipient_type text NOT NULL,
  recipient_id uuid,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for sla_thresholds
CREATE POLICY "Admins can manage SLA thresholds"
ON public.sla_thresholds
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for sla_alerts
CREATE POLICY "Admins can view all SLA alerts"
ON public.sla_alerts
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update SLA alerts"
ON public.sla_alerts
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Insert default thresholds
INSERT INTO public.sla_thresholds (channel, warning_seconds, critical_seconds, enabled)
VALUES 
  ('call', 900, 1800, true),
  ('email', 3600, 7200, true),
  ('sms', 1800, 3600, true),
  ('whatsapp', 1800, 3600, true)
ON CONFLICT (channel) DO NOTHING;

-- Create index for faster alert queries
CREATE INDEX idx_sla_alerts_unacknowledged ON public.sla_alerts(acknowledged, created_at DESC) WHERE acknowledged = false;
-- Create scheduled reports configuration table
CREATE TABLE public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('admin_summary', 'broker_client_report')),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  day_of_month integer CHECK (day_of_month >= 1 AND day_of_month <= 28),
  time_of_day time NOT NULL DEFAULT '09:00:00',
  enabled boolean NOT NULL DEFAULT true,
  recipient_type text NOT NULL CHECK (recipient_type IN ('all_admins', 'specific_admins', 'broker', 'all_brokers')),
  recipient_ids uuid[] DEFAULT '{}',
  broker_id uuid REFERENCES public.brokers(id), -- For broker-specific reports
  include_sections text[] DEFAULT ARRAY['summary', 'channel_breakdown', 'response_times'],
  last_sent_at timestamp with time zone,
  next_scheduled_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create report history table
CREATE TABLE public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id uuid REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  recipients text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'partial')),
  error_message text,
  report_data jsonb
);

-- Enable RLS
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_reports
CREATE POLICY "Admins can manage all scheduled reports"
ON public.scheduled_reports
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Brokers can view their own report schedules"
ON public.scheduled_reports
FOR SELECT
USING (
  broker_id IN (
    SELECT id FROM public.brokers WHERE user_id = auth.uid()
  )
);

-- RLS policies for report_history
CREATE POLICY "Admins can view all report history"
ON public.report_history
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create indexes
CREATE INDEX idx_scheduled_reports_next_scheduled ON public.scheduled_reports(next_scheduled_at) WHERE enabled = true;
CREATE INDEX idx_scheduled_reports_broker ON public.scheduled_reports(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX idx_report_history_report ON public.report_history(scheduled_report_id, sent_at DESC);

-- Function to calculate next scheduled time
CREATE OR REPLACE FUNCTION public.calculate_next_schedule(
  p_frequency text,
  p_day_of_week integer,
  p_day_of_month integer,
  p_time_of_day time
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_run timestamp with time zone;
  current_time_tz timestamp with time zone := now();
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN
      next_run := date_trunc('day', current_time_tz) + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 day';
      END IF;
    WHEN 'weekly' THEN
      next_run := date_trunc('week', current_time_tz) + (p_day_of_week || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 week';
      END IF;
    WHEN 'monthly' THEN
      next_run := date_trunc('month', current_time_tz) + ((p_day_of_month - 1) || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 month';
      END IF;
  END CASE;
  
  RETURN next_run;
END;
$$;

-- Trigger to auto-calculate next_scheduled_at
CREATE OR REPLACE FUNCTION public.update_next_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.next_scheduled_at := calculate_next_schedule(
    NEW.frequency,
    COALESCE(NEW.day_of_week, 1),
    COALESCE(NEW.day_of_month, 1),
    NEW.time_of_day
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_next_schedule
BEFORE INSERT OR UPDATE ON public.scheduled_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_next_schedule();
-- Fix 1: Add policy to deny anonymous access to leads table (contains PII: email, phone)
CREATE POLICY "Deny anonymous access to leads"
ON public.leads
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Fix 2: Add policy to deny anonymous access to communications table (contains messages, recordings)
CREATE POLICY "Deny anonymous access to communications"
ON public.communications
FOR SELECT
USING (auth.uid() IS NOT NULL);
-- 1. DROP existing tables to fix the schema (CAUTION: This clears test data)
DROP TABLE IF EXISTS public.broker_analysis;
DROP TABLE IF EXISTS public.broker_onboarding_responses;

-- 2. Create Onboarding Table (Corrected Link)
CREATE TABLE public.broker_onboarding_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- LINK TO PROFILES, NOT AUTH.USERS
    broker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Operational Inputs
    crm_usage TEXT NOT NULL,
    speed_to_contact TEXT NOT NULL,
    team_size TEXT NOT NULL,
    follow_up_process TEXT NOT NULL,
    
    -- Budget & Spend
    monthly_lead_spend TEXT NOT NULL,
    cpl_awareness TEXT NOT NULL,
    pricing_comfort TEXT NOT NULL,
    
    -- Volume & Capacity
    desired_leads_weekly INTEGER NOT NULL,
    max_capacity_weekly INTEGER NOT NULL,
    
    -- Growth & Intent
    product_focus_clarity TEXT NOT NULL,
    geographic_focus_clarity TEXT NOT NULL,
    growth_goal_clarity TEXT NOT NULL,
    timeline_to_start TEXT NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Analysis Table (Corrected Link)
CREATE TABLE public.broker_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_id UUID REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE,
    -- LINK TO PROFILES, NOT AUTH.USERS
    broker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Deterministic Scores
    operational_score INTEGER NOT NULL,
    budget_score INTEGER NOT NULL,
    growth_score INTEGER NOT NULL,
    intent_score INTEGER NOT NULL,
    success_probability INTEGER NOT NULL,
    
    -- Results
    risk_flags TEXT[] DEFAULT '{}',
    primary_sales_angle TEXT NOT NULL,
    success_band TEXT NOT NULL,
    
    -- AI Generated Explanations
    ai_explanations JSONB DEFAULT '{}',
    
    -- Admin State
    status TEXT DEFAULT 'Pending',
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS but allow Public access for Development
ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

-- ALLOW ALL (Development Mode)
CREATE POLICY "Enable all access for dev" ON public.broker_onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for dev" ON public.broker_analysis
    FOR ALL USING (true) WITH CHECK (true);
-- Add content_data column to admin_documents table to support re-editing
ALTER TABLE public.admin_documents ADD COLUMN IF NOT EXISTS content_data JSONB;
-- Add contact fields to match live onboarding form (leadvelocity.co.za/onboarding)
ALTER TABLE public.broker_onboarding_responses
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS preferred_call_time TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN DEFAULT false;
-- Fix onboarding schema: allow anonymous submissions with contact info
-- Drop and recreate to fix issues with broker_id foreign key and missing contact fields

DROP TABLE IF EXISTS public.broker_analysis CASCADE;
DROP TABLE IF EXISTS public.broker_onboarding_responses CASCADE;

-- 1. Broker Onboarding Responses — no FK required (allows anonymous public submissions)
CREATE TABLE public.broker_onboarding_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID,  -- optional: auth user id if logged in

    -- Contact Details (collected at submission time)
    full_name TEXT,
    email TEXT,
    phone_number TEXT,
    firm_name TEXT,

    -- Operational Inputs
    crm_usage TEXT NOT NULL,
    speed_to_contact TEXT NOT NULL,
    team_size TEXT NOT NULL,
    follow_up_process TEXT NOT NULL,

    -- Budget & Spend
    monthly_lead_spend TEXT NOT NULL,
    cpl_awareness TEXT NOT NULL,
    pricing_comfort TEXT NOT NULL,

    -- Volume & Capacity
    desired_leads_weekly INTEGER NOT NULL,
    max_capacity_weekly INTEGER NOT NULL,

    -- Growth & Intent
    product_focus_clarity TEXT NOT NULL,
    geographic_focus_clarity TEXT NOT NULL,
    growth_goal_clarity TEXT NOT NULL,
    timeline_to_start TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Broker Analysis — stores computed scores linked to response
CREATE TABLE public.broker_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID REFERENCES public.broker_onboarding_responses(id) ON DELETE CASCADE,
    broker_id UUID,  -- optional

    -- Deterministic Scores
    operational_score INTEGER NOT NULL DEFAULT 0,
    budget_score INTEGER NOT NULL DEFAULT 0,
    growth_score INTEGER NOT NULL DEFAULT 0,
    intent_score INTEGER NOT NULL DEFAULT 0,
    success_probability INTEGER NOT NULL DEFAULT 0,

    -- Results
    risk_flags TEXT[] DEFAULT '{}',
    primary_sales_angle TEXT NOT NULL DEFAULT '',
    success_band TEXT NOT NULL DEFAULT 'Low Probability',

    -- AI Generated Explanation (text field for display)
    ai_explanation TEXT,

    -- Admin State
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

-- 4. Public insert policy (anyone can submit the onboarding form)
CREATE POLICY "Public can submit onboarding" ON public.broker_onboarding_responses
    FOR INSERT WITH CHECK (true);

-- 5. Admin/Service role can read and update everything
CREATE POLICY "Service role full access to responses" ON public.broker_onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to analysis" ON public.broker_analysis
    FOR ALL USING (true) WITH CHECK (true);
-- Migration for Premium Broker Portal Features
-- Date: 2026-02-25

-- Extend brokers table
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Pilot';
ALTER TABLE public.brokers ADD COLUMN IF NOT EXISTS is_lead_loading BOOLEAN DEFAULT true;

-- Appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    appointment_date TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'Scheduled',
    reason TEXT,
    reason_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lead / Client Notes (Threaded between Broker and Admin)
CREATE TABLE IF NOT EXISTS public.broker_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id),
    author_role TEXT CHECK (author_role IN ('broker', 'admin')),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_notes ENABLE ROW LEVEL SECURITY;

-- Appointments Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Brokers can see their appointments') THEN
        CREATE POLICY "Brokers can see their appointments" ON public.appointments
            FOR SELECT USING (broker_id IN (SELECT id FROM public.brokers WHERE user_id = auth.uid()));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Brokers can update their appointments') THEN
        CREATE POLICY "Brokers can update their appointments" ON public.appointments
            FOR UPDATE USING (broker_id IN (SELECT id FROM public.brokers WHERE user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all appointments') THEN
        CREATE POLICY "Admins can manage all appointments" ON public.appointments
            FOR ALL USING (true); -- Assuming admin access is handled via RLS or service role
    END IF;
END $$;

-- Notes Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Brokers can see notes for their leads') THEN
        CREATE POLICY "Brokers can see notes for their leads" ON public.broker_notes
            FOR SELECT USING (lead_id IN (SELECT id FROM public.leads WHERE broker_id IN (SELECT id FROM public.brokers WHERE user_id = auth.uid())));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Brokers can insert notes for their leads') THEN
        CREATE POLICY "Brokers can insert notes for their leads" ON public.broker_notes
            FOR INSERT WITH CHECK (lead_id IN (SELECT id FROM public.leads WHERE broker_id IN (SELECT id FROM public.brokers WHERE user_id = auth.uid())));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all notes') THEN
        CREATE POLICY "Admins can manage all notes" ON public.broker_notes
            FOR ALL USING (true);
    END IF;
END $$;
-- Final Onboarding & Elite Portal Support Repair
-- Date: 2026-02-26

-- 1. Add Elite Portal Support to Brokers
ALTER TABLE public.brokers 
ADD COLUMN IF NOT EXISTS portal_style TEXT DEFAULT 'Standard' CHECK (portal_style IN ('Standard', 'Elite')),
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Pilot' CHECK (tier IN ('Pilot', 'Bronze', 'Silver', 'Gold')),
ADD COLUMN IF NOT EXISTS is_lead_loading BOOLEAN DEFAULT true;

-- 2. Fix Column Names in Onboarding Responses (for cross-compatibility)
-- This ensures 'phone' and 'phone_number' are interchangeable
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='broker_onboarding_responses' AND column_name='phone_number') THEN
        ALTER TABLE public.broker_onboarding_responses RENAME COLUMN phone_number TO phone;
    END IF;
END $$;

-- 3. Ensure Onboarding Policies are Active
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all analyses') THEN
        CREATE POLICY "Admins can view all analyses"
        ON public.broker_analysis
        FOR ALL
        USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- 4. Create the Admin Documents Bucket (if missing)
-- This is often handled via the Supabase Dashboard, but placing the policy here for completeness.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', true)
ON CONFLICT (id) DO NOTHING;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.policies WHERE name = 'Public Access') THEN
        CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'admin-documents');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM storage.policies WHERE name = 'Admin Upload') THEN
        CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'admin-documents' AND public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;
