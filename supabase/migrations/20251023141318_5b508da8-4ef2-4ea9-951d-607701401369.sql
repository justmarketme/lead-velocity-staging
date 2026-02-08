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