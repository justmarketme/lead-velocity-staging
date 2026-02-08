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