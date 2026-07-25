// ============================================================
// MIghTy — AI Gateway (Edge Function, deployed as "ai-proxy").
//
// One entry point for EVERY Claude call in the product. It:
//   1. routes each feature to the cheapest capable model (Haiku/Sonnet/Opus),
//   2. returns a cached answer when the same input was seen before (free),
//   3. enforces guardrails: per-user daily + monthly assist caps, a per-user
//      monthly $ ceiling, and a company-wide daily $ budget,
//   4. logs user/feature/model/tokens/cost/latency/cache for every call.
//
// The one Anthropic key lives here server-side; students never see or manage it.
// Budget knobs live in the public.ai_config table — retune them in the SQL
// editor without redeploying this function.
//
// Deploy:
//   1. supabase functions new ai-proxy   (replace its index.ts with this file)
//   2. supabase functions deploy ai-proxy
//   3. supabase secrets set ANTHROPIC_API_KEY='sk-ant-...'
//      (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY     = Deno.env.get("ANTHROPIC_API_KEY")!;

// ---- Model IDs. Verify these against your Anthropic account and adjust here
//      in ONE place if they differ; nothing else references raw model names. ----
const MODELS = {
  haiku:  "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus:   "claude-opus-4-8",
};

// ---- Pricing per 1M tokens (USD), [input, output]. Estimates for budget math —
//      directionally right is enough; cost only drives the $ guardrails + ledger.
//      Update if pricing changes. ----
const PRICING: Record<string, [number, number]> = {
  [MODELS.haiku]:  [1, 5],
  [MODELS.sonnet]: [3, 15],
  [MODELS.opus]:   [15, 75],
};

// ---- Feature registry: the single source of truth for model routing + cost
//      tier + whether the answer is cacheable. "AI should think, not calculate"
//      — everything here needs reasoning; anything mechanical stays in SQL/JS and
//      never reaches this function. ----
type Tier = "low" | "medium" | "high";
interface FeatureDef { model: string; tier: Tier; cache: boolean; }
const FEATURES: Record<string, FeatureDef> = {
  // Tier 1 — user-facing reasoning, Sonnet.
  profile_briefing:    { model: MODELS.sonnet, tier: "low",    cache: true  },
  draft_message:       { model: MODELS.sonnet, tier: "low",    cache: false },
  meeting_prep:        { model: MODELS.sonnet, tier: "high",   cache: true  },
  daily_plan:          { model: MODELS.sonnet, tier: "medium", cache: true  },
  // Extraction/classification — cheap, Haiku.
  coffee_extract:      { model: MODELS.haiku,  tier: "medium", cache: false },
  tagging:             { model: MODELS.haiku,  tier: "low",    cache: false },
  resume_extract:      { model: MODELS.sonnet, tier: "medium", cache: false },
  // Tier 2 — reasoning, Sonnet.
  relationship_health: { model: MODELS.sonnet, tier: "medium", cache: true  },
  intro_suggestion:    { model: MODELS.sonnet, tier: "medium", cache: false },
  followup_timing:     { model: MODELS.sonnet, tier: "low",    cache: false },
  network_search:      { model: MODELS.sonnet, tier: "medium", cache: false },
  // Tier 3 — rare, heavy, Opus.
  deep_network_report: { model: MODELS.opus,   tier: "high",   cache: true  },
};
const DEFAULT_FEATURE = "draft_message";

// Assist "weight" per tier — what the client can show as "Uses N MIghTy Assists"
// and what counts against the daily/monthly assist caps.
const TIER_WEIGHT: Record<Tier, number> = { low: 1, medium: 2, high: 5 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function estCost(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] || [3, 15];
  return (inTok / 1e6) * p[0] + (outTok / 1e6) * p[1];
}
// Small, stable content hash for the cache key (FNV-1a → hex).
function hashKey(...parts: string[]): string {
  let h = 0x811c9dc5;
  const s = parts.join(" ");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* no body */ }
  const { system, user: userPrompt, maxTokens } = body;
  const feature: string = FEATURES[body.feature] ? body.feature : DEFAULT_FEATURE;
  if (!system || !userPrompt) {
    return json({ ok: false, error: "bad_request", message: "system and user are required." }, 400);
  }

  // ---- auth: identify the caller from their own Supabase session ----
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const def = FEATURES[feature];
  const weight = TIER_WEIGHT[def.tier];

  // ---- G2: cache hit? (content-addressed by feature+model+prompt) ----
  const cacheKey = def.cache ? hashKey(feature, def.model, system, userPrompt) : "";
  if (cacheKey) {
    const { data: hit } = await admin.from("ai_cache").select("response").eq("cache_key", cacheKey).maybeSingle();
    if (hit && hit.response) {
      await admin.rpc("ai_record_call", {
        p_user_id: user.id, p_feature: feature, p_model: def.model, p_tier: def.tier,
        p_in: 0, p_out: 0, p_cost: 0, p_cache_hit: true, p_latency: 0,
      });
      return json({ ok: true, text: hit.response, meta: { model: def.model, tier: def.tier, cached: true, assists: 0 } });
    }
  }

  // ---- precheck: one round-trip for all counters + budgets + plan ----
  const { data: pc, error: pcErr } = await admin.rpc("ai_precheck", { p_user_id: user.id });
  if (pcErr) return json({ ok: false, error: "usage_error", message: pcErr.message }, 500);
  const cfg = (pc?.config) || { daily_company_budget_usd: 20, free_daily_assists: 30, explorer_monthly_assists: 25, builder_monthly_assists: 300, user_monthly_budget_usd: 15 };
  const plan       = pc?.plan || "explorer";
  const dayCount   = Number(pc?.day_count || 0);
  const monthCount = Number(pc?.month_count || 0);
  const userMonth$ = Number(pc?.user_month_cost || 0);
  const company$   = Number(pc?.company_day_cost || 0);

  // Per-plan monthly assist cap (Explorer/Builder/Leader). Leader = unlimited.
  const PLAN_LABEL: Record<string, string> = { explorer: "Explorer", builder: "Builder", leader: "Leader" };
  const monthlyCap = plan === "leader" ? Infinity
    : plan === "builder" ? Number(cfg.builder_monthly_assists ?? 300)
    : Number(cfg.explorer_monthly_assists ?? 25);

  // ---- G3: per-user daily abuse guard (skipped for Leader) ----
  if (plan !== "leader" && dayCount + weight > Number(cfg.free_daily_assists)) {
    return json({ ok: false, error: "rate_limited", scope: "daily", message: `Daily AI limit reached (${cfg.free_daily_assists}/day). Resets tomorrow.` });
  }
  // ---- G4: per-plan monthly assist cap ----
  if (monthCount + weight > monthlyCap) {
    const up = plan === "explorer" ? " Upgrade to Builder for more." : "";
    return json({ ok: false, error: "rate_limited", scope: "monthly", plan, message: `You've used all ${monthlyCap} MIghTy Assists in your ${PLAN_LABEL[plan] || plan} plan this month.${up}` });
  }
  // ---- G6: per-user monthly $ ceiling ----
  if (userMonth$ >= Number(cfg.user_monthly_budget_usd)) {
    return json({ ok: false, error: "rate_limited", scope: "user_budget", message: "You've hit this month's AI budget on your account." });
  }

  // ---- G7: company-wide daily $ budget. Over budget → downgrade to Haiku for
  //      low/medium features, refuse the expensive (high-tier) ones outright. ----
  let model = def.model;
  const overBudget = company$ >= Number(cfg.daily_company_budget_usd);
  if (overBudget) {
    if (def.tier === "high") {
      return json({ ok: false, error: "budget_paused", message: "Heavy AI features are paused for today (daily budget reached). Try again tomorrow." });
    }
    model = MODELS.haiku; // G8: the routing decision lives here, not in the app
  }

  // ---- run it ----
  const t0 = Date.now();
  let data: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens || 900, system, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!res.ok) { const t = await res.text(); return json({ ok: false, error: "anthropic_error", message: t.slice(0, 300) }, 502); }
    data = await res.json();
  } catch (e) {
    return json({ ok: false, error: "proxy_error", message: String((e as Error)?.message || e) }, 500);
  }
  const latency = Date.now() - t0;
  const text = (data.content || []).map((c: any) => c.text || "").join("");
  const inTok  = data.usage?.input_tokens  || 0;
  const outTok = data.usage?.output_tokens || 0;
  const cost   = estCost(model, inTok, outTok);

  // ---- log + cache ----
  await admin.rpc("ai_record_call", {
    p_user_id: user.id, p_feature: feature, p_model: model, p_tier: def.tier,
    p_in: inTok, p_out: outTok, p_cost: cost, p_cache_hit: false, p_latency: latency,
  });
  if (cacheKey && text) {
    await admin.from("ai_cache").upsert({ cache_key: cacheKey, feature, model, response: text }, { onConflict: "cache_key" });
  }

  return json({
    ok: true, text,
    meta: {
      model, tier: def.tier, cached: false, assists: weight, plan,
      assistsLeftMonth: monthlyCap === Infinity ? null : Math.max(0, monthlyCap - monthCount - weight),
      downgraded: overBudget,
    },
  });
});
