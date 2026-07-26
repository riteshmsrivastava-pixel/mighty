// MIghTy - web-app bridge
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
// app for them to choose from - no page ever opens in their face.
(() => {
  const TAG_IN = 'mighty-app';   // page  -> extension
  const TAG_OUT = 'mighty-ext';  // extension -> page

  function reply(id, payload) {
    window.postMessage({ source: TAG_OUT, id, ...payload }, window.location.origin);
  }
  function send(type, extra) {
    return new Promise(resolve => chrome.runtime.sendMessage({ type, ...extra }, resolve));
  }

  // A rate-limited or challenged response is still HTTP 200 with real HTML, and
  // it contains no /in/ links - so parsing it looks exactly like "nobody
  // matched". That silence is the worst failure mode available: the student
  // rewords a perfectly good query five times against a wall. Detect it and
  // say so instead.
  function looksBlocked(html) {
    const head = String(html || '').slice(0, 4000).toLowerCase();
    return /\/sorry\/index|unusual traffic|recaptcha|g-recaptcha|our systems have detected/.test(head);
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
      const parts = title.split(/\s+[-\u2013\u2014]\s+/);  // hyphen, en dash, em dash: escaped so a text-level purge cannot corrupt the class
      const name = (parts[0] || '').trim();
      if (!name || name.length > 60 || /^https?:/i.test(name)) continue;
      const headline = parts.slice(1).join(' - ').trim();
      const at = headline.match(/\bat\s+(.+?)(?:\s*[·|]|$)/i) || headline.match(/@\s*(.+?)(?:\s*[·|]|$)/);

      // Google's snippet carries far more than the headline - location,
      // experience, education, follower counts. It costs nothing extra to read
      // (it's already in the page we fetched) and needs no LinkedIn request.
      let blk = card;
      for (let i = 0; i < 4 && blk.parentElement; i++) { blk = blk.parentElement; if ((blk.innerText || '').length > 140) break; }
      let snip = (blk.innerText || '').replace(/\s+/g, ' ').trim();
      snip = snip.split(title).slice(1).join(' ').trim();           // drop the heading
      snip = snip.replace(/^(LinkedIn\s*·\s*[^·]{0,60}?(?:[\d.]+K?\+?\s*followers)?\s*)+/i, '').trim();
      const grab = re => { const m = snip.match(re); return m ? m[1].replace(/\s*[·|].*$/, '').trim().slice(0, 90) : ''; };

      // Google dropped the "Location:" / "Education:" labels these patterns were
      // written against, so they now match nothing. Measured against live results
      // on 26 July 2026: name and followers came back for 10 of 10, and location,
      // education and experience for 0 to 1 of 10. The labelled forms are kept as
      // a first attempt because the format still varies by locale and query type,
      // with positional parsing below as the path that actually works.
      //
      // The shape now is:
      //   <Name><n>+ followersLinkedIn · <Name><n>+ followers<LOCATION> · <TITLE> · <COMPANY><about text>
      // Location is glued straight onto the second "followers" with no separator,
      // and company runs into the About text with no separator either.
      const followers = grab(/([\d.,]+K?\+?)\s*followers/i);
      const connections = grab(/([\d.,]+\+?)\s*connections/i);

      // The first "followers" is followed by "LinkedIn"; the second is followed by
      // the location, so skip the one that isn't.
      const locM = snip.match(/followers(?!LinkedIn)([A-Z][^·]{2,60}?)\s+·/);
      const location = grab(/Location:\s*([^·]+)/i)
        || (locM ? locM[1].trim() : '')
        || grab(/^([A-Z][A-Za-z.\- ]+,\s*[A-Za-z.\- ]+(?:,\s*[A-Za-z.\- ]+)?)\s*·/);

      // Company is the fourth middot segment, joined to the About text at a
      // lowercase-then-uppercase boundary. Only a fallback: company parsed out of
      // the title ("... at X") is more reliable and takes precedence below.
      // Known limitation: a camelCase brand splits wrongly, so PayPal would yield
      // "Pay". The four-character floor rejects the worst of those rather than
      // emitting a confident fragment.
      const segs = snip.split(/\s+·\s+/);
      const coCut = ((segs[3] || '').split(/(?<=[a-z])(?=[A-Z])/)[0] || '').trim();
      const snippetCompany = (coCut.length >= 4 && coCut.length <= 45) ? coCut : '';

      // Not currently returned by Google in any of the results measured. Left in
      // so a restored label starts working again on its own, but nothing should
      // be built on the assumption that search supplies education.
      const education = grab(/Education:\s*([^·]+)/i);
      const experience= grab(/Experience:\s*([^·]+)/i);

      seen.add(url);
      out.push({
        profileUrl: url, name, title: headline,
        // Title-derived first ("Senior Product Manager at Hi Marley" gives
        // exactly "Hi Marley"), then the snippet's fourth segment, then the
        // Experience label if Google happens to still be sending one.
        company: (at ? at[1].trim() : '') || snippetCompany || experience,
        location, education, experience, followers, connections,
        snippet: snip.slice(0, 300),
      });
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
      if (!people.length && looksBlocked(r.html)) { reply(d.id, { ok: false, error: 'blocked' }); return; }
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
