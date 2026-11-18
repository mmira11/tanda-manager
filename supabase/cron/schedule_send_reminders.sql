-- Schedule send-reminders every hour (Phase 4). Run once in the Supabase SQL editor, only after:
--   1. migration 013 is applied,
--   2. send-reminders is deployed:  supabase functions deploy send-reminders --no-verify-jwt
--   3. its secrets are set (CRON_SECRET, REMINDERS_DRY_RUN=true, Twilio keys), and
--   4. two Vault secrets exist (values are typed in the dashboard, never committed):
--        select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-reminders', 'tanda_reminders_url');
--        select vault.create_secret('<same value as CRON_SECRET>', 'tanda_cron_secret');
--
-- pg_cron runs in UTC, so this fires at the top of every hour and the function decides in
-- America/Los_Angeles time whether a window (Thu 9:00, Fri 12:00, Fri 18:00) is due. That keeps
-- the texts on Los Angeles time across daylight saving changes. Not part of migrations/ because
-- CI's plain Postgres has no pg_cron, pg_net, or Vault. Safe to run more than once.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'tanda-send-reminders';

select cron.schedule(
  'tanda-send-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tanda_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
