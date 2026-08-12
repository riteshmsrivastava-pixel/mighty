// ============================================================
// MIghTy - People search (Edge Function, deployed as "people-search").
//
// The "Discover" backend. Takes a keyword query, calls Google's official
// Programmable Search JSON API scoped to public LinkedIn profiles, parses the
// results into people, and returns them to the app - which shows a selectable
// list to import. This is the compliant way to "search in the backend": an
// official API with a quota, never scraping Google's HTML.
//
// Setup (one time):
//   1. Create a Programmable Search Engine at https://programmablesearchengine.google.com
// - set it to search the whole web (we scope to LinkedIn per-query). Copy its
//      "Search engine ID" (cx).
//   2. Enable the "Custom Search API" and make an API key at
//      https://console.cloud.google.com/apis/credentials
//   3. supabase functions deploy people-search
//      supabase secrets set GOOGLE_CSE_KEY='<api key>'
//      supabase secrets set GOOGLE_CSE_CX='<search engine id>'
//   (Free tier: 100 searches/day, then ~$5 per 1000.)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CSE_KEY           = Deno.env.get("GOOGLE_CSE_KEY") || "";
const CSE_CX            = Deno.env.get("GOOGLE_CSE_CX")  || "";
// Google's free tier is 100 searches/day for the whole project, not per user -
// unlike ai-proxy, nothing here tracked that shared ceiling at all, so a wave
// of new users trying Discover in the same week could exhaust it before noon
// and start either erroring for everyone or spending with no ceiling Mighty
// controls, depending on whether billing happens to be on. Capped a little
// under the hard 100 so this fails with a clear message before Google's own
// error does; raise via secret once billing is confirmed on and a higher
// ceiling is wanted.
const DAILY_CAP = Number(Deno.env.get("PEOPLE_SEARCH_DAILY_CAP")) || 90;

// Browsers preflight every POST carrying Authorization/content-type; without
// these headers the OPTIONS request fails and the caller sees "Failed to fetch".
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}
function normUrl(href: string): string {
  try { const u = new URL(href); return (u.origin + u.pathname).replace(/\/$/, ""); } catch { return href; }
}
function companyFromTitle(t: string): string {
  const at = (t || "").match(/\bat\s+(.+?)(?:\s*[·|]|$)/i);
  if (at) return at[1].trim();
  const atSign = (t || "").match(/@\s*(.+?)(?:\s*[·|]|$)/);
  if (atSign) return atSign[1].trim();
  return "";
}
// Google result title → { name, headline, company }
function parseItem(it: any) {
  const link = it.link || "";
  if (!/linkedin\.com\/in\//i.test(link)) return null;
  let title = (it.title || "").replace(/\s*[|·]?\s*LinkedIn\s*$/i, "").replace(/\s*[.…]+\s*$/, "").trim();
  const parts = title.split(/\s+[-\u2013\u2014]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length > 60) return null;
  const headline = parts.slice(1).join(" - ").trim();
  return { profileUrl: normUrl(link), name, title: headline, company: companyFromTitle(headline) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch (_e) {}
  const query = (body.query || "").toString().trim();
  if (!query) return json({ ok: false, error: "bad_request", message: "query is required." }, 400);

  // auth - only signed-in students may search (protects the CSE quota)
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  if (!CSE_KEY || !CSE_CX) {
    return json({ ok: false, error: "not_configured", message: "Web search isn't set up yet (GOOGLE_CSE_KEY / GOOGLE_CSE_CX)." });
  }

  // Claim one unit of today's shared quota before spending it. Insert-or-
  // increment-with-cap is one statement, so concurrent callers serialise on
  // this row instead of racing to read the same pre-burst count - the same
  // shape claim_invite_seat already uses for exactly this reason.
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: claimed, error: claimErr } = await admin.rpc("claim_people_search", { p_daily_cap: DAILY_CAP });
  if (claimErr) return json({ ok: false, error: "usage_error", message: claimErr.message }, 500);
  if (!claimed) {
    return json({ ok: false, error: "rate_limited", scope: "daily_quota",
      message: "Web search has hit its shared daily limit. This resets tomorrow - saved profiles and your own network still work." });
  }

  const q = `site:linkedin.com/in ${query}`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&num=10&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `search failed (${res.status})`;
      return json({ ok: false, error: "search_error", message: msg.slice(0, 200) }, 502);
    }
    const seen = new Set<string>();
    const people = (data.items || []).map(parseItem).filter((p: any) => {
      if (!p || seen.has(p.profileUrl)) return false; seen.add(p.profileUrl); return true;
    });
    return json({ ok: true, people, query: q });
  } catch (e) {
    return json({ ok: false, error: "proxy_error", message: String((e as Error)?.message || e) }, 500);
  }
});
