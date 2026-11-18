-- Zelle review follow-ups. The scan records which collection window a payment fell in
-- (round_timing). Match can apply the row to a round the admin picked. Dismiss can
-- store an optional reason, for a partial or combined payment that is not "not a tanda".
-- Safe to run more than once. Does not edit 014.

begin;

alter table public.pending_review add column if not exists round_timing text;
alter table public.pending_review add column if not exists dismiss_reason text;

alter table public.pending_review drop constraint if exists pending_review_round_timing_check;
alter table public.pending_review add constraint pending_review_round_timing_check
  check (round_timing is null or round_timing in ('early', 'on_time', 'after_deadline', 'late'));

-- 014 created the two-argument function. A third argument with a default would be a
-- second overload, and a two-argument call would then be ambiguous. Replace it.
drop function if exists public.confirm_zelle_match(uuid, uuid);

-- Confirm a review: mark the chosen member paid for the chosen round (paid_at = when the
-- email arrived, source = 'auto' because it was detected), close the review, and remember
-- the sender name as that member's payer alias. p_round, when set, is the round the admin
-- picked and replaces the round the scan stored.
-- SECURITY INVOKER: RLS (admins only) and the archived-cycle lock still apply.
create or replace function public.confirm_zelle_match(p_review uuid, p_member uuid, p_round uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_review  public.pending_review%rowtype;
  v_member  public.members%rowtype;
  v_payment public.payments%rowtype;
begin
  select * into v_review from public.pending_review where id = p_review for update;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if v_review.status <> 'pending' then
    raise exception 'This item was already handled' using errcode = '22023';
  end if;

  if p_round is not null then
    if not exists (select 1 from public.rounds where id = p_round and cycle_id = v_review.cycle_id) then
      raise exception 'That round is not in this cycle' using errcode = '22023';
    end if;
    update public.pending_review set round_id = p_round where id = p_review;
    v_review.round_id := p_round;
  end if;

  if v_review.round_id is null
     or not exists (select 1 from public.rounds where id = v_review.round_id and cycle_id = v_review.cycle_id) then
    raise exception 'This item has no round in its cycle to apply it to' using errcode = '22023';
  end if;

  select * into v_member from public.members
  where id = p_member and cycle_id = v_review.cycle_id and removed_at is null;
  if not found then
    raise exception 'That member is not in this cycle' using errcode = '22023';
  end if;

  select * into v_payment from public.payments
  where round_id = v_review.round_id and member_id = p_member
  for update;
  if not found then
    raise exception 'That member has no payment for this round' using errcode = '22023';
  end if;
  -- Only an exact amount can be confirmed here; partial or combined payments are marked by hand.
  if v_review.amount is distinct from v_payment.amount then
    raise exception 'The Zelle amount does not match this payment; mark it by hand instead' using errcode = '22023';
  end if;

  -- Already marked paid by hand: keep that record as it is.
  if v_payment.paid_at is null then
    update public.payments
    set paid_at = v_review.received_at, source = 'auto'
    where id = v_payment.id;
  end if;

  update public.pending_review
  set status = 'matched', suggested_member_id = p_member, resolved_at = now()
  where id = p_review;

  insert into public.payer_aliases (member_id, alias_name)
  values (p_member, v_review.sender_name)
  on conflict (member_id, alias_name) do nothing;
end;
$$;

revoke all on function public.confirm_zelle_match(uuid, uuid, uuid) from public;
revoke all on function public.confirm_zelle_match(uuid, uuid, uuid) from anon;
grant execute on function public.confirm_zelle_match(uuid, uuid, uuid) to authenticated;

commit;
