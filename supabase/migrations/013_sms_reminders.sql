-- Automatic SMS reminders (Phase 4): opt-out record and a send log.
-- Only the send-reminders and twilio-inbound Edge Functions write these tables (server side,
-- with the service role). Admins can read them; anon and non-admins cannot.
-- Safe to run more than once.

begin;

-- One row per phone that replied STOP (or another opt-out word). Keyed by E.164 phone so
-- an opt-out follows the person into later cycles. Deleted when they reply START.
create table if not exists public.sms_opt_outs (
  phone_e164   text primary key check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  opted_out_at timestamptz not null default now(),
  keyword      text
);

-- One row per member per reminder window per round, in dry-run and in live mode separately.
-- The unique key makes each window send at most once even if the hourly job runs twice.
create table if not exists public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  round_id   uuid not null references public.rounds (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  kind       text not null check (kind in ('thursday_all', 'friday_noon', 'friday_evening')),
  local_date date not null,
  dry_run    boolean not null,
  status     text not null check (status in ('dry_run', 'sending', 'sent', 'failed')),
  twilio_sid text,
  error      text,
  created_at timestamptz not null default now(),
  unique (round_id, member_id, kind, dry_run)
);

alter table public.sms_opt_outs enable row level security;
alter table public.reminder_log enable row level security;

drop policy if exists admin_read_sms_opt_outs on public.sms_opt_outs;
create policy admin_read_sms_opt_outs on public.sms_opt_outs
  for select to authenticated using (public.is_admin());
drop policy if exists admin_read_reminder_log on public.reminder_log;
create policy admin_read_reminder_log on public.reminder_log
  for select to authenticated using (public.is_admin());

revoke all on public.sms_opt_outs, public.reminder_log from anon;
revoke all on public.sms_opt_outs, public.reminder_log from authenticated;
grant select on public.sms_opt_outs, public.reminder_log to authenticated;

commit;
