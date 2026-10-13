-- Einstein's knowledge base = the public leadvelocity.co.za site. Every 3 hours pg_cron asks the
-- einstein-agent edge function to re-crawl; it re-uploads only pages whose text hash changed.
-- Prerequisites (one-off, not in git):
--   npx supabase secrets set EINSTEIN_KB_CRON_SECRET=<random> --project-ref cmsylaupctrbsvzrgzwy
--   select vault.create_secret('<same random>', 'einstein_kb_cron_secret');
--   select vault.create_secret('<project anon JWT>', 'einstein_kb_anon_jwt');
-- The Authorization header carries the public anon JWT only to pass the gateway's verify_jwt;
-- the function authorises the cron call by x-cron-secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('einstein-kb-refresh') where exists (select 1 from cron.job where jobname = 'einstein-kb-refresh');

select cron.schedule(
  'einstein-kb-refresh',
  '17 */3 * * *',
  $$
  select net.http_post(
    url := 'https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/einstein-agent/kb-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'einstein_kb_anon_jwt' limit 1),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'einstein_kb_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);
