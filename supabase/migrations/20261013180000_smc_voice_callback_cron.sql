-- SortMyCover voice receptionist: every 5 minutes, smc-voice/tick dials due missed-call
-- callbacks (inside CPA s12 hours only; max 1 automatic callback per number per 24 h).
-- No tables: callbacks are communications rows (metadata.kind = 'smc_voice_callback').
--
-- The shared secret lives in Supabase Vault (name 'smc_voice_cron_secret') and must equal the
-- edge-function secret SMC_VOICE_CRON_SECRET. Create it once, out of band:
--   select vault.create_secret('<same value as SMC_VOICE_CRON_SECRET>', 'smc_voice_cron_secret');
-- Switch off: select cron.unschedule('smc-voice-callback-tick');
select cron.unschedule('smc-voice-callback-tick')
 where exists (select 1 from cron.job where jobname = 'smc-voice-callback-tick');

select cron.schedule(
  'smc-voice-callback-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/smc-voice/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'smc_voice_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
