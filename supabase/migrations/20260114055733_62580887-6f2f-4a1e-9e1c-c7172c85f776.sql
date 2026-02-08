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