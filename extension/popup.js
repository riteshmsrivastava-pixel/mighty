// MIghTy - LinkedIn Outreach · popup
// Status + auth surface only. Shortlisting, templates, and the log all live
// in the MIghTy web app - this popup doesn't duplicate that UI.
//
// Same baked-in Supabase project as index.html (see SETUP.md) - students
// only ever enter their email + password, never a URL or key.
const SUPABASE_URL = 'https://hplyyywdftnvjajyncvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e_oCwuz3Qlko5N3Xl8ZwxA_zQijz_u8';

const $ = id => document.getElementById(id);

async function get(keys) { return await chrome.storage.local.get(keys); }
async function set(obj) { return await chrome.storage.local.set(obj); }

async function render() {
  const { settings = {} } = await get('settings');
  const sb = settings.sb;
  const connected = !!(sb && sb.accessToken);

  $('statusDot').className = 'dot ' + (connected ? 'ok' : 'warn');
  $('statusText').textContent = connected ? `Connected - ${sb.email}` : 'Not connected';
  $('connectedCard').style.display = connected ? 'block' : 'none';
  $('signinDetails').style.display = connected ? 'none' : 'block';
  $('signinDetails').open = !connected;
}

$('sbSignin').onclick = async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { $('sbStatus').textContent = '✕ Extension not configured yet - see SETUP.md.'; return; }
  const email = $('sbEmail').value.trim(), password = $('sbPass').value;
  $('sbStatus').textContent = 'Signing in…';
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'sign-in failed');
    const s = await get('settings'); const settings = s.settings || {};
    settings.sb = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: j.access_token, refreshToken: j.refresh_token, email, userId: j.user && j.user.id };
    await set({ settings });
    $('sbStatus').textContent = '✓ Connected.';
    $('sbPass').value = '';
    render();
  } catch (e) { $('sbStatus').textContent = '✕ ' + (e.message || e); }
};

$('signOutBtn').onclick = async () => {
  const s = await get('settings'); const settings = s.settings || {};
  delete settings.sb;
  await set({ settings });
  render();
};

render();
chrome.storage.onChanged.addListener(render);
