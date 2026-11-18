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

-- One row per member per round. paid_at IS NULL = unpaid
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  amount numeric(10,2) not null,
  paid_at timestamptz,
  source text check (source in ('manual', 'auto')),
  unique (round_id, member_id)
);

-- Reminder schedule + EN/ES templates (wired to Twilio in Week 3)
create table public.reminder_settings (
  cycle_id uuid primary key references public.cycles (id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  thursday_all_at time not null default '09:00',
  friday_noon_at time not null default '12:00',
  friday_evening_at time not null default '18:00',
  enabled boolean not null default false
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

  -- Already marked paid by hand: keep that record as it is.
  if v_payment.paid_at is null then
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

  select * into v_member from public.members where access_token = p_token;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_cycle from public.cycles where id = v_member.cycle_id;
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
      'payout_date', (
        select r.payout_date from public.rounds r
        where r.recipient_member_id = v_member.id
        limit 1
      ),
      'paid_this_round', (
        select p.paid_at is not null
        from public.payments p
        where p.round_id = v_round.id and p.member_id = v_member.id
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
        where m.id = v_round.recipient_member_id
      )
    ) end,
    'progress', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'display_first_name', m.display_first_name,
        'paid', p.paid_at is not null,
        'is_recipient', m.id = v_round.recipient_member_id
      ) order by m.slot), '[]'::jsonb)
      from public.members m
      left join public.payments p
        on p.member_id = m.id and p.round_id = v_round.id
      where m.cycle_id = v_cycle.id
    ),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'number', r.round_number,
        'collect_date', r.collect_date,
        'payout_date', r.payout_date,
        'recipient_first_name', rm.display_first_name
      ) order by r.round_number), '[]'::jsonb)
      from public.rounds r
      join public.members rm on rm.id = r.recipient_member_id
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
