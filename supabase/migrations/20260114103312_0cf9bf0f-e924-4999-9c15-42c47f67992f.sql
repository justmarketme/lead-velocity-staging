-- Create message_templates table
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'all')),
  subject TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage all templates
CREATE POLICY "Admins can manage templates"
ON public.message_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view templates (for use in communications)
CREATE POLICY "Authenticated users can view templates"
ON public.message_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.message_templates (name, channel, subject, content, category, created_by) VALUES
('Appointment Reminder', 'sms', NULL, 'Hi {{name}}, this is a reminder about your appointment scheduled for {{date}}. Please reply to confirm. - Lead Velocity', 'appointment', '00000000-0000-0000-0000-000000000000'),
('Appointment Reminder Email', 'email', 'Appointment Reminder - {{date}}', '<p>Dear {{name}},</p><p>This is a friendly reminder about your upcoming appointment scheduled for <strong>{{date}}</strong>.</p><p>Please let us know if you need to reschedule.</p><p>Best regards,<br>Lead Velocity Team</p>', 'appointment', '00000000-0000-0000-0000-000000000000'),
('Follow-up SMS', 'sms', NULL, 'Hi {{name}}, just following up on our recent conversation. Do you have any questions? Feel free to reach out! - Lead Velocity', 'follow-up', '00000000-0000-0000-0000-000000000000'),
('Follow-up Email', 'email', 'Following Up - How Can We Help?', '<p>Hi {{name}},</p><p>I wanted to follow up on our recent conversation and see if you have any questions.</p><p>Please don''t hesitate to reach out if there''s anything I can help with.</p><p>Best regards,<br>Lead Velocity Team</p>', 'follow-up', '00000000-0000-0000-0000-000000000000'),
('WhatsApp Greeting', 'whatsapp', NULL, 'Hello {{name}}! 👋 Thank you for your interest. How can we assist you today?', 'greeting', '00000000-0000-0000-0000-000000000000'),
('Thank You SMS', 'sms', NULL, 'Thank you {{name}} for your time today! We appreciate the opportunity to assist you. - Lead Velocity', 'thank-you', '00000000-0000-0000-0000-000000000000');