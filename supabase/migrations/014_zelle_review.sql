-- Zelle payment detection (Phase 5).
-- scan-zelle-email writes one pending_review row per Zelle "you received" email. It never
-- touches payments. The admin confirms each row with Match, which calls confirm_zelle_match:
-- that is the only place a detected payment becomes paid, and only after a person chose it.
-- Safe to run more than once.

begin;

alter table public.pending_review add column if not exists gmail_message_id text;
alter table public.pending_review add column if not exists round_id uuid references public.rounds (id) on delete cascade;
alter table public.pending_review add column if not exists match_reason text;
-- The verified bank domain the email came from (only allowlisted, DKIM/DMARC-passing senders are queued).
alter table public.pending_review add column if not exists email_from text;
create unique index if not exists pending_review_gmail_message_id on public.pending_review (gmail_message_id);

-- Confirm a review: mark the chosen member paid for the review's round (paid_at = when the
-- email arrived, source = 'auto' because it was detected), close the review, and remember the
-- sender name as that member's payer alias so the next email from them is suggested.
-- SECURITY INVOKER: RLS (admins only) and the archived-cycle lock still apply.
create or replace function public.confirm_zelle_match(p_review uuid, p_member uuid)
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

revoke all on function public.confirm_zelle_match(uuid, uuid) from public;
revoke all on function public.confirm_zelle_match(uuid, uuid) from anon;
grant execute on function public.confirm_zelle_match(uuid, uuid) to authenticated;

commit;
