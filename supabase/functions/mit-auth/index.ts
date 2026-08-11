// ============================================================
// MIghTy - MIT Touchstone login (Edge Function, deployed as "mit-auth").
//
// "Continue with MIT" on the Gate. Students authenticate through MIT's own
// Touchstone (with Duo) via the MIT OpenID Connect service at oidc.mit.edu,
// and Mighty receives a verified @mit.edu identity. No password is ever
// created, typed, or stored - which is already this product's stance.
//
// WHY THIS SHAPE
//   - oidc.mit.edu offers self-service client registration to anyone with a
//     Touchstone account, so no IS&T approval process gates the pilot.
//   - Supabase's signInWithIdToken only accepts a fixed provider list, so the
//     bridge is: verify the MIT identity here, create-or-find the Supabase
//     user with the reserved invite code (the auth.users trigger still
//     enforces seats - MIT is a channel, not a bypass), then 302 the browser
//     to a one-time magic link. GoTrue verifies it and redirects into the app
//     with the session in the URL fragment, where supabase-js's default
//     detectSessionInUrl picks it up. Zero client-side session code.
//   - generateLink() never sends email, so this works regardless of the
//     built-in mailer's rate limit.
//
// Three endpoints, all pre-auth (deploy with --no-verify-jwt):
//   ?action=status   {configured} - the Gate only renders the button if true
//   ?action=start    {url}       - authorize URL with an HMAC-signed state
//   /callback        302 chain   - code -> token -> userinfo -> magic link
//
// Setup (the only part that needs Ritesh's Touchstone account):
//   1. https://oidc.mit.edu -> Self-service client registration -> new client
//        redirect URI:  <SUPABASE_URL>/functions/v1/mit-auth/callback
//        grant type:    authorization_code · scopes: openid email profile
//        token endpoint auth: client_secret_basic
//   2. supabase secrets set MIT_CLIENT_ID='...' MIT_CLIENT_SECRET='...'
//      supabase secrets set MIT_INVITE_CODE='MIT-TOUCHSTONE'
//      (add that code to the invite table with enough seats - MIT signups
//       consume seats from it, so the cap stays a real cap)
//   3. supabase functions deploy mit-auth --no-verify-jwt
//   4. Supabase Auth -> URL Configuration: the app URL is already in the
//      redirect allow-list from the email-confirm fix; APP_URL below must
//      stay on that list.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID        = Deno.env.get("MIT_CLIENT_ID") || "";
const CLIENT_SECRET    = Deno.env.get("MIT_CLIENT_SECRET") || "";
const MIT_INVITE_CODE  = Deno.env.get("MIT_INVITE_CODE") || "";
const APP_URL          = Deno.env.get("APP_URL") || "https://yourmighty.com/app/";

const OIDC = {
  authorize: "https://oidc.mit.edu/authorize",
  token:     "https://oidc.mit.edu/token",
  userinfo:  "https://oidc.mit.edu/userinfo",
};
const REDIRECT_URI = SUPABASE_URL + "/functions/v1/mit-auth/callback";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});

/* The state has to survive a round trip through MIT with no session on our
   side to anchor it (the whole point is that the user is not signed in yet),
   so it is stateless: a nonce and a timestamp, HMAC-signed with the service
   key. Nothing to store, nothing to prune, and a tampered or replayed-late
   state fails verification rather than a lookup. */
const enc = new TextEncoder();
async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SERVICE_ROLE_KEY),
    {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function makeState(): Promise<string> {
  const payload = btoa(JSON.stringify({n: crypto.randomUUID(), t: Date.now()}))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return payload + "." + await hmac(payload);
}
async function checkState(state: string): Promise<boolean> {
  const dot = state.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = state.slice(0, dot);
  if (await hmac(payload) !== state.slice(dot + 1)) return false;
  try {
    const {t} = JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/")));
    return Date.now() - t < 10 * 60 * 1000;          // Touchstone + Duo in under ten minutes
  } catch (_) { return false; }
}

/* Every failure lands back on the Gate as ?mit_error=..., where it renders as
   a sentence. A browser stranded on a JSON error blob mid-login is the SSO
   equivalent of the 404 confirmation link this product already got burned by. */
const bounce = (msg: string) =>
  new Response(null, {status: 302, headers: {Location: APP_URL + "?mit_error=" + encodeURIComponent(msg)}});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers: CORS});
  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith("/callback");
  const action = url.searchParams.get("action") || (isCallback ? "callback" : "status");

  if (action === "status") return json({configured: !!(CLIENT_ID && CLIENT_SECRET)});

  if (!CLIENT_ID || !CLIENT_SECRET)
    return isCallback ? bounce("MIT sign-in is not switched on yet.")
      : json({error: "MIT sign-in is not configured on the server yet."}, 503);

  if (action === "start") {
    const state = await makeState();
    const q = new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      scope: "openid email profile", state,
    });
    return json({url: OIDC.authorize + "?" + q.toString()});
  }

  if (action === "callback") {
    const err = url.searchParams.get("error");
    if (err) return bounce(err === "access_denied"
      ? "MIT sign-in was cancelled. Nothing happened."
      : "MIT could not complete the sign-in: " + err);

    const code  = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !await checkState(state))
      return bounce("That sign-in link expired or did not match. Start again from the login page.");

    // code -> tokens, authenticated as the registered client
    let access = "";
    try {
      const res = await fetch(OIDC.token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET),
        },
        body: new URLSearchParams({grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.access_token)
        throw new Error(body.error_description || body.error || ("token exchange failed, HTTP " + res.status));
      access = body.access_token;
    } catch (e) { return bounce("MIT sign-in failed at the token step: " + (e as Error).message); }

    // Who is this, per MIT - not per anything the browser claimed.
    let email = "", name = "", sub = "";
    try {
      const res = await fetch(OIDC.userinfo, {headers: {Authorization: "Bearer " + access}});
      const info = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("userinfo HTTP " + res.status);
      sub   = String(info.sub || "");
      name  = String(info.name || "");
      email = String(info.email || "").toLowerCase().trim();
      /* The OIDC pilot has been seen returning a bare Kerberos principal with
         no email claim. principal@mit.edu is that account's canonical address. */
      if (!email && info.preferred_username && !String(info.preferred_username).includes("@"))
        email = String(info.preferred_username).toLowerCase().trim() + "@mit.edu";
    } catch (e) { return bounce("MIT sign-in failed reading your identity: " + (e as Error).message); }

    /* The check that makes this mean something: only MIT addresses get in this
       door. Subdomains included - sloan.mit.edu, alum.mit.edu are still MIT. */
    if (!/^[^@\s]+@([a-z0-9-]+\.)*mit\.edu$/.test(email))
      return bounce("That MIT account did not come back with an mit.edu address, so it cannot be verified.");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth: {persistSession: false}});

    /* Create if new. The auth.users trigger still enforces the invite gate -
       MIT_INVITE_CODE is a reserved channel code with its own seat count, so
       "how many came in through MIT" stays attributable and capped. An
       existing account (any signup path) just signs in. */
    const {error: createErr} = await admin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: {
        invite_code: MIT_INVITE_CODE, auth_source: "mit_touchstone",
        mit_sub: sub, full_name: name,
      },
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      return bounce(/invite|seat|database error/i.test(createErr.message)
        ? "Every MIT seat in this round has been taken. Request access and we will come back to you."
        : "Could not set up the account: " + createErr.message);
    }

    /* No email is sent - the link comes back to us and the browser is walked
       through it directly. GoTrue verifies the one-time token and redirects
       to the app with the session in the fragment. */
    const {data: link, error: linkErr} = await admin.auth.admin.generateLink({
      type: "magiclink", email, options: {redirectTo: APP_URL},
    });
    const target = link && link.properties && link.properties.action_link;
    if (linkErr || !target)
      return bounce("Signed in with MIT, but the session could not be issued: "
        + ((linkErr && linkErr.message) || "no link returned") + ". Try again.");

    return new Response(null, {status: 302, headers: {Location: target}});
  }

  return json({error: "Unknown action."}, 400);
});
