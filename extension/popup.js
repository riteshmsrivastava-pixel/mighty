// MIghTy — MIT Watch · popup

const $ = id => document.getElementById(id);
const rel = ts => { if(!ts) return 'never'; const s=(Date.now()-ts)/1000;
  if(s<60) return 'just now'; if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; };
const uid = () => Math.random().toString(36).slice(2,9);

async function get(keys){ return await chrome.storage.local.get(keys); }
async function set(obj){ return await chrome.storage.local.set(obj); }

async function render(){
  const { watch=[], results={}, settings={}, lastRun, running } = await get(['watch','results','settings','lastRun','running']);
  $('lastrun').textContent = running ? 'refreshing…' : `last refresh ${rel(lastRun)} · ${watch.length} page${watch.length!==1?'s':''}`;
  $('refresh').disabled = !!running;
  $('refresh').textContent = running ? '… working' : '↻ Refresh now';

  // results
  const R = $('results');
  if (!watch.length){ R.innerHTML = `<div class="card mini">No pages yet — add some under “Pages & settings”.</div>`; }
  else {
    R.innerHTML = '';
    for (const it of watch){
      const e = results[it.id] || {};
      const st = e.status || 'none';
      const div = document.createElement('div');
      div.className = 'row';
      div.innerHTML = `<span class="dot ${st}"></span>
        <div class="g">
          <div class="t">${escapeHtml(it.label)}</div>
          <div class="m">${e.summary ? escapeHtml(e.summary) : '<span style="color:var(--mute)">watching: '+escapeHtml(it.watchFor||'')+'</span>'}</div>
          <a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a>
        </div>
        <span class="tag">${rel(e.lastChecked)}</span>`;
      R.appendChild(div);
    }
  }

  // watch list editor
  const WL = $('watchlist');
  WL.innerHTML = '';
  watch.forEach(it => {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<div class="g"><div class="t">${escapeHtml(it.label)}</div><div class="m">${escapeHtml(it.watchFor||'')}</div></div>`;
    const x = document.createElement('button'); x.className='x'; x.textContent='✕';
    x.onclick = async () => { const s = await get('watch'); await set({ watch: (s.watch||[]).filter(w=>w.id!==it.id) }); render(); };
    d.appendChild(x); WL.appendChild(d);
  });

  // settings fields
  $('daily').checked = settings.daily !== false;
  $('anthropicKey').value = settings.anthropicKey || '';
  if (settings.sb){ $('sbUrl').value=settings.sb.url||''; $('sbKey').value=settings.sb.anonKey||'';
    $('sbStatus').textContent = settings.sb.accessToken ? '✓ Connected — results sync to your account.' : ''; }
}

function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escapeAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }

/* events */
$('refresh').onclick = async () => {
  $('refresh').disabled = true; $('refresh').textContent = '… working';
  chrome.runtime.sendMessage({ type:'refreshNow' }, () => {});
  const poll = setInterval(async () => { const { running } = await get('running'); render(); if (!running) clearInterval(poll); }, 1200);
};

$('discover').onclick = () => {
  $('discover').disabled = true; $('discover').textContent = '🔍 discovering…';
  chrome.runtime.sendMessage({ type:'discover' }, (res) => {
    $('discover').disabled = false; $('discover').textContent = '🔍 Auto-discover linked pages';
    if (res) $('discoverNote').textContent = `Added ${res.added} page${res.added!==1?'s':''} · now watching ${res.total}. Hit “Refresh now” to read them.`;
    render();
  });
};

$('add').onclick = async () => {
  let url = $('newUrl').value.trim();
  if (!url) { $('newUrl').focus(); $('newUrl').style.borderColor = 'var(--brand)'; return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;          // tolerate "canvas.mit.edu"
  let label = $('newLabel').value.trim();
  if (!label) { try { label = new URL(url).hostname.replace(/^www\./,'').replace(/\.mit\.edu$/,''); } catch(e){ label = url; } }
  const watchFor = $('newWatch').value.trim() || 'anything new or changed';
  const s = await get('watch');
  await set({ watch: [ ...(s.watch||[]), { id: uid(), label, url, watchFor } ] });
  $('newLabel').value=''; $('newUrl').value=''; $('newWatch').value=''; $('newUrl').style.borderColor='';
  render();
};

$('daily').onchange = async () => {
  const s = await get('settings'); const settings = s.settings || {};
  settings.daily = $('daily').checked; await set({ settings });
  chrome.runtime.sendMessage({ type:'setDaily', on: settings.daily }, () => {});
};

$('saveAnthropic').onclick = async () => {
  const s = await get('settings'); const settings = s.settings || {};
  settings.anthropicKey = $('anthropicKey').value.trim(); await set({ settings });
  $('saveAnthropic').textContent = 'Saved ✓'; setTimeout(()=>$('saveAnthropic').textContent='Save', 1200);
};

$('sbSignin').onclick = async () => {
  const url = $('sbUrl').value.trim().replace(/\/$/,''), anonKey = $('sbKey').value.trim();
  const email = $('sbEmail').value.trim(), password = $('sbPass').value;
  $('sbStatus').textContent = 'Signing in…';
  try{
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method:'POST', headers:{ apikey: anonKey, 'content-type':'application/json' },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'sign-in failed');
    const s = await get('settings'); const settings = s.settings || {};
    settings.sb = { url, anonKey, accessToken: j.access_token, refreshToken: j.refresh_token, email };
    await set({ settings });
    $('sbStatus').textContent = '✓ Connected — results sync to your account.';
    $('sbPass').value = '';
  }catch(e){ $('sbStatus').textContent = '✕ ' + (e.message || e); }
};

render();
chrome.storage.onChanged.addListener(render);
