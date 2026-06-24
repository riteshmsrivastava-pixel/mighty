// MIghTy — MIT Watch · background service worker
// Runs daily (and on demand): opens each watched MIT page in a background tab,
// reads it in YOUR logged-in session, detects what changed, optionally summarizes
// with Claude, and optionally pushes to your MIghTy (Supabase) account.

const DEFAULT_WATCH = [
  { id: 'sloanhub',  label: 'SloanHub — Dashboard',       url: 'https://sloanhub.mit.edu/',                       watchFor: 'new announcements, tasks, or action items' },
  { id: 'funding',   label: 'SloanHub — Student Funding',  url: 'https://sloanhub.mit.edu/pages/student-funding',  watchFor: 'new funding/fellowship opportunities and their deadlines' },
];

/* ---------- helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hash(s){ let h = 5381; for (let i=0;i<s.length;i++){ h = ((h<<5)+h) + s.charCodeAt(i); h |= 0; } return h>>>0; }
function looksLikeLogin(url, text){
  if (/idp\.mit\.edu|shibboleth|\/wayf|duosecurity|cas\/login|login\.mit\.edu|oidc\/authorize/i.test(url||'')) return true;
  if (/touchstone/i.test(text||'') && /password/i.test(text||'') && (text||'').length < 4000) return true;
  return false;
}

function waitForComplete(tabId, timeout){
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(to); chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const to = setTimeout(finish, timeout);
    function listener(id, info){ if (id === tabId && info.status === 'complete') finish(); }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrape(url){
  let tab;
  try{
    tab = await chrome.tabs.create({ url, active: false });
    await waitForComplete(tab.id, 25000);
    await sleep(2800); // let single-page apps render
    const out = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ url: location.href, title: document.title, text: ((document.body && document.body.innerText) || '').slice(0, 12000) })
    });
    return out && out[0] ? out[0].result : { error: 'no result' };
  } catch(e){ return { error: String((e && e.message) || e) }; }
  finally { if (tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch(e){} } }
}

async function summarize(item, text, settings){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type':'application/json', 'x-api-key': settings.anthropicKey,
      'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model: settings.model || 'claude-sonnet-4-6', max_tokens: 300,
      system: `Summarize ONLY what is relevant to: "${item.watchFor}". 1-2 sentences, include any dates. On a final line output exactly one word: ok, changed, or attention.`,
      messages: [{ role:'user', content: text.slice(0, 8000) }] })
  });
  const j = await r.json();
  const out = ((j.content && j.content[0] && j.content[0].text) || '').trim();
  const last = (out.split('\n').pop() || '').toLowerCase();
  const status = /attention/.test(last) ? 'attention' : /changed/.test(last) ? 'changed' : 'ok';
  return { summary: out.replace(/\n?(ok|changed|attention)\s*$/i, '').trim(), status };
}

async function pushSupabase(sb, payload){
  const res = await fetch(`${sb.url}/rest/v1/watch_results`, {
    method: 'POST',
    headers: { apikey: sb.anonKey, Authorization: `Bearer ${sb.accessToken}`,
      'content-type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify({ payload })
  });
  return res.ok;
}

/* ---------- the refresh run ---------- */
let RUNNING = false;
async function runRefresh(){
  if (RUNNING) return;
  RUNNING = true;
  try {
    const store = await chrome.storage.local.get(['watch','settings','results']);
    const watch = store.watch || [];
    const settings = store.settings || {};
    const results = store.results || {};
    if (!watch.length) return;
    await chrome.storage.local.set({ running: true });

    for (const item of watch){
      const r = await scrape(item.url);
      let entry = results[item.id] || {};
      if (r.error){
        entry = { ...entry, label:item.label, url:item.url, status:'error', summary:r.error, lastChecked: Date.now() };
      } else if (looksLikeLogin(r.url, r.text)){
        entry = { ...entry, label:item.label, url:item.url, status:'login', summary:'Needs MIT login — open the page, sign in, then refresh.', lastChecked: Date.now() };
      } else {
        const h = hash(r.text);
        const changed = entry.hash !== undefined && entry.hash !== h;
        let status = changed ? 'changed' : 'ok';
        let summary = (r.text || '').replace(/\s+/g,' ').trim().slice(0, 240);
        if (settings.anthropicKey){
          try { const s = await summarize(item, r.text, settings); summary = s.summary; status = s.status; } catch(e){}
        }
        entry = { ...entry, label:item.label, url:item.url, title:r.title, hash:h, status, summary, lastChecked: Date.now() };
        if (settings.sb && settings.sb.url && settings.sb.anonKey && settings.sb.accessToken){
          try { await pushSupabase(settings.sb, [{ id:item.id, label:item.label, latest:summary, status }]); } catch(e){}
        }
      }
      results[item.id] = entry;
      await chrome.storage.local.set({ results });
    }
    await chrome.storage.local.set({ lastRun: Date.now() });
  } finally {
    RUNNING = false;
    await chrome.storage.local.set({ running: false });
  }
}

/* ---------- wiring ---------- */
chrome.runtime.onInstalled.addListener(async () => {
  const { watch } = await chrome.storage.local.get('watch');
  if (!watch) await chrome.storage.local.set({ watch: DEFAULT_WATCH, settings: { daily: true } });
  chrome.alarms.create('dailyRefresh', { periodInMinutes: 1440, delayInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(a => { if (a.name === 'dailyRefresh') runRefresh(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'refreshNow'){ runRefresh().then(() => sendResponse({ ok:true })); return true; }
  if (msg && msg.type === 'setDaily'){
    chrome.alarms.clear('dailyRefresh');
    if (msg.on) chrome.alarms.create('dailyRefresh', { periodInMinutes: 1440, delayInMinutes: 1 });
    sendResponse({ ok:true });
  }
});
