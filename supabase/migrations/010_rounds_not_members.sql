-- Rounds are not tied to the number of members (review item N9).
-- Totals, pot, and progress come from each round's own payment rows instead of the roster.
-- 1. get_member_board (from 008): progress lists only members with a payment row in the
--    current round, so a round with fewer payers shows the right count and pot.
-- 2. import_cycle (from 006): no longer requires payments = members x rounds. It still needs
--    at least one member, round, and payment, and unknown slots still fail the insert.
-- Safe to run more than once.

begin;

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
        where m.id = v_round.recipient_member_id and m.removed_at is null
      )
    ) end,
    'progress', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'display_first_name', m.display_first_name,
        'paid', p.paid_at is not null,
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
  values (v_cycle_id, 'America/Los_Angeles', '09:00', '12:00', '18:00', false);

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

grant execute on function public.get_member_board(text) to anon, authenticated;

revoke all on function public.import_cycle(jsonb) from public;
revoke all on function public.import_cycle(jsonb) from anon;
grant execute on function public.import_cycle(jsonb) to authenticated;

commit;
