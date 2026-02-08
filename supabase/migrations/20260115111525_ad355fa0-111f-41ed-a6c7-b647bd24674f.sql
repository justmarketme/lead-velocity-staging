-- Create scheduled reports configuration table
CREATE TABLE public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('admin_summary', 'broker_client_report')),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  day_of_month integer CHECK (day_of_month >= 1 AND day_of_month <= 28),
  time_of_day time NOT NULL DEFAULT '09:00:00',
  enabled boolean NOT NULL DEFAULT true,
  recipient_type text NOT NULL CHECK (recipient_type IN ('all_admins', 'specific_admins', 'broker', 'all_brokers')),
  recipient_ids uuid[] DEFAULT '{}',
  broker_id uuid REFERENCES public.brokers(id), -- For broker-specific reports
  include_sections text[] DEFAULT ARRAY['summary', 'channel_breakdown', 'response_times'],
  last_sent_at timestamp with time zone,
  next_scheduled_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create report history table
CREATE TABLE public.report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id uuid REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  recipients text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'partial')),
  error_message text,
  report_data jsonb
);

-- Enable RLS
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_reports
CREATE POLICY "Admins can manage all scheduled reports"
ON public.scheduled_reports
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Brokers can view their own report schedules"
ON public.scheduled_reports
FOR SELECT
USING (
  broker_id IN (
    SELECT id FROM public.brokers WHERE user_id = auth.uid()
  )
);

-- RLS policies for report_history
CREATE POLICY "Admins can view all report history"
ON public.report_history
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create indexes
CREATE INDEX idx_scheduled_reports_next_scheduled ON public.scheduled_reports(next_scheduled_at) WHERE enabled = true;
CREATE INDEX idx_scheduled_reports_broker ON public.scheduled_reports(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX idx_report_history_report ON public.report_history(scheduled_report_id, sent_at DESC);

-- Function to calculate next scheduled time
CREATE OR REPLACE FUNCTION public.calculate_next_schedule(
  p_frequency text,
  p_day_of_week integer,
  p_day_of_month integer,
  p_time_of_day time
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_run timestamp with time zone;
  current_time_tz timestamp with time zone := now();
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN
      next_run := date_trunc('day', current_time_tz) + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 day';
      END IF;
    WHEN 'weekly' THEN
      next_run := date_trunc('week', current_time_tz) + (p_day_of_week || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 week';
      END IF;
    WHEN 'monthly' THEN
      next_run := date_trunc('month', current_time_tz) + ((p_day_of_month - 1) || ' days')::interval + p_time_of_day::interval;
      IF next_run <= current_time_tz THEN
        next_run := next_run + interval '1 month';
      END IF;
  END CASE;
  
  RETURN next_run;
END;
$$;

-- Trigger to auto-calculate next_scheduled_at
CREATE OR REPLACE FUNCTION public.update_next_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.next_scheduled_at := calculate_next_schedule(
    NEW.frequency,
    COALESCE(NEW.day_of_week, 1),
    COALESCE(NEW.day_of_month, 1),
    NEW.time_of_day
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_next_schedule
BEFORE INSERT OR UPDATE ON public.scheduled_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_next_schedule();