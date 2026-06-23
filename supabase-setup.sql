-- ============================================================
-- MIghTy — Supabase setup. Run ONCE in your project's SQL editor.
-- (Supabase dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

-- 1. Per-user data table: one JSONB blob per account.
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

-- ============================================================
-- Also in the dashboard (not SQL):
--   • Authentication → Providers → Email: ENABLED, "Confirm email" ON
--     (so only someone who controls the @mit.edu inbox can activate an account).
--   • Authentication → URL Configuration → Site URL: your GitHub Pages URL
--     (so confirmation / password-reset links point back to the app).
-- Then copy Project URL + anon public key into MIghTy → Settings → Supabase backend config.
-- ============================================================
