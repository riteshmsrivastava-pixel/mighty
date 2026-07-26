-- ============================================================
-- MIghTy - Supabase setup. Run ONCE in your project's SQL editor.
-- Safe to re-run any time (every statement is idempotent) - running this
-- again after a prior version migrates you forward cleanly.
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

-- 3. Sign-up is OPEN. There used to be a trigger here restricting registration
-- to @mit.edu addresses, enforced properly at the database level. It is removed
-- deliberately: Mighty is for founders, recruiters, investors and operators as
-- well as students, and an email-domain gate turned all of them away.
--
-- Abuse moved to where it actually costs money rather than where it is easy to
-- check. Assists are granted only once a LinkedIn profile has been claimed, and
-- a profile URL can be claimed by one account, so farming trials needs a new
-- real LinkedIn profile each time - and a profile with no history is useless
-- here, because there is nothing to import or enrich. Email addresses are free
-- and infinite; LinkedIn profiles worth having are neither.
--
-- Both statements are safe to run on a database that never had the trigger.
drop trigger if exists enforce_mit_email_trg on auth.users;
drop function if exists public.enforce_mit_email();

-- 4. Outreach inbox - the browser extension writes shortlisted profiles,
-- send-confirmations, and captured profile context here directly (one
-- authenticated INSERT per event); the app ingests + clears them.
-- user_id defaults to the caller, so the extension only ever needs to
-- send {kind, payload}.
create table if not exists public.outreach_inbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'profile' check (kind in ('profile','sent_confirmation','profile_context')),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.outreach_inbox enable row level security;

-- Bug fix for installs that ran an earlier version of this file: the check
-- constraint never allowed 'profile_context', so those inserts were silently
-- failing since the extension started sending that kind. Safe to re-run.
alter table public.outreach_inbox drop constraint if exists outreach_inbox_kind_check;
alter table public.outreach_inbox add constraint outreach_inbox_kind_check
  check (kind in ('profile','sent_confirmation','profile_context'));

drop policy if exists "oi select own" on public.outreach_inbox;
create policy "oi select own" on public.outreach_inbox for select using (auth.uid() = user_id);
drop policy if exists "oi insert own" on public.outreach_inbox;
create policy "oi insert own" on public.outreach_inbox for insert with check (auth.uid() = user_id);
drop policy if exists "oi delete own" on public.outreach_inbox;
create policy "oi delete own" on public.outreach_inbox for delete using (auth.uid() = user_id);
-- no update policy - write-once / consume-once, same as the old watch_results table.

-- 5. Outreach log - the permanent ledger. One row per profile a student has
-- ever shortlisted or contacted. This is the core pipeline record: the
-- Google Sheet mirrors it, the weekly cap is computed from it, and its
-- `status` drives the Pipeline board.
create table if not exists public.outreach_log (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_url    text not null,
  name           text,
  title          text,
  company        text,
  avatar_url     text,
  message_sent   text,
  status         text not null default 'prospect'
                   check (status in ('prospect','ready_to_contact','contacted','replied','coffee_chat','referral','interview','offer','do_not_contact')),
  priority       text not null default 'medium' check (priority in ('high','medium','low')),
  shortlisted_at timestamptz not null default now(),
  contacted_at   timestamptz,
  updated_at     timestamptz not null default now(),
 -- profile-page context cache (last capture wins - not a timeline, see outreach_events
 -- below), the cached AI briefing (career summary, school/grad/previous employer,
 -- conversation starters, why-contact reasons - all regenerated on demand, never
 -- automatic), the last AI draft, and free-form notes (the Drawer's Notes tab).
  context        jsonb,
  briefing       jsonb,
  ai_draft       text,
  notes          text,
  unique (user_id, profile_url)
);
alter table public.outreach_log enable row level security;

-- Migration for installs that ran an earlier version of this file - safe to
-- re-run (no-op on a fresh install). Covers every prior status value in one
-- pass regardless of which earlier version you're migrating from.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='outreach_log' and column_name='sent_at')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='outreach_log' and column_name='contacted_at') then
    alter table public.outreach_log rename column sent_at to contacted_at;
  end if;
end $$;
alter table public.outreach_log add column if not exists contacted_at timestamptz;
alter table public.outreach_log add column if not exists priority text not null default 'medium';
alter table public.outreach_log add column if not exists notes text;
alter table public.outreach_log add column if not exists context jsonb;
alter table public.outreach_log add column if not exists briefing jsonb;
alter table public.outreach_log add column if not exists ai_draft text;
alter table public.outreach_log add column if not exists avatar_url text;

alter table public.outreach_log drop constraint if exists outreach_log_status_check;
update public.outreach_log set status = 'prospect' where status in ('shortlisted','to_contact','deferred');
update public.outreach_log set status = 'contacted' where status = 'sent';
alter table public.outreach_log add constraint outreach_log_status_check
  check (status in ('prospect','ready_to_contact','contacted','replied','coffee_chat','referral','interview','offer','do_not_contact'));
alter table public.outreach_log alter column status set default 'prospect';

alter table public.outreach_log drop constraint if exists outreach_log_priority_check;
update public.outreach_log set priority = 'medium' where priority is null or priority not in ('high','medium','low');
alter table public.outreach_log add constraint outreach_log_priority_check check (priority in ('high','medium','low'));

drop policy if exists "ol select own" on public.outreach_log;
create policy "ol select own" on public.outreach_log for select using (auth.uid() = user_id);
drop policy if exists "ol insert own" on public.outreach_log;
create policy "ol insert own" on public.outreach_log for insert with check (auth.uid() = user_id);
drop policy if exists "ol update own" on public.outreach_log;
create policy "ol update own" on public.outreach_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ol delete own" on public.outreach_log;
create policy "ol delete own" on public.outreach_log for delete using (auth.uid() = user_id);

-- 6. Outreach events - the relationship timeline. A "reply" event also flips
-- the parent row's status to 'replied' (done client-side via the same
-- update used for status changes). A "stage_change" event is logged on
-- every Pipeline move (drag-drop, dropdown, drawer action) so the Timeline
-- tab is real history, not synthesized from the current stage.
create table if not exists public.outreach_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_id      bigint not null references public.outreach_log(id) on delete cascade,
  event_type  text not null check (event_type in
                ('connection_request','first_message','reply','coffee_chat','note','referral','interview','stage_change')),
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
 -- structured coffee-chat capture (personal details/promises mentioned) or a
 -- {from,to} pair for stage_change events. Populated at insert time only -
 -- there's no update policy on this table, so this is set before the row is written.
  extracted             jsonb,
  suggested_next_touch  timestamptz
);
alter table public.outreach_events enable row level security;

alter table public.outreach_events add column if not exists extracted jsonb;
alter table public.outreach_events add column if not exists suggested_next_touch timestamptz;

alter table public.outreach_events drop constraint if exists outreach_events_event_type_check;
alter table public.outreach_events add constraint outreach_events_event_type_check
  check (event_type in ('connection_request','first_message','reply','coffee_chat','note','referral','interview','stage_change'));

drop policy if exists "oe select own" on public.outreach_events;
create policy "oe select own" on public.outreach_events for select using (auth.uid() = user_id);
drop policy if exists "oe insert own" on public.outreach_events;
create policy "oe insert own" on public.outreach_events for insert with check (auth.uid() = user_id);
drop policy if exists "oe delete own" on public.outreach_events;
create policy "oe delete own" on public.outreach_events for delete using (auth.uid() = user_id);
-- no update policy - timeline entries are corrected by delete + reinsert, not edited in place.

create index if not exists outreach_events_log_id_idx on public.outreach_events(log_id);
create index if not exists outreach_events_user_type_idx on public.outreach_events(user_id, event_type);

-- 6b. Community insights - opt-in, anonymous, aggregated. Written ONLY by the
-- scheduled edge-community-stats.ts function using the service-role key
-- (which bypasses RLS entirely - that's why there's no insert/update policy
-- for any other role below). Enforces a k-anonymity floor of >=3 distinct
-- contributing students per company before a row is even written; the app
-- additionally buckets every count in the UI layer rather than showing
-- raw numbers, so no individual student's activity can be singled out.
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

-- 6b2. AI usage - daily per-student counter for the shared AI proxy (see
-- edge-ai-proxy.ts). Students never see or manage an API key; the proxy
-- holds one server-side key and this table just bounds cohort-wide cost.
-- Only the edge function (service role, bypasses RLS) increments it -
-- students can read their own count but never write it directly.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "au select own" on public.ai_usage;
create policy "au select own" on public.ai_usage for select using (auth.uid() = user_id);
-- no insert/update/delete policy for any role - only the service-role key writes.

-- Atomic increment-and-return for the proxy's rate check - avoids a
-- check-then-write race between concurrent requests from the same student.
create or replace function public.increment_ai_usage(p_user_id uuid)
returns int
language plpgsql
security definer
as $$
declare new_count int;
begin
  insert into public.ai_usage (user_id, day, count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- 6b-ii. AI GATEWAY - cost visibility + guardrails.
-- Every Claude call routes through the ai-proxy Edge Function, which:
-- · routes each feature to the cheapest capable model (Haiku/Sonnet/Opus),
-- · reuses a cached answer when the same input was seen before,
-- · logs user/feature/model/tokens/estimated-cost/latency/cache for every call,
-- · enforces per-user daily + monthly assist caps, a per-user monthly $ cap,
-- and a company-wide daily $ budget (over budget → downgrade or refuse).
-- The knobs live in ai_config so you can retune them without redeploying.

-- Tunable budget knobs (single row). Edit these values live in the SQL editor.
create table if not exists public.ai_config (
  id                       int primary key default 1 check (id = 1),
  daily_company_budget_usd numeric not null default 20, -- G7: whole-cohort daily ceiling
  free_daily_assists       int     not null default 30, -- G3: per-user/day abuse guard (all paid plans)
  free_monthly_assists     int     not null default 400, -- legacy flat monthly cap (superseded by per-plan below)
  user_monthly_budget_usd  numeric not null default 15 -- G6: per-user/month $ ceiling
);
insert into public.ai_config (id) values (1) on conflict (id) do nothing;
-- Per-plan monthly assist caps (Explorer/Builder/Leader). Added idempotently so
-- existing installs pick them up. Leader is unlimited (enforced in the gateway).
alter table public.ai_config add column if not exists explorer_monthly_assists int not null default 25;
alter table public.ai_config add column if not exists builder_monthly_assists  int not null default 300;
alter table public.ai_config enable row level security;
-- readable by any signed-in user (the app shows "assists left"); only service role writes.
drop policy if exists "aicfg select" on public.ai_config;
create policy "aicfg select" on public.ai_config for select using (auth.role() = 'authenticated');

-- Which plan each user is on. Defaults to Explorer (free). There is no payment
-- integration yet, so upgrades are set here manually (or by a future billing
-- webhook using the service-role key): update public.user_plans set plan='builder'
-- where user_id = '...';  Users can read their own plan but never change it.
create table if not exists public.user_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'explorer' check (plan in ('explorer','builder','leader')),
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
drop policy if exists "up select own" on public.user_plans;
create policy "up select own" on public.user_plans for select using (auth.uid() = user_id);
-- no insert/update/delete policy - plan changes go through the service role only.

-- One row per Claude call - the gateway's ledger. cache_hit rows cost $0.
create table if not exists public.ai_call_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  feature       text not null,
  model         text not null,
  tier          text,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  est_cost_usd  numeric not null default 0,
  cache_hit     boolean not null default false,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
create index if not exists ai_call_log_user_time on public.ai_call_log (user_id, created_at);
create index if not exists ai_call_log_time on public.ai_call_log (created_at);
alter table public.ai_call_log enable row level security;
drop policy if exists "acl select own" on public.ai_call_log;
create policy "acl select own" on public.ai_call_log for select using (auth.uid() = user_id);
-- no insert/update/delete policy - only the service-role edge function writes.

-- Content-addressed answer cache (G2). Keyed by a hash of feature+model+prompt;
-- the gateway reads/writes this with the service-role key (bypasses RLS).
create table if not exists public.ai_cache (
  cache_key  text primary key,
  feature    text,
  model      text,
  response   text not null,
  hits       int  not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.ai_cache enable row level security;
-- no policies at all - service role only.

-- Single round-trip precheck: current usage counters + budgets + config, so the
-- gateway makes one DB call before deciding whether/how to run a request.
create or replace function public.ai_precheck(p_user_id uuid)
returns json
language sql
security definer
as $$
  select json_build_object(
    'day_count',        (select count(*) from public.ai_call_log
                           where user_id = p_user_id and cache_hit = false
                             and created_at >= date_trunc('day',   now() at time zone 'utc')),
    'month_count',      (select count(*) from public.ai_call_log
                           where user_id = p_user_id and cache_hit = false
                             and created_at >= date_trunc('month', now() at time zone 'utc')),
    'user_month_cost',  coalesce((select sum(est_cost_usd) from public.ai_call_log
                           where user_id = p_user_id
                             and created_at >= date_trunc('month', now() at time zone 'utc')), 0),
    'company_day_cost', coalesce((select sum(est_cost_usd) from public.ai_call_log
                           where created_at >= date_trunc('day', now() at time zone 'utc')), 0),
    'plan',             coalesce((select plan from public.user_plans where user_id = p_user_id), 'explorer'),
    'config',           (select row_to_json(c) from public.ai_config c where id = 1)
  );
$$;

-- Append a call to the ledger (service role only).
create or replace function public.ai_record_call(
  p_user_id uuid, p_feature text, p_model text, p_tier text,
  p_in int, p_out int, p_cost numeric, p_cache_hit boolean, p_latency int)
returns void
language sql
security definer
as $$
  insert into public.ai_call_log
    (user_id, feature, model, tier, input_tokens, output_tokens, est_cost_usd, cache_hit, latency_ms)
  values
    (p_user_id, p_feature, p_model, p_tier, p_in, p_out, p_cost, p_cache_hit, p_latency);
$$;

-- 6c. Tasks - a lightweight standalone to-do list. Genuinely independent of
-- outreach_log (a task doesn't have to be about a specific contact), but
-- can optionally link to one (`log_id`) so the Drawer/People/Pipeline can
-- surface it. `due_date` is a plain date; "Today"/"This week" buckets are
-- derived client-side by comparing to the current date, not stored.
create table if not exists public.tasks (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label        text not null,
  sub          text,
  due_date     date,
  log_id       bigint references public.outreach_log(id) on delete set null,
  done         boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.tasks enable row level security;

drop policy if exists "tk select own" on public.tasks;
create policy "tk select own" on public.tasks for select using (auth.uid() = user_id);
drop policy if exists "tk insert own" on public.tasks;
create policy "tk insert own" on public.tasks for insert with check (auth.uid() = user_id);
drop policy if exists "tk update own" on public.tasks;
create policy "tk update own" on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tk delete own" on public.tasks;
create policy "tk delete own" on public.tasks for delete using (auth.uid() = user_id);

-- 7. Weekly send cap - 100 profiles marked contacted per student, per week.
-- Week = Monday 00:00 UTC through the following Monday 00:00 UTC, fixed
-- for everyone (not localized). This is a BACKSTOP, not an adversarial
-- wall: the app's UI is the primary guard. Keyed off `contacted_at` (set
-- once, first time only, never cleared by further pipeline progression) -
-- NOT off current `status`, because a status-based check would silently
-- drop someone from the week's count the moment they progress past
-- "contacted" to "replied"/"coffee_chat"/etc.
create or replace function public.enforce_weekly_send_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  week_start timestamptz;
  sent_count int;
begin
  if new.contacted_at is not null and (old is null or old.contacted_at is null) then
    week_start := date_trunc('week', (new.contacted_at at time zone 'utc')) at time zone 'utc';
    select count(*) into sent_count
      from public.outreach_log
      where user_id = new.user_id
        and contacted_at >= week_start and contacted_at < week_start + interval '7 days'
        and id <> coalesce(new.id, -1);
    if sent_count >= 100 then
      raise exception 'Weekly cap of 100 reached (resets Monday 00:00 UTC). Profile stays in Prospects for next week.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_weekly_send_cap_trg on public.outreach_log;
create trigger enforce_weekly_send_cap_trg
  before insert or update on public.outreach_log
  for each row execute function public.enforce_weekly_send_cap();

-- 8. Waitlist - captures interest from the public pricing page (Builder upgrade,
-- Teams). Anyone may INSERT (submit their email); nobody can read it back via
-- the API. You read entries in SQL:  select * from public.waitlist order by created_at desc;
create table if not exists public.waitlist (
  id         bigint generated always as identity primary key,
  email      text not null,
  plan       text, -- 'builder' | 'teams' | null
  source     text, -- where they signed up from
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
drop policy if exists "wl insert public" on public.waitlist;
create policy "wl insert public" on public.waitlist
  for insert to anon, authenticated
  with check (email is not null and length(email) between 3 and 200);
-- no select/update/delete policy - entries are visible only via the service role / SQL editor.

-- 9. Product events - the only instrumentation in the product, and deliberately
-- our own table rather than a third-party analytics service. We tell users that
-- nothing they write about a person leaves their account; shipping behavioural
-- data to a vendor a week later would make that untrue in spirit even if the
-- events looked harmless. Here it is subject to the same RLS, the same export
-- and the same delete path as everything else.
--
-- These events are COUNTS AND CATEGORIES ONLY. No names, no emails, no URLs, no
-- note text, ever. The client's track() enforces that structurally by dropping
-- any string that does not look like an enum value, so a leak needs someone to
-- defeat the sanitizer rather than merely forget the rule.
--
-- You read these in SQL, e.g. capture rate over the last 30 days:
--   select count(distinct user_id) filter (where event = 'capture_saved')::float
--        / nullif(count(distinct user_id), 0)
--   from public.app_events where created_at > now() - interval '30 days';
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event      text not null check (length(event) between 2 and 40),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_events_user_time_idx  on public.app_events (user_id, created_at desc);
create index if not exists app_events_event_time_idx on public.app_events (event, created_at desc);

alter table public.app_events enable row level security;
-- Insert-only from the client. A user may write and read their own rows, which
-- keeps the export path honest, but cannot update or delete a single event: the
-- funnel would stop meaning anything if rows could be rewritten. Deleting the
-- account removes them all via the cascade above, which is the real delete path.
drop policy if exists "ev insert own" on public.app_events;
create policy "ev insert own" on public.app_events
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "ev select own" on public.app_events;
create policy "ev select own" on public.app_events
  for select to authenticated using (auth.uid() = user_id);

-- ============================================================
-- Also in the dashboard (not SQL):
-- • Authentication → Providers → Email: ENABLED, "Confirm email" ON
-- (so only someone who controls the inbox can activate an account).
-- • Authentication → URL Configuration → Site URL: your GitHub Pages URL
-- (so confirmation / password-reset links point back to the app).
-- • Edge Functions → sheets-sync → Secrets: set GOOGLE_SERVICE_ACCOUNT_JSON
-- (see SETUP.md for how to create the service account).
-- • Edge Functions → community-stats: deploy + schedule via pg_cron (SETUP.md).
-- No secrets needed - it only reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
-- both injected automatically.
-- Then copy Project URL + anon public key into MIghTy → Settings → Supabase backend config.
-- ============================================================
