-- Extensions
create extension if not exists "pgcrypto";

-- Who may administer the app (you only, for now)
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

-- Cycles are archive-friendly: finish one, insert another, never wipe history
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  interval_days integer not null default 14 check (interval_days > 0),
  contribution numeric(10,2) not null check (contribution > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  timezone text not null default 'America/Los_Angeles',
  zelle_destination text,          -- organizer Zelle target; members receive it from get_member_board
  organizer_display_name text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index cycles_one_active on public.cycles (status)
  where status = 'active';

-- Members belong to a cycle. slot = payout order
create table public.members (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  slot integer not null check (slot > 0),
  display_first_name text not null,
  phone text,                      -- admin-only; never returned by the member RPC
  language_pref text not null default 'en' check (language_pref in ('en', 'es')),
  access_token text not null default rtrim(translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_'), '='),
  created_at timestamptz not null default now(),
  unique (cycle_id, slot),
  unique (access_token)
);

-- Bank-account names as they appear in Capital One Zelle emails (Week 3)
create table public.payer_aliases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  alias_name text not null,
  unique (member_id, alias_name)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  round_number integer not null check (round_number > 0),
  collect_date date not null,
  payout_date date not null,
  recipient_member_id uuid not null references public.members (id),
  payout_sent boolean not null default false,
  payout_sent_at timestamptz,
  notes text not null default '',
  unique (cycle_id, round_number)
);

-- One row per member per round. paid_at IS NULL = unpaid.
-- auto_recipient: this member receives the round and does not pay in.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  amount numeric(10,2) not null,
  paid_at timestamptz,
  source text check (source in ('manual', 'auto', 'bot', 'auto_recipient')),
  unique (round_id, member_id)
);

-- Reminder schedule + EN/ES templates (wired to Twilio in Week 3)
create table public.reminder_settings (
  cycle_id uuid primary key references public.cycles (id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  thursday_all_at time not null default '09:00',
  friday_noon_at time not null default '12:00',
  friday_evening_at time not null default '16:30',
  enabled boolean not null default false,
  channel text not null default 'queue' check (channel in ('queue', 'twilio'))
);

create table public.reminder_templates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  kind text not null check (kind in ('thursday_all', 'friday_noon', 'friday_evening')),
  lang text not null check (lang in ('en', 'es')),
  body text not null,
  unique (cycle_id, kind, lang)
);

-- Detected Zelle emails waiting for Match. Nothing here is paid until confirm_zelle_match.
create table public.pending_review (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  received_at timestamptz not null default now(),
  sender_name text not null,
  amount numeric(10,2),
  raw_subject text,
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'ignored')),
  suggested_member_id uuid references public.members (id),
  resolved_at timestamptz,
  gmail_message_id text,
  round_id uuid references public.rounds (id) on delete cascade,
  match_reason text,
  email_from text,
  round_timing text,
  dismiss_reason text,
  constraint pending_review_round_timing_check
    check (round_timing is null or round_timing in ('early', 'on_time', 'after_deadline', 'late'))
);

create unique index pending_review_gmail_message_id on public.pending_review (gmail_message_id);

-- RLS
alter table public.admins            enable row level security;
alter table public.cycles            enable row level security;
alter table public.members           enable row level security;
alter table public.payer_aliases     enable row level security;
alter table public.rounds            enable row level security;
alter table public.payments          enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.reminder_templates enable row level security;
alter table public.pending_review    enable row level security;

-- Admin (authenticated + listed in admins) has full access
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy admin_all_cycles on public.cycles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_members on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_aliases on public.payer_aliases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_rounds on public.rounds
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_payments on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_reminder_settings on public.reminder_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_reminder_templates on public.reminder_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_pending_review on public.pending_review
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Writes stop once the parent cycle is archived. SELECT stays open: a single
-- restrictive FOR ALL policy whose USING rejected archived rows would hide
-- history from the admin. FOR ALL below uses USING (true) so reads pass, and
-- WITH CHECK blocks inserts and updates. A second restrictive DELETE policy
-- blocks deletes, which do not consult WITH CHECK.
create policy members_no_write_when_archived on public.members
  as restrictive for all to authenticated
  using (true)
  with check (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');
create policy members_no_delete_when_archived on public.members
  as restrictive for delete to authenticated
  using (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');

create policy rounds_no_write_when_archived on public.rounds
  as restrictive for all to authenticated
  using (true)
  with check (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');
create policy rounds_no_delete_when_archived on public.rounds
  as restrictive for delete to authenticated
  using (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');

create policy payments_no_write_when_archived on public.payments
  as restrictive for all to authenticated
  using (true)
  with check (
    coalesce((
      select c.status from public.rounds r
      join public.cycles c on c.id = r.cycle_id
      where r.id = round_id
    ), '') is distinct from 'archived'
  );
create policy payments_no_delete_when_archived on public.payments
  as restrictive for delete to authenticated
  using (
    coalesce((
      select c.status from public.rounds r
      join public.cycles c on c.id = r.cycle_id
      where r.id = round_id
    ), '') is distinct from 'archived'
  );

-- pending_review (dismiss is an update) and payer_aliases use the same lock.
-- The cycles row is not locked: an archived cycle can still be viewed and unarchived.
create policy pending_review_no_write_when_archived on public.pending_review
  as restrictive for all to authenticated
  using (true)
  with check (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');
create policy pending_review_no_delete_when_archived on public.pending_review
  as restrictive for delete to authenticated
  using (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');

create policy payer_aliases_no_write_when_archived on public.payer_aliases
  as restrictive for all to authenticated
  using (true)
  with check (
    coalesce((
      select c.status from public.members m
      join public.cycles c on c.id = m.cycle_id
      where m.id = member_id
    ), '') is distinct from 'archived'
  );
create policy payer_aliases_no_delete_when_archived on public.payer_aliases
  as restrictive for delete to authenticated
  using (
    coalesce((
      select c.status from public.members m
      join public.cycles c on c.id = m.cycle_id
      where m.id = member_id
    ), '') is distinct from 'archived'
  );

-- Confirm a review: mark the chosen member paid for the chosen round (paid_at = when the
-- email arrived, source = 'auto' because it was detected), close the review, and remember
-- the sender name as that member's payer alias. p_round, when set, is the round the admin
-- picked and replaces the round the scan stored.
-- An archived cycle raises 'cycle is archived' before any payment row is locked or written.
-- SECURITY INVOKER: admin RLS still applies. The archive check is in the function because a
-- policy error is not this message, and table owners bypass RLS.
create or replace function public.confirm_zelle_match(p_review uuid, p_member uuid, p_round uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_review  public.pending_review%rowtype;
  v_member  public.members%rowtype;
  v_payment public.payments%rowtype;
begin
  select * into v_review from public.pending_review where id = p_review for update;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if v_review.status <> 'pending' then
    raise exception 'This item was already handled' using errcode = '22023';
  end if;
  -- Archived cycles stay readable and can be unarchived. Match must not change a payment.
  if coalesce((select status from public.cycles where id = v_review.cycle_id), '') = 'archived' then
    raise exception 'cycle is archived' using errcode = '22023';
  end if;

  if p_round is not null then
    if not exists (select 1 from public.rounds where id = p_round and cycle_id = v_review.cycle_id) then
      raise exception 'That round is not in this cycle' using errcode = '22023';
    end if;
    update public.pending_review set round_id = p_round where id = p_review;
    v_review.round_id := p_round;
  end if;

  if v_review.round_id is null
     or not exists (select 1 from public.rounds where id = v_review.round_id and cycle_id = v_review.cycle_id) then
    raise exception 'This item has no round in its cycle to apply it to' using errcode = '22023';
  end if;

  select * into v_member from public.members
  where id = p_member and cycle_id = v_review.cycle_id and removed_at is null;
  if not found then
    raise exception 'That member is not in this cycle' using errcode = '22023';
  end if;

  select * into v_payment from public.payments
  where round_id = v_review.round_id and member_id = p_member
  for update;
  if not found then
    raise exception 'That member has no payment for this round' using errcode = '22023';
  end if;
  -- Only an exact amount can be confirmed here; partial or combined payments are marked by hand.
  if v_review.amount is distinct from v_payment.amount then
    raise exception 'The Zelle amount does not match this payment; mark it by hand instead' using errcode = '22023';
  end if;

  -- A waiver (auto_recipient) is not a recorded payment, so a real Zelle match
  -- replaces it with source auto and the email time. That money still stays out of
  -- the pot, because pot sums skip the recipient. A row already paid from a real
  -- source (manual, auto, bot) is left as it is.
  if v_payment.paid_at is null or v_payment.source is not distinct from 'auto_recipient' then
    update public.payments
    set paid_at = v_review.received_at, source = 'auto'
    where id = v_payment.id;
  end if;

  update public.pending_review
  set status = 'matched', suggested_member_id = p_member, resolved_at = now()
  where id = p_review;

  insert into public.payer_aliases (member_id, alias_name)
  values (p_member, v_review.sender_name)
  on conflict (member_id, alias_name) do nothing;
end;
$$;

-- Members never read tables directly. They call this RPC with their secret token.
-- Returns only: their status, their payout date, current/last round, first names
-- and paid/unpaid for group progress. No phones, no tokens, no aliases, no notes
-- unless you later choose to add a safe public note field.
create or replace function public.get_member_board(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_cycle  public.cycles%rowtype;
  v_zone   text;
  v_today  date;
  v_round  public.rounds%rowtype;
  v_deadline timestamptz;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_member from public.members
  where access_token = p_token and token_revoked_at is null and removed_at is null;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_cycle from public.cycles where id = v_member.cycle_id;
  if v_cycle.status = 'archived'
     and coalesce(v_cycle.archived_at, '-infinity'::timestamptz) + interval '30 days' <= now() then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  v_zone := coalesce(nullif(btrim(v_cycle.timezone), ''), 'America/Los_Angeles');
  v_today := (timezone(v_zone, now()))::date;

  select * into v_round
  from public.rounds
  where cycle_id = v_cycle.id
    and payout_date >= v_today
  order by round_number
  limit 1;

  if not found then
    select * into v_round
    from public.rounds
    where cycle_id = v_cycle.id
    order by round_number desc
    limit 1;
  end if;

  if v_round.id is not null then
    v_deadline := (v_round.collect_date + time '18:00') at time zone v_zone;
  end if;

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'name', v_cycle.name,
      'contribution', v_cycle.contribution,
      'status', v_cycle.status,
      'start_date', v_cycle.start_date,
      'interval_days', v_cycle.interval_days,
      'timezone', v_zone,
      'zelle_destination', v_cycle.zelle_destination
    ),
    'me', jsonb_build_object(
      'slot', v_member.slot,
      'display_first_name', v_member.display_first_name,
      'language_pref', v_member.language_pref,
      'payout_date', coalesce(
        (select r.payout_date from public.rounds r
         where r.recipient_member_id = v_member.id and r.cycle_id = v_cycle.id and r.payout_date >= v_today
         order by r.payout_date limit 1),
        (select r.payout_date from public.rounds r
         where r.recipient_member_id = v_member.id and r.cycle_id = v_cycle.id
         order by r.payout_date desc limit 1)
      ),
      'paid_this_round', (
        v_member.id = v_round.recipient_member_id
        or exists (
          select 1 from public.payments p
          where p.round_id = v_round.id
            and p.member_id = v_member.id
            and p.paid_at is not null
        )
      )
    ),
    'current_round', case when v_round.id is null then null else jsonb_build_object(
      'round_number', v_round.round_number,
      'collect_date', v_round.collect_date,
      'payout_date', v_round.payout_date,
      'payout_sent', v_round.payout_sent,
      'collect_deadline', v_deadline,
      'recipient_first_name', (
        select m.display_first_name from public.members m
        where m.id = v_round.recipient_member_id and m.removed_at is null
      )
    ) end,
    'progress', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'display_first_name', m.display_first_name,
        'paid', (p.paid_at is not null) or m.id = v_round.recipient_member_id,
        'is_recipient', m.id = v_round.recipient_member_id
      ) order by m.slot), '[]'::jsonb)
      from public.payments p
      join public.members m on m.id = p.member_id
      where p.round_id = v_round.id and m.cycle_id = v_cycle.id and m.removed_at is null
    ),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'number', r.round_number,
        'collect_date', r.collect_date,
        'payout_date', r.payout_date,
        'recipient_first_name', rm.display_first_name
      ) order by r.round_number), '[]'::jsonb)
      from public.rounds r
      left join public.members rm on rm.id = r.recipient_member_id and rm.removed_at is null
      where r.cycle_id = v_cycle.id
    )
  );
end;
$$;

-- Anon (no login) may only execute the member RPC, not read tables.
-- Global revokes undo database-wide defaults. Schema-scoped revokes undo grants
-- that were set only for public. Both are required.
alter default privileges revoke execute on functions from public;
alter default privileges revoke execute on functions from anon, authenticated;
alter default privileges revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from PUBLIC, anon;
grant usage on schema public to anon, authenticated;
grant execute on function public.get_member_board(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.confirm_zelle_match(uuid, uuid, uuid) to authenticated;
-- table grants for authenticated are still gated by the admin_* policies
grant select, insert, update, delete on
  public.admins, public.cycles, public.members, public.payer_aliases,
  public.rounds, public.payments, public.reminder_settings,
  public.reminder_templates, public.pending_review
to authenticated;

-- 007, 008, 018: columns the later functions read. Added here in migration order so a
-- fresh schema.sql matches migrations-in-order (each migration uses IF NOT EXISTS).
alter table public.members add column if not exists token_revoked_at timestamptz;
alter table public.members add column if not exists removed_at timestamptz;
alter table public.members add column if not exists link_sent_at timestamptz;

-- 013 + 017: opt-outs, the reminder log, and the queue RPCs. channel and the queued
-- status are the post-017 shape. 013's CREATE TABLE IF NOT EXISTS leaves this in place;
-- 017 drops and recreates the status and channel checks.
create table if not exists public.sms_opt_outs (
  phone_e164   text primary key check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  opted_out_at timestamptz not null default now(),
  keyword      text
);

create table if not exists public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  round_id   uuid not null references public.rounds (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  kind       text not null check (kind in ('thursday_all', 'friday_noon', 'friday_evening')),
  local_date date not null,
  dry_run    boolean not null,
  status     text not null check (status in ('dry_run', 'sending', 'sent', 'failed', 'queued', 'skipped')),
  twilio_sid text,
  error      text,
  created_at timestamptz not null default now(),
  channel    text not null default 'queue' check (channel in ('queue', 'twilio')),
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
drop policy if exists admin_update_reminder_log on public.reminder_log;
create policy admin_update_reminder_log on public.reminder_log
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.sms_opt_outs, public.reminder_log from anon, authenticated;
grant select on public.sms_opt_outs to authenticated;
grant select, update on public.reminder_log to authenticated;

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
    if exists (
      select 1 from public.rounds r
      where r.id = (v_row->>'round_id')::uuid
        and r.recipient_member_id = (v_row->>'member_id')::uuid
    ) then
      continue;
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

revoke all on function public.enqueue_reminders(jsonb) from public, anon;
grant execute on function public.enqueue_reminders(jsonb) to authenticated;
revoke all on function public.set_reminder_log_status(uuid, text) from public, anon;
grant execute on function public.set_reminder_log_status(uuid, text) to authenticated;

-- 018 + 019: one hashed bot key. Status returns first name, round, paid, and amount,
-- not phone numbers. Marking paid records source 'bot' and an optional paid_at.
create table if not exists public.bot_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null default 'Grokbot',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.bot_keys enable row level security;
drop policy if exists admin_read_bot_keys on public.bot_keys;
create policy admin_read_bot_keys on public.bot_keys
  for select to authenticated using (public.is_admin());
revoke all on public.bot_keys from anon, authenticated;
grant select on public.bot_keys to authenticated;

create or replace function public.bot_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_key is not null and length(p_key) >= 32 and exists (
    select 1 from public.bot_keys
    where revoked_at is null
      and key_hash = encode(digest(p_key, 'sha256'), 'hex')
  );
$$;

create or replace function public.create_bot_key()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.bot_keys set revoked_at = now() where revoked_at is null;
  v_key := 'tbk_' || encode(gen_random_bytes(32), 'hex');
  insert into public.bot_keys (key_hash) values (encode(digest(v_key, 'sha256'), 'hex'));
  return v_key;
end;
$$;

create or replace function public.revoke_bot_keys()
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.bot_keys set revoked_at = now() where revoked_at is null;
end;
$$;

create or replace function public.bot_pick_round(p_cycle uuid, p_round integer)
returns public.rounds
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_zone text;
  v_today date;
  v_round public.rounds%rowtype;
begin
  if p_round is not null then
    select * into v_round from public.rounds where cycle_id = p_cycle and round_number = p_round;
    if not found then
      raise exception 'no round %', p_round using errcode = 'P0002';
    end if;
    return v_round;
  end if;
  select coalesce(nullif(btrim(timezone), ''), 'America/Los_Angeles') into v_zone from public.cycles where id = p_cycle;
  v_today := (timezone(v_zone, now()))::date;
  select * into v_round from public.rounds
  where cycle_id = p_cycle and payout_date >= v_today order by round_number limit 1;
  if not found then
    select * into v_round from public.rounds where cycle_id = p_cycle order by round_number desc limit 1;
  end if;
  return v_round;
end;
$$;

create or replace function public.bot_round_status(p_key text, p_round integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles%rowtype;
  v_round public.rounds%rowtype;
  v_zone text;
begin
  if not public.bot_key_ok(p_key) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_cycle from public.cycles where status = 'active' order by start_date desc limit 1;
  if not found then
    return jsonb_build_object('cycle', null);
  end if;
  v_round := public.bot_pick_round(v_cycle.id, p_round);
  v_zone := coalesce(nullif(btrim(v_cycle.timezone), ''), 'America/Los_Angeles');

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'name', v_cycle.name,
      'contribution', v_cycle.contribution,
      'zelle_destination', v_cycle.zelle_destination,
      'timezone', v_zone,
      'rounds_total', (select count(*) from public.rounds where cycle_id = v_cycle.id)
    ),
    'round', case when v_round.id is null then null else jsonb_build_object(
      'number', v_round.round_number,
      'collect_date', v_round.collect_date,
      'payout_date', v_round.payout_date,
      'collect_deadline', (v_round.collect_date + time '18:00') at time zone v_zone,
      'payout_sent', v_round.payout_sent,
      'recipient_first_name', (
        select m.display_first_name from public.members m
        where m.id = v_round.recipient_member_id and m.removed_at is null
      ),
      -- Money skips the recipient. paid_count still includes them, so a full round is N/N.
      'pot', (
        select coalesce(sum(p.amount), 0)
        from public.payments p
        join public.members m on m.id = p.member_id
        where p.round_id = v_round.id and m.removed_at is null
          and p.member_id is distinct from v_round.recipient_member_id
      ),
      'collected', (
        select coalesce(sum(p.amount), 0)
        from public.payments p
        join public.members m on m.id = p.member_id
        where p.round_id = v_round.id and m.removed_at is null
          and p.paid_at is not null
          and p.member_id is distinct from v_round.recipient_member_id
      ),
      'paid_count', (
        select count(*)
        from public.payments p
        join public.members m on m.id = p.member_id
        where p.round_id = v_round.id and m.removed_at is null
          and ((p.paid_at is not null) or p.member_id = v_round.recipient_member_id)
      ),
      'member_count', (
        select count(*)
        from public.payments p
        join public.members m on m.id = p.member_id
        where p.round_id = v_round.id and m.removed_at is null
      )
    ) end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'first_name', m.display_first_name,
        'language', m.language_pref,
        'paid', (p.paid_at is not null) or m.id = v_round.recipient_member_id,
        'amount', case when m.id = v_round.recipient_member_id then 0 else p.amount end,
        'is_recipient', m.id = v_round.recipient_member_id
      ) order by m.slot), '[]'::jsonb)
      from public.payments p
      join public.members m on m.id = p.member_id
      where p.round_id = v_round.id and m.removed_at is null
    )
  );
end;
$$;

create or replace function public.bot_mark_paid(
  p_key text,
  p_slot integer,
  p_paid boolean default true,
  p_round integer default null,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles%rowtype;
  v_round public.rounds%rowtype;
  v_member public.members%rowtype;
begin
  if not public.bot_key_ok(p_key) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_cycle from public.cycles where status = 'active' order by start_date desc limit 1;
  if not found then
    raise exception 'no active cycle' using errcode = 'P0002';
  end if;
  v_round := public.bot_pick_round(v_cycle.id, p_round);
  select * into v_member from public.members
  where cycle_id = v_cycle.id and slot = p_slot and removed_at is null;
  if not found then
    raise exception 'no member in slot %', p_slot using errcode = 'P0002';
  end if;

  -- The recipient does not owe. Marking them paid records the real bot payment
  -- (source bot, the given time) without adding it to the pot. Clearing them is ignored,
  -- so a waiver or a real payment cannot turn into a debt.
  if v_member.id = v_round.recipient_member_id then
    if not exists (
      select 1 from public.payments
      where round_id = v_round.id and member_id = v_member.id
    ) then
      raise exception '% does not pay in round %', v_member.display_first_name, v_round.round_number
        using errcode = 'P0002';
    end if;
    if coalesce(p_paid, true) then
      update public.payments
         set paid_at = coalesce(p_paid_at, paid_at, now()),
             source = 'bot'
       where round_id = v_round.id and member_id = v_member.id;
    end if;
    return public.bot_round_status(p_key, v_round.round_number);
  end if;

  update public.payments
  set paid_at = case
        when coalesce(p_paid, true) then coalesce(p_paid_at, paid_at, now())
        else null
      end,
      source = case when coalesce(p_paid, true) then 'bot' else null end
  where round_id = v_round.id and member_id = v_member.id;
  if not found then
    raise exception '% does not pay in round %', v_member.display_first_name, v_round.round_number using errcode = 'P0002';
  end if;

  return public.bot_round_status(p_key, v_round.round_number);
end;
$$;

revoke all on function public.bot_key_ok(text) from public, anon, authenticated;
revoke all on function public.bot_pick_round(uuid, integer) from public, anon, authenticated;
revoke all on function public.create_bot_key() from public, anon;
revoke all on function public.revoke_bot_keys() from public, anon;
revoke all on function public.bot_round_status(text, integer) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.create_bot_key() to authenticated;
grant execute on function public.revoke_bot_keys() to authenticated;
grant execute on function public.bot_round_status(text, integer) to anon, authenticated;
grant execute on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) to anon, authenticated;

-- 010 + 019: backup import. Last-call reminder is 16:30, not the 6 PM deadline.
create or replace function public.import_cycle(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_start    date := (p_plan->'cycle'->>'start_date')::date;
  v_members  integer;
  v_rounds   integer;
  v_payments integer;
  v_paid     integer;
begin
  if v_start is null then
    raise exception 'start_date is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.cycles where start_date = v_start) then
    raise exception 'A cycle with this start date already exists' using errcode = '23505';
  end if;

  insert into public.cycles
    (name, start_date, interval_days, contribution, status, timezone, organizer_display_name, zelle_destination)
  select c.name, c.start_date, c.interval_days, c.contribution, 'draft',
         coalesce(nullif(btrim(c.timezone), ''), 'America/Los_Angeles'),
         c.organizer_display_name, c.zelle_destination
  from jsonb_to_record(p_plan->'cycle') as c(
    name text, start_date date, interval_days integer, contribution numeric,
    timezone text, organizer_display_name text, zelle_destination text)
  returning id into v_cycle_id;

  insert into public.members (cycle_id, slot, display_first_name, phone, language_pref, access_token)
  select v_cycle_id, m.slot, m.display_first_name, m.phone, coalesce(m.language_pref, 'en'), m.access_token
  from jsonb_to_recordset(p_plan->'members') as m(
    slot integer, display_first_name text, phone text, language_pref text, access_token text);
  get diagnostics v_members = row_count;

  insert into public.rounds
    (cycle_id, round_number, collect_date, payout_date, recipient_member_id, payout_sent, payout_sent_at, notes)
  select v_cycle_id, r.round_number, r.collect_date, r.payout_date, m.id,
         coalesce(r.payout_sent, false), r.payout_sent_at, coalesce(r.notes, '')
  from jsonb_to_recordset(p_plan->'rounds') as r(
    round_number integer, collect_date date, payout_date date, "recipientSlot" integer,
    payout_sent boolean, payout_sent_at timestamptz, notes text)
  left join public.members m on m.cycle_id = v_cycle_id and m.slot = r."recipientSlot";
  get diagnostics v_rounds = row_count;

  insert into public.payments (round_id, member_id, amount, paid_at, source)
  select r.id, m.id, p.amount, p.paid_at, p.source
  from jsonb_to_recordset(p_plan->'payments') as p(
    "roundNumber" integer, slot integer, amount numeric, paid_at timestamptz, source text)
  left join public.rounds r on r.cycle_id = v_cycle_id and r.round_number = p."roundNumber"
  left join public.members m on m.cycle_id = v_cycle_id and m.slot = p.slot;
  get diagnostics v_payments = row_count;

  if v_members = 0 or v_rounds = 0 or v_payments = 0 then
    raise exception 'An import needs members, rounds, and payments' using errcode = '22023';
  end if;

  insert into public.reminder_settings
    (cycle_id, timezone, thursday_all_at, friday_noon_at, friday_evening_at, enabled)
  values (v_cycle_id, 'America/Los_Angeles', '09:00', '12:00', '16:30', false);

  insert into public.reminder_templates (cycle_id, kind, lang, body)
  select v_cycle_id, t.kind, t.lang, t.body
  from jsonb_to_recordset(coalesce(p_plan->'reminder_templates', '[]'::jsonb)) as t(kind text, lang text, body text);

  update public.cycles
  set status = 'archived',
      archived_at = coalesce((p_plan->'cycle'->>'archived_at')::timestamptz, now())
  where id = v_cycle_id;

  select count(*) into v_paid from public.payments p
  join public.rounds r on r.id = p.round_id
  where r.cycle_id = v_cycle_id and p.paid_at is not null;

  return jsonb_build_object(
    'cycle_id', v_cycle_id,
    'members', v_members,
    'rounds', v_rounds,
    'payments', v_payments,
    'paid', v_paid
  );
end;
$$;

revoke all on function public.import_cycle(jsonb) from public, anon;
grant execute on function public.import_cycle(jsonb) to authenticated;

-- 020: recipient waiver. The payment trigger settles the row;
-- the round trigger moves the waiver when the recipient changes.
create or replace function public.settle_recipient_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  select recipient_member_id into v_recipient
  from public.rounds
  where id = new.round_id;

  if v_recipient is null or new.member_id is distinct from v_recipient then
    -- auto_recipient means "this person receives the round." It is not a payment source
    -- for anyone else. A real source (manual, auto, bot) is left alone.
    if new.source = 'auto_recipient' then
      raise exception 'auto_recipient is only for the round recipient' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Never store the recipient as unpaid.
  if new.paid_at is null then
    new.paid_at := case
      when tg_op = 'UPDATE' and old.paid_at is not null then old.paid_at
      else now()
    end;
    new.source := case
      when tg_op = 'UPDATE' and old.paid_at is not null and old.source in ('manual', 'auto', 'bot') then old.source
      else 'auto_recipient'
    end;
  elsif new.source is null or new.source not in ('manual', 'auto', 'bot', 'auto_recipient') then
    new.source := 'auto_recipient';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_settle_recipient on public.payments;
create trigger payments_settle_recipient
  before insert or update on public.payments
  for each row execute function public.settle_recipient_payment();

create or replace function public.resettle_round_recipient()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.recipient_member_id is not distinct from new.recipient_member_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.recipient_member_id is distinct from new.recipient_member_id then
    -- Only the waiver moves. A real payment (manual, auto, bot) stays on the row.
    update public.payments
       set paid_at = null,
           source = null
     where round_id = new.id
       and member_id = old.recipient_member_id
       and source = 'auto_recipient';
  end if;

  update public.payments
     set paid_at = coalesce(paid_at, now()),
         source = case
           when paid_at is not null and source in ('manual', 'auto', 'bot') then source
           else 'auto_recipient'
         end
   where round_id = new.id
     and member_id = new.recipient_member_id
     and (
       paid_at is null
       or source is null
       or source not in ('manual', 'auto', 'bot', 'auto_recipient')
     );

  return new;
end;
$$;

drop trigger if exists rounds_resettle_recipient on public.rounds;
create trigger rounds_resettle_recipient
  after insert or update of recipient_member_id on public.rounds
  for each row execute function public.resettle_round_recipient();

-- Trigger functions are invoked by the statement. EXECUTE is not checked then.
revoke all on function public.settle_recipient_payment() from public, anon;
revoke all on function public.resettle_round_recipient() from public, anon;

create or replace function public.skip_recipient_reminder()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.rounds r
    where r.id = new.round_id and r.recipient_member_id = new.member_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists reminder_log_skip_recipient on public.reminder_log;
create trigger reminder_log_skip_recipient
  before insert on public.reminder_log
  for each row execute function public.skip_recipient_reminder();

revoke all on function public.skip_recipient_reminder() from public, anon;
