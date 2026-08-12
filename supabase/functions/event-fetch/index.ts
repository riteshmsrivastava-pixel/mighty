// ============================================================
// MIghTy - Event page fetch (Edge Function, deployed as "event-fetch").
//
// Rooms' backend, half of it. A conference or meetup page is fetched here,
// server-side, and reduced to plain text - the browser cannot fetch an
// arbitrary external URL itself because almost no conference site sends the
// CORS header that would allow it, and it should not try to: a personal
// Chrome extension permission is not the same thing as this server fetching
// a public page on the user's behalf.
//
// This function does the fetch and the HTML-to-text reduction ONLY. It does
// not call an LLM and does not hold the Anthropic key - extracting speakers
// from the returned text goes through the existing ai-proxy gateway from the
// client, via the new event_extract feature, so that call gets the same cost
// tracking, model routing and guardrails every other AI call in this product
// already has. Splitting it this way means a fetch that returns nothing
// useful (a login wall, a PDF, a page that is mostly JavaScript) costs
// nothing - the client only spends an Assist once there is real text to
// read.
//
// Deploy:
//   supabase functions deploy event-fetch
//   (no secrets - this only ever fetches a URL the signed-in user supplied)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

/* This fetches whatever public URL a signed-in user pastes, server-side,
   which is exactly the shape of request an SSRF exploit wants: aim it at an
   internal address instead of a real conference site. Blocking loopback,
   link-local and the RFC1918 private ranges by IP-shaped hostname is a
   partial defense (it does nothing about a hostname that only resolves to a
   private IP via DNS), but it is the same partial defense worth having
   regardless, and this function reaches no internal network Supabase itself
   does not already put a real boundary in front of. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch (_e) {}
  const raw = String(body.url || "").trim();
  if (!raw) return json({ ok: false, error: "bad_request", message: "url is required." }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  let target: URL;
  try { target = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw); }
  catch (_e) { return json({ ok: false, error: "bad_url", message: "That doesn't look like a web address." }, 400); }
  if (target.protocol !== "http:" && target.protocol !== "https:")
    return json({ ok: false, error: "bad_url", message: "Only http and https pages can be read." });
  if (isBlockedHost(target.hostname))
    return json({ ok: false, error: "bad_url", message: "That address can't be read from here." });

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MightyBot/1.0; +https://yourmighty.com)" },
    });
  } catch (e) {
    return json({ ok: false, error: "fetch_failed", message: "Could not load that page. It may be blocking automated visits." });
  }
  if (!res.ok)
    return json({ ok: false, error: "fetch_failed", message: "That page answered with an error (HTTP " + res.status + ")." });

  const ct = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(ct))
    return json({ ok: false, error: "not_html", message: "That link isn't a web page Mighty can read (got " + (ct || "an unknown type") + ")." });

  /* Capped before ever touching the string - a multi-megabyte page (or a
     misconfigured server streaming forever) should not be read in full just
     to throw most of it away two lines later. */
  const buf = await res.arrayBuffer();
  const capped = buf.byteLength > 2_000_000 ? buf.slice(0, 2_000_000) : buf;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(capped);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = stripHtml(html).slice(0, 20000);

  if (text.length < 200)
    return json({ ok: false, error: "empty", message: "That page didn't have enough readable text - it may need a login, or be built entirely in JavaScript." });

  return json({ ok: true, title: titleMatch ? titleMatch[1].trim().slice(0, 200) : "", text, url: target.toString() });
});
