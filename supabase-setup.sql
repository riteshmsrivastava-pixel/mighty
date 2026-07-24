-- ============================================================
-- MIghTy — Supabase setup. Run ONCE in your project's SQL editor.
-- (Supabase dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

-- 1. Per-user data table: one JSONB blob per account (templates, sheet settings).
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Row-Level Security: each user can touch ONLY their own row.
alter table public.user_data enable row level security;

drop policy if exists "own row select" on public.user_data;
create policy "own row select" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "own row upsert" on public.user_data;
create policy "own row upsert" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.user_data;
create policy "own row update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Restrict sign-up to MIT addresses (mit.edu and any *.mit.edu subdomain).
--    Server-side guard — the client also checks, but this is the real gate.
create or replace function public.enforce_mit_email()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email !~* '@([a-z0-9-]+\.)*mit\.edu$' then
    raise exception 'Registration is limited to @mit.edu email addresses.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mit_email_trg on auth.users;
create trigger enforce_mit_email_trg
  before insert on auth.users
  for each row execute function public.enforce_mit_email();

-- 4. Outreach inbox — the browser extension writes shortlisted profiles and
--    send-confirmations here directly (one authenticated INSERT per event);
--    the app ingests + clears them. user_id defaults to the caller, so the
--    extension only ever needs to send {kind, payload}.
create table if not exists public.outreach_inbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'profile' check (kind in ('profile','sent_confirmation')),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.outreach_inbox enable row level security;

drop policy if exists "oi select own" on public.outreach_inbox;
create policy "oi select own" on public.outreach_inbox for select using (auth.uid() = user_id);
drop policy if exists "oi insert own" on public.outreach_inbox;
create policy "oi insert own" on public.outreach_inbox for insert with check (auth.uid() = user_id);
drop policy if exists "oi delete own" on public.outreach_inbox;
create policy "oi delete own" on public.outreach_inbox for delete using (auth.uid() = user_id);
-- no update policy — write-once / consume-once, same as the old watch_results table.

-- 5. Outreach log — the permanent ledger. One row per profile a student has
--    ever shortlisted or contacted. This is what the Google Sheet mirrors and
--    what the weekly-cap count is computed from.
create table if not exists public.outreach_log (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_url    text not null,
  name           text,
  title          text,
  company        text,
  message_sent   text,
  status         text not null default 'shortlisted'
                   check (status in ('shortlisted','sent','replied','do_not_contact','deferred')),
  shortlisted_at timestamptz not null default now(),
  sent_at        timestamptz,
  updated_at     timestamptz not null default now(),
  unique (user_id, profile_url)
);
alter table public.outreach_log enable row level security;

drop policy if exists "ol select own" on public.outreach_log;
create policy "ol select own" on public.outreach_log for select using (auth.uid() = user_id);
drop policy if exists "ol insert own" on public.outreach_log;
create policy "ol insert own" on public.outreach_log for insert with check (auth.uid() = user_id);
drop policy if exists "ol update own" on public.outreach_log;
create policy "ol update own" on public.outreach_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ol delete own" on public.outreach_log;
create policy "ol delete own" on public.outreach_log for delete using (auth.uid() = user_id);

-- 6. Weekly send cap — 100 profiles marked "sent" per student, per week.
--    Week = Monday 00:00 UTC through the following Monday 00:00 UTC, fixed
--    for everyone (not localized). This is a BACKSTOP, not an adversarial
--    wall: the app's UI is the primary guard (disables "Mark Sent" once the
--    count hits 100). This trigger only catches a buggy/stale client or a
--    misfiring extension listener from silently writing past the cap.
create or replace function public.enforce_weekly_send_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  week_start timestamptz;
  sent_count int;
begin
  if new.status = 'sent' and (old is null or old.status is distinct from 'sent') then
    week_start := date_trunc('week', (coalesce(new.sent_at, now()) at time zone 'utc')) at time zone 'utc';
    select count(*) into sent_count
      from public.outreach_log
      where user_id = new.user_id
        and status = 'sent'
        and sent_at >= week_start and sent_at < week_start + interval '7 days'
        and id <> coalesce(new.id, -1);
    if sent_count >= 100 then
      raise exception 'Weekly cap of 100 reached (resets Monday 00:00 UTC). Profile stays Shortlisted for next week.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_weekly_send_cap_trg on public.outreach_log;
create trigger enforce_weekly_send_cap_trg
  before insert or update on public.outreach_log
  for each row execute function public.enforce_weekly_send_cap();

-- ============================================================
-- Also in the dashboard (not SQL):
--   • Authentication → Providers → Email: ENABLED, "Confirm email" ON
--     (so only someone who controls the @mit.edu inbox can activate an account).
--   • Authentication → URL Configuration → Site URL: your GitHub Pages URL
--     (so confirmation / password-reset links point back to the app).
--   • Edge Functions → sheets-sync → Secrets: set GOOGLE_SERVICE_ACCOUNT_JSON
--     (see SETUP.md for how to create the service account).
-- Then copy Project URL + anon public key into MIghTy → Settings → Supabase backend config.
-- ============================================================
