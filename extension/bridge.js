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

  // Company parsing, out here so the rules are readable rather than buried in
  // the loop. Every one earns its place from a measured failure - see the notes
  // at the call site.
  // Split at a camelCase boundary OR an acronym boundary: the second is what
  // separates "SAP" from "SAPSenior Director...", where the first cannot.
  const CO_BOUNDARY = /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;
  const CO_ACRONYM = /^[A-Z]{2,4}$/;                                    // SAP, IBM, AWS, GE
  const CO_ROLE_PREFIX = /^(head|vp|vice president|director|chief|svp|evp)\s+of\b/i;
  const CO_ROLE_NOUN = /\b(analyst|manager|engineer|consultant|specialist|coordinator|intern|recruiter|designer)\b/i;
  const CO_LEVEL = /\b(i{1,3}|iv|v)$/i;                                 // "Analyst II"

  function reply(id, payload) {
    window.postMessage({ source: TAG_OUT, id, ...payload }, window.location.origin);
  }
  // Updating or reloading the extension leaves this script running in any page
  // that was already open, with a dead chrome.runtime handle. sendMessage then
  // throws "Extension context invalidated" synchronously, which surfaced as an
  // uncaught rejection and left the caller waiting out its full timeout. Answer
  // straight away instead, so the app can say something useful.
  function send(type, extra) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type, ...extra }, (res) => {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: 'extension_reloaded' }); return; }
          resolve(res);
        });
      } catch (e) {
        resolve({ ok: false, error: 'extension_reloaded' });
      }
    });
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
  // point at /in/ profiles (still handled, in case a locale or a future
  // rollback ever sends one directly again), and now - the normal case -
  // links that point at Google's own /goto?url=<token> redirector, which
  // carries no readable URL at all. Cards behind a redirector come back
  // with url:null here; the caller resolves those via background.js's
  // resolveGotoUrls before anything is usable. The <h3> heading inside the
  // same result block is what everything else (name, headline, snippet) is
  // still anchored on either way - that part of Google's markup hasn't moved.
  function parseCards(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seenHref = new Set(), out = [];
    for (const a of doc.querySelectorAll('a[href*="linkedin.com/in/"], a[href^="/goto?url="]')) {
      let href = a.getAttribute('href') || '';
      if (/^\/url\?/.test(href)) { const m = href.match(/[?&]q=([^&]+)/); if (m) href = decodeURIComponent(m[1]); }
      let url = null;
      if (/linkedin\.com\/in\//.test(href)) {
        // Deliberately no base-URL argument here: these hrefs are always
        // absolute, and this function also declares its own local `location`
        // further down (the parsed person's location text) - passing
        // window.location as a base would shadow into that name and throw a
        // temporal-dead-zone ReferenceError on every single candidate.
        try { const u = new URL(href); url = (u.origin + u.pathname).replace(/\/$/, ''); } catch (e) { continue; }
      } else if (!/^\/goto\?url=/.test(href)) {
        continue;
      }
      if (seenHref.has(href)) continue;
      seenHref.add(href);

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

      // Company is the fourth middot segment, joined to the About text with no
      // separator. Only a fallback: company parsed out of the title ("... at X")
      // was right in every measured case and takes precedence below.
      //
      // Measured on the 26 July run, this slot produced three confidently wrong
      // values out of ten, which is worse than three blanks: company reaches the
      // draft prompt, so a wrong one comes out of the user's own mouth in a
      // message to a stranger, and nothing in the interface would reveal it. Each
      // rule below exists because of a specific observed failure.
      const segs = snip.split(/\s+·\s+/);
      const coCut = ((segs[3] || '').split(CO_BOUNDARY)[0] || '').trim();
      const snippetCompany =
        (!coCut || coCut.length > 45) ? ''
        // Short is only trustworthy when acronym-shaped. "Pay" out of PayPal is a
        // split artefact; "SAP" out of SAPSenior is the actual employer.
        : (coCut.length < 4 && !CO_ACRONYM.test(coCut)) ? ''
        // A job title here means the segments did not line up at all: observed
        // "Head of Product, Crash" and "Business Analyst II" landing in this slot.
        : (CO_ROLE_PREFIX.test(coCut) || CO_ROLE_NOUN.test(coCut) || CO_LEVEL.test(coCut)) ? ''
        : coCut;

      // Not currently returned by Google in any of the results measured. Left in
      // so a restored label starts working again on its own, but nothing should
      // be built on the assumption that search supplies education.
      const education = grab(/Education:\s*([^·]+)/i);
      const experience= grab(/Experience:\s*([^·]+)/i);

      out.push({
        href, profileUrl: url, name, title: headline,
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

  // Cards whose profileUrl is still null came back behind a /goto redirector
  // and need the background worker to resolve it (see resolveGotoUrls in
  // background.js for why that step can't happen here, in the page). Cards
  // that already had a direct URL skip the round trip entirely.
  async function resolveCards(cards) {
    const need = cards.filter(c => !c.profileUrl).map(c => c.href);
    let resolved = {};
    if (need.length) {
      const r = await send('resolveGotoUrls', { hrefs: need, requireLinkedinProfile: true });
      resolved = (r && r.resolved) || {};
    }
    const seen = new Set(), out = [];
    for (const c of cards) {
      const url = c.profileUrl || resolved[c.href];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const { href, profileUrl, ...rest } = c;
      out.push({ profileUrl: url, ...rest });
    }
    return out;
  }

  // Generic organic results, not LinkedIn-restricted - same goto-redirector
  // markup as parseCards above, same card-boundary heuristic (climb from the
  // anchor to the nearest ancestor holding an <h3>), but no linkedin.com/in
  // filter at all, since the destination here is a conference or meetup page
  // on any domain. Kept deliberately separate from parseCards rather than
  // generalizing that one - the two are shaped by genuinely different
  // things (a person's headline/company/location vs. a page's own title and
  // surrounding snippet), and forcing one function to do both would leave
  // neither case reading clearly.
  function parseWebResults(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seenHref = new Set(), out = [];
    for (const a of doc.querySelectorAll('a[href^="/goto?url="], a[href^="http"]')) {
      let href = a.getAttribute('href') || '';
      if (/^\/url\?/.test(href)) { const m = href.match(/[?&]q=([^&]+)/); if (m) href = decodeURIComponent(m[1]); }
      let url = null;
      if (/^https?:\/\//.test(href) && !/(^|\.)google\.com/i.test(href)) {
        url = href;
      } else if (!/^\/goto\?url=/.test(href)) {
        continue;
      }
      if (seenHref.has(href)) continue;
      seenHref.add(href);

      let card = a;
      for (let i = 0; i < 6 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('h3')) break; }
      const h3 = card.querySelector('h3');
      const title = ((h3 && h3.textContent) || '').trim();
      if (!title) continue;

      let blk = card;
      for (let i = 0; i < 4 && blk.parentElement; i++) { blk = blk.parentElement; if ((blk.innerText || '').length > 140) break; }
      let snip = (blk.innerText || '').replace(/\s+/g, ' ').trim();
      snip = snip.split(title).slice(1).join(' ').trim();

      out.push({ href, url, title: title.slice(0, 140), snippet: snip.slice(0, 220) });
      if (out.length >= 10) break;
    }
    return out;
  }
  async function resolveWebResults(cards) {
    const need = cards.filter(c => !c.url).map(c => c.href);
    let resolved = {};
    if (need.length) {
      const r = await send('resolveGotoUrls', { hrefs: need });
      resolved = (r && r.resolved) || {};
    }
    const seen = new Set(), out = [];
    for (const c of cards) {
      const url = c.url || resolved[c.href];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { continue; }
      // Google renders a site-name-glued-to-its-own-URL chip directly before
      // the real description, sometimes twice in a row (an accessible/visual
      // duplicate pair - both present in innerText, only one actually
      // visible). Only knowable as noise once the real host is known, which
      // is why this happens here and not in parseWebResults above: strip any
      // leading run of "<a short name><https://this-host><optional
      // breadcrumb>" before whatever text is left, real or not, is shown.
      const hostEsc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const chip = new RegExp('^(?:.{0,40}?https?:\\/\\/(?:www\\.)?' + hostEsc + '[^\\s]*\\s*(?:[›»]\\s*[^\\s]+\\s*)*)+', 'i');
      const snippet = (c.snippet || '').replace(chip, '').trim();
      out.push({ url, title: c.title, snippet, host });
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
      const cards = parseCards(r.html);
      const people = await resolveCards(cards);
      if (!people.length && looksBlocked(r.html)) { reply(d.id, { ok: false, error: 'blocked' }); return; }
      reply(d.id, { ok: true, people });
      return;
    }

    // A plain Google search (not restricted to any one site), for events
    // worth going to rather than people worth meeting - the app's own Ask
    // box routes here for a sentence that reads as event-shaped ("meetup",
    // "conference", "near me"). Same fetch as webSearch below, but parsed
    // into results (title/url/snippet) instead of one blob of body text,
    // since these need to be individually clickable and addable as a Room.
    if (d.kind === 'eventSearch') {
      const r = await send('fetchWebSearchHtml', { query: String(d.query || '') });
      if (!r || !r.ok) { reply(d.id, { ok: false, error: (r && r.error) || 'search_failed' }); return; }
      const cards = parseWebResults(r.html);
      const results = await resolveWebResults(cards);
      if (!results.length && looksBlocked(r.html)) { reply(d.id, { ok: false, error: 'blocked' }); return; }
      reply(d.id, { ok: true, results });
      return;
    }

    // Plain web search for the self-research knowledge-base refresh. No
    // structured parsing (general results have none of the durable anchors
    // parseProfiles relies on) - just the page's own visible text, script/
    // style stripped, so whatever mentions exist come through as-is. Raw
    // and unverified by design; the caller labels it that way downstream.
    if (d.kind === 'webSearch') {
      const r = await send('fetchWebSearchHtml', { query: String(d.query || '') });
      if (!r || !r.ok) { reply(d.id, { ok: false, error: (r && r.error) || 'search_failed' }); return; }
      if (looksBlocked(r.html)) { reply(d.id, { ok: false, error: 'blocked' }); return; }
      const doc = new DOMParser().parseFromString(r.html, 'text/html');
      doc.querySelectorAll('script,style').forEach(el => el.remove());
      const text = (doc.body ? doc.body.innerText : '').replace(/\s+/g, ' ').trim();
      reply(d.id, { ok: true, text: text.slice(0, 1500) });
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
