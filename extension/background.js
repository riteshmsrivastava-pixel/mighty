// MIghTy — LinkedIn Outreach · background service worker
//
// This is a thin relay ONLY. It never opens tabs, never navigates, never
// clicks anything — it just forwards events the content script observed
// (in a page the student themselves opened) to Supabase's outreach_inbox.
// No alarms, no scheduled jobs: nothing runs unless the student is actively
// browsing LinkedIn themselves.

async function pushInbox(kind, payload) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const sb = settings.sb;
  if (!sb || !sb.url || !sb.anonKey || !sb.accessToken) return { ok: false, error: 'not_signed_in' };

  const doPost = (accessToken) => fetch(`${sb.url}/rest/v1/outreach_inbox`, {
    method: 'POST',
    headers: {
      apikey: sb.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ kind, payload }),
  });

  let res;
  try { res = await doPost(sb.accessToken); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }

  if (res.status === 401 && sb.refreshToken) {
    // Access token expired — refresh once and retry.
    try {
      const r = await fetch(`${sb.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: sb.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: sb.refreshToken }),
      });
      const j = await r.json();
      if (r.ok && j.access_token) {
        settings.sb = { ...sb, accessToken: j.access_token, refreshToken: j.refresh_token || sb.refreshToken };
        await chrome.storage.local.set({ settings });
        res = await doPost(j.access_token);
      }
    } catch (e) { /* fall through with original failure */ }
  }
  return { ok: res.ok, status: res.status };
}

// One retry with backoff — a lost "sent confirmation" matters more than a
// lost "shortlisted" event, and there's no daily job to catch it later.
async function pushInboxWithRetry(kind, payload) {
  let r = await pushInbox(kind, payload);
  if (!r.ok) { await new Promise(res => setTimeout(res, 2000)); r = await pushInbox(kind, payload); }
  return r;
}

// Authenticated GET of the signed-in student's OWN outreach_log + outreach_events
// (RLS scopes this automatically — no user_id filter needed). Used to decorate
// LinkedIn pages with real score/status data for profiles already tracked in
// MIghTy. Cached briefly so scanning a results page doesn't refetch per-card.
let logCache = { at: 0, log: [], events: [], targetCompanies: [], goal: '', profile: {} };
const LOG_CACHE_TTL = 5 * 60 * 1000;
async function fetchLog(force) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const sb = settings.sb;
  if (!sb || !sb.url || !sb.accessToken) return { ok: false, error: 'not_signed_in' };
  if (!force && Date.now() - logCache.at < LOG_CACHE_TTL) return { ok: true, ...logCache };
  const headers = { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}` };
  try {
    const [logRes, eventsRes, userDataRes] = await Promise.all([
      fetch(`${sb.url}/rest/v1/outreach_log?select=*`, { headers }),
      fetch(`${sb.url}/rest/v1/outreach_events?select=*`, { headers }),
      fetch(`${sb.url}/rest/v1/user_data?select=data`, { headers }),
    ]);
    if (!logRes.ok || !eventsRes.ok) return { ok: false, error: 'fetch_failed' };
    const log = await logRes.json(); const events = await eventsRes.json();
    // The sidebar answers "why this person?" locally, so it needs the same goal
    // signals the web app scores with — not just target companies.
    let targetCompanies = [], goal = '', profile = {};
    try {
      const ud = await userDataRes.json(); const st = ud?.[0]?.data?.settings || {};
      targetCompanies = st.targetCompanies || []; goal = st.goal || '';
      profile = {
        targetRoles: st.targetRoles || [], schools: st.schools || [], industries: st.industries || [],
        skills: st.skills || [], targetLocations: st.targetLocations || [], homeLocation: st.homeLocation || '',
      };
    } catch (e) {}
    logCache = { at: Date.now(), log, events, targetCompanies, goal, profile };
    return { ok: true, log, events, targetCompanies, goal, profile };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Direct upsert into outreach_log — used only for the explicit "Save to
// MIghTy" action (sidebar's Save button, search-results' Send-N-to-MIghTy
// panel). Unlike the passive sent-confirmation/profile-context observations,
// this is a deliberate save, so it goes straight to outreach_log instead of
// round-tripping through outreach_inbox and waiting for the web app to be
// open to ingest it — otherwise the sidebar keeps saying "not tracked" even
// right after the student clicked Save.
async function saveProfile(payload) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const sb = settings.sb;
  if (!sb || !sb.url || !sb.anonKey || !sb.accessToken) return { ok: false, error: 'not_signed_in' };

  const doPost = (accessToken) => fetch(`${sb.url}/rest/v1/outreach_log?on_conflict=user_id,profile_url`, {
    method: 'POST',
    headers: {
      apikey: sb.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      profile_url: payload.profileUrl,
      name: payload.name || null,
      title: payload.title || null,
      company: payload.company || null,
      avatar_url: payload.avatarUrl || null,
      // Location only exists in the rendered page, so carry it through here
      // into the same context blob the web app reads.
      ...(payload.location ? { context: { location: payload.location, source: 'profile' } } : {}),
      updated_at: new Date().toISOString(),
    }),
  });

  let res;
  try { res = await doPost(sb.accessToken); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }

  if (res.status === 401 && sb.refreshToken) {
    try {
      const r = await fetch(`${sb.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: sb.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: sb.refreshToken }),
      });
      const j = await r.json();
      if (r.ok && j.access_token) {
        settings.sb = { ...sb, accessToken: j.access_token, refreshToken: j.refresh_token || sb.refreshToken };
        await chrome.storage.local.set({ settings });
        res = await doPost(j.access_token);
      }
    } catch (e) { /* fall through with original failure */ }
  }
  if (!res.ok) return { ok: false, status: res.status };
  const rows = await res.json().catch(() => []);
  const row = rows[0];
  if (row) logCache.log = [row, ...logCache.log.filter(r => r.id !== row.id)];
  return { ok: true, row };
}

// Direct PATCH to outreach_log.notes — that table already has an update
// policy (unlike outreach_inbox/outreach_events), so this doesn't need to
// go through the inbox relay.
async function patchNotes(logId, notes) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const sb = settings.sb;
  if (!sb || !sb.url || !sb.accessToken) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${sb.url}/rest/v1/outreach_log?id=eq.${logId}`, {
      method: 'PATCH',
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ notes, updated_at: new Date().toISOString() }),
    });
    return { ok: res.ok };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Calls the shared ai-proxy Edge Function directly — same auth pattern as
// pushInbox, so the docked sidebar can draft a follow-up without opening the
// web app. No API key here either; the proxy holds it server-side.
async function generateDraft(system, user, maxTokens, feature) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const sb = settings.sb;
  if (!sb || !sb.url || !sb.accessToken) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${sb.url}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ feature: feature || 'draft_message', system, user, maxTokens: maxTokens || 700 }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) return { ok: false, error: data.message || data.error || 'ai_failed' };
    return { ok: true, text: data.text };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// LinkedIn profile photos are served from media.licdn.com as signed, expiring,
// referrer-locked URLs — they do NOT hotlink from the MIghTy web app (they load
// on linkedin.com and nowhere else). So we fetch the bytes here (host permission
// for licdn.com bypasses CORS), downscale to a small square thumbnail, and hand
// back a self-contained base64 data URL to store. That renders anywhere, forever,
// with no network call. ~4 KB per contact.
async function encodeAvatar(url) {
  try {
    if (!url || /^data:/.test(url)) return { ok: false };
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: 'http_' + r.status };
    const blob = await r.blob();
    const bmp = await createImageBitmap(blob);
    const S = 128;
    const oc = new OffscreenCanvas(S, S);
    const ctx = oc.getContext('2d');
    const side = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - side) / 2, sy = (bmp.height - side) / 2;
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, S, S);
    const outBlob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    // Build the data URL without FileReader (not available in MV3 service workers).
    const bytes = new Uint8Array(await outBlob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const dataUrl = 'data:image/jpeg;base64,' + btoa(bin);
    return { ok: true, dataUrl };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

// Fetches a people-search results page and hands the raw HTML back to the
// caller to parse (service workers have no DOM). Only the background worker can
// read a cross-origin page — content scripts are still bound by CORS. This is
// what lets the web app show search results without sending the student off to
// Google or LinkedIn: one foreground search they asked for, no page navigation.
async function fetchSearchHtml(query) {
  const url = 'https://www.google.com/search?num=20&q=' + encodeURIComponent('site:linkedin.com/in ' + query);
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { ok: false, error: 'http_' + res.status };
    const html = await res.text();
    return { ok: true, html };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

// Reading one profile page to recover a missing photo. Deliberately throttled:
// requests are serialised with a minimum gap and capped per browser session, so
// this never becomes the burst-of-requests pattern that gets accounts flagged.
// It only ever runs for people the student already saved, on their explicit
// click — never speculatively, never in bulk.
const PHOTO_MIN_GAP_MS = 3000;
const PHOTO_SESSION_CAP = 25;
let photoLastAt = 0, photoCount = 0, photoChain = Promise.resolve();
async function fetchProfilePhotoInner(profileUrl) {
  if (!/^https:\/\/(www\.)?linkedin\.com\/in\//.test(profileUrl || '')) return { ok: false, error: 'bad_url' };
  if (photoCount >= PHOTO_SESSION_CAP) return { ok: false, error: 'session_cap' };
  const wait = Math.max(0, PHOTO_MIN_GAP_MS - (Date.now() - photoLastAt));
  if (wait) await new Promise(r => setTimeout(r, wait));
  photoLastAt = Date.now(); photoCount++;
  try {
    const res = await fetch(profileUrl, { credentials: 'include' });
    if (!res.ok) return { ok: false, error: 'http_' + res.status };
    const html = await res.text();
    const m = html.match(/https:\/\/media\.licdn\.com\/dms\/image\/[^"'\\\s]+profile-displayphoto[^"'\\\s]*/i);
    if (!m) return { ok: false, error: 'no_photo' };
    const url = m[0].replace(/&amp;/g, '&');
    const enc = await encodeAvatar(url);
    return enc && enc.ok ? { ok: true, dataUrl: enc.dataUrl } : { ok: false, error: 'encode_failed' };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
function fetchProfilePhoto(profileUrl) {
  photoChain = photoChain.then(() => fetchProfilePhotoInner(profileUrl), () => fetchProfilePhotoInner(profileUrl));
  return photoChain;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'encodeAvatar') { encodeAvatar(msg.url).then(sendResponse); return true; }
  if (msg && msg.type === 'fetchSearchHtml') { fetchSearchHtml(msg.query).then(sendResponse); return true; }
  if (msg && msg.type === 'fetchProfilePhoto') { fetchProfilePhoto(msg.profileUrl).then(sendResponse); return true; }
  if (msg && msg.type === 'pushInbox') { pushInboxWithRetry(msg.kind, msg.payload).then(sendResponse); return true; }
  if (msg && msg.type === 'fetchLog') { fetchLog(msg.force).then(sendResponse); return true; }
  if (msg && msg.type === 'saveProfile') { saveProfile(msg.payload).then(sendResponse); return true; }
  if (msg && msg.type === 'patchNotes') { patchNotes(msg.logId, msg.notes).then(sendResponse); return true; }
  if (msg && msg.type === 'generateDraft') { generateDraft(msg.system, msg.user, msg.maxTokens).then(sendResponse); return true; }
});

// Toolbar icon reflects sign-in state — colored when signed in, grey otherwise.
const COLOR_ICON = { 16: 'icons/logo-16.png', 32: 'icons/logo-32.png', 48: 'icons/logo-48.png', 128: 'icons/logo-128.png' };
const GREY_ICON = { 16: 'icons-grey/logo-16.png', 32: 'icons-grey/logo-32.png', 48: 'icons-grey/logo-48.png', 128: 'icons-grey/logo-128.png' };
async function updateActionIcon() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const connected = !!(settings.sb && settings.sb.accessToken);
  chrome.action.setIcon({ path: connected ? COLOR_ICON : GREY_ICON });
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) updateActionIcon(); });
updateActionIcon();
