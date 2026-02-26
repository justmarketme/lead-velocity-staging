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
