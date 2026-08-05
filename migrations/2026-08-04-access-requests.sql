-- Early-access requests.
--
-- Signup is deliberately NOT self-serve: the first cohort is meant to stay
-- small enough to actually talk to, so people ask, and accounts get created by
-- hand. This table is only the inbox for those asks.
--
-- What is NOT here, on purpose: a password column. A password the requester
-- chose would have to sit in this table in plaintext until someone got round
-- to creating the account, which is a real credential leak waiting for a
-- backup, a log line, or a stray select to find it. It also buys nothing:
-- accounts are created through Supabase Auth with a temporary password, and
-- the person changes it themselves from Account once they are in.
--
-- linkedin_url earns its place rather than being a nice-to-have. Mighty is
-- built on a LinkedIn export, so the profile URL is both the thing that makes
-- a request checkable before granting access, and the first thing the account
-- needs anyway.
create table if not exists public.access_requests (
  id           bigint generated always as identity primary key,
  name         text not null,
  email        text not null,
  linkedin_url text,
  affiliation  text,
  status       text not null default 'new' check (status in ('new','invited','declined')),
  created_at   timestamptz not null default now()
);

-- Older revision of this table shipped with a free-text note field; keep any
-- existing data addressable while the new columns become the ones in use.
alter table public.access_requests add column if not exists linkedin_url text;
alter table public.access_requests add column if not exists affiliation  text;

-- One row per email. A second request from the same person is not a new lead,
-- and without this a refresh-and-resubmit quietly fills the table.
create unique index if not exists access_requests_email_key
  on public.access_requests (lower(email));

alter table public.access_requests enable row level security;

-- Anonymous visitors may ask, and may do nothing else.
--
-- Insert only: no select policy exists, so the anon key cannot read the list
-- back. That matters more than it looks - without it, the publishable key in
-- the page source would let anyone enumerate every person who has asked for
-- access, which is exactly the kind of list that should not be public.
drop policy if exists "ar insert anon" on public.access_requests;
create policy "ar insert anon" on public.access_requests
  for insert to anon, authenticated with check (true);

-- Reading and triaging the list is service-role only (the Supabase dashboard,
-- or the query at the bottom of this file).
revoke all on public.access_requests from anon, authenticated;
grant insert on public.access_requests to anon, authenticated;

-- Cap what one insert can carry, so the form cannot be used to store arbitrary
-- payloads through the public key.
alter table public.access_requests drop constraint if exists access_requests_len_check;
alter table public.access_requests add constraint access_requests_len_check check (
  length(email) between 5 and 200
  and length(name) between 1 and 120
  and (linkedin_url is null or length(linkedin_url) <= 300)
  and (affiliation  is null or length(affiliation)  <= 160)
);

-- ---- Triage: who is waiting.
--   select name, email, linkedin_url, affiliation, created_at
--     from public.access_requests where status = 'new' order by created_at;
--
-- To invite someone: Supabase dashboard → Authentication → Users → Add user,
-- set a temporary password, send it to them, and they change it from Account
-- once they are in. Then:
--   update public.access_requests set status = 'invited' where lower(email) = lower('them@work.com');
