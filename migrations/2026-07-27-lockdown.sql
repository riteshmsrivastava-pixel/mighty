-- Mighty migration 2, 27 Jul 2026. RUN THIS ONE NEXT.
--
-- Paste into the Supabase SQL editor for hplyyywdftnvjajyncvj and run it.
-- Idempotent. Nothing here changes behaviour for a signed-in user.
--
-- ============================================================
-- WHY: the gateway's own functions were callable by anybody
-- ============================================================
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and nothing in
-- this schema ever revoked it. Four of these functions are `security definer`,
-- which means they run as their owner and bypass RLS entirely. So the publishable
-- anon key - which is in the committed client code, correctly, because it is
-- meant to be public - was enough to call them directly, skipping the edge
-- function that is supposed to be the only caller.
--
-- Proven against the live project, not theorised:
--
--   POST /rest/v1/rpc/ai_precheck  {"p_user_id":"000...0"}
--     -> 200, and it returned the entire ai_config: every budget knob, every
--        per-plan cap. ai_config has an RLS policy limiting reads to
--        authenticated users, and `security definer` walked straight past it.
--        With a real user id it also returns that user's plan and usage.
--
--   POST /rest/v1/rpc/ai_record_call {...}
--     -> 409, foreign key violation. The ONLY thing that stopped the write was
--        that the user id was fake. A real one - and user ids are not secret,
--        every signed-in user knows their own - inserts arbitrary rows into
--        ai_call_log as the table owner.
--
-- That last one is the serious one, and it defeats today's metering three ways:
--
--   1. Insert rows with a large `assists` for someone else's user id and they
--      are locked out of their own plan for the month.
--   2. Insert rows with a large `est_cost_usd` and company_day_cost trips the
--      global daily budget, which downgrades every user to Haiku and refuses
--      high-tier features for everyone.
--   3. Insert a row with assists > 0 and a guessed exchange_key - the shape is
--      'ex:<log_id>:<n>' and log ids are sequential - and ai_exchange_paid then
--      reports that exchange as already paid. Free drafts.
--
-- The fix is not to make the functions cleverer. It is that these four have
-- exactly one legitimate caller, the ai-proxy edge function, which authenticates
-- with the service-role key. So only service_role should be able to execute
-- them, and PUBLIC should never have been able to.

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
revoke execute on function public.connections_match(text[], text[], int) from anon;
revoke execute on function public.connections_count() from anon;
grant  execute on function public.connections_match(text[], text[], int) to authenticated, service_role;
grant  execute on function public.connections_count() to authenticated, service_role;

-- ---- 4. Stop the default from coming back ----
--
-- Everything above fixes the functions that exist today. This stops the next
-- function anyone adds from arriving world-executable, which is the actual bug:
-- the default, not any individual mistake.
alter default privileges in schema public revoke execute on functions from public;

-- ---- 5. Proof, to run straight after ----
--
-- Should list ai_precheck, ai_record_call, ai_exchange_paid, increment_ai_usage
-- and plan_relationship_cap with service_role only, and connections_match and
-- connections_count with authenticated and service_role.
select p.proname,
       coalesce(array_agg(distinct a.grantee::text order by a.grantee::text)
                filter (where a.privilege_type = 'EXECUTE'), '{}') as can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join information_schema.routine_privileges a
         on a.specific_schema = n.nspname
        and a.routine_name = p.proname
 where n.nspname = 'public'
   and p.proname in ('ai_precheck','ai_record_call','ai_exchange_paid','increment_ai_usage',
                     'plan_relationship_cap','connections_match','connections_count')
 group by p.proname
 order by p.proname;
