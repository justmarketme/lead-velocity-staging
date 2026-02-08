-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ai_call_email BOOLEAN NOT NULL DEFAULT true,
  ai_call_in_app BOOLEAN NOT NULL DEFAULT true,
  ai_call_sound BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.notification_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all preferences (for email notification lookup)
CREATE POLICY "Admins can view all preferences"
ON public.notification_preferences
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();