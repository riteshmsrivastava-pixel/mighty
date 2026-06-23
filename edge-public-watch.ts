// ============================================================
// MIghTy — OPTIONAL scheduled checker for PUBLIC (no-login) MIT Watch pages.
// This is the only piece that needs a deployed server-side function. Everything
// else is the static app + the in-browser Chrome agent. Login-protected pages are
// NOT touched here (a server can't authenticate to MIT) — they stay in-browser.
//
// Deploy:
//   1. supabase functions new public-watch   (then replace its index.ts with this file)
//   2. supabase functions deploy public-watch
//   3. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//      (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)
//   4. Schedule it daily — see the pg_cron snippet at the bottom of SETUP.md.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6";

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);   // service role → can read every user, write results
  const { data: rows } = await sb.from("user_data").select("user_id,data");
  let touched = 0;

  for (const row of rows ?? []) {
    const items = (row.data?.watch?.items ?? []).filter((i: any) => !i.needsLogin && i.url);
    if (!items.length) continue;
    const payload: any[] = [];

    for (const it of items) {
      try {
        const html = await (await fetch(it.url)).text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 300,
            system: `Summarize ONLY what is relevant to: "${it.watchFor}". 1-2 sentences, include any dates. On a final line output exactly one word: ok, changed, or attention.`,
            messages: [{ role: "user", content: text }],
          }),
        });
        const j = await r.json();
        const out = (j.content?.[0]?.text ?? "").trim();
        const last = (out.split("\n").pop() || "").toLowerCase();
        const status = /attention/.test(last) ? "attention" : /changed/.test(last) ? "changed" : "ok";
        payload.push({ id: it.id, latest: out.replace(/\n?(ok|changed|attention)\s*$/i, "").trim(), status });
      } catch (_e) { /* skip a page that failed to fetch */ }
    }

    if (payload.length) { await sb.from("watch_results").insert({ user_id: row.user_id, payload }); touched++; }
  }
  return new Response(JSON.stringify({ ok: true, users: touched }), { headers: { "content-type": "application/json" } });
});
