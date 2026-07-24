// MIghTy — LinkedIn Outreach · popup
// Status + auth surface only. Shortlisting, templates, and the log all live
// in the MIghTy web app — this popup doesn't duplicate that UI.

const $ = id => document.getElementById(id);

async function get(keys) { return await chrome.storage.local.get(keys); }
async function set(obj) { return await chrome.storage.local.set(obj); }

function weekStartUTC(ts = Date.now()) {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff);
}

async function render() {
  const { settings = {} } = await get('settings');
  const sb = settings.sb;
  const connected = !!(sb && sb.accessToken);

  $('statusDot').className = 'dot ' + (connected ? 'ok' : 'warn');
  $('statusText').textContent = connected ? `Connected — ${sb.email}` : 'Not connected';
  $('connectedCard').style.display = connected ? 'block' : 'none';
  $('signinDetails').open = !connected;

  if (connected) {
    try {
      const res = await fetch(
        `${sb.url}/rest/v1/outreach_log?user_id=eq.${encodeURIComponent(sb.userId||'')}&status=eq.sent&sent_at=gte.${new Date(weekStartUTC()).toISOString()}&select=id`,
        { headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}` } }
      );
      if (res.ok) { const rows = await res.json(); $('weekCount').textContent = `${rows.length}/100`; }
    } catch (e) { /* leave placeholder */ }
  }
}

$('sbSignin').onclick = async () => {
  const url = $('sbUrl').value.trim().replace(/\/$/, ''), anonKey = $('sbKey').value.trim();
  const email = $('sbEmail').value.trim(), password = $('sbPass').value;
  $('sbStatus').textContent = 'Signing in…';
  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'sign-in failed');
    const s = await get('settings'); const settings = s.settings || {};
    settings.sb = { url, anonKey, accessToken: j.access_token, refreshToken: j.refresh_token, email, userId: j.user && j.user.id };
    await set({ settings });
    $('sbStatus').textContent = '✓ Connected.';
    $('sbPass').value = '';
    render();
  } catch (e) { $('sbStatus').textContent = '✕ ' + (e.message || e); }
};

render();
chrome.storage.onChanged.addListener(render);
