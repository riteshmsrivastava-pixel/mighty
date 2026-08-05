-- ============================================================
-- Demo unlock — run this in the Supabase SQL editor.
--
-- Plan changes deliberately cannot be made from the browser: user_plans has a
-- select-own policy and no insert/update/delete policy at all, so the only way
-- in is the service role. That is the correct design (a user must never be able
-- to grant themselves a plan), which is why this is a SQL file and not a button.
--
-- There are five separate guards in the gateway that can each refuse an Assist.
-- Clearing only the plan would still leave four of them able to stop a live
-- demo mid-draft, so all five are handled below.
-- ============================================================

-- ---- 1. Highest plan, and a trial date far enough out that G2b never fires.
--
-- 'pro' is the top tier: 120 assists/month and 500 relationships. paused_at is
-- cleared too, since a paused account is refused regardless of plan.
insert into public.user_plans (user_id, plan, trial_ends_at)
select id, 'pro', now() + interval '365 days'
  from auth.users
 where email = 'rmohans@mit.edu'
on conflict (user_id) do update
   set plan          = 'pro',
       trial_ends_at = now() + interval '365 days',
       paused_at     = null,
       updated_at    = now();

-- ---- 2. A top-up balance on top of the monthly allowance.
--
-- The monthly ceiling is (plan allowance + topup_assists), and top-ups never
-- expire. This matters because assists already spent this month still count
-- against the new 120 — the counter is not reset by changing plan. 500 here is
-- simply "cannot run out during a demo".
update public.user_plans
   set topup_assists = 500,
       updated_at    = now()
 where user_id = (select id from auth.users where email = 'rmohans@mit.edu');

-- ---- 3. The three remaining guards, which are global config rather than
--         per-user, and would otherwise still bite.
--
--   free_daily_assists       G3b, default 30/day  — the one most likely to hit
--                            during a demo doing repeated live drafting
--   free_daily_calls         G3a, default 200/day — caps free features
--                            (briefs, Ask Mighty), which a demo leans on
--   user_monthly_budget_usd  G6, default $15/month per user
--   daily_company_budget_usd G7, default $20/day across all accounts. Over
--                            this, Sonnet features silently downgrade to Haiku
--                            and Opus features are refused outright — so a
--                            demo could quietly get worse output without any
--                            visible error.
--
-- These are project-wide, not per-user. On a project with one real account that
-- is a distinction without a difference, but it is worth knowing before running
-- this against a project with live users on it.
update public.ai_config
   set free_daily_assists       = 500,
       free_daily_calls         = 5000,
       user_monthly_budget_usd  = 200,
       daily_company_budget_usd = 200
 where id = 1;

-- ---- 4. Confirm it took. Expect: plan 'pro', topup 500, and a month_assists
--         number well under 620 (120 allowance + 500 top-up).
select p.plan,
       p.topup_assists,
       p.trial_ends_at,
       p.paused_at,
       (select coalesce(sum(assists), 0)
          from public.ai_call_log
         where user_id = p.user_id
           and cache_hit = false
           and created_at >= date_trunc('month', now() at time zone 'utc')) as assists_used_this_month,
       120 + p.topup_assists as monthly_ceiling
  from public.user_plans p
 where p.user_id = (select id from auth.users where email = 'rmohans@mit.edu');
