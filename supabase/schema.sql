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
  zelle_destination text,          -- organizer Zelle target; admin-only
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

-- Unmatched or ambiguous Zelle emails (wired in Week 3)
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
  resolved_at timestamptz
);

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
  v_today  date := (timezone('America/Los_Angeles', now()))::date;
  v_round  public.rounds%rowtype;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_member from public.members where access_token = p_token;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select * into v_cycle from public.cycles where id = v_member.cycle_id;

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

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'name', v_cycle.name,
      'contribution', v_cycle.contribution,
      'status', v_cycle.status,
      'start_date', v_cycle.start_date,
      'interval_days', v_cycle.interval_days
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
    )
  );
end;
$$;

-- Anon (no login) may only execute the member RPC, not read tables
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function public.get_member_board(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
-- table grants for authenticated are still gated by the admin_* policies
grant select, insert, update, delete on
  public.admins, public.cycles, public.members, public.payer_aliases,
  public.rounds, public.payments, public.reminder_settings,
  public.reminder_templates, public.pending_review
to authenticated;
