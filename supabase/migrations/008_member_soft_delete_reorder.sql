-- Soft-deleted members and atomic payout reorder (review item N5).
-- Removing a member sets members.removed_at (and revokes their link) instead of deleting
-- rows, so payment history and the round they were due to receive are kept. The member
-- page leaves removed members out of progress, and a round whose recipient was removed
-- shows no recipient name until the admin assigns someone else.
-- swap_payout_order swaps two members' slots and payout rounds in one transaction.
-- Builds on 007 (revocable, expiring links). Safe to run more than once.

begin;

alter table public.members add column if not exists removed_at timestamptz;

create or replace function public.swap_payout_order(p_a uuid, p_b uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  a public.members%rowtype;
  b public.members%rowtype;
begin
  select * into a from public.members where id = p_a for update;
  select * into b from public.members where id = p_b for update;
  if a.id is null or b.id is null or a.id = b.id or a.cycle_id <> b.cycle_id then
    raise exception 'Both members must exist and be in the same cycle' using errcode = '22023';
  end if;

  -- (cycle_id, slot) is unique, so park one member on a temporary slot first.
  update public.members set slot = 1000000 + a.slot where id = a.id;
  update public.members set slot = a.slot where id = b.id;
  update public.members set slot = b.slot where id = a.id;

  update public.rounds
  set recipient_member_id = case when recipient_member_id = a.id then b.id else a.id end
  where cycle_id = a.cycle_id and recipient_member_id in (a.id, b.id);
end;
$$;

revoke all on function public.swap_payout_order(uuid, uuid) from public;
revoke all on function public.swap_payout_order(uuid, uuid) from anon;
grant execute on function public.swap_payout_order(uuid, uuid) to authenticated;

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
      from public.members m
      left join public.payments p
        on p.member_id = m.id and p.round_id = v_round.id
      where m.cycle_id = v_cycle.id and m.removed_at is null
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

commit;
