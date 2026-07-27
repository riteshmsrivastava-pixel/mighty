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
           (select array_agg(distinct t)
              from unnest(p_terms) t
             where length(t) >= 3
               and position(lower(t) in
                     lower(coalesce(c.company,'') || ' ' || coalesce(c."position",'') || ' ' ||
                           coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))) > 0
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
