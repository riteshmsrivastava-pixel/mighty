# MIghTy — setup

A single static file (`index.html`). Works two ways, and the backend is **optional**.

## Run it (no backend) — guest mode
Open `index.html` as a Claude artifact, or host it (GitHub Pages). Works immediately; data lives in that browser. Add an Anthropic API key in **Settings** (or run as an artifact for zero-config Claude).

## Turn on accounts + cross-device sync (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase-setup.sql`](supabase-setup.sql) → **Run**. This creates the per-user table, row-level security, and the `@mit.edu`-only sign-up rule.
3. **Authentication → Providers → Email**: enabled, **Confirm email ON**.
4. **Authentication → URL Configuration → Site URL**: your GitHub Pages URL.
5. In MIghTy → **Settings → Account & sync → Supabase backend config**: paste your **Project URL** and **anon public key** (Project Settings → API). These are public/safe — RLS protects the data.
6. **Sign in** (top right) → create your `@mit.edu` account → confirm via email → your work now syncs.

## MIT Watch (the dashboard)
Pick the MIT pages you check constantly (starter set + your own). Each carries a "what to watch for."
**Refresh runs on desktop**, in your own logged-in browser, via the **Claude for Chrome** extension — that's how it reads Touchstone-protected pages without ever storing your MIT password.

- **Signed in → auto write-back:** click **Refresh** → copy the brief into Claude for Chrome → it visits your links and POSTs the findings straight to your account → click **Watch for results** and they apply automatically (no copy-paste). The brief carries a short-lived token scoped to your own row.
- **Local / fallback:** paste the JSON the agent returns back into the modal.
- Mobile/web shows the last desktop sync, read-only.

### Optional: auto-check PUBLIC pages on a schedule
Login pages must stay in-browser, but `needsLogin: false` pages can be checked server-side on a cron. Deploy [`edge-public-watch.ts`](edge-public-watch.ts) as a Supabase Edge Function (instructions in its header), then schedule it daily:

```sql
-- enable once: extensions pg_cron + pg_net (Database → Extensions)
select cron.schedule('mighty-public-watch','0 12 * * *', $$
  select net.http_post(
    url:='https://<project-ref>.functions.supabase.co/public-watch',
    headers:=jsonb_build_object('Authorization','Bearer <your-anon-or-service-key>')
  );
$$);
```
Results land in the same inbox and show up next time the app syncs.

## Deploy
`./deploy.sh` copies `~/mighty.html` → `index.html`, commits, and pushes (add a GitHub remote first).

## Scope
- **Stores only what you put in** — readings, reps, your watch list, the summaries you/your agent record.
- **No MIT records, no Canvas, no grades, no MIT password.** That keeps it clear of the FERPA / institutional-review wall.
- Visa items track **dates only** — not advice. For rules, see the ISO.
