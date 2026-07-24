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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pushInbox') {
    pushInboxWithRetry(msg.kind, msg.payload).then(sendResponse);
    return true; // async response
  }
});
