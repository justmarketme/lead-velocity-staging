-- CONSOLIDATED SUPABASE MIGRATION FOR LEAD VELOCITY
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'broker');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Brokers
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  firm_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT CHECK (source IN ('Broker Book', 'LV Campaign')),
  current_status TEXT DEFAULT 'New' CHECK (current_status IN ('New', 'Contacted', 'Will Done', 'Appointment Booked', 'Rejected', 'Follow-up')),
  notes TEXT,
  date_uploaded TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Lead Activities
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  will_status TEXT DEFAULT 'Pending' CHECK (will_status IN ('Pending', 'Done')),
  appointment_date TIMESTAMP WITH TIME ZONE,
  broker_appointment_scheduled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Admin Documents (Proposals, Invoices, Contracts)
CREATE TABLE IF NOT EXISTS public.admin_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  category TEXT DEFAULT 'general',
  content_data JSONB,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Document Shares
CREATE TABLE IF NOT EXISTS public.document_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.admin_documents(id) ON DELETE CASCADE NOT NULL,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE NOT NULL,
  shared_by UUID NOT NULL,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AI Call Requests
CREATE TABLE IF NOT EXISTS public.ai_call_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requested_by UUID NOT NULL,
  recipient_id UUID NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  call_purpose TEXT NOT NULL,
  call_purpose_details TEXT,
  call_status TEXT DEFAULT 'pending' NOT NULL,
  call_sid TEXT,
  call_duration INTEGER,
  call_recording_url TEXT,
  call_summary TEXT,
  proposed_changes JSONB,
  changes_approved BOOLEAN,
  changes_approved_at TIMESTAMP WITH TIME ZONE,
  changes_approved_by UUID,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Communications
CREATE TABLE IF NOT EXISTS public.communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'call')),
  sender_type TEXT NOT NULL,
  sender_id UUID,
  recipient_type TEXT NOT NULL,
  recipient_id UUID,
  recipient_contact TEXT NOT NULL,
  subject TEXT,
  content TEXT,
  status TEXT,
  external_id TEXT,
  response_time_seconds INTEGER,
  responded_to_id UUID REFERENCES public.communications(id),
  metadata JSONB,
  call_duration INTEGER,
  call_recording_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Scheduled Reports
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('admin_summary', 'broker_client_report')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 28),
  time_of_day TIME NOT NULL DEFAULT '09:00:00',
  enabled BOOLEAN NOT NULL DEFAULT true,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all_admins', 'specific_admins', 'broker', 'all_brokers')),
  recipient_ids UUID[] DEFAULT '{}',
  broker_id UUID REFERENCES public.brokers(id),
  include_sections TEXT[] DEFAULT ARRAY['summary', 'channel_breakdown', 'response_times'],
  last_sent_at TIMESTAMP WITH TIME ZONE,
  next_scheduled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Report History
CREATE TABLE IF NOT EXISTS public.report_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheduled_report_id UUID REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  recipients TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'partial')),
  error_message TEXT,
  report_data JSONB
);

-- Broker Onboarding Responses
CREATE TABLE IF NOT EXISTS public.broker_onboarding_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_id UUID REFERENCES public.brokers(id),
  full_name TEXT,
  email TEXT,
  phone_number TEXT,
  firm_name TEXT,
  crm_usage TEXT NOT NULL,
  speed_to_contact TEXT NOT NULL,
  team_size TEXT NOT NULL,
  follow_up_process TEXT NOT NULL,
  monthly_lead_spend TEXT NOT NULL,
  cpl_awareness TEXT NOT NULL,
  pricing_comfort TEXT NOT NULL,
  desired_leads_weekly INTEGER NOT NULL,
  max_capacity_weekly INTEGER NOT NULL,
  product_focus_clarity TEXT NOT NULL,
  geographic_focus_clarity TEXT NOT NULL,
  growth_goal_clarity TEXT NOT NULL,
  timeline_to_start TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Broker Analysis
CREATE TABLE IF NOT EXISTS public.broker_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  response_id UUID REFERENCES public.broker_onboarding_responses(id),
  broker_id UUID REFERENCES public.brokers(id),
  operational_score INTEGER NOT NULL,
  budget_score INTEGER NOT NULL,
  growth_score INTEGER NOT NULL,
  intent_score INTEGER NOT NULL,
  success_probability INTEGER NOT NULL,
  risk_flags TEXT[] DEFAULT '{}',
  primary_sales_angle TEXT NOT NULL,
  success_band TEXT NOT NULL,
  ai_explanation TEXT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Lead Conversations
CREATE TABLE IF NOT EXISTS public.lead_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('broker', 'admin')),
  read_at TIMESTAMP WITH TIME ZONE,
  read_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. STORAGE
-- Run these as separate steps if they fail in a single transaction
INSERT INTO storage.buckets (id, name, public) 
VALUES ('admin-documents', 'admin-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. FUNCTIONS & TRIGGERS

-- Function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Updated at column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger applications
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_brokers_updated_at') THEN
        CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON public.brokers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_leads_updated_at') THEN
        CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_admin_documents_updated_at') THEN
        CREATE TRIGGER update_admin_documents_updated_at BEFORE UPDATE ON public.admin_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 6. RLS POLICIES (Development Friendly)
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_analysis ENABLE ROW LEVEL SECURITY;

-- Allow public access for development (adjust for production)
CREATE POLICY "Public profiles access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public roles access" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public brokers access" ON public.brokers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public leads access" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public documents access" ON public.admin_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public onboarding access" ON public.broker_onboarding_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public analysis access" ON public.broker_analysis FOR ALL USING (true) WITH CHECK (true);

-- Storage Policies
CREATE POLICY "Public storage access" ON storage.objects FOR ALL USING (bucket_id = 'admin-documents') WITH CHECK (bucket_id = 'admin-documents');
