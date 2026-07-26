// ============================================================
// MIghTy - Google Sheets sync Edge Function.
// Pushes each student's outreach_log OUT to their own Google Sheet.
// Never touches LinkedIn - this only moves already-collected data
// from Supabase to Sheets, on request or on a schedule.
//
// Deploy:
//   1. supabase functions new sheets-sync   (then replace its index.ts with this file)
//   2. supabase functions deploy sheets-sync
//   3. supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<the full service-account key JSON, one line>'
//      (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected automatically)
//   4. Share your Google Sheet with the service account's client_email (Editor access) -
//      the app's Settings tab fetches that email for you via the "whoami" action.
//   5. Optional: schedule the ?all=1 cron mode - see the pg_cron snippet in SETUP.md.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT     = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const HEADER_ROW = ["Profile URL","Name","Title","Company","Status","Priority","Message","Shortlisted At","Contacted At","Updated At"];

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

/* ---------- Google service-account auth ---------- */
function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; arr.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function signedGoogleJWT() {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: SHEETS_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  };
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pem = SERVICE_ACCOUNT.private_key as string;
  const pkcs8 = pem.replace(/-----[^-]+-----|\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}
async function googleAccessToken() {
  const assertion = await signedGoogleJWT();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`google_auth_failed: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

/* ---------- Sheets API ---------- */
async function sheetsGet(token: string, sheetId: string, range: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { status: res.status, body: await res.json() };
}
async function sheetsUpdate(token: string, sheetId: string, range: string, values: unknown[][]) {
  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ values }) }
  );
}
async function sheetsBatchUpdate(token: string, sheetId: string, data: { range: string, values: unknown[][] }[]) {
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}
async function sheetsAppend(token: string, sheetId: string, tabName: string, rows: unknown[][]) {
  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ values: rows }) }
  );
}

function rowValues(r: any) {
  return [r.profile_url, r.name||"", r.title||"", r.company||"", r.status, r.priority||"", r.message_sent||"", r.shortlisted_at||"", r.contacted_at||"", r.updated_at||""];
}

/* ---------- core sync: one user's outreach_log -> their Sheet ---------- */
async function syncUserToSheet(rows: any[], sheetId: string, tabName: string) {
  const token = await googleAccessToken();
  const current = await sheetsGet(token, sheetId, `${tabName}!A:A`);
  if (current.status === 403) return { ok: false, error: "not_shared", message: `Share your Google Sheet with ${SERVICE_ACCOUNT.client_email} (Editor access), then try again.` };
  if (current.status === 404) return { ok: false, error: "not_found", message: "Sheet ID not found - check it's correct and the tab name matches." };
  if (current.status >= 400) return { ok: false, error: "google_error", message: JSON.stringify(current.body).slice(0, 300) };

  const colA: string[] = (current.body.values || []).map((r: string[]) => r[0]);
  const existing = new Map<string, number>(); // profile_url -> 1-indexed row number
  colA.forEach((url, i) => { if (i > 0 && url) existing.set(url, i + 1); }); // row 1 is header

  if (colA.length === 0) {
    await sheetsUpdate(token, sheetId, `${tabName}!A1:J1`, [HEADER_ROW]);
  }

  const updates: { range: string, values: unknown[][] }[] = [];
  const appends: unknown[][] = [];
  for (const r of rows) {
    const rowNum = existing.get(r.profile_url);
    if (rowNum) updates.push({ range: `${tabName}!A${rowNum}:J${rowNum}`, values: [rowValues(r)] });
    else appends.push(rowValues(r));
  }
  if (updates.length) await sheetsBatchUpdate(token, sheetId, updates);
  if (appends.length) await sheetsAppend(token, sheetId, tabName, appends);

  return { ok: true, updated: updates.length, appended: appends.length };
}

/* ---------- HTTP entry ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // Cron / all-users mode - service role bearer required.
  if (url.searchParams.get("all") === "1") {
    const auth = req.headers.get("Authorization") || "";
    if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ ok: false, error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: users } = await admin.from("user_data").select("user_id,data");
    let touched = 0;
    for (const u of users ?? []) {
      const sheets = u.data?.settings?.sheets;
      if (!sheets?.sheetId) continue;
      const { data: rows } = await admin.from("outreach_log").select("*").eq("user_id", u.user_id);
      if (!rows?.length) continue;
      try { await syncUserToSheet(rows, sheets.sheetId, sheets.tabName || "MIghTy Outreach"); touched++; }
      catch (_e) { /* skip a user whose sync failed; next cron run retries */ }
    }
    return json({ ok: true, users: touched });
  }

  // On-demand mode - the calling user's own JWT, forwarded by supabase.functions.invoke().
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* no body */ }

  if (body.action === "whoami") return json({ email: SERVICE_ACCOUNT.client_email });

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  if (body.action !== "sync") return json({ ok: false, error: "unknown_action" }, 400);
  if (!body.sheetId) return json({ ok: false, error: "missing_sheet_id", message: "Add your Google Sheet ID in Settings first." });

  const { data: rows, error: rowsErr } = await userClient.from("outreach_log").select("*").eq("user_id", user.id);
  if (rowsErr) return json({ ok: false, error: "db_error", message: rowsErr.message });
  if (!rows?.length) return json({ ok: true, updated: 0, appended: 0, message: "Nothing to sync yet." });

  try {
    const result = await syncUserToSheet(rows, body.sheetId, body.tabName || "MIghTy Outreach");
    return json(result);
  } catch (e) {
    return json({ ok: false, error: "sync_failed", message: String((e as Error)?.message || e) });
  }
});
