-- Payout dates in round order (review item N11 follow-up).
-- 009 made collection dates rise with round_number and kept each payout on or after its
-- own collection date, but payouts could still be out of order across rounds (round 1
-- paying out after round 2). Payout dates now rise strictly with round_number too, and the
-- trigger also fires when payout_date changes, so create, import, and update are all checked.
-- Safe to run more than once.

begin;

create or replace function public.check_round_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.rounds r
    where r.cycle_id = new.cycle_id
      and r.id <> new.id
      and ((r.round_number < new.round_number and r.collect_date >= new.collect_date)
        or (r.round_number > new.round_number and r.collect_date <= new.collect_date))
  ) then
    raise exception 'Round % (collects %) is out of date order', new.round_number, new.collect_date
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.rounds r
    where r.cycle_id = new.cycle_id
      and r.id <> new.id
      and ((r.round_number < new.round_number and r.payout_date >= new.payout_date)
        or (r.round_number > new.round_number and r.payout_date <= new.payout_date))
  ) then
    raise exception 'Round % (pays out %) is out of payout order', new.round_number, new.payout_date
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists rounds_in_date_order on public.rounds;
create constraint trigger rounds_in_date_order
  after insert or update of collect_date, payout_date, round_number, cycle_id on public.rounds
  deferrable initially immediate
  for each row execute function public.check_round_order();

commit;
