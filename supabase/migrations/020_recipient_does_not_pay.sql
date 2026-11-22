-- The round's recipient does not pay in.
--
-- Their payment row is settled (paid_at set) with source 'auto_recipient'. A row that was
-- already paid by hand, by Zelle match, or by the bot keeps that source and is not counted
-- twice: pot and collected sums skip the recipient either way. Clearing paid_at on the
-- recipient is ignored, so the waiver cannot turn into a debt.
--
-- Changing who receives moves the waiver with them. The previous recipient owes again
-- only when their row was the waiver; a real payment stays paid.
--
-- Draft and active cycles are backfilled. Archived cycles are left as stored.
-- enqueue_reminders skips the recipient. get_member_board and bot_round_status report
-- the recipient as paid with no amount toward the pot.
-- Safe to run more than once. Do not edit a payment by hand before this file has run.

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
  check (source in ('manual', 'auto', 'bot', 'auto_recipient'));

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

-- The admin's inserts and updates fire these. The owner runs them; authenticated still
-- needs EXECUTE or marking a payment fails with permission denied for the function.
revoke all on function public.settle_recipient_payment() from public, anon;
revoke all on function public.resettle_round_recipient() from public, anon;
grant execute on function public.settle_recipient_payment() to authenticated;
grant execute on function public.resettle_round_recipient() to authenticated;

-- The cron and the manual list both insert reminder_log. Drop the recipient even if a caller forgets.
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
grant execute on function public.skip_recipient_reminder() to authenticated;

-- Current cycles only. A second run changes nothing: settled rows no longer match.
update public.payments p
   set paid_at = coalesce(p.paid_at, now()),
       source = case
         when p.paid_at is not null and p.source in ('manual', 'auto', 'bot') then p.source
         else 'auto_recipient'
       end
  from public.rounds r
  join public.cycles c on c.id = r.cycle_id
 where p.round_id = r.id
   and p.member_id = r.recipient_member_id
   and c.status in ('draft', 'active')
   and not (
     p.paid_at is not null
     and p.source in ('manual', 'auto', 'bot', 'auto_recipient')
   );

-- Same member board as migration 012, with the recipient reported paid.
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

grant execute on function public.get_member_board(text) to anon, authenticated;

-- Reminders are not queued for the person receiving the round.
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

revoke all on function public.enqueue_reminders(jsonb) from public, anon;
grant execute on function public.enqueue_reminders(jsonb) to authenticated;

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

  -- The recipient is already settled. Do not record a second contribution, and do not clear it.
  if v_member.id = v_round.recipient_member_id then
    if not exists (
      select 1 from public.payments
      where round_id = v_round.id and member_id = v_member.id
    ) then
      raise exception '% does not pay in round %', v_member.display_first_name, v_round.round_number
        using errcode = 'P0002';
    end if;
    update public.payments
       set paid_at = coalesce(paid_at, now()),
           source = case
             when paid_at is not null and source in ('manual', 'auto', 'bot', 'auto_recipient') then source
             else 'auto_recipient'
           end
     where round_id = v_round.id
       and member_id = v_member.id
       and (
         paid_at is null
         or source is null
         or source not in ('manual', 'auto', 'bot', 'auto_recipient')
       );
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

revoke all on function public.bot_round_status(text, integer) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) from anon, authenticated;
grant execute on function public.bot_round_status(text, integer) to anon, authenticated;
grant execute on function public.bot_mark_paid(text, integer, boolean, integer, timestamptz) to anon, authenticated;

commit;
