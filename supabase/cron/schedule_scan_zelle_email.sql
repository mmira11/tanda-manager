-- Schedule scan-zelle-email every 30 minutes across Thursday–Saturday in
-- America/Los_Angeles. Run once in the Supabase SQL editor, only after:
--   1. migrations 014 and 015 are applied,
--   2. scan-zelle-email is deployed:
--        supabase functions deploy scan-zelle-email --no-verify-jwt
--   3. its secrets are set (CRON_SECRET, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
--      GMAIL_REFRESH_TOKEN, ZELLE_SENDER_DOMAINS), and
--   4. two Vault secrets exist (values are typed in the dashboard, never committed):
--        select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/scan-zelle-email', 'tanda_zelle_url');
--        select vault.create_secret('<same value as CRON_SECRET>', 'tanda_cron_secret');
--      tanda_cron_secret is the same secret send-reminders uses. Create it once.
--
-- pg_cron runs in UTC. America/Los_Angeles is UTC-8 in standard time and UTC-7 in
-- daylight time. Thursday 00:00 through Saturday 23:30 local, in both offsets, is:
--   Thursday 07:00–23:30 UTC
--   Friday and Saturday, every 30 minutes
--   Sunday 00:00–07:30 UTC
-- In winter the first run is 23:00 Wednesday local. In summer the last run is
-- 00:30 Sunday local. One cron expression cannot cover that span, so this is
-- three jobs. Not part of migrations/ because CI's plain Postgres has no pg_cron,
-- pg_net, or Vault. Safe to run more than once: jobs with these names are removed
-- first.
--
-- The posted body sets dryRun to false, so each run queues new mail. The function
-- treats a missing dryRun as a dry run; to rehearse, change the body to
-- {"dryRun":true} and run this file again.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job
where jobname in ('tanda-scan-zelle-thu', 'tanda-scan-zelle-weekend', 'tanda-scan-zelle-sun');

select cron.schedule(
  'tanda-scan-zelle-thu',
  '*/30 7-23 * * 4',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_zelle_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_cron_secret')
    ),
    body := '{"dryRun":false}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'tanda-scan-zelle-weekend',
  '*/30 * * * 5,6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_zelle_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_cron_secret')
    ),
    body := '{"dryRun":false}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'tanda-scan-zelle-sun',
  '*/30 0-7 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_zelle_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_cron_secret')
    ),
    body := '{"dryRun":false}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
