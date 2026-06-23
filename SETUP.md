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
**Refresh runs on desktop**, in your own logged-in browser, via the **Claude for Chrome** extension — that's how it reads Touchstone-protected pages without ever storing your MIT password. Click **Refresh** → copy the generated brief into Claude for Chrome → paste the JSON it returns back into MIghTy. (Mobile/web shows the last desktop sync, read-only.)

## Deploy
`./deploy.sh` copies `~/mighty.html` → `index.html`, commits, and pushes (add a GitHub remote first).

## Scope
- **Stores only what you put in** — readings, reps, your watch list, the summaries you/your agent record.
- **No MIT records, no Canvas, no grades, no MIT password.** That keeps it clear of the FERPA / institutional-review wall.
- Visa items track **dates only** — not advice. For rules, see the ISO.
