// ============================================================
// MIghTy - Google connector (Edge Function, deployed as "google-sync").
//
// Replaces the Google Takeout upload with a "Connect Google" button. Three
// actions, all authenticated as the calling Mighty user:
//
//   connect    exchange the one-time OAuth code for tokens and store the
//              refresh token. The code arrives from the browser; the client
//              secret and the refresh token never do.
//   sync       refresh the access token if needed, then read Contacts, Other
//              contacts and Calendar, and return one aggregate the app folds
//              into the knowledge base. Raw contacts and events are never
//              stored anywhere - the aggregate is the product.
//   status     what the app can safely show about the connection.
//
// WHY THIS RUNS SERVER SIDE
// A Google refresh token is a standing key to a mailbox, a calendar and an
// address book, valid until revoked. It must never reach the browser, and the
// OAuth client secret must never reach it either. So the code-for-token
// exchange, the refresh, and every Google API call happen here.
//
// SCOPES - the one thing that decides what this can do
//   Sensitive (verification only, no security assessment, no user cap once
//   verified, refresh tokens never expire):
//     contacts.readonly, contacts.other.readonly, calendar.events.readonly
//   Restricted (verification AND an annual CASA Tier 2 assessment by a
//   Google-approved lab before more than 100 users, at real cost):
//     every Gmail scope, including gmail.readonly and gmail.metadata
// So the default set below is deliberately sensitive-only: it needs no audit
// and delivers the relationship graph. Gmail is wired but off by default -
// flip GMAIL_ENABLED once the assessment is done. Until then the mbox upload
// in the app is the Gmail path, and it needs no permission from Google at all.
//
// Deploy:
//   supabase functions deploy google-sync
//   supabase secrets set GOOGLE_CLIENT_ID='....apps.googleusercontent.com'
//   supabase secrets set GOOGLE_CLIENT_SECRET='GOCSPX-...'
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID         = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CLIENT_SECRET     = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

// Restricted scopes need a passed CASA assessment on file. Leave false until
// there is one - asking for a scope the project is not cleared for makes
// Google refuse the whole consent screen, taking Contacts and Calendar down
// with it.
const GMAIL_ENABLED = (Deno.env.get("GOOGLE_GMAIL_ENABLED") || "") === "true";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {...CORS, "Content-Type": "application/json"}});

// ---------------- Google plumbing ----------------

async function tokenRequest(params: Record<string,string>){
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params}),
  });
  const body = await res.json().catch(()=>({}));
  if(!res.ok){
    /* Google's own error strings are the useful part and are safe to pass on -
       "invalid_grant" almost always means the user revoked access in their
       Google account, and telling them that beats a generic failure. */
    throw new Error(body.error_description || body.error || ("Google returned " + res.status));
  }
  return body as {access_token:string; refresh_token?:string; expires_in:number; scope?:string; id_token?:string};
}

/* One shared fetcher so every Google call gets the same retry treatment. 429
   and 5xx are transient and worth one backoff; 401 means the access token died
   mid-sync and is worth surfacing rather than retrying with the same token. */
async function gfetch(url: string, token: string, attempt = 0): Promise<any>{
  const res = await fetch(url, {headers: {Authorization: "Bearer " + token}});
  if(res.status === 429 || res.status >= 500){
    if(attempt < 2){
      await new Promise(r=>setTimeout(r, 400 * Math.pow(3, attempt)));
      return gfetch(url, token, attempt + 1);
    }
  }
  const body = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = (body && body.error && (body.error.message || body.error)) || ("HTTP " + res.status);
    /* A scope the user unticked shows up as 403 on that one endpoint. The
       caller treats null as "not granted" and carries on with the rest rather
       than failing the whole sync. */
    if(res.status === 403 || res.status === 404) return null;
    throw new Error(String(msg));
  }
  return body;
}

const FREEMAIL = new Set(["gmail.com","googlemail.com","yahoo.com","yahoo.co.in","hotmail.com",
  "outlook.com","live.com","msn.com","icloud.com","me.com","aol.com","protonmail.com","proton.me",
  "rediffmail.com","zoho.com","gmx.com","mail.com","yandex.com","hey.com","fastmail.com"]);

const NOREPLY = /^(no-?reply|donotreply|do-?not-?reply|notifications?|notify|alerts?|support|info|admin|billing|receipts?|invoice|news|newsletter|updates?|mailer|postmaster|bounce|automated|robot|calendar-notification|team)([._-]|@|$)/i;

function normEmail(e: string){
  const s = String(e||"").toLowerCase().trim();
  const at = s.lastIndexOf("@");
  if(at < 1) return "";
  let local = s.slice(0,at); let dom = s.slice(at+1);
  local = local.split("+")[0];
  if(dom === "googlemail.com") dom = "gmail.com";
  if(dom === "gmail.com") local = local.replace(/\./g,"");
  return (local && dom) ? local + "@" + dom : "";
}

// ---------------- the aggregate ----------------

type Person = {
  email: string; name: string; org: string; title: string;
  /* Where the knowledge of this person came from, because the three sources
     mean genuinely different things and the app says so:
       contacts - they deliberately saved this person
       other    - Google auto-saved them from mail, i.e. correspondence
       calendar - they were in a meeting together */
  saved: boolean; corresponded: boolean;
  meetings: number; firstMetAt: string|null; lastMetAt: string|null;
};

function aggregator(selfEmails: Set<string>){
  const people = new Map<string, Person>();
  const domains = new Map<string, number>();
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const TOD = [
    {key:"morning",   label:"Morning (5am–noon)",   test:(h:number)=>h>=5&&h<12},
    {key:"afternoon", label:"Afternoon (noon–5pm)", test:(h:number)=>h>=12&&h<17},
    {key:"evening",   label:"Evening (5–9pm)",      test:(h:number)=>h>=17&&h<21},
    {key:"night",     label:"Night (9pm–5am)",      test:(h:number)=>h>=21||h<5},
  ];
  const byDow = DOW.map(label=>({label, meetings:0}));
  const byTod: Record<string,{label:string;meetings:number}> = {};
  TOD.forEach(b=>{ byTod[b.key] = {label:b.label, meetings:0}; });
  let meetingsTotal = 0, meetingsWithOthers = 0, eventsSeen = 0, broadcastSkipped = 0;
  let firstEventAt: number|null = null, lastEventAt: number|null = null;

  const get = (email: string, name: string) => {
    const key = normEmail(email);
    if(!key || selfEmails.has(key)) return null;
    if(NOREPLY.test(key.split("@")[0])) return null;
    /* Resource calendars are rooms, not people, and Google puts them in the
       attendee list exactly like a human. */
    if(/resource\.calendar\.google\.com$/.test(key) || /\bcalendar\.google\.com$/.test(key)) return null;
    let p = people.get(key);
    if(!p){
      p = {email:key, name:"", org:"", title:"", saved:false, corresponded:false,
           meetings:0, firstMetAt:null, lastMetAt:null};
      people.set(key, p);
      const dom = key.split("@")[1];
      if(dom && !FREEMAIL.has(dom)) domains.set(dom, (domains.get(dom)||0) + 1);
    }
    if(name && name.length > p.name.length && name.length < 80) p.name = name;
    return p;
  };

  return {
    addContact(c: any, saved: boolean){
      const emails: any[] = c.emailAddresses || [];
      if(!emails.length) return;
      const name = ((c.names||[])[0]||{}).displayName || "";
      const org  = (c.organizations||[])[0] || {};
      emails.slice(0,3).forEach((e:any)=>{
        const p = get(e.value||"", name);
        if(!p) return;
        if(saved) p.saved = true; else p.corresponded = true;
        if(org.name && !p.org) p.org = String(org.name).slice(0,80);
        if(org.title && !p.title) p.title = String(org.title).slice(0,80);
      });
    },

    addEvent(ev: any){
      eventsSeen++;
      const att: any[] = ev.attendees || [];
      /* An all-hands is not a meeting with 60 people, and counting it as one
         puts every colleague at the top of "who you actually meet". Same rule
         the mbox parser applies to a 20-recipient email. */
      if(att.length > 20){ broadcastSkipped++; return; }
      /* Declined means it did not happen. A cancelled event likewise. */
      if(ev.status === "cancelled") return;
      const meStatus = att.find(a=>a.self);
      if(meStatus && meStatus.responseStatus === "declined") return;

      const startIso = (ev.start && (ev.start.dateTime || ev.start.date)) || null;
      const t = startIso ? Date.parse(startIso) : NaN;
      if(isNaN(t)) return;
      /* Nothing in the future has happened yet. */
      if(t > Date.now()) return;
      if(firstEventAt === null || t < firstEventAt) firstEventAt = t;
      if(lastEventAt  === null || t > lastEventAt)  lastEventAt  = t;

      const others = att.filter(a=>!a.self && a.email && a.responseStatus !== "declined");
      meetingsTotal++;
      if(!others.length) return;                       // a solo block, not a meeting
      meetingsWithOthers++;

      /* An all-day event has a date and no time, so the hour would read as
         midnight local and pile every one of them into the Night bucket. */
      if(ev.start && ev.start.dateTime){
        const d = new Date(t);
        byDow[d.getDay()].meetings++;
        const b = TOD.find(x=>x.test(d.getHours()));
        if(b) byTod[b.key].meetings++;
      }

      others.forEach(a=>{
        const p = get(a.email, a.displayName || "");
        if(!p) return;
        p.meetings++;
        const iso = new Date(t).toISOString();
        if(!p.firstMetAt || iso < p.firstMetAt) p.firstMetAt = iso;
        if(!p.lastMetAt  || iso > p.lastMetAt)  p.lastMetAt  = iso;
      });
    },

    done(scopes: string[]){
      const list = [...people.values()];
      /* Ranked by what actually evidences a relationship: time in a room
         together first, then whether they were deliberately saved, then
         whether there is correspondence, then recency. */
      list.sort((a,b)=>
        (b.meetings - a.meetings)
        || ((b.saved?1:0) - (a.saved?1:0))
        || ((b.corresponded?1:0) - (a.corresponded?1:0))
        || String(b.lastMetAt||"").localeCompare(String(a.lastMetAt||"")));

      const months = (firstEventAt && lastEventAt)
        ? Math.max(1, (lastEventAt - firstEventAt) / (1000*60*60*24*30.4)) : null;

      const bestOf = <T extends {meetings:number}>(arr: T[]) =>
        meetingsWithOthers >= 20 ? arr.slice().sort((a,b)=>b.meetings-a.meetings)[0] || null : null;

      return {
        source: "google_api",
        capturedAt: new Date().toISOString(),
        scopes,
        /* Capped: this is folded into the one settings blob that gets
           rewritten on every save. */
        people: list.slice(0,600),
        peopleCount: list.length,
        savedCount: list.filter(p=>p.saved).length,
        correspondedCount: list.filter(p=>p.corresponded).length,
        metCount: list.filter(p=>p.meetings > 0).length,
        /* Someone met three or more times is not an acquaintance. This is the
           number worth putting in front of the user. */
        knownWellCount: list.filter(p=>p.meetings >= 3).length,
        domains: [...domains.entries()].map(([domain,count])=>({domain,count}))
          .sort((a,b)=>b.count-a.count).slice(0,40),
        meetings: {
          eventsSeen, broadcastSkipped,
          total: meetingsTotal,
          withOthers: meetingsWithOthers,
          perMonth: months ? Math.round(meetingsWithOthers / months * 10) / 10 : null,
          firstAt: firstEventAt ? new Date(firstEventAt).toISOString() : null,
          lastAt:  lastEventAt  ? new Date(lastEventAt).toISOString()  : null,
          byDow, byTod: TOD.map(b=>({key:b.key, ...byTod[b.key]})),
          bestDow: bestOf(byDow), bestTod: bestOf(TOD.map(b=>({key:b.key, ...byTod[b.key]}))),
          /* Withheld below 20 meetings for the same reason every other rate in
             this product is: a pattern read off five data points is a
             coincidence with a percentage sign on it. */
          enoughData: meetingsWithOthers >= 20,
        },
      };
    },
  };
}

// ---------------- Google readers ----------------

const PERSON_FIELDS = "names,emailAddresses,organizations,photos,metadata";

async function readContacts(token: string, add: (c:any,saved:boolean)=>void){
  let granted = 0;
  for(const [path, saved] of [["people/me/connections", true], ["otherContacts", false]] as [string,boolean][]){
    let pageToken = "", pages = 0;
    /* otherContacts is the interesting half and the one nobody expects: Google
       auto-saves everyone the user has ever exchanged mail with, and reading it
       needs only a sensitive scope. It is most of what a Gmail scope would tell
       us about who they correspond with, without the restricted scope. */
    const fields = path === "otherContacts" ? "names,emailAddresses,metadata" : PERSON_FIELDS;
    while(pages < 12){
      const url = "https://people.googleapis.com/v1/" + path
        + "?pageSize=1000&" + (path === "otherContacts" ? "readMask=" : "personFields=") + fields
        + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
      const body = await gfetch(url, token);
      if(!body) break;                              // scope not granted
      const rows = body.connections || body.otherContacts || [];
      rows.forEach((c:any)=>add(c, saved));
      granted += rows.length;
      pageToken = body.nextPageToken || "";
      pages++;
      if(!pageToken) break;
    }
  }
  return granted;
}

async function readCalendar(token: string, add: (e:any)=>void, monthsBack: number){
  const timeMin = new Date(Date.now() - monthsBack * 30.4 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date().toISOString();
  let pageToken = "", pages = 0, seen = 0;
  while(pages < 20){
    /* singleEvents expands a recurring weekly 1:1 into the individual meetings
       that actually happened, which is the whole point - "we meet every week"
       is the signal, and the unexpanded series would count it once. */
    const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
      + "?singleEvents=true&orderBy=startTime&maxResults=2500"
      + "&timeMin=" + encodeURIComponent(timeMin) + "&timeMax=" + encodeURIComponent(timeMax)
      + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const body = await gfetch(url, token);
    if(!body) break;                                // scope not granted
    (body.items || []).forEach((e:any)=>{ add(e); seen++; });
    pageToken = body.nextPageToken || "";
    pages++;
    if(!pageToken) break;
  }
  return seen;
}

// ---------------- handler ----------------

Deno.serve(async (req)=>{
  if(req.method === "OPTIONS") return new Response("ok", {headers: CORS});
  if(req.method !== "POST")    return json({error:"POST only"}, 405);
  if(!CLIENT_ID || !CLIENT_SECRET)
    return json({error:"Google is not configured on the server yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."}, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if(!authHeader.startsWith("Bearer ")) return json({error:"Not signed in."}, 401);

  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {headers: {Authorization: authHeader}}, auth: {persistSession:false},
  });
  const {data:{user}, error:userErr} = await asUser.auth.getUser();
  if(userErr || !user) return json({error:"Not signed in."}, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}});

  let payload: any = {};
  try{ payload = await req.json(); }catch(_){ /* empty body means status */ }
  const action = String(payload.action || "status");

  // ---- status ----
  if(action === "status"){
    const {data} = await admin.from("google_tokens")
      .select("google_email,scopes,connected_at,last_sync_at,last_sync_err,last_sync_stats")
      .eq("user_id", user.id).maybeSingle();
    return json({connected: !!data, connection: data || null, gmailEnabled: GMAIL_ENABLED});
  }

  // ---- connect ----
  if(action === "connect"){
    const code = String(payload.code || "");
    const state = String(payload.state || "");
    const redirectUri = String(payload.redirect_uri || "");
    if(!code || !redirectUri) return json({error:"Missing code or redirect_uri."}, 400);

    /* The state has to belong to this user's own attempt. Without this check
       an attacker who can get a victim to load a crafted redirect could attach
       their own Google account to the victim's Mighty account, or the reverse.
       The row is consumed here so a replayed code cannot be used twice. */
    const {data: st} = await admin.from("oauth_states")
      .select("user_id,created_at").eq("state", state).maybeSingle();
    if(!st || st.user_id !== user.id)
      return json({error:"That sign-in link did not match this session. Start again from Mighty."}, 400);
    if(Date.now() - Date.parse(st.created_at) > 15*60*1000)
      return json({error:"That sign-in took too long and expired. Start again."}, 400);
    await admin.from("oauth_states").delete().eq("state", state);

    let tok;
    try{
      tok = await tokenRequest({code, redirect_uri: redirectUri, grant_type: "authorization_code"});
    }catch(e){ return json({error: "Google would not complete the connection: " + (e as Error).message}, 400); }

    const scopes = String(tok.scope||"").split(/\s+/).filter(Boolean);

    /* Who did they actually connect. Read from the token rather than trusted
       from the client, and used to exclude the user from their own contact and
       attendee lists. */
    let gEmail = "", gSub = "";
    try{
      const info = await gfetch("https://www.googleapis.com/oauth2/v3/userinfo", tok.access_token);
      if(info){ gEmail = info.email || ""; gSub = info.sub || ""; }
    }catch(_){ /* not fatal - the sync falls back to the Mighty account email */ }

    /* Google hands over a refresh token only on a consent that used
       prompt=consent with access_type=offline. A re-connect can legitimately
       come back without one, and writing null over a working token would break
       every future sync silently - hence the read-then-coalesce rather than a
       plain upsert. */
    const {data: existing} = await admin.from("google_tokens")
      .select("refresh_token").eq("user_id", user.id).maybeSingle();
    const refresh = tok.refresh_token || (existing && existing.refresh_token) || "";
    if(!refresh)
      return json({error:"Google did not return a refresh token, so the connection could not be kept. "
        + "Remove Mighty at myaccount.google.com/permissions and connect again."}, 400);

    const {error: upErr} = await admin.from("google_tokens").upsert({
      user_id: user.id, google_email: gEmail, google_sub: gSub,
      refresh_token: refresh,
      access_token: tok.access_token,
      access_expires: new Date(Date.now() + (tok.expires_in||3500)*1000).toISOString(),
      scopes, connected_at: new Date().toISOString(), last_sync_err: null,
    }, {onConflict:"user_id"});
    if(upErr) return json({error:"Could not save the connection: " + upErr.message}, 500);

    return json({connected:true, google_email:gEmail, scopes, gmailEnabled: GMAIL_ENABLED});
  }

  // ---- sync ----
  if(action === "sync"){
    const {data: row, error: rowErr} = await admin.from("google_tokens")
      .select("*").eq("user_id", user.id).maybeSingle();
    if(rowErr) return json({error:"Could not read the connection: " + rowErr.message}, 500);
    if(!row)   return json({error:"Google is not connected yet."}, 400);

    let access = row.access_token as string | null;
    const stillGood = access && row.access_expires && Date.parse(row.access_expires) - Date.now() > 120000;
    if(!stillGood){
      try{
        const tok = await tokenRequest({refresh_token: row.refresh_token, grant_type: "refresh_token"});
        access = tok.access_token;
        await admin.from("google_tokens").update({
          access_token: access,
          access_expires: new Date(Date.now() + (tok.expires_in||3500)*1000).toISOString(),
        }).eq("user_id", user.id);
      }catch(e){
        const msg = (e as Error).message;
        await admin.from("google_tokens").update({last_sync_err: msg}).eq("user_id", user.id);
        /* invalid_grant here means the user revoked Mighty in their Google
           account, or the app is still in Testing publishing status, where
           Google expires every refresh token after seven days. Both are fixed
           by reconnecting, and only one of them is our problem. */
        return json({error: /invalid_grant/i.test(msg)
          ? "Google has revoked the connection, which happens if you removed Mighty in your Google account, "
            + "or after seven days while Mighty is still awaiting Google's review. Connect again to restore it."
          : "Google would not refresh the connection: " + msg,
          needsReconnect:true}, 400);
      }
    }

    const selfEmails = new Set<string>();
    [row.google_email, user.email].forEach((e:any)=>{ const n = normEmail(e||""); if(n) selfEmails.add(n); });
    (payload.extra_emails || []).forEach((e:any)=>{ const n = normEmail(String(e||"")); if(n) selfEmails.add(n); });

    const agg = aggregator(selfEmails);
    const months = Math.min(60, Math.max(6, Number(payload.months_back) || 36));
    let contactRows = 0, eventRows = 0;
    const problems: string[] = [];
    try{ contactRows = await readContacts(access!, agg.addContact); }
    catch(e){ problems.push("Contacts: " + (e as Error).message); }
    try{ eventRows = await readCalendar(access!, agg.addEvent, months); }
    catch(e){ problems.push("Calendar: " + (e as Error).message); }

    const out = agg.done(row.scopes || []);
    const stats = {contactRows, eventRows, people: out.peopleCount, met: out.metCount,
                   knownWell: out.knownWellCount, months, problems};

    /* Recorded even when a source failed, so "last synced" is honest about a
       partial result instead of reading as a clean run. */
    await admin.from("google_tokens").update({
      last_sync_at: new Date().toISOString(),
      last_sync_err: problems.length ? problems.join(" | ") : null,
      last_sync_stats: stats,
    }).eq("user_id", user.id);

    try{
      await admin.from("imports").insert({user_id:user.id, kind:"google_api", storage_path:null,
        file_name:null, file_bytes:null, derived:stats});
    }catch(_){}

    /* Nothing at all came back and nothing errored: the user unticked both
       scopes on the consent screen. Saying "0 people" with a tick would be the
       same lie the archive step used to tell. */
    if(!contactRows && !eventRows && !problems.length)
      return json({error:"Google returned nothing. On the permission screen, Contacts and Calendar both need to "
        + "stay ticked - without them there is nothing for Mighty to read.", granted: row.scopes}, 400);

    return json({ok:true, google: out, stats, problems});
  }

  return json({error:"Unknown action."}, 400);
});
