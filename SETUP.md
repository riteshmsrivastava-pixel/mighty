# MIghTy — setup (for whoever deploys this, not for students)

A single static file (`index.html`) plus a browser extension. **Students never see or configure anything technical** — they just sign in with their `@mit.edu` email. Every backend detail below (Supabase, AI) is a one-time step for you, the deployer, baked directly into the code.

## 1. Create the Supabase project
1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase-setup.sql`](supabase-setup.sql) → **Run**. This creates every table (per-user settings, outreach log/inbox/events, tasks, AI usage, community stats), row-level security, the weekly-cap trigger, and the `@mit.edu`-only sign-up rule. Safe to re-run any time.
3. **Authentication → Providers → Email**: enabled, **Confirm email ON**.
4. **Authentication → URL Configuration → Site URL**: your GitHub Pages URL.
5. **Project Settings → API**: copy the **Project URL** and **anon public key**.

## 2. Bake the connection into the app (no student-facing setup screen)
Open `index.html` and `extension/popup.js`, and fill in the two constants near the top of each:
```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci…';
```
These are public/safe to ship — row-level security is what actually protects each student's data. Once filled in, every visitor goes straight to the sign-in screen; there is no setup card, no manual config, ever.

## 3. Turn on AI (shared proxy — students never need their own key)
Every AI feature (drafting, briefings, coffee-chat extraction, follow-up drafts) routes through one Edge Function that holds **your** Anthropic key server-side, authenticated by each student's own session. A per-student daily cap (50 calls/day, tune it in the function if needed) bounds cohort-wide cost.
```
supabase functions new ai-proxy   # then replace its index.ts with edge-ai-proxy.ts
supabase functions deploy ai-proxy
supabase secrets set ANTHROPIC_API_KEY='sk-ant-...'
```
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.) Without this deployed, the app still works fully for tracking/pipeline/Sheets — every AI-powered button just shows a sign-in-required-style error instead.

## 4. Turn on Google Sheets sync (optional)
1. In the [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a project → **APIs & Services → Library** → enable the **Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create service account**. No roles needed (access is granted by sharing the Sheet directly).
3. Open the service account → **Keys → Add key → Create new key → JSON**. Download it.
4. Deploy:
   ```
   supabase functions new sheets-sync   # then replace its index.ts with edge-sheets-sync.ts
   supabase functions deploy sheets-sync
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<paste the entire downloaded JSON as one line>'
   ```
5. Each student creates their own Google Sheet, pastes its URL into **Settings → Google Sheets sync**, clicks **Get service-account email**, and shares the Sheet with that email as Editor.
6. Sync is on-demand only in this version (no scheduled cron) — students trigger it from the Log tab's sync action once wired into the UI, or you can add the `?all=1` cron mode following the same pattern as `edge-community-stats.ts` below.

## 5. Turn on anonymous community insights (optional)
Aggregates opted-in students' outreach by company (counts only, bucketed in the UI — never names or messages) into a `community_stats` table any signed-in student can read.
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
Only writes a company's row once **at least 3 distinct students** have opted in and contributed to it.

## 6. The pipeline model
`outreach_log.status` is one of: `prospect → ready_to_contact → contacted → replied → coffee_chat → referral → interview → offer`, plus a side status `do_not_contact`. The Pipeline tab is a drag-and-drop kanban across these 8 stages. The weekly cap (100/week, Monday 00:00 UTC reset) is keyed off `contacted_at` (set once, first time only) — not off current status — so a student doesn't silently fall out of the week's count as they progress through later stages.

## 7. The extension
See [`extension/INSTALL.md`](extension/INSTALL.md). Same baked-in Supabase project as the web app — students install it once and sign in with the same email/password, nothing else to configure. It's human-in-the-loop by design: it never clicks Connect/Message for you, and now also shows real match scores/context directly on LinkedIn (only for profiles already tracked in MIghTy — never a fabricated score for a stranger).

## Deploy
`./deploy.sh` copies `~/mighty.html` → `index.html`, commits, and pushes (add a GitHub remote first).

## Scope
- **Stores only what students put in** — templates, shortlisted profiles, profile context, messages sent, status, priority, notes, and the events they log (coffee chats, referrals, interviews, notes, stage changes).
- **No LinkedIn password, ever.** The extension reads pages through the student's own logged-in browser session and only observes clicks they make — it never simulates one.
- **No Anthropic key, ever, for students.** The shared proxy holds one key server-side; a daily cap bounds cost.
- Sign-up is restricted to `@mit.edu` addresses.
- Community insights are opt-in and aggregate-only — see above.
