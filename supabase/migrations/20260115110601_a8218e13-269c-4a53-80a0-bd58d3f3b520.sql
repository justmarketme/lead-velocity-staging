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