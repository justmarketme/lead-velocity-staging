-- Migration to add advanced integrations for Ayanda AI and Broker Calendar systems

-- 1. Update Brokers table for Gmail Account and Google Calendar Integration
ALTER TABLE public.brokers 
ADD COLUMN IF NOT EXISTS calendar_email TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_token JSONB,
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
ADD COLUMN IF NOT EXISTS firm_address TEXT,
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'English';

-- 2. Update AI Call Requests for better tracking and notifications
ALTER TABLE public.ai_call_requests
ADD COLUMN IF NOT EXISTS is_roleplay BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS coaching_feedback TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS call_goal TEXT DEFAULT 'appointment_scheduling';

-- 3. Create appointments table if it doesn't exist (linking lead to broker)
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
  appointment_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  meeting_type TEXT DEFAULT 'virtual' CHECK (meeting_type IN ('virtual', 'physical')),
  meeting_link TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Admins and Brokers can see their own appointments
CREATE POLICY "Users can view their own appointments"
ON public.appointments
FOR SELECT
USING (auth.uid() = broker_id OR has_role(auth.uid(), 'admin'::app_role));

-- 4. Enable Realtime for the new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- 5. Add trigger for updated_at on appointments
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
