-- Schedule and time zone validation (review item N11).
-- 1. A round's payout date can't be before its collection date.
-- 2. Within a cycle, collection dates rise strictly with round_number. A constraint
--    trigger checks at the end of each statement, so multi-row inserts (create cycle,
--    import) and swap_payout_order are checked against their final state.
-- 3. cycles.timezone must be a real IANA zone name (from pg_timezone_names).
-- Apply after checking existing data (see the PR). Safe to run more than once.

begin;

alter table public.rounds drop constraint if exists rounds_payout_on_or_after_collect;
alter table public.rounds
  add constraint rounds_payout_on_or_after_collect check (payout_date >= collect_date);

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
  return null;
end;
$$;

drop trigger if exists rounds_in_date_order on public.rounds;
create constraint trigger rounds_in_date_order
  after insert or update of collect_date, round_number, cycle_id on public.rounds
  deferrable initially immediate
  for each row execute function public.check_round_order();

create or replace function public.check_cycle_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.timezone is null or not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', coalesce(new.timezone, '(none)') using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists cycles_valid_timezone on public.cycles;
create trigger cycles_valid_timezone
  before insert or update of timezone on public.cycles
  for each row execute function public.check_cycle_timezone();

commit;
