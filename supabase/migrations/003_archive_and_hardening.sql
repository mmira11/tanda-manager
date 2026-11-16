-- Archive lock, function privileges, and a timezone-aware member deadline.
-- Safe to run more than once, including when 002_review_fixes.sql was never applied.
-- One transaction: a syntax error rolls the whole file back.

begin;

-- Global revokes undo database-wide defaults. Schema-scoped revokes undo grants
-- that were set only for public. Both are required.
alter default privileges revoke execute on functions from public;
alter default privileges revoke execute on functions from anon, authenticated;
alter default privileges revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

revoke execute on all functions in schema public from PUBLIC;
revoke execute on all functions in schema public from anon;

-- Reads of an archived cycle stay allowed (USING true). Inserts and updates fail
-- WITH CHECK once status is archived. Deletes ignore WITH CHECK, so each table
-- also has a restrictive DELETE policy.
drop policy if exists members_no_write_when_archived on public.members;
create policy members_no_write_when_archived
  on public.members
  as restrictive for all to authenticated
  using (true)
  with check (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');
drop policy if exists members_no_delete_when_archived on public.members;
create policy members_no_delete_when_archived
  on public.members
  as restrictive for delete to authenticated
  using (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');

drop policy if exists rounds_no_write_when_archived on public.rounds;
create policy rounds_no_write_when_archived
  on public.rounds
  as restrictive for all to authenticated
  using (true)
  with check (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');
drop policy if exists rounds_no_delete_when_archived on public.rounds;
create policy rounds_no_delete_when_archived
  on public.rounds
  as restrictive for delete to authenticated
  using (coalesce((select c.status from public.cycles c where c.id = cycle_id), '') is distinct from 'archived');

drop policy if exists payments_no_write_when_archived on public.payments;
create policy payments_no_write_when_archived
  on public.payments
  as restrictive for all to authenticated
  using (true)
  with check (
    coalesce((
      select c.status from public.rounds r
      join public.cycles c on c.id = r.cycle_id
      where r.id = round_id
    ), '') is distinct from 'archived'
  );
drop policy if exists payments_no_delete_when_archived on public.payments;
create policy payments_no_delete_when_archived
  on public.payments
  as restrictive for delete to authenticated
  using (
    coalesce((
      select c.status from public.rounds r
      join public.cycles c on c.id = r.cycle_id
      where r.id = round_id
    ), '') is distinct from 'archived'
  );

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
      'timezone', v_zone
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
    )
  );
end;
$$;

grant execute on function public.get_member_board(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

commit;
