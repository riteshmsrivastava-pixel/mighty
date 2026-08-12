// ============================================================
// MIghTy - AI Gateway (Edge Function, deployed as "ai-proxy").
//
// One entry point for EVERY Claude call in the product. It:
//   1. routes each feature to the cheapest capable model (Haiku/Sonnet/Opus),
//   2. returns a cached answer when the same input was seen before (free),
//   3. enforces guardrails: per-user daily + monthly assist caps, a per-user
//      monthly $ ceiling, and a company-wide daily $ budget,
//   4. logs user/feature/model/tokens/cost/latency/cache for every call.
//
// The one Anthropic key lives here server-side; students never see or manage it.
// Budget knobs live in the public.ai_config table - retune them in the SQL
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

// ---- Pricing per 1M tokens (USD), [input, output]. Estimates for budget math -
//      directionally right is enough; cost only drives the $ guardrails + ledger.
//      Update if pricing changes. ----
const PRICING: Record<string, [number, number]> = {
  [MODELS.haiku]:  [1, 5],
  [MODELS.sonnet]: [3, 15],
  [MODELS.opus]:   [15, 75],
};

// ---- Feature registry: the single source of truth for model routing + cost
//      tier + whether the answer is cacheable. "AI should think, not calculate"
// - everything here needs reasoning; anything mechanical stays in SQL/JS and
//      never reaches this function. ----
type Tier = "free" | "low" | "medium" | "high";
interface FeatureDef { model: string; tier: Tier; cache: boolean; }
const FEATURES: Record<string, FeatureDef> = {
  // Tier 0 - free. Two things must never carry a price.
  //
  // profile_briefing is free because the brief is how you decide someone is NOT
  // worth your time. Charging for it means charging people to say no, which
  // makes the honest answer the expensive one.
  //
  // network_search is Ask Mighty. It was Sonnet at tier "medium", which made a
  // question cost twice a draft: the first thing a new user does with the
  // product was also the most expensive thing they could do. Asking is
  // exploration. The meter belongs on what you send, not on what you wonder.
  profile_briefing:    { model: MODELS.sonnet, tier: "free",   cache: true  },
  network_search:      { model: MODELS.haiku,  tier: "free",   cache: false },
  // Tier 1 - user-facing reasoning, Sonnet.
  draft_message:       { model: MODELS.sonnet, tier: "low",    cache: false },
  meeting_prep:        { model: MODELS.sonnet, tier: "high",   cache: true  },
  daily_plan:          { model: MODELS.sonnet, tier: "medium", cache: true  },
  // Extraction/classification - cheap, Haiku.
  coffee_extract:      { model: MODELS.haiku,  tier: "medium", cache: false },
  tagging:             { model: MODELS.haiku,  tier: "low",    cache: false },
  resume_extract:      { model: MODELS.sonnet, tier: "medium", cache: false },
  // Tier 2 - reasoning, Sonnet.
  relationship_health: { model: MODELS.sonnet, tier: "medium", cache: true  },
  intro_suggestion:    { model: MODELS.sonnet, tier: "medium", cache: false },
  followup_timing:     { model: MODELS.sonnet, tier: "low",    cache: false },
  // Tier 3 - rare, heavy, Opus.
  deep_network_report: { model: MODELS.opus,   tier: "high",   cache: true  },
  // Rooms: turn a fetched conference page's raw text into a speaker list.
  // Haiku and cached - the same page parsed twice (two people on a team
  // both pasting the same conference link) should not be billed twice.
  event_extract:       { model: MODELS.haiku,  tier: "medium", cache: true  },
};
const DEFAULT_FEATURE = "draft_message";

// Bounds on a single call, independent of the cap/budget checks below. Those
// caps assume each call costs roughly what its tier implies; without this, one
// request with an inflated maxTokens or a giant pasted prompt could cost far
// more than its weight accounts for, before any cap even sees it.
const MAX_TOKENS_CAP = 4096;
const MAX_PROMPT_CHARS = 60000;

// Assist "weight" per tier - what the client shows as "Uses N Assists" and what
// counts against the monthly cap. free is 0 and is genuinely free: it is bounded
// by a daily call guard further down, never by the assist balance.
const TIER_WEIGHT: Record<Tier, number> = { free: 0, low: 1, medium: 2, high: 5 };

// ---- Plans. A 30-day trial, then Starter / Plus / Pro. ----
//
// The legacy explorer/builder/leader values still exist in the database, so they
// are mapped here rather than migrated away: a live account must not lose access
// because we renamed a tier.
const PLAN_LABEL: Record<string, string> = {
  trial: "trial", starter: "Starter", plus: "Plus", pro: "Pro",
  explorer: "Starter", builder: "Plus", leader: "Pro",
};
function monthlyAssists(plan: string, cfg: any): number {
  switch (plan) {
    case "pro": case "leader":     return Number(cfg.pro_monthly_assists     ?? 120);
    case "plus": case "builder":   return Number(cfg.plus_monthly_assists    ?? 60);
    case "starter": case "explorer": return Number(cfg.starter_monthly_assists ?? 30);
    default:                       return Number(cfg.trial_monthly_assists   ?? 10);
  }
}

// Browsers preflight every POST carrying Authorization/content-type. Without
// these headers the OPTIONS request fails and the app sees "Failed to fetch"
// long before anything reaches Anthropic - so CORS is not optional here.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* no body */ }
  const { system, user: userPrompt } = body;
  // An exchange is one outbound conversation with one person: the brief, the
  // draft, and every take of that draft. It is charged once. Shape is
  // 'ex:<log_id>:<n>', carrying no name and no profile URL.
  const exchangeKey: string | null =
    typeof body.exchangeKey === "string" && /^ex:\d+:\d+$/.test(body.exchangeKey)
      ? body.exchangeKey : null;
  const feature: string = FEATURES[body.feature] ? body.feature : DEFAULT_FEATURE;
  if (!system || !userPrompt) {
    return json({ ok: false, error: "bad_request", message: "system and user are required." }, 400);
  }
  if (String(system).length > MAX_PROMPT_CHARS || String(userPrompt).length > MAX_PROMPT_CHARS) {
    return json({ ok: false, error: "bad_request", message: "That request is too long." }, 400);
  }
  // Clamp rather than trust: taken straight from the request body, and this is
  // also the number the reservation below prices the call at, so a caller
  // cannot under-reserve by lying about maxTokens either.
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 900, 1), MAX_TOKENS_CAP);

  // ---- auth: identify the caller from their own Supabase session ----
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const def = FEATURES[feature];
  let weight = TIER_WEIGHT[def.tier];

  // ---- G1: has this exchange already been paid for? ----
  // One assist buys ten takes. Without this the regenerate button would be a
  // meter, and every user would learn to accept the first draft rather than the
  // right one.
  let exchangePaid = false;
  if (weight > 0 && exchangeKey) {
    const { data: already } = await admin.rpc("ai_exchange_paid", { p_user_id: user.id, p_key: exchangeKey });
    if (already === true) { exchangePaid = true; weight = 0; }
  }

  // ---- G2: cache hit? (content-addressed by feature+model+prompt) ----
  const cacheKey = def.cache ? hashKey(feature, def.model, system, userPrompt) : "";
  if (cacheKey) {
    const { data: hit } = await admin.from("ai_cache").select("response").eq("cache_key", cacheKey).maybeSingle();
    if (hit && hit.response) {
      await admin.rpc("ai_record_call", {
        p_user_id: user.id, p_feature: feature, p_model: def.model, p_tier: def.tier,
        p_in: 0, p_out: 0, p_cost: 0, p_cache_hit: true, p_latency: 0,
        p_assists: 0, p_exchange_key: exchangeKey,
      });
      return json({ ok: true, text: hit.response, meta: { model: def.model, tier: def.tier, cached: true, assists: 0 } });
    }
  }

  // ---- precheck: one round-trip for all counters + budgets + plan ----
  const { data: pc, error: pcErr } = await admin.rpc("ai_precheck", { p_user_id: user.id });
  if (pcErr) return json({ ok: false, error: "usage_error", message: pcErr.message }, 500);
  const cfg = (pc?.config) || { daily_company_budget_usd: 20, free_daily_assists: 30, free_daily_calls: 200, trial_monthly_assists: 10, user_monthly_budget_usd: 15 };
  const plan        = pc?.plan || "trial";
  const trialEnds   = pc?.trial_ends_at ? Date.parse(pc.trial_ends_at) : null;
  const dayAssists  = Number(pc?.day_assists || 0);
  const monthAssists= Number(pc?.month_assists || 0);
  const dayCalls    = Number(pc?.day_calls || 0);
  const topup       = Number(pc?.topup_assists || 0);
  const userMonth$  = Number(pc?.user_month_cost || 0);
  const company$    = Number(pc?.company_day_cost || 0);

  // Purchased assists never expire and stack on top of the monthly allowance,
  // so the ceiling is allowance + balance rather than allowance alone.
  const monthlyCap = monthlyAssists(plan, cfg) + topup;

  // ---- G2b: the trial actually ends ----
  //
  // trial_ends_at was being stored and returned and nothing read it, so a trial
  // simply renewed itself every month forever. Note what is refused: only work
  // that costs an assist. Briefs and Ask Mighty keep working after the trial,
  // because someone deciding whether to pay should still be able to look at
  // what they already have and ask questions about it. What stops is Mighty
  // writing for them, which is the thing worth paying for.
  if (weight > 0 && plan === "trial" && trialEnds && Date.now() > trialEnds) {
    return json({ ok: false, error: "trial_over", scope: "trial", plan,
      message: "Your thirty days are up. Everything you have given Mighty is still here and still yours, "
             + "and reading it stays free. Writing needs a plan." });
  }

  // ---- G3a: free features are unmetered, not unbounded ----
  // Ask Mighty costs nothing, which is a pricing decision, not an invitation to
  // run it in a loop. A generous daily call ceiling is the guard.
  if (weight === 0 && dayCalls >= Number(cfg.free_daily_calls ?? 200)) {
    return json({ ok: false, error: "rate_limited", scope: "daily_calls", message: "That is a lot of questions for one day. This resets tomorrow." });
  }
  // ---- G3b: per-user daily abuse guard, on assists ----
  if (weight > 0 && dayAssists + weight > Number(cfg.free_daily_assists)) {
    return json({ ok: false, error: "rate_limited", scope: "daily", message: `Daily AI limit reached (${cfg.free_daily_assists}/day). Resets tomorrow.` });
  }
  // ---- G4: per-plan monthly assist cap ----
  if (weight > 0 && monthAssists + weight > monthlyCap) {
    const up = plan === "trial" ? " Choose a plan to keep going."
             : plan === "pro" || plan === "leader" ? " Top-up bundles never expire."
             : " Buy a top-up bundle, or move up a plan.";
    return json({ ok: false, error: "rate_limited", scope: "monthly", plan, message: `You have used all ${monthlyCap} Assists on your ${PLAN_LABEL[plan] || plan} this month.${up}` });
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

  // ---- reserve: count this call against every cap above BEFORE the slow
  // external call, not after. Without this, a burst of concurrent requests all
  // read the same pre-burst ai_precheck numbers above and all pass - the write
  // that was supposed to stop the second one only happens seconds later, once
  // Anthropic answers. Priced at the capped maxTokens, the same number the
  // actual call is about to be held to, so this cannot under-reserve. ----
  const estInTok = Math.ceil((String(system).length + String(userPrompt).length) / 3);
  const { data: reserveId, error: reserveErr } = await admin.rpc("ai_reserve_call", {
    p_user_id: user.id, p_feature: feature, p_model: model, p_tier: def.tier,
    p_assists: weight, p_est_cost: estCost(model, estInTok, maxTokens), p_exchange_key: exchangeKey,
  });
  if (reserveErr) return json({ ok: false, error: "usage_error", message: reserveErr.message }, 500);

  // ---- run it ----
  const t0 = Date.now();
  let data: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!res.ok) {
      const t = await res.text();
      await admin.rpc("ai_release_call", { p_id: reserveId });
      return json({ ok: false, error: "anthropic_error", message: t.slice(0, 300) }, 502);
    }
    data = await res.json();
  } catch (e) {
    await admin.rpc("ai_release_call", { p_id: reserveId });
    return json({ ok: false, error: "proxy_error", message: String((e as Error)?.message || e) }, 500);
  }
  const latency = Date.now() - t0;
  const text = (data.content || []).map((c: any) => c.text || "").join("");
  const inTok  = data.usage?.input_tokens  || 0;
  const outTok = data.usage?.output_tokens || 0;
  const cost   = estCost(model, inTok, outTok);

  // ---- confirm the reservation with the real numbers, + cache ----
  await admin.rpc("ai_confirm_call", { p_id: reserveId, p_in: inTok, p_out: outTok, p_cost: cost, p_latency: latency });
  if (cacheKey && text) {
    await admin.from("ai_cache").upsert({ cache_key: cacheKey, feature, model, response: text }, { onConflict: "cache_key" });
  }

  return json({
    ok: true, text,
    meta: {
      model, tier: def.tier, cached: false, assists: weight, plan,
      planLabel: PLAN_LABEL[plan] || plan,
      assistsLeftMonth: Math.max(0, monthlyCap - monthAssists - weight),
      exchangePaid, exchangeKey,
      downgraded: overBudget,
    },
  });
});
