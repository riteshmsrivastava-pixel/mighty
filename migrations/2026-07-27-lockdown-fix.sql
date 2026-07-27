-- Mighty migration 3, 27 Jul 2026. Small, and it fixes my own mistake in migration 2.
--
-- Paste into the Supabase SQL editor for hplyyywdftnvjajyncvj. Idempotent.
--
-- Migration 2 said "anon loses it" about connections_match and connections_count
-- and then wrote:
--
--   revoke execute on function public.connections_match(...) from anon;
--
-- which did nothing. PUBLIC in Postgres is an implicit group that every role
-- belongs to, so anon held EXECUTE via PUBLIC and revoking it from anon directly
-- left the PUBLIC grant untouched. The privilege listing proved it: these two
-- came back as PUBLIC, authenticated, postgres, service_role, while the five
-- functions where migration 2 correctly said `from public, anon, authenticated`
-- came back as postgres, service_role only.
--
-- The same trap in one sentence: to take a privilege away you must revoke it from
-- wherever it was granted, and the default grant is always to PUBLIC.
--
-- Severity, honestly: low. Both functions are `security invoker` and filter on
-- auth.uid(), so an anon caller gets 0 and an empty array rather than anyone's
-- data - which is exactly what probing them returned. This is unnecessary
-- surface area rather than a leak. Worth closing anyway, because an endpoint that
-- exists for no reason is one somebody has to reason about later.

revoke execute on function public.connections_match(text[], text[], int) from public, anon;
revoke execute on function public.connections_count() from public, anon;

grant execute on function public.connections_match(text[], text[], int) to authenticated, service_role;
grant execute on function public.connections_count() to authenticated, service_role;

-- Proof. Both rows should now read authenticated, postgres, service_role - with
-- no PUBLIC and no anon. authenticated MUST stay: the browser calls these two
-- with the signed-in user's JWT, and Discover breaks without them.
select p.proname,
       coalesce(array_agg(distinct a.grantee::text order by a.grantee::text)
                filter (where a.privilege_type = 'EXECUTE'), '{}') as can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join information_schema.routine_privileges a
         on a.specific_schema = n.nspname
        and a.routine_name = p.proname
 where n.nspname = 'public'
   and p.proname in ('connections_match','connections_count')
 group by p.proname
 order by p.proname;
