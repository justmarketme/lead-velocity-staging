-- PREMIUM BROKER PORTAL SCHEMA UPDATES
-- Add tiering and features required for the world-class broker experience

-- 1. Update Brokers table
ALTER TABLE public.brokers 
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Pilot' CHECK (tier IN ('Pilot', 'Bronze', 'Silver', 'Gold')),
ADD COLUMN IF NOT EXISTS is_lead_loading BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS lead_quota INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS leads_used INTEGER DEFAULT 0;

-- 2. Add Appointment Status to Referrals (since they have appointment_date)
-- Note: 'late' and 'no-show' are specifically requested.
ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS appointment_status TEXT CHECK (appointment_status IN ('scheduled', 'no-show', 'late', 'completed', 'cancelled', 'other')),
ADD COLUMN IF NOT EXISTS appointment_notes TEXT;

-- 3. Create a dedicated notes table for Broker-Admin communication per client
-- This allows threading and specific replies.
CREATE TABLE IF NOT EXISTS public.client_engagement_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL, -- References leads.id
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'broker')),
  is_internal BOOLEAN DEFAULT false, -- If only admins should see it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Enable RLS on new table
ALTER TABLE public.client_engagement_notes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for notes
CREATE POLICY "Brokers can view/create notes for their leads"
ON public.client_engagement_notes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.leads
    JOIN public.brokers ON leads.broker_id = brokers.id
    WHERE leads.id = client_engagement_notes.client_id
    AND brokers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads
    JOIN public.brokers ON leads.broker_id = brokers.id
    WHERE leads.id = client_engagement_notes.client_id
    AND brokers.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view/create all notes"
ON public.client_engagement_notes
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Add trigger for notifications (conceptual for now)
-- The user wants email notifications on appointment changes.
-- This would typically be handled by a Supabase Edge Function or a listener.

-- 7. Add columns for temporary login tracking to auth.users (via metadata usually)
-- But we can add it to profiles for easier manual check if needed.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS temp_password_set_at TIMESTAMP WITH TIME ZONE;
