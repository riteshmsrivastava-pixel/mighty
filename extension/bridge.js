// MIghTy — web-app bridge
//
// Runs only on the MIghTy web app's own pages. It lets the app ask the
// extension to do the two things a web page cannot do for itself:
//
//   1. read a cross-origin search results page (CORS blocks the page; the
//      extension's background worker has host permission), and
//   2. turn a LinkedIn photo URL into a self-contained thumbnail (those URLs
//      are signed and referrer-locked, so they never render off LinkedIn).
//
// Nothing here navigates, clicks or posts anything. It answers questions the
// student explicitly asked by pressing Search, and the results are shown in the
// app for them to choose from — no page ever opens in their face.
(() => {
  const TAG_IN = 'mighty-app';   // page  -> extension
  const TAG_OUT = 'mighty-ext';  // extension -> page

  function reply(id, payload) {
    window.postMessage({ source: TAG_OUT, id, ...payload }, window.location.origin);
  }
  function send(type, extra) {
    return new Promise(resolve => chrome.runtime.sendMessage({ type, ...extra }, resolve));
  }

  // Google's markup rotates, so anchor on the only durable things: links that
  // point at /in/ profiles, and the <h3> heading inside the same result block.
  function parseProfiles(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set(), out = [];
    for (const a of doc.querySelectorAll('a[href*="linkedin.com/in/"]')) {
      let href = a.getAttribute('href') || '';
      if (/^\/url\?/.test(href)) { const m = href.match(/[?&]q=([^&]+)/); if (m) href = decodeURIComponent(m[1]); }
      if (!/linkedin\.com\/in\//.test(href)) continue;
      let url;
      try { const u = new URL(href); url = (u.origin + u.pathname).replace(/\/$/, ''); } catch (e) { continue; }
      if (seen.has(url)) continue;

      let card = a;
      for (let i = 0; i < 6 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('h3')) break; }
      const h3 = card.querySelector('h3');
      let title = ((h3 && h3.textContent) || '').trim();
      title = title.replace(/\s*[|·]?\s*LinkedIn\s*$/i, '').replace(/\s*[.…]+\s*$/, '').trim();
      if (!title) continue;
      const parts = title.split(/\s+[-–—]\s+/);
      const name = (parts[0] || '').trim();
      if (!name || name.length > 60 || /^https?:/i.test(name)) continue;
      const headline = parts.slice(1).join(' - ').trim();
      const at = headline.match(/\bat\s+(.+?)(?:\s*[·|]|$)/i) || headline.match(/@\s*(.+?)(?:\s*[·|]|$)/);
      seen.add(url);
      out.push({ profileUrl: url, name, title: headline, company: at ? at[1].trim() : '' });
      if (out.length >= 12) break;
    }
    return out;
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;                       // ignore other frames
    const d = ev.data;
    if (!d || d.source !== TAG_IN || !d.id) return;

    if (d.kind === 'ping') { reply(d.id, { ok: true, version: chrome.runtime.getManifest().version }); return; }

    if (d.kind === 'search') {
      const r = await send('fetchSearchHtml', { query: String(d.query || '') });
      if (!r || !r.ok) { reply(d.id, { ok: false, error: (r && r.error) || 'search_failed' }); return; }
      const people = parseProfiles(r.html);
      reply(d.id, { ok: true, people });
      return;
    }

    // Photo for one profile: fetch that profile page, pull the display-photo URL
    // out of it, and encode it to a thumbnail. Called one person at a time by
    // the app, on the student's explicit request.
    if (d.kind === 'photo') {
      const r = await send('fetchProfilePhoto', { profileUrl: String(d.profileUrl || '') });
      reply(d.id, r || { ok: false });
      return;
    }
  });

  // Announce availability so the app can prefer the in-app path when present.
  window.postMessage({ source: TAG_OUT, id: 'ready', ok: true, ready: true }, window.location.origin);
})();
