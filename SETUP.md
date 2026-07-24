# MIghTy — setup

A single static file (`index.html`). Works two ways, and the backend is **optional**.

## Run it (no backend) — guest mode
Open `index.html` as a Claude artifact, or host it (GitHub Pages). Works immediately for writing templates; data lives in that browser. Sign-in, the outreach log, the weekly cap, and Sheets sync all need the Supabase backend below.

## Turn on accounts + the outreach log (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase-setup.sql`](supabase-setup.sql) → **Run**. This creates the per-user settings table, the outreach inbox/log/events tables, the community-stats table, row-level security, the weekly-cap trigger, and the `@mit.edu`-only sign-up rule.
3. **Authentication → Providers → Email**: enabled, **Confirm email ON**.
4. **Authentication → URL Configuration → Site URL**: your GitHub Pages URL.
5. In MIghTy → **Settings → Account & sync → Supabase backend config**: paste your **Project URL** and **anon public key** (Project Settings → API). These are public/safe — RLS protects the data.
6. **Sign in** (top right) → create your `@mit.edu` account → confirm via email → your work now syncs.

## Turn on Google Sheets sync
1. In the [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a project → **APIs & Services → Library** → enable the **Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create service account**. No roles needed (Sheets access is granted by sharing the Sheet directly, not by IAM roles).
3. Open the new service account → **Keys → Add key → Create new key → JSON**. Download it.
4. Deploy the sync function:
   ```
   supabase functions new sheets-sync   # then replace its index.ts with edge-sheets-sync.ts
   supabase functions deploy sheets-sync
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<paste the entire downloaded JSON as one line>'
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)
5. Create a Google Sheet for your outreach log. In MIghTy → **Settings → Google Sheets sync**, paste the Sheet's URL (the ID is extracted automatically) and click **Get service-account email**.
6. Share the Sheet with that email as **Editor**.
7. In the **Log** tab, click **Sync to Google Sheet** — it writes a header row, then upserts by profile URL (a status change updates the existing row instead of duplicating it).

### Optional: sync on a schedule instead of only on-demand
```sql
-- enable once: extensions pg_cron + pg_net (Database → Extensions)
select cron.schedule('mighty-sheets-sync','0 */6 * * *', $$
  select net.http_post(
    url:='https://<project-ref>.functions.supabase.co/sheets-sync?all=1',
    headers:=jsonb_build_object('Authorization','Bearer <your-service-role-key>')
  );
$$);
```
This mode loops every student who has a Sheet ID configured, using the service role key (never expose that key client-side).

## Turn on anonymous community insights (optional)
Aggregates opted-in students' outreach by company (counts only — never names or messages) into a `community_stats` table any signed-in student can read. Requires no secrets, just the function deployed and scheduled:
```
supabase functions new community-stats   # then replace its index.ts with edge-community-stats.ts
supabase functions deploy community-stats
```
```sql
-- enable once: extensions pg_cron + pg_net (Database → Extensions)
select cron.schedule('mighty-community-stats','0 6 * * *', $$
  select net.http_post(
    url:='https://<project-ref>.functions.supabase.co/community-stats',
    headers:=jsonb_build_object('Authorization','Bearer <your-service-role-key>')
  );
$$);
```
It only writes a company's row once **at least 3 distinct students** have opted in and contributed to it (Settings → Community insights), and the app displays every number bucketed rather than exact — so no aggregate can be traced back to one student.

## The weekly cap (100 sends/week)
Enforced in the UI (the "Mark Sent" button disables once you hit 100) and backed by a Postgres trigger as a safety net. The week is Monday 00:00 UTC → the next Monday 00:00 UTC, the same for every student regardless of timezone. A profile that's over cap simply stays "Shortlisted" until the reset — nothing is ever dropped.

## The extension
See [`extension/INSTALL.md`](extension/INSTALL.md). It's human-in-the-loop by design — it never clicks Connect/Message for you, only reads pages you opened and logs sends you made yourself. Same Supabase project + `@mit.edu` login as the web app.

## Deploy
`./deploy.sh` copies `~/mighty.html` → `index.html`, commits, and pushes (add a GitHub remote first).

## Scope
- **Stores only what you put in** — templates, shortlisted profiles, profile context, messages sent, status, and the events you log (coffee chats, referrals, interviews, notes).
- **No LinkedIn password, ever.** The extension reads pages through your own logged-in browser session and only observes clicks you make — it never simulates one.
- Sign-up is restricted to `@mit.edu` addresses, same as the rest of MIghTy.
- Community insights are opt-in and aggregate-only — see above.
