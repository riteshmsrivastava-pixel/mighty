// ============================================================
// MIghTy — Shared AI proxy Edge Function.
// Holds ONE Anthropic API key server-side so students never see, manage, or
// pay for their own key — every AI feature (drafting, briefings, coffee-chat
// extraction, follow-up drafts) routes through this function, authenticated
// by the student's own Supabase session. A per-student daily cap bounds
// cohort-wide cost; there is no other rate limiting or abuse control here on
// purpose — keep this function simple, tune DAILY_LIMIT if cost runs high.
//
// Deploy:
//   1. supabase functions new ai-proxy   (then replace its index.ts with this file)
//   2. supabase functions deploy ai-proxy
//   3. supabase secrets set ANTHROPIC_API_KEY='sk-ant-...'
//      (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected automatically)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY     = Deno.env.get("ANTHROPIC_API_KEY")!;
const DAILY_LIMIT = 50;
const DEFAULT_MODEL = "claude-sonnet-4-6";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* no body */ }
  const { system, user: userPrompt, maxTokens, model } = body;
  if (!system || !userPrompt) return json({ ok: false, error: "bad_request", message: "system and user are required." }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  // Atomic increment-and-return via a Postgres function — avoids a
  // check-then-write race between concurrent requests from the same student.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: count, error: usageErr } = await admin.rpc("increment_ai_usage", { p_user_id: user.id });
  if (usageErr) return json({ ok: false, error: "usage_error", message: usageErr.message }, 500);
  if ((count as number) > DAILY_LIMIT) {
    return json({ ok: false, error: "rate_limited", message: `Daily AI limit reached (${DAILY_LIMIT}/day) — try again tomorrow.` });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, max_tokens: maxTokens || 900, system, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!res.ok) { const t = await res.text(); return json({ ok: false, error: "anthropic_error", message: t.slice(0, 300) }, 502); }
    const data = await res.json();
    const text = (data.content || []).map((c: any) => c.text || "").join("");
    return json({ ok: true, text });
  } catch (e) {
    return json({ ok: false, error: "proxy_error", message: String((e as Error)?.message || e) }, 500);
  }
});
