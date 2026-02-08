-- Create SLA thresholds configuration table
CREATE TABLE public.sla_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  warning_seconds integer NOT NULL DEFAULT 1800, -- 30 minutes
  critical_seconds integer NOT NULL DEFAULT 3600, -- 1 hour
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(channel)
);

-- Create SLA alerts history table
CREATE TABLE public.sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid REFERENCES public.communications(id),
  channel text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  response_time_seconds integer NOT NULL,
  threshold_seconds integer NOT NULL,
  recipient_type text NOT NULL,
  recipient_id uuid,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for sla_thresholds
CREATE POLICY "Admins can manage SLA thresholds"
ON public.sla_thresholds
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for sla_alerts
CREATE POLICY "Admins can view all SLA alerts"
ON public.sla_alerts
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update SLA alerts"
ON public.sla_alerts
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Insert default thresholds
INSERT INTO public.sla_thresholds (channel, warning_seconds, critical_seconds, enabled)
VALUES 
  ('call', 900, 1800, true),
  ('email', 3600, 7200, true),
  ('sms', 1800, 3600, true),
  ('whatsapp', 1800, 3600, true)
ON CONFLICT (channel) DO NOTHING;

-- Create index for faster alert queries
CREATE INDEX idx_sla_alerts_unacknowledged ON public.sla_alerts(acknowledged, created_at DESC) WHERE acknowledged = false;