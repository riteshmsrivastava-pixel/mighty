-- ============================================================
-- Google connector: "Connect Google" instead of a Takeout upload.
--
-- Run this whole file in the Supabase SQL editor. Safe to re-run.
--
-- WHY A TABLE AND NOT THE SETTINGS BLOB
-- A Google refresh token is a standing key to somebody's mailbox, calendar
-- and address book, valid until revoked. It must never be reachable from the
-- browser, which rules out user_data.data (the client reads that whole blob).
-- So it lives here, with RLS on and NO policy granting anon or authenticated
-- anything at all - only the service role, i.e. only the google-sync Edge
-- Function, can see this table. A leaked publishable key gets nothing.
--
-- The user still gets to see and control the connection: everything safe to
-- show (which scopes were granted, when it last synced, the Google account
-- address) is mirrored into their settings blob by the function, and
-- google_connection_status below is a security-definer read of the non-secret
-- columns for anything that needs it fresh.
-- ============================================================

create table if not exists public.google_tokens (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  google_email   text,
  google_sub     text,
  -- The long-lived one. Google only ever hands this over on the first consent
  -- with prompt=consent + access_type=offline, so a re-connect that comes back
  -- without one must NOT overwrite a good stored token with null - see the
  -- coalesce in google-sync's upsert.
  refresh_token  text not null,
  -- Cached so a sync inside the hour skips the refresh round trip.
  access_token   text,
  access_expires timestamptz,
  -- Exactly what the user agreed to, as Google reports it back - not what we
  -- asked for. A user can untick individual scopes on the consent screen, and
  -- the sync has to skip what it was not granted rather than error.
  scopes         text[] not null default '{}',
  connected_at   timestamptz not null default now(),
  last_sync_at   timestamptz,
  last_sync_err  text,
  -- Rolling counters, so the app can say what the last sync actually did.
  last_sync_stats jsonb
);

alter table public.google_tokens enable row level security;

-- Deliberately no policies. RLS with zero policies denies everything to anon
-- and authenticated; the service role bypasses RLS entirely. Adding a
-- "users can read their own row" policy here would expose refresh_token to
-- anyone holding the publishable key and a session.
do $$
begin
  execute 'revoke all on public.google_tokens from anon, authenticated';
end $$;

comment on table public.google_tokens is
  'Google OAuth refresh tokens. Service-role only - never expose to the client. See migrations/2026-08-10-google-connector.sql.';

-- Non-secret view of the connection, for the client. Security definer so it
-- can read the table the caller cannot, and it never selects refresh_token or
-- access_token.
create or replace function public.google_connection_status()
returns table (
  google_email    text,
  scopes          text[],
  connected_at    timestamptz,
  last_sync_at    timestamptz,
  last_sync_err   text,
  last_sync_stats jsonb
)
language sql
security definer
set search_path = public
as $$
  select g.google_email, g.scopes, g.connected_at, g.last_sync_at, g.last_sync_err, g.last_sync_stats
  from public.google_tokens g
  where g.user_id = auth.uid();
$$;

revoke all on function public.google_connection_status() from public, anon;
grant execute on function public.google_connection_status() to authenticated;

-- Disconnecting has to be something the user can do themselves, without an
-- Edge Function round trip and without ever reading the token. Security
-- definer, scoped to their own row by auth.uid().
create or replace function public.google_disconnect()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.google_tokens where user_id = auth.uid();
$$;

revoke all on function public.google_disconnect() from public, anon;
grant execute on function public.google_disconnect() to authenticated;

-- The OAuth state parameter, so the redirect coming back from Google can be
-- proved to belong to the session that started it. One row per attempt, short
-- lived; the function deletes on use.
create table if not exists public.oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null default 'google',
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;

-- The client must be able to create its own state row (it starts the flow) but
-- must never read or alter anyone else's, and never read one back - a readable
-- state table would let a stolen publishable key harvest in-flight states.
drop policy if exists oauth_states_insert_own on public.oauth_states;
create policy oauth_states_insert_own on public.oauth_states
  for insert to authenticated
  with check (user_id = auth.uid());

create index if not exists oauth_states_created_idx on public.oauth_states(created_at);

-- Housekeeping: anything older than 15 minutes is a flow the user abandoned.
create or replace function public.prune_oauth_states()
returns void language sql security definer set search_path = public as $$
  delete from public.oauth_states where created_at < now() - interval '15 minutes';
$$;
revoke all on function public.prune_oauth_states() from public, anon;
grant execute on function public.prune_oauth_states() to authenticated;

-- Record the import alongside the LinkedIn zip and the mbox, so "where did
-- this data come from" has one answer.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='imports' and column_name='kind'
  ) then
    raise notice 'public.imports not found - skipping (nothing to alter).';
  end if;
end $$;
