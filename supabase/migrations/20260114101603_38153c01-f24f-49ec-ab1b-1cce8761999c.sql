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