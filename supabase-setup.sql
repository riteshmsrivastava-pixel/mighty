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
  status         text not null default 'to_contact'
                   check (status in ('to_contact','sent','replied','do_not_contact','deferred')),
  shortlisted_at timestamptz not null default now(),
  sent_at        timestamptz,
  updated_at     timestamptz not null default now(),
  -- profile-page context cache (last capture wins — not a timeline, see outreach_events below),
  -- and the cached AI briefing/draft generated from it. All regenerated on demand, never automatic.
  context        jsonb,
  briefing       jsonb,
  ai_draft       text,
  unique (user_id, profile_url)
);
alter table public.outreach_log enable row level security;

-- Migration for installs that ran an earlier version of this file with the old
-- 'shortlisted' status value — safe to re-run (no-op on a fresh install).
alter table public.outreach_log drop constraint if exists outreach_log_status_check;
update public.outreach_log set status = 'to_contact' where status = 'shortlisted';
alter table public.outreach_log add constraint outreach_log_status_check
  check (status in ('to_contact','sent','replied','do_not_contact','deferred'));
alter table public.outreach_log alter column status set default 'to_contact';
alter table public.outreach_log add column if not exists context jsonb;
alter table public.outreach_log add column if not exists briefing jsonb;
alter table public.outreach_log add column if not exists ai_draft text;

drop policy if exists "ol select own" on public.outreach_log;
create policy "ol select own" on public.outreach_log for select using (auth.uid() = user_id);
drop policy if exists "ol insert own" on public.outreach_log;
create policy "ol insert own" on public.outreach_log for insert with check (auth.uid() = user_id);
drop policy if exists "ol update own" on public.outreach_log;
create policy "ol update own" on public.outreach_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ol delete own" on public.outreach_log;
create policy "ol delete own" on public.outreach_log for delete using (auth.uid() = user_id);

-- 6. Outreach events — the relationship timeline. A "reply" event also flips
--    the parent row's status to 'replied' (done client-side via the same
--    update used for status changes); coffee_chat/referral/interview/note
--    events don't touch status — they're purely what the dashboard counts.
create table if not exists public.outreach_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_id      bigint not null references public.outreach_log(id) on delete cascade,
  event_type  text not null check (event_type in
                ('connection_request','first_message','reply','coffee_chat','note','referral','interview')),
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.outreach_events enable row level security;

drop policy if exists "oe select own" on public.outreach_events;
create policy "oe select own" on public.outreach_events for select using (auth.uid() = user_id);
drop policy if exists "oe insert own" on public.outreach_events;
create policy "oe insert own" on public.outreach_events for insert with check (auth.uid() = user_id);
drop policy if exists "oe delete own" on public.outreach_events;
create policy "oe delete own" on public.outreach_events for delete using (auth.uid() = user_id);
-- no update policy — timeline entries are corrected by delete + reinsert, not edited in place.

create index if not exists outreach_events_log_id_idx on public.outreach_events(log_id);
create index if not exists outreach_events_user_type_idx on public.outreach_events(user_id, event_type);

-- 6b. Community insights — opt-in, anonymous, aggregated. Written ONLY by the
--     scheduled edge-community-stats.ts function using the service-role key
--     (which bypasses RLS entirely — that's why there's no insert/update policy
--     for any other role below). Enforces a k-anonymity floor of >=3 distinct
--     contributing students per company before a row is even written; the app
--     additionally buckets every count in the UI layer rather than showing
--     raw numbers, so no individual student's activity can be singled out.
create table if not exists public.community_stats (
  company           text primary key,
  contributor_count int not null,
  outreach_count    int not null,
  reply_count       int not null,
  coffee_chat_count int not null,
  referral_count    int not null,
  interview_count   int not null,
  updated_at        timestamptz not null default now()
);
alter table public.community_stats enable row level security;
drop policy if exists "cs select all" on public.community_stats;
create policy "cs select all" on public.community_stats for select using (true);

-- 7. Weekly send cap — 100 profiles marked "sent" per student, per week.
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
      raise exception 'Weekly cap of 100 reached (resets Monday 00:00 UTC). Profile stays in To Contact for next week.';
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
--   • Edge Functions → community-stats: deploy + schedule via pg_cron (SETUP.md).
--     No secrets needed — it only reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
--     both injected automatically.
-- Then copy Project URL + anon public key into MIghTy → Settings → Supabase backend config.
-- ============================================================
