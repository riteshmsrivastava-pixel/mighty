-- Mighty migration 6, 6 Aug 2026. A hard ceiling on the size of the first
-- round, and a second way in for the people already holding a code.
--
-- Paste into the Supabase SQL editor for hplyyywdftnvjajyncvj. Idempotent.
-- Requires 2026-08-04-access-requests.sql to have run first.
--
-- The 4 Aug change closed self-serve signup and made access something granted
-- by hand off /request/. That keeps the round small by discipline: nothing
-- stops account 31 except somebody remembering not to create it. This adds the
-- ceiling itself, and once it is there a code becomes safe to hand out - the
-- worst a leaked one can do is fill seats that were going to be filled anyway.
--
-- Two doors, one counter:
--   * a code from this round, typed into /app/
--   * an access_request already marked 'invited', created by hand as before
-- Anything else is refused, including a raw POST to /auth/v1/signup - which is
-- why this lives on auth.users and not in the Gate component. app/index.html
-- ships the publishable key; a check in the browser is a message, not a lock.

create extension if not exists pgcrypto;

-- Codes are read off a message and retyped, so comparison ignores case and any
-- punctuation gained or lost on the way. Store the pretty form, compare bare.
create or replace function public.norm_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- One row per round, not one per person. uses is the seat counter and every
-- door decrements it, so "how many people are in" has a single answer.
create table if not exists public.invite_codes (
  code       text primary key,
  max_uses   int  not null default 30,
  uses       int  not null default 0,
  plan       text not null default 'pro',
  active     boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
-- No policies at all. Reading or editing a code needs the service role or the
-- SQL editor - the same stance as user_plans, where plan changes never go
-- through a client. Anonymous callers reach this table only through
-- invite_code_valid() below, which answers one boolean and nothing else.

-- Which seat, and how it was taken. Cascades with the user, so a deleted
-- tester leaves nothing behind here either.
create table if not exists public.invite_claims (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text not null references public.invite_codes(code),
  via        text not null default 'code' check (via in ('code','invited')),
  claimed_at timestamptz not null default now()
);
alter table public.invite_claims enable row level security;

-- Seed exactly one code, once. Re-running this file will not mint a second one
-- or reset the counter on the live one.
insert into public.invite_codes (code, max_uses, plan, note)
select 'MIGHTY-' || (
         select string_agg(
           substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + get_byte(b, i) % 32, 1), '')
         from (select gen_random_bytes(6) b) t, generate_series(0, 5) i
       ),
       30, 'pro', 'first round'
where not exists (select 1 from public.invite_codes);
-- 0/O and 1/I are absent from the alphabet on purpose: this gets read off a
-- screen and retyped, and those four are where that goes wrong. 32^6 leaves the
-- space around 1.07 billion, which matters because invite_code_valid() will
-- answer guesses from anyone holding the publishable key.

-- The gate. AFTER, not BEFORE: user_plans.user_id references auth.users(id), so
-- seeding a plan before the user row exists fails the foreign key. Raising here
-- still aborts the whole transaction, so a refused signup leaves no user, no
-- claim, and no spent seat.
create or replace function public.claim_invite_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := norm_invite_code(new.raw_user_meta_data ->> 'invite_code');
  v_via  text;
  v_plan text;
begin
  -- Door 1: a code from an open round. One statement, not SELECT-then-UPDATE.
  -- Concurrent signups serialise on this row, and under READ COMMITTED the
  -- blocked one re-evaluates uses < max_uses against the version the winner
  -- committed. Seat 31 always loses - but only because the read and the write
  -- are the same command; splitting them reintroduces the race.
  if v_code <> '' then
    update public.invite_codes
       set uses = uses + 1
     where norm_invite_code(code) = v_code
       and active
       and uses < max_uses
    returning code, plan into v_code, v_plan;
    v_via := 'code';
  end if;

  -- Door 2: someone triaged off /request/ and created by hand. Without this the
  -- trigger would refuse the dashboard's own Add user button and take the 4 Aug
  -- access flow down with it. Marking the request 'invited' is the approval, so
  -- it is also the credential - no second list to keep in step.
  if v_plan is null then
    update public.invite_codes
       set uses = uses + 1
     where active
       and uses < max_uses
       and exists (
         select 1 from public.access_requests r
          where lower(r.email) = lower(new.email)
            and r.status = 'invited')
    returning code, plan into v_code, v_plan;
    v_via := 'invited';
  end if;

  if v_plan is null then
    raise exception 'no seat: invite code missing, invalid, or this round is full'
      using errcode = 'check_violation';
  end if;

  insert into public.invite_claims (user_id, code, via) values (new.id, v_code, v_via);

  insert into public.user_plans (user_id, plan)
  values (new.id, v_plan)
  on conflict (user_id) do update set plan = excluded.plan, updated_at = now();

  return new;
end;
$$;

drop trigger if exists claim_invite_seat_trg on auth.users;
create trigger claim_invite_seat_trg
  after insert on auth.users
  for each row execute function public.claim_invite_seat();

-- Deleting a tester frees their seat. BEFORE, not AFTER: invite_claims cascades
-- off auth.users, so by the time an AFTER trigger ran there would be no row
-- left saying which round to credit.
create or replace function public.release_invite_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invite_codes c
     set uses = greatest(c.uses - 1, 0)
    from public.invite_claims k
   where k.user_id = old.id
     and k.code = c.code;
  return old;
end;
$$;

drop trigger if exists release_invite_seat_trg on auth.users;
create trigger release_invite_seat_trg
  before delete on auth.users
  for each row execute function public.release_invite_seat();

-- Message only, never the gate. A refused trigger reaches the browser as
-- "Database error saving new user", which tells a tester nothing, so the client
-- asks this first and prints a sentence instead. Returns a bare boolean: seats
-- remaining would be useful to show and is also exactly what someone
-- enumerating the code space would want to watch.
create or replace function public.invite_code_valid(p_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.invite_codes
     where norm_invite_code(code) = norm_invite_code(p_code)
       and active
       and uses < max_uses
  );
$$;
revoke all on function public.invite_code_valid(text) from public;
grant execute on function public.invite_code_valid(text) to anon, authenticated;

-- ---- Accounts that already exist keep their access and are not counted. The
-- trigger only fires on new rows, so running this locks nobody out. To start
-- the round from a true head count instead:
--   update public.invite_codes set uses = (select count(*) from auth.users);

-- ---- Running the round.
--   select code, uses, max_uses from public.invite_codes;   -- the code, seats left
--
--   select u.email, k.via, k.claimed_at                     -- who is in, by which door
--     from public.invite_claims k join auth.users u on u.id = k.user_id
--    order by k.claimed_at;
--
--   update public.invite_codes set max_uses = 50;           -- widen the round
--   update public.invite_codes set active = false;          -- close it, keep everyone in
--
-- ---- Inviting by hand off /request/ is unchanged, plus one line first:
--   update public.access_requests set status = 'invited' where lower(email) = lower('them@work.com');
--   -- then Authentication -> Users -> Add user, with a temporary password.
--
-- Creating an account for someone who never filled the form - yourself, say -
-- needs a row for the trigger to find:
--   insert into public.access_requests (name, email, status)
--   values ('You', 'you@work.com', 'invited');
--
-- ---- Confirm-email is on, so a seat is spent when the form is submitted, not
-- when the link is clicked. A mistyped address holds one indefinitely; sweeping
-- them credits each seat back through the delete trigger above:
--   delete from auth.users
--    where email_confirmed_at is null and created_at < now() - interval '48 hours';
