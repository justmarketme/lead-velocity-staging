-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a scheduled job to send appointment reminders daily at 7 AM
SELECT cron.schedule(
  'send-daily-appointment-reminders',
  '0 7 * * *',  -- Every day at 7:00 AM UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-appointment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('hoursAhead', 24)
    )
  $$
);