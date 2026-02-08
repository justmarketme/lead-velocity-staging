-- Create AI call requests table for tracking AI-initiated calls
CREATE TABLE public.ai_call_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('lead', 'referral', 'broker')),
  recipient_id UUID NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  call_purpose TEXT NOT NULL CHECK (call_purpose IN ('appointment_scheduling', 'appointment_rescheduling', 'follow_up', 'voice_note', 'general_inquiry', 'reminder')),
  call_purpose_details TEXT,
  call_status TEXT NOT NULL DEFAULT 'pending' CHECK (call_status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  call_sid TEXT,
  call_duration INTEGER,
  call_recording_url TEXT,
  call_summary TEXT,
  proposed_changes JSONB,
  changes_approved BOOLEAN,
  changes_approved_by UUID,
  changes_approved_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  requested_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_call_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage all AI call requests
CREATE POLICY "Admins can manage AI call requests"
ON public.ai_call_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_ai_call_requests_updated_at
BEFORE UPDATE ON public.ai_call_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for call status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_call_requests;