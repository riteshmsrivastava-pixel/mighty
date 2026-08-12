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

-- 3. Sign-up is BY INVITE, seat-limited. See section 15 for the mechanism.
--
-- There used to be a trigger here restricting registration to @mit.edu, and it
-- was removed deliberately: Mighty is for founders, recruiters, investors and
-- operators as well as students, and an email-domain gate turned all of them
-- away. The gate that replaced it asks a different question - not who you are,
-- but whether a seat is left in this test round.
--
-- Beyond the seat count, abuse is handled where it actually costs money rather
-- than where it is easy to check. Assists are granted only once a LinkedIn
-- profile has been claimed, and a profile URL can be claimed by one account, so
-- farming trials needs a new real LinkedIn profile each time - and a profile
-- with no history is useless here, because there is nothing to import or
-- enrich. Email addresses are free and infinite; LinkedIn profiles worth having
-- are neither.
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
  kind       text not null default 'profile' check (kind in ('profile','sent_confirmation','profile_context',
               'reply_detected','connection_accepted','profile_viewed')),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.outreach_inbox enable row level security;

-- Bug fix for installs that ran an earlier version of this file: the check
-- constraint never allowed 'profile_context', so those inserts were silently
-- failing since the extension started sending that kind. Safe to re-run.
--
-- 31 Jul 2026: added reply_detected / connection_accepted / profile_viewed -
-- the passive activity detection signals, read from LinkedIn's own messaging,
-- notifications and (Premium-only) profile-viewers pages while the user is
-- already there. See mighty-plan/reply-detection-spec.md.
alter table public.outreach_inbox drop constraint if exists outreach_inbox_kind_check;
alter table public.outreach_inbox add constraint outreach_inbox_kind_check
  check (kind in ('profile','sent_confirmation','profile_context',
                   'reply_detected','connection_accepted','profile_viewed'));

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

-- 10. Connections - the user's own LinkedIn connections export. A separate pool
-- from outreach_log on purpose: importing twenty thousand contacts into a tier
-- that caps *relationships* at fifty would either block the user immediately or
-- make the cap meaningless. These are never scored, never assisted, never
-- contacted. They exist to answer one question: of the people I already know,
-- which matter to what I am trying to do now, and which have gone quiet.
--
-- `connected_on` is the field that earns this table its place. It is the only
-- dormancy signal available anywhere in the product, and it is why a 19,928-row
-- import is worth having: 48% of that founder's network is 5+ years silent.
--
-- The archive is parsed IN THE BROWSER and only these columns are sent here. The
-- zip itself is also stored, in the archives bucket in section 11 - an earlier
-- draft of this comment claimed it never leaves the machine, which stopped being
-- true and was never much of a privacy win anyway: the rows below already carry
-- the same nineteen thousand names.
--
-- Unique on (user_id, profile_url) so re-importing a fresh export merges rather
-- than duplicating - the idempotency the plan requires.
create table if not exists public.connections (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_url  text not null,
  first_name   text,
  last_name    text,
  company      text,
  position     text,
  connected_on date,
  source       text not null default 'linkedin_archive',
  imported_at  timestamptz not null default now(),
  unique (user_id, profile_url)
);
create index if not exists connections_user_dormancy_idx on public.connections (user_id, connected_on);
create index if not exists connections_user_company_idx  on public.connections (user_id, company);

alter table public.connections enable row level security;
drop policy if exists "cx select own" on public.connections;
create policy "cx select own" on public.connections for select using (auth.uid() = user_id);
drop policy if exists "cx insert own" on public.connections;
create policy "cx insert own" on public.connections for insert with check (auth.uid() = user_id);
drop policy if exists "cx update own" on public.connections;
create policy "cx update own" on public.connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cx delete own" on public.connections;
create policy "cx delete own" on public.connections for delete using (auth.uid() = user_id);
-- Delete is granted deliberately: this table holds names and employers of people
-- who are not users and never agreed to be here, so the account holder must be
-- able to remove all of it in one action.

-- 11. The archive store - Mighty's knowledge base, user side.
--
-- The raw LinkedIn export is kept, not just the fields parsed out of it today.
-- The reason is that the parser will get better and the questions we ask of the
-- file will change, and re-deriving from a stored archive costs nothing while
-- asking someone to export again costs their goodwill. It is also the honest
-- shape of the thing: this is the user's own history, accumulating, and it is a
-- paid-tier asset rather than a transient upload.
--
-- An earlier draft of this parsed the archive in the browser and deliberately
-- did NOT store it, on the grounds that the zip never leaving the machine was a
-- strong privacy position. It was not. The derived rows in public.connections
-- carry the same nineteen thousand names and employers, so refusing to store the
-- source protected nobody while giving up the ability to re-derive. Storing it
-- is the better call, and it makes the consent copy simpler: we keep this, here
-- is why, you can delete it.
--
-- Cost is not a consideration: a 3.2 MB archive at ten thousand paid users is
-- about 34 GB, roughly seventy cents a month.
insert into storage.buckets (id, name, public)
  values ('archives', 'archives', false)
  on conflict (id) do nothing;

-- Objects are namespaced by user id as the first path segment: archives/<uid>/...
-- so the policies below give each account access to its own folder and nothing
-- else. Never make this bucket public: it holds message history containing both
-- sides of conversations with people who are not users.
drop policy if exists "arch read own" on storage.objects;
create policy "arch read own" on storage.objects for select to authenticated
  using (bucket_id = 'archives' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "arch write own" on storage.objects;
create policy "arch write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'archives' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "arch delete own" on storage.objects;
create policy "arch delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'archives' and (storage.foldername(name))[1] = auth.uid()::text);

-- 12. Import ledger - what was ingested, when, and what came out of it. Exists so
-- a re-import can be compared against the last one rather than guessed at, and so
-- "where did Mighty learn that" has an answer.
create table if not exists public.imports (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('linkedin_archive','resume','manual')),
  storage_path text,
  file_name    text,
  file_bytes   bigint,
  derived      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists imports_user_time_idx on public.imports (user_id, created_at desc);
alter table public.imports enable row level security;
drop policy if exists "im select own" on public.imports;
create policy "im select own" on public.imports for select using (auth.uid() = user_id);
drop policy if exists "im insert own" on public.imports;
create policy "im insert own" on public.imports for insert with check (auth.uid() = user_id);
drop policy if exists "im delete own" on public.imports;
create policy "im delete own" on public.imports for delete using (auth.uid() = user_id);

-- ============================================================
-- 13. The build of 27 Jul 2026 - assists priced per exchange, the new plans,
--     and the retrieval Discover needs.
--
-- Everything here is idempotent, so it is safe to paste over an existing
-- install. Also mirrored as migrations/2026-07-27-build.sql for that purpose.
-- ============================================================

-- 13a. Assists are priced per EXCHANGE, not per call.
--
-- One assist buys the brief, the draft, and all ten takes of a single outbound
-- exchange with one person. When they reply, answering is a new exchange and a
-- new assist, because it is new work. The gateway needs to know whether an
-- exchange has already been paid for, so the ledger carries the key.
--
-- Shape of the key: 'ex:<log_id>:<n>' where n increments each time a reply is
-- logged. It deliberately contains no name and no profile URL.
alter table public.ai_call_log add column if not exists exchange_key text;
create index if not exists ai_call_log_exchange_idx
  on public.ai_call_log (user_id, exchange_key) where exchange_key is not null;

-- The ledger records what a call actually cost in assists, so the number the user
-- sees and the number we charge come from the same column instead of being
-- re-derived from the tier in two places. Added before the function below,
-- which reads it: `language sql` bodies are parsed at creation time, so the
-- column has to exist first.
alter table public.ai_call_log add column if not exists assists int not null default 0;

-- Has this user already paid an assist for this exchange? Cache hits and
-- zero-weight (free) calls are excluded, so a free brief does not accidentally
-- mark the exchange as paid.
create or replace function public.ai_exchange_paid(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.ai_call_log
     where user_id = p_user_id
       and exchange_key = p_key
       and cache_hit = false
       and assists > 0
  );
$$;

-- Replaces the 9-argument version. Dropped explicitly rather than overloaded,
-- because an ambiguous ai_record_call is exactly the kind of thing that silently
-- writes to the wrong ledger for a month.
drop function if exists public.ai_record_call(uuid, text, text, text, int, int, numeric, boolean, int);
create or replace function public.ai_record_call(
  p_user_id uuid, p_feature text, p_model text, p_tier text,
  p_in int, p_out int, p_cost numeric, p_cache_hit boolean, p_latency int,
  p_assists int default 0, p_exchange_key text default null)
returns void
language sql
security definer
as $$
  insert into public.ai_call_log
    (user_id, feature, model, tier, input_tokens, output_tokens, est_cost_usd,
     cache_hit, latency_ms, assists, exchange_key)
  values
    (p_user_id, p_feature, p_model, p_tier, p_in, p_out, p_cost,
     p_cache_hit, p_latency, coalesce(p_assists,0), p_exchange_key);
$$;

-- 13b. The plans we actually sell: a 30-day trial, then Starter / Plus / Pro.
--
-- The old explorer/builder/leader values are kept in the check constraint on
-- purpose. Any existing row still validates, so this migration cannot fail
-- halfway on live data, and the gateway maps the legacy names onto the new caps.
alter table public.user_plans drop constraint if exists user_plans_plan_check;
alter table public.user_plans add constraint user_plans_plan_check
  check (plan in ('trial','starter','plus','pro','explorer','builder','leader'));
alter table public.user_plans alter column plan set default 'trial';
alter table public.user_plans add column if not exists trial_ends_at timestamptz;
alter table public.user_plans add column if not exists paused_at timestamptz;
-- Purchased assists never expire and stack on top of the monthly allowance,
-- which is why they are a balance on the account and not a monthly counter.
alter table public.user_plans add column if not exists topup_assists int not null default 0;

-- Monthly assist allowance and relationship cap per plan. Editable live.
alter table public.ai_config add column if not exists trial_monthly_assists   int not null default 10;
alter table public.ai_config add column if not exists starter_monthly_assists int not null default 30;
alter table public.ai_config add column if not exists plus_monthly_assists    int not null default 60;
alter table public.ai_config add column if not exists pro_monthly_assists     int not null default 120;
alter table public.ai_config add column if not exists trial_relationships     int not null default 50;
alter table public.ai_config add column if not exists starter_relationships   int not null default 100;
alter table public.ai_config add column if not exists plus_relationships      int not null default 200;
alter table public.ai_config add column if not exists pro_relationships       int not null default 500;

-- Give every existing account a trial that starts now rather than one that has
-- already expired, and make sure everyone has a row at all.
insert into public.user_plans (user_id, plan, trial_ends_at)
  select id, 'trial', now() + interval '30 days' from auth.users
  on conflict (user_id) do nothing;
update public.user_plans set trial_ends_at = now() + interval '30 days'
  where plan = 'trial' and trial_ends_at is null;

-- 13d. The caps count assists, not calls.
--
-- ai_precheck returned count(*) of rows, while the gateway compared that count
-- against a cap and then added the request's weight to it. So a two-assist call
-- consumed one from the monthly cap and a five-assist call also consumed one.
-- Now that every row records what it cost, the counters sum that column and the
-- two halves of the arithmetic finally agree.
--
-- day_calls is kept separately as the abuse guard for zero-cost features: Ask
-- Mighty is free, and free has to mean unmetered rather than unbounded.
alter table public.ai_config add column if not exists free_daily_calls int not null default 200;

create or replace function public.ai_precheck(p_user_id uuid)
returns json
language sql
security definer
as $$
  select json_build_object(
    'day_assists',      coalesce((select sum(assists) from public.ai_call_log
                           where user_id = p_user_id and cache_hit = false
                             and created_at >= date_trunc('day',   now() at time zone 'utc')), 0),
    'month_assists',    coalesce((select sum(assists) from public.ai_call_log
                           where user_id = p_user_id and cache_hit = false
                             and created_at >= date_trunc('month', now() at time zone 'utc')), 0),
    'day_calls',        (select count(*) from public.ai_call_log
                           where user_id = p_user_id and cache_hit = false
                             and created_at >= date_trunc('day',   now() at time zone 'utc')),
    'user_month_cost',  coalesce((select sum(est_cost_usd) from public.ai_call_log
                           where user_id = p_user_id
                             and created_at >= date_trunc('month', now() at time zone 'utc')), 0),
    'company_day_cost', coalesce((select sum(est_cost_usd) from public.ai_call_log
                           where created_at >= date_trunc('day', now() at time zone 'utc')), 0),
    'plan',             coalesce((select plan from public.user_plans where user_id = p_user_id), 'trial'),
    'trial_ends_at',    (select trial_ends_at from public.user_plans where user_id = p_user_id),
    'topup_assists',    coalesce((select topup_assists from public.user_plans where user_id = p_user_id), 0),
    'config',           (select row_to_json(c) from public.ai_config c where id = 1)
  );
$$;

-- 13e. The two caps that only existed in the client.
--
-- A cap the browser enforces is a suggestion. Both of these are the kind of
-- limit that decides what someone pays, so both belong in the database where a
-- crafted insert cannot walk past them.

-- How many relationships each plan allows. Reads ai_config so the numbers stay
-- editable in SQL without a deploy.
create or replace function public.plan_relationship_cap(p_plan text)
returns int
language sql
stable
as $$
  select case p_plan
    when 'pro'      then (select pro_relationships     from public.ai_config where id = 1)
    when 'leader'   then (select pro_relationships     from public.ai_config where id = 1)
    when 'plus'     then (select plus_relationships    from public.ai_config where id = 1)
    when 'builder'  then (select plus_relationships    from public.ai_config where id = 1)
    when 'starter'  then (select starter_relationships from public.ai_config where id = 1)
    when 'explorer' then (select starter_relationships from public.ai_config where id = 1)
    else                 (select trial_relationships   from public.ai_config where id = 1)
  end;
$$;

-- Refuse the insert that would take someone past their plan's cap.
--
-- The message matters as much as the refusal. The cap exists because a list of
-- five hundred names nobody remembers adding is worse than a list of fifty that
-- someone actually works, so the error says that rather than "limit reached".
create or replace function public.enforce_relationship_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  current_plan text;
  cap int;
  held int;
begin
  select coalesce(plan, 'trial') into current_plan
    from public.user_plans where user_id = new.user_id;
  cap := public.plan_relationship_cap(coalesce(current_plan, 'trial'));
  select count(*) into held from public.outreach_log where user_id = new.user_id;
  if held >= cap then
    raise exception
      'You are at % relationships, which is the cap on your plan. Close one out, or move up a plan.', cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_relationship_cap_trg on public.outreach_log;
create trigger enforce_relationship_cap_trg
  before insert on public.outreach_log
  for each row execute function public.enforce_relationship_cap();
-- Insert only. An update must never be blocked by the cap: someone already over
-- it (because a plan was downgraded) still has to be able to change a stage,
-- log a reply, or delete a row to get back under.

-- 13c. Retrieval over the user's own connections.
--
-- One function serves both jobs Discover has. The unasked ranking passes the
-- terms from the user's goal plus their own past employers; the open query box
-- passes the words the user typed. In both cases a row only comes back if
-- something actually matched, so Discover can never pad the list with people it
-- has no reason to suggest.
--
-- Honest about what this is: keyword retrieval over company, position and name.
-- It finds "Boston" and "investing" in "folks from Boston investing in
-- idea-stage sustainable companies". It does not understand "idea-stage".
-- Semantic retrieval needs embeddings over every row and is not this.
--
-- Sequential scan by design. At twenty thousand rows per user it is a few
-- milliseconds; if a user ever arrives with two hundred thousand connections
-- this is the thing that needs replacing, not tuning.
create or replace function public.connections_match(
  p_terms         text[],
  p_own_companies text[] default '{}',
  p_limit         int    default 12)
returns table (
  id            bigint,
  profile_url   text,
  first_name    text,
  last_name     text,
  company       text,
  "position"    text,
  connected_on  date,
  years_silent  numeric,
  hits          text[],
  shared_company text,
  score         numeric)
language sql
stable
security invoker
as $$
  with logged as (
    select lower(profile_url) u
      from public.outreach_log
     where user_id = auth.uid() and profile_url is not null
  ),
  scored as (
    select c.id, c.profile_url, c.first_name, c.last_name, c.company,
           c."position", c.connected_on,
           round(extract(epoch from (now() - coalesce(c.connected_on::timestamptz, now())))
                 / 31557600.0, 1)::numeric as years_silent,
           -- Word-boundary match, not substring. \m and \M are Postgres's own
           -- word delimiters, so "ai" matches "AI-native" and "AI infrastructure"
           -- but not "Raiffeisen", and "pay" no longer matches "PayPal" - the
           -- exact false positive the extension's company parser already hit.
           (select array_agg(distinct t)
              from unnest(p_terms) t
             where length(t) >= 2
               and lower(coalesce(c.company,'') || ' ' || coalesce(c."position",'') || ' ' ||
                         coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
                   ~ ('\m' || lower(t) || '\M')
           ) as hits,
           (select oc from unnest(p_own_companies) oc
             where lower(coalesce(c.company,'')) = lower(oc) limit 1) as shared_company
      from public.connections c
     where c.user_id = auth.uid()
       and lower(coalesce(c.profile_url,'')) not in (select u from logged)
  )
  select id, profile_url, first_name, last_name, company, "position", connected_on,
         years_silent,
         coalesce(hits, '{}'::text[]) as hits,
         shared_company,
         ( coalesce(array_length(hits, 1), 0) * 3.0
         + case when shared_company is not null then 2.0 else 0.0 end
         + least(coalesce(years_silent, 0), 8.0) * 0.25 )::numeric as score
    from scored
   where hits is not null or shared_company is not null
   order by score desc, years_silent desc nulls last
   limit greatest(least(p_limit, 50), 1);
$$;

-- How many connections were imported, for the "out of N" line in Discover.
-- A count(*) over the user's own rows, so it cannot leak anyone else's.
create or replace function public.connections_count()
returns int
language sql
stable
security invoker
as $$
  select count(*)::int from public.connections where user_id = auth.uid();
$$;


-- ============================================================
-- 14. Function privileges.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and this schema never
-- revoked it. Four of the functions above are `security definer`, so they run as
-- their owner and bypass RLS: the publishable anon key was enough to read the
-- whole ai_config and to insert rows into ai_call_log as the table owner. That
-- last one defeated the metering entirely - a crafted row could lock a user out
-- of their plan, trip the company-wide budget for everyone, or mark an exchange
-- as paid and get free drafts.
--
-- Found by probing the live project with the public key on 27 Jul 2026, after the
-- migration that added them. Fixed here and in
-- migrations/2026-07-27-lockdown.sql.
-- ============================================================

-- ---- 1. The gateway's internals: service_role only ----
--
-- revoke from public first: revoking from anon and authenticated alone leaves
-- the PUBLIC grant in place, and PUBLIC covers both.
revoke execute on function public.ai_precheck(uuid)      from public, anon, authenticated;
revoke execute on function public.ai_exchange_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.ai_record_call(uuid, text, text, text, int, int, numeric, boolean, int, int, text)
  from public, anon, authenticated;
revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;

grant execute on function public.ai_precheck(uuid)      to service_role;
grant execute on function public.ai_exchange_paid(uuid, text) to service_role;
grant execute on function public.ai_record_call(uuid, text, text, text, int, int, numeric, boolean, int, int, text)
  to service_role;
grant execute on function public.increment_ai_usage(uuid) to service_role;

-- ---- 2. Helpers with no legitimate caller outside the database ----
--
-- plan_relationship_cap is read by the enforce_relationship_cap trigger. Trigger
-- functions do not require the acting user to hold EXECUTE, so revoking here
-- does not break the cap.
revoke execute on function public.plan_relationship_cap(text) from public, anon, authenticated;
grant  execute on function public.plan_relationship_cap(text) to service_role;

-- ---- 3. What the browser legitimately calls ----
--
-- These two are `security invoker` and filter on auth.uid(), so they were never
-- a leak: an anon caller gets 0 and an empty array, which is exactly what the
-- probe returned. authenticated must keep EXECUTE or Discover stops working.
-- anon loses it because an unauthenticated caller has no business here at all.
-- from public, NOT from anon. PUBLIC is an implicit group containing every role,
-- so anon holds EXECUTE through it and revoking from anon alone is a no-op - a
-- mistake made in the first version of this and caught by reading the privilege
-- listing rather than trusting the statement.
revoke execute on function public.connections_match(text[], text[], int) from public, anon;
revoke execute on function public.connections_count() from public, anon;
grant  execute on function public.connections_match(text[], text[], int) to authenticated, service_role;
grant  execute on function public.connections_count() to authenticated, service_role;

-- ---- 4. Stop the default from coming back ----
--
-- Everything above fixes the functions that exist today. This stops the next
-- function anyone adds from arriving world-executable, which is the actual bug:
-- the default, not any individual mistake.
alter default privileges in schema public revoke execute on functions from public;

-- ============================================================
-- 14b. Early-access requests (from the 4 Aug 2026 migration, folded in here so
-- a fresh project gets it - section 15 below reads this table to decide whether
-- a hand-made account is one somebody actually approved).
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

-- ============================================================
-- 15. A hard ceiling on the first round, and a second way in (6 Aug 2026).
--
-- Section 3 above stopped being "sign-up is open" in two steps: the 4 Aug
-- change closed self-serve and made access something granted by hand off
-- /request/, and this adds the ceiling that keeps the round small whether or
-- not anyone remembers to stop inviting. Two doors - a code, or an
-- access_request marked 'invited' - and one seat counter behind both.
--
-- It lives on auth.users rather than in the Gate component because
-- app/index.html ships the publishable key: /auth/v1/signup answers with or
-- without our JavaScript in front of it. See
-- migrations/2026-08-06-invite-code-gate.sql for the operator notes.
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

-- 15. Close the ai-proxy race: a burst of concurrent requests (a double-clicked
-- regenerate, a retry-on-timeout bug, or a scripted call with a valid JWT) used
-- to all call ai_precheck, all read the same pre-burst sums, and all pass the
-- same cap - because the only write, ai_record_call, happens after Anthropic
-- answers, seconds later. A lock cannot close this: it would have to span the
-- Anthropic round-trip, holding a connection open for the length of an external
-- HTTP call, which is worse than the race it fixes. So the reservation is a row
-- instead, inserted before the call and confirmed or released after - the same
-- "check and write are one statement" idea claim_invite_seat already uses,
-- adapted to a gateway that cannot do both halves in one transaction because a
-- slow external call sits in between.
--
-- ai_precheck's sums already have no cache_hit/pending filter, so a reserved
-- row counts against day_assists/month_assists/day_calls/user_month_cost/
-- company_day_cost the instant it is inserted - every cap the gateway already
-- checks tightens for free, with no change to ai_precheck or to the gateway's
-- own guard comparisons.
alter table public.ai_call_log add column if not exists pending boolean not null default false;

create or replace function public.ai_reserve_call(
  p_user_id uuid, p_feature text, p_model text, p_tier text,
  p_assists int, p_est_cost numeric, p_exchange_key text default null)
returns bigint
language sql
security definer
as $$
  insert into public.ai_call_log
    (user_id, feature, model, tier, input_tokens, output_tokens, est_cost_usd,
     cache_hit, latency_ms, assists, exchange_key, pending)
  values
    (p_user_id, p_feature, p_model, p_tier, 0, 0, p_est_cost,
     false, 0, coalesce(p_assists,0), p_exchange_key, true)
  returning id;
$$;

-- Confirm with the real numbers once Anthropic has actually answered. Feature,
-- model, tier, assists and exchange_key were already correct at reserve time
-- and do not change here.
create or replace function public.ai_confirm_call(
  p_id bigint, p_in int, p_out int, p_cost numeric, p_latency int)
returns void
language sql
security definer
as $$
  update public.ai_call_log
     set input_tokens = p_in, output_tokens = p_out, est_cost_usd = p_cost,
         latency_ms = p_latency, pending = false
   where id = p_id;
$$;

-- Release a reservation the call never got to keep - Anthropic erroring, a
-- timeout, a network failure. Without this every failed call would still count
-- against the caps it was checked against, which is what ai_record_call already
-- did before this change (it was simply never invoked on the failure paths, so
-- failed calls silently cost nothing AND reserved nothing - this restores the
-- second half now that reserving exists).
create or replace function public.ai_release_call(p_id bigint)
returns void
language sql
security definer
as $$
  delete from public.ai_call_log where id = p_id and pending = true;
$$;

revoke execute on function public.ai_reserve_call(uuid, text, text, text, int, numeric, text) from public, anon, authenticated;
revoke execute on function public.ai_confirm_call(bigint, int, int, numeric, int) from public, anon, authenticated;
revoke execute on function public.ai_release_call(bigint) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(uuid, text, text, text, int, numeric, text) to service_role;
grant execute on function public.ai_confirm_call(bigint, int, int, numeric, int) to service_role;
grant execute on function public.ai_release_call(bigint) to service_role;

-- Known residual gap, accepted rather than missed: if the edge function's
-- process is killed outright between reserving and either confirming or
-- releasing (not a caught error - an actual platform-level kill, which request
-- timeouts and network failures above are not), the reservation row is
-- orphaned: pending stays true forever. Effect is small and bounded, not
-- unbounded - one call's worth of assists/cost, and ai_precheck's day/month
-- date filters age it out of every cap within one day or month on their own.
-- The one permanent effect is ai_exchange_paid, which has no date filter, so an
-- orphaned row permanently marks that one exchange as already paid - a
-- user-favorable bug (a free retry that looks like an already-spent assist),
-- not an overcharge. A sweep to expire old pending rows would close this
-- fully; not built now because the failure mode it guards against is rare and
-- the exposure per occurrence is one call, not a growing one.

-- 16. people-search had no budget backstop at all, unlike every other external
-- API call in this codebase - Google's Custom Search free tier is 100
-- searches/day for the whole project, not per user, and nothing tracked
-- that shared ceiling. Simpler than ai_call_log's reserve/confirm pair above:
-- a search costs one fixed unit of quota regardless of outcome, so this needs
-- only a flat atomic counter, one global row instead of one per user.
create table if not exists public.people_search_usage (
  day   date primary key,
  count int  not null default 0
);
alter table public.people_search_usage enable row level security;
-- No policies at all, on purpose: nothing needs to read this from the client,
-- and only the service-role edge function ever touches it.

-- Claims one unit of today's search budget. Check and write are one
-- statement - same reason claim_invite_seat does it that way - so concurrent
-- callers serialise on this row instead of racing to read the same
-- pre-burst count. Returns false once the cap is hit; RETURNING INTO a
-- variable comes back null when the UPDATE's WHERE skips the row (the cap
-- was already reached), so coalesce is what turns "no row" into "false"
-- rather than an unhandled null.
create or replace function public.claim_people_search(p_daily_cap int)
returns boolean
language plpgsql
security definer
as $$
declare
  v_ok boolean;
begin
  insert into public.people_search_usage (day, count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set count = public.people_search_usage.count + 1
  where public.people_search_usage.count < p_daily_cap
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.claim_people_search(int) from public, anon, authenticated;
grant execute on function public.claim_people_search(int) to service_role;

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
