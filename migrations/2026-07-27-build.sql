-- Mighty migration, 27 Jul 2026
-- Paste this whole file into the Supabase SQL editor for project hplyyywdftnvjajyncvj
-- and run it. Everything is idempotent, so running it twice is safe.
--
-- It does three things:
--   a) prices assists per exchange instead of per call
--   b) adds the plans we actually sell (trial / starter / plus / pro)
--   c) adds the retrieval Discover needs over your own connections
--
-- This is also section 13 of supabase-setup.sql, which stays the canonical file.

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

