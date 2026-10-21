-- =============================================================================
-- 20261021150200_unschedule_legacy_appointment_reminders.sql  --  smoke test 21 Oct 2026 #43
-- NEEDS JONO'S GO. Removes the legacy pg_cron job 'send-daily-appointment-reminders' (created in
-- 20260114094619_e9c12fbb-...). It reads app.settings.supabase_url, which is not set on this project, so it has failed on
-- every run (live 21 Oct: 156 of 156 runs failed, "unrecognized configuration parameter"). It belongs to the legacy
-- referrals flow (referrals table empty); SortMyCover reminders run in n8n (W09). Other cron jobs are not touched.
-- Idempotent: does nothing when the job is already gone or pg_cron is absent.
-- Apply by hand with the CRM release (no db push), then:
--   npx supabase migration repair --status applied --linked --project-ref cmsylaupctrbsvzrgzwy 20261021150200
-- Undo: re-run the cron.schedule block of 20260114094619 (it would fail again until app.settings.* exist).
-- =============================================================================
DO $mig$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'send-daily-appointment-reminders: no pg_cron here - skipped';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-daily-appointment-reminders';
END
$mig$;
