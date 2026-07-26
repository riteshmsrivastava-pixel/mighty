// MIghTy - LinkedIn Outreach · popup
// Status + auth surface only. Shortlisting, templates, and the log all live
// in the MIghTy web app - this popup doesn't duplicate that UI.
//
// Same baked-in Supabase project as index.html (see SETUP.md) - students
// only ever enter their @mit.edu email + password, never a URL or key.
const SUPABASE_URL = 'https://hplyyywdftnvjajyncvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e_oCwuz3Qlko5N3Xl8ZwxA_zQijz_u8';

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
  $('statusText').textContent = connected ? `Connected - ${sb.email}` : 'Not connected';
  $('connectedCard').style.display = connected ? 'block' : 'none';
  $('signinDetails').style.display = connected ? 'none' : 'block';
  $('signinDetails').open = !connected;

  if (connected) {
    const H = { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}` };
    try {
      const res = await fetch(
        `${sb.url}/rest/v1/outreach_log?status=eq.contacted&contacted_at=gte.${new Date(weekStartUTC()).toISOString()}&select=id`,
        { headers: H }
      );
      if (res.ok) { const rows = await res.json(); $('weekCount').textContent = `${rows.length}/100`; }
    } catch (e) { /* leave placeholder */ }
    // Plan + MIghTy Assists used this month (fails soft if the gateway isn't deployed).
    try {
      const d = new Date();
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
      const [planRes, cfgRes, usedRes] = await Promise.all([
        fetch(`${sb.url}/rest/v1/user_plans?select=plan`, { headers: H }),
        fetch(`${sb.url}/rest/v1/ai_config?id=eq.1&select=explorer_monthly_assists,builder_monthly_assists`, { headers: H }),
        fetch(`${sb.url}/rest/v1/ai_call_log?cache_hit=eq.false&created_at=gte.${monthStart}&select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }),
      ]);
      if (planRes.ok && cfgRes.ok) {
        const plan = ((await planRes.json())[0] || {}).plan || 'explorer';
        const cfg = (await cfgRes.json())[0] || {};
        const cap = plan === 'leader' ? null : plan === 'builder' ? (cfg.builder_monthly_assists || 300) : (cfg.explorer_monthly_assists || 25);
        const cr = usedRes.headers.get('content-range') || '';
        const used = cr.includes('/') ? parseInt(cr.split('/')[1], 10) || 0 : 0;
        const label = plan.charAt(0).toUpperCase() + plan.slice(1);
        $('planLine').textContent = `${label} · ${used}${cap != null ? '/' + cap : ''} assists this month`;
        $('planLine').style.display = 'block';
      }
    } catch (e) { /* gateway not deployed - leave hidden */ }
  }
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
