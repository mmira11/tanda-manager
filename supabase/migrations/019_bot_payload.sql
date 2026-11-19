-- Bot payload and last-call time.
--
-- bot_round_status no longer returns member phone numbers. It keeps the slot, first name,
-- language, paid flag, payment amount, and whether this person receives the round.
-- bot_mark_paid takes an optional paid_at (the Zelle email time). A payment it records
-- uses source 'bot'. Omitting paid_at keeps an existing time, or uses now() when there
-- is none. The bot-key check stays, and these two functions use search_path = public.
--
-- The last-call reminder moves from 18:00 (the 6 PM collection deadline) to 16:30 PT.
-- Rows still stored at 18:00 are updated. A cycle that already chose another time is left
-- as it is. import_cycle writes 16:30 for a new backup.
-- Safe to run more than once.

begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'payments' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%source%'
  loop
    execute format('alter table public.payments drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.payments add constraint payments_source_check
  check (source in ('manual', 'auto', 'bot'));

alter table public.reminder_settings
  alter column friday_evening_at set default '16:30';

update public.reminder_settings
   set friday_evening_at = '16:30'
 where friday_evening_at = time '18:00';

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
      )
    ) end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'first_name', m.display_first_name,
        'language', m.language_pref,
        'paid', p.paid_at is not null,
        'amount', p.amount,
        'is_recipient', m.id = v_round.recipient_member_id
      ) order by m.slot), '[]'::jsonb)
      from public.payments p
      join public.members m on m.id = p.member_id
      where p.round_id = v_round.id and m.removed_at is null
    )
  );
end;
$$;

drop function if exists public.bot_mark_paid(text, integer, boolean, integer);

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

revoke all on function public.bot_round_status(text, integer) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) from anon, authenticated;
grant execute on function public.bot_round_status(text, integer) to anon, authenticated;
grant execute on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) to anon, authenticated;

-- Same import as 010, with the last-call time at 16:30. Signature is unchanged, so the
-- authenticated grant from 010 stays; it is repeated here so a re-run is enough.
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

  -- Child rows go in while the cycle is a draft. The archived-cycle lock (migration 003)
  -- rejects writes to an archived cycle, so the cycle is archived last.
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

  -- An unknown recipient slot leaves recipient_member_id null, which the NOT NULL rejects.
  insert into public.rounds
    (cycle_id, round_number, collect_date, payout_date, recipient_member_id, payout_sent, payout_sent_at, notes)
  select v_cycle_id, r.round_number, r.collect_date, r.payout_date, m.id,
         coalesce(r.payout_sent, false), r.payout_sent_at, coalesce(r.notes, '')
  from jsonb_to_recordset(p_plan->'rounds') as r(
    round_number integer, collect_date date, payout_date date, "recipientSlot" integer,
    payout_sent boolean, payout_sent_at timestamptz, notes text)
  left join public.members m on m.cycle_id = v_cycle_id and m.slot = r."recipientSlot";
  get diagnostics v_rounds = row_count;

  -- Same for payments: an unknown round or slot becomes a null id and the insert fails.
  insert into public.payments (round_id, member_id, amount, paid_at, source)
  select r.id, m.id, p.amount, p.paid_at, p.source
  from jsonb_to_recordset(p_plan->'payments') as p(
    "roundNumber" integer, slot integer, amount numeric, paid_at timestamptz, source text)
  left join public.rounds r on r.cycle_id = v_cycle_id and r.round_number = p."roundNumber"
  left join public.members m on m.cycle_id = v_cycle_id and m.slot = p.slot;
  get diagnostics v_payments = row_count;

  -- Rounds and members don't have to match (N9): a round only needs at least one payment row.
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

revoke all on function public.import_cycle(jsonb) from public;
revoke all on function public.import_cycle(jsonb) from anon;
grant execute on function public.import_cycle(jsonb) to authenticated;

commit;
