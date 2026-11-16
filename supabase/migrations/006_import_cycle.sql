-- Atomic backup import (review item N3).
-- One function call writes the cycle, members, rounds, payments, and reminder rows, then
-- archives the cycle. A function runs inside the caller's single statement, so any error
-- rolls every row back and no draft cycle is left behind.
-- SECURITY INVOKER: the caller's RLS still applies, so only admins (or the service role
-- used by scripts/import-backup.mjs) can write. Safe to run more than once.

begin;

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

  if v_members = 0 or v_rounds = 0 or v_payments <> v_members * v_rounds then
    raise exception 'Payment rows must equal members x rounds' using errcode = '22023';
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

revoke all on function public.import_cycle(jsonb) from public;
revoke all on function public.import_cycle(jsonb) from anon;
grant execute on function public.import_cycle(jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.import_cycle(jsonb) to service_role';
  end if;
end $$;

commit;
