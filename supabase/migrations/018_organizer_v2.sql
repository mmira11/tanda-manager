-- Organizer v2: track when each member's link was sent, and give Grokbot a narrow key.
--
-- members.link_sent_at: set when the organizer taps Send link (or marks it sent).
--
-- bot_keys: one active key at a time. Only a SHA-256 hash is stored; the key itself is
-- shown once when it is made. Admins can see that a key exists, never the key.
-- A key can do exactly two things, through the functions below:
--   bot_round_status(key)              who is in the active cycle's current round and who has paid,
--                                      with first names and phones so the bot can text them
--   bot_mark_paid(key, slot, paid, round)  mark one member paid (or unpaid) for the current round,
--                                      or for a given round number of the active cycle
-- Nothing else: no archived cycles, no other tables, no deletes.
-- Safe to run more than once.

begin;

alter table public.members add column if not exists link_sent_at timestamptz;

create table if not exists public.bot_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null default 'Grokbot',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.bot_keys enable row level security;
drop policy if exists admin_read_bot_keys on public.bot_keys;
create policy admin_read_bot_keys on public.bot_keys
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: keys change only through create_bot_key / revoke_bot_keys.
revoke all on public.bot_keys from anon, authenticated;
grant select on public.bot_keys to authenticated;

-- True when p_key matches a key that has not been turned off.
create or replace function public.bot_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_key is not null and length(p_key) >= 32 and exists (
    select 1 from public.bot_keys
    where revoked_at is null
      and key_hash = encode(digest(p_key, 'sha256'), 'hex')
  );
$$;

-- Admin only. Turns off any current key and returns a new one. The caller must save it now.
create or replace function public.create_bot_key()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.bot_keys set revoked_at = now() where revoked_at is null;
  v_key := 'tbk_' || encode(gen_random_bytes(32), 'hex');
  insert into public.bot_keys (key_hash) values (encode(digest(v_key, 'sha256'), 'hex'));
  return v_key;
end;
$$;

-- Admin only. Turns off every key.
create or replace function public.revoke_bot_keys()
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.bot_keys set revoked_at = now() where revoked_at is null;
end;
$$;

-- The active cycle's current round (first round whose payout day is today or later in the
-- cycle's time zone, else the last round), or p_round when given.
create or replace function public.bot_pick_round(p_cycle uuid, p_round integer)
returns public.rounds
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_zone text;
  v_today date;
  v_round public.rounds%rowtype;
begin
  if p_round is not null then
    select * into v_round from public.rounds where cycle_id = p_cycle and round_number = p_round;
    if not found then
      raise exception 'no round %', p_round using errcode = 'P0002';
    end if;
    return v_round;
  end if;
  select coalesce(nullif(btrim(timezone), ''), 'America/Los_Angeles') into v_zone from public.cycles where id = p_cycle;
  v_today := (timezone(v_zone, now()))::date;
  select * into v_round from public.rounds
  where cycle_id = p_cycle and payout_date >= v_today order by round_number limit 1;
  if not found then
    select * into v_round from public.rounds where cycle_id = p_cycle order by round_number desc limit 1;
  end if;
  return v_round;
end;
$$;

create or replace function public.bot_round_status(p_key text, p_round integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
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
      )
    ) end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', m.slot,
        'first_name', m.display_first_name,
        'phone', m.phone,
        'language', m.language_pref,
        'paid', p.paid_at is not null,
        'is_recipient', m.id = v_round.recipient_member_id
      ) order by m.slot), '[]'::jsonb)
      from public.payments p
      join public.members m on m.id = p.member_id
      where p.round_id = v_round.id and m.removed_at is null
    )
  );
end;
$$;

create or replace function public.bot_mark_paid(p_key text, p_slot integer, p_paid boolean default true, p_round integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
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

  update public.payments
  set paid_at = case when coalesce(p_paid, true) then coalesce(paid_at, now()) else null end,
      source = case when coalesce(p_paid, true) then 'auto' else null end
  where round_id = v_round.id and member_id = v_member.id;
  if not found then
    raise exception '% does not pay in round %', v_member.display_first_name, v_round.round_number using errcode = 'P0002';
  end if;

  return public.bot_round_status(p_key, v_round.round_number);
end;
$$;

revoke all on function public.bot_key_ok(text) from public, anon, authenticated;
revoke all on function public.bot_pick_round(uuid, integer) from public, anon, authenticated;
revoke all on function public.create_bot_key() from public, anon;
revoke all on function public.revoke_bot_keys() from public, anon;
revoke all on function public.bot_round_status(text, integer) from public;
revoke all on function public.bot_mark_paid(text, integer, boolean, integer) from public;
grant execute on function public.create_bot_key() to authenticated;
grant execute on function public.revoke_bot_keys() to authenticated;
grant execute on function public.bot_round_status(text, integer) to anon, authenticated;
grant execute on function public.bot_mark_paid(text, integer, boolean, integer) to anon, authenticated;

commit;
