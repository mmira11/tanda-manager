-- One collection cutoff.
--
-- The 6 PM deadline was written out in get_member_board and bot_round_status. Both now
-- call collect_deadline(), which reads collect_cutoff(). Nothing about the result changes:
-- the cutoff is still 18:00 in the cycle's time zone.
-- Safe to run more than once.

begin;

-- The collection cutoff lives here and nowhere else in SQL. Change it in one place
-- (and COLLECT_CUTOFF in src/utils/rounds.js + supabase/functions/_shared/reminders.js).
create or replace function public.collect_cutoff()
returns time
language sql
immutable
set search_path = public
as $$
  select time '18:00';
$$;

-- The moment collection closes for a round, in the cycle's time zone.
create or replace function public.collect_deadline(p_collect_date date, p_zone text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_collect_date + public.collect_cutoff()) at time zone p_zone;
$$;

revoke all on function public.collect_cutoff() from public;
revoke all on function public.collect_deadline(date, text) from public;
grant execute on function public.collect_cutoff() to anon, authenticated;
grant execute on function public.collect_deadline(date, text) to anon, authenticated;

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
    v_deadline := public.collect_deadline(v_round.collect_date, v_zone);
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
      'collect_deadline', public.collect_deadline(v_round.collect_date, v_zone),
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

revoke all on function public.bot_round_status(text, integer) from public;
grant execute on function public.bot_round_status(text, integer) to anon, authenticated;

commit;
