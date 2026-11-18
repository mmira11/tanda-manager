-- One-tap reminder queue (replaces paid Twilio as the default).
-- reminder_log gains a channel and the queued/skipped statuses. The default channel is
-- queue: the hourly job writes one row per person, and the admin sends it from the phone.
-- Twilio stays available when reminder_settings.channel is twilio.
-- Admins read the log and change a queued row through the RPCs below. Non-admins cannot
-- read or update it. Safe to run more than once.

begin;

alter table public.reminder_log add column if not exists channel text;
update public.reminder_log set channel = 'queue' where channel is null;
alter table public.reminder_log alter column channel set default 'queue';
alter table public.reminder_log alter column channel set not null;

alter table public.reminder_settings add column if not exists channel text;
update public.reminder_settings set channel = 'queue' where channel is null;
alter table public.reminder_settings alter column channel set default 'queue';
alter table public.reminder_settings alter column channel set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'reminder_log' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%status%'
  loop
    execute format('alter table public.reminder_log drop constraint %I', constraint_name);
  end loop;
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'reminder_log' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%channel%'
  loop
    execute format('alter table public.reminder_log drop constraint %I', constraint_name);
  end loop;
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'reminder_settings' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%channel%'
  loop
    execute format('alter table public.reminder_settings drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.reminder_log add constraint reminder_log_status_check
  check (status in ('dry_run', 'sending', 'sent', 'failed', 'queued', 'skipped'));
alter table public.reminder_log add constraint reminder_log_channel_check
  check (channel in ('queue', 'twilio'));
alter table public.reminder_settings add constraint reminder_settings_channel_check
  check (channel in ('queue', 'twilio'));

drop policy if exists admin_update_reminder_log on public.reminder_log;
create policy admin_update_reminder_log on public.reminder_log
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.reminder_log from anon;
grant select, update on public.reminder_log to authenticated;

-- Insert the queue for the open window. Ignores a row that was already logged for that
-- member, round, window, and live mode, so the button and the cron cannot double-queue.
create or replace function public.enqueue_reminders(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_row jsonb;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'expected a list of reminders' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if (v_row->>'kind') not in ('thursday_all', 'friday_noon', 'friday_evening') then
      raise exception 'invalid reminder window' using errcode = '22023';
    end if;
    v_id := null;
    insert into public.reminder_log (
      cycle_id, round_id, member_id, kind, local_date, dry_run, status, channel
    ) values (
      (v_row->>'cycle_id')::uuid,
      (v_row->>'round_id')::uuid,
      (v_row->>'member_id')::uuid,
      v_row->>'kind',
      (v_row->>'local_date')::date,
      false,
      'queued',
      'queue'
    )
    on conflict (round_id, member_id, kind, dry_run) do nothing
    returning id into v_id;
    if v_id is not null then
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  return v_inserted;
end;
$$;

-- queued → sent (Miguel tapped SMS or WhatsApp, or marked the list done) or skipped.
create or replace function public.set_reminder_log_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'skipped') then
    raise exception 'invalid reminder status' using errcode = '22023';
  end if;
  update public.reminder_log
     set status = p_status
   where id = p_id
     and status = 'queued';
  if not found then
    raise exception 'reminder not queued' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.enqueue_reminders(jsonb) from public;
revoke all on function public.enqueue_reminders(jsonb) from anon;
grant execute on function public.enqueue_reminders(jsonb) to authenticated;

revoke all on function public.set_reminder_log_status(uuid, text) from public;
revoke all on function public.set_reminder_log_status(uuid, text) from anon;
grant execute on function public.set_reminder_log_status(uuid, text) to authenticated;

commit;
