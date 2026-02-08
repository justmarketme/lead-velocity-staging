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