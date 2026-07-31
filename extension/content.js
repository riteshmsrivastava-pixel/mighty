// MIghTy - LinkedIn Outreach · content script
//
// Human-in-the-loop only. Everything here is foreground, on a page the
// student themselves navigated to:
//   1. Shortlist visible search-result cards (student checks boxes, clicks one button).
//   2. Optionally paste a draft the student already copied FROM the web app into a
//      compose box (only on explicit click). The extension never writes messages:
//      drafting and sending live in the web app, on purpose.
//   3. Passively read a profile page's About/Experience/Education text to enrich a
//      contact's briefing - but ONLY if that profile is already on the student's
//      shortlist; the app discards this for anyone not already added, so nothing
//      is retained for a profile the student merely browsed past.
//   4. Passively OBSERVE the real Send/Connect click (never calls .click() ourselves)
//      and log a confirmed send.
//   6. Passively read the messaging inbox, the notifications feed, and (Premium only)
//      the who's-viewed-your-profile page - never pages this script opens itself, only
//      ones the student is already on. Tells the app about a reply, an accepted
//      connection request, or a profile view; never reads message content. Full design:
//      mighty-plan/reply-detection-spec.md.
//
// LinkedIn's DOM changes without notice and isn't verifiable from this dev
// environment. If shortlisting or send-detection breaks, inspect the live
// page and fix ONLY this SELECTORS object.
// Only the compose box + send/connect buttons still use fixed selectors -
// everything else (names, titles, companies, photos, profile text, mutual
// connections) is scraped by DOM-anchoring helpers below, because LinkedIn's
// class names rotate. If Send/Connect detection or draft-fill breaks, fix here.
const SELECTORS = {
  composeBox: 'div.msg-form__contenteditable, div[role="textbox"][contenteditable="true"]',
  sendButton: 'button.msg-form__send-button, button[aria-label*="Send" i]',
  connectButton: 'button[aria-label*="Connect" i], button[aria-label^="Invite"]',
};

// LinkedIn headlines are "Title at Company", "Title @ Company", or
// "Company | tagline | ..." - good enough to split without a real parser.
// Returns '' rather than guessing when no company pattern is present.
// Words that mark a phrase as an organisation rather than a job title. Used to
// resolve the very common "Company - Title" headline (and its reverse) without
// guessing: only when exactly one side looks like an org do we take it.
const CO_SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc|ag|s\.?a|b\.?v|n\.?v|bank|group|holdings|university|institute|school|partners|ventures|capital|labs|technologies|systems|solutions|consulting|foundation)\b\.?/i;
function companyFromTitle(title) {
  const t = title || '';
  const at = t.match(/\bat\s+(.+?)(?:\s*[·|]|$)/i);
  if (at) return at[1].trim();
  const atSign = t.match(/@\s*(.+?)(?:\s*[·|｜]|$)/);
  if (atSign) return atSign[1].trim();
  // Headlines are often pipe-separated claims ("MIT Sloan '27 | DBJ - VP"), so
  // resolve within each segment before falling back to the whole string.
  for (const seg of t.split(/\s*[|｜]\s*/).map(s => s.trim()).filter(Boolean)) {
    const dash = seg.split(/\s+[-\u2013\u2014]\s+/);
    if (dash.length < 2) continue;
    const first = dash[0].trim(), rest = dash.slice(1).join(' - ').trim();
    const firstIsCo = CO_SUFFIX.test(first), restIsCo = CO_SUFFIX.test(rest);
    if (firstIsCo && !restIsCo && first.length < 60) return first;
    if (restIsCo && !firstIsCo && rest.length < 60) return rest;
  }
  if (t.includes('|')) { const b = t.split('|')[0].trim(); if (b && b.length < 50) return b; }
  return '';
}

/* ---------- robust profile-page extraction ----------
   LinkedIn ships obfuscated, frequently-rotated class names (e.g. "_699ffef9")
   and renders the name in an <h2>, not <h1> - so fixed class selectors rot fast.
   These read from stable anchors instead: the document <title>, the
   profile-photo image src pattern, and DOM order relative to the name. Verified
   against the live profile DOM; if this breaks, re-inspect and fix HERE. */
function profileName() {
  const t = (document.title || '').split(/\s[|·]\s/)[0].trim();
  if (t && !/^\(\d+\)/.test(t) && t.toLowerCase() !== 'linkedin') return t;
  const h = [...document.querySelectorAll('h1,h2')].find(x => {
    const s = x.textContent.trim();
    return s.length > 1 && s.length < 60;
  });
  return h ? h.textContent.trim() : '';
}
function profilePhotoUrl() {
  const imgs = [...document.querySelectorAll('img[src*="profile-displayphoto"], img[src*="profile-framedphoto"]')];
  imgs.sort((a, b) => (b.naturalWidth || b.width || 0) - (a.naturalWidth || a.width || 0));
  return imgs[0] ? imgs[0].src : '';
}
// Returns a small, self-contained base64 thumbnail of the profile photo (or ''),
// so it renders in the web app. The raw licdn.com URL is signed/expiring and
// won't hotlink off LinkedIn - the background worker fetches + downscales it.
async function profilePhotoDataUrl() {
  const url = profilePhotoUrl();
  if (!url) return '';
  try {
    const res = await send('encodeAvatar', { url });
    return (res && res.ok && res.dataUrl) ? res.dataUrl : '';
  } catch (e) { return ''; }
}
// Location lives only in the RENDERED page - LinkedIn ships it via JS, so a
// background fetch of the HTML can't see it (verified). Read it here instead,
// while the student is actually looking at the profile.
function profileLocation(name) {
  const nameH = [...document.querySelectorAll('h1,h2')].find(h => h.textContent.trim() === name);
  let card = nameH;
  for (let i = 0; i < 8 && card && card.parentElement; i++) {
    card = card.parentElement;
    if (card.querySelector('img[src*="profile-displayphoto"]')) break;
  }
  if (!card) return '';
  const LOC = /^[A-Z][A-Za-zÀ-ÿ.'\- ]{1,40}(?:,\s*[A-Za-zÀ-ÿ.'\- ]{2,40}){1,2}$/;
  const bad = /followers|connections|mutual|Contact info|·|Message|More|Follow|School|University/i;
  const leaves = [...card.querySelectorAll('div,span,p')].filter(el => el.children.length === 0);
  for (const el of leaves) {
    const t = el.textContent.trim();
    if (t.length > 3 && t.length < 60 && LOC.test(t) && !bad.test(t)) return t;
  }
  return '';
}
function profileHeadline(name) {
  const nameH = [...document.querySelectorAll('h1,h2')].find(h => h.textContent.trim() === name);
  if (!nameH) return '';
  let card = nameH;
  for (let i = 0; i < 8 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('img[src*="profile-displayphoto"]')) break; }
  const bad = /^·|^\d|1st|2nd|3rd|Contact info|mutual|connection|follower|^Message$|^More$|^Follow$|Skip to|MIghTy|match ·|first time/i;
  const leaves = [...card.querySelectorAll('div,span,p')].filter(el => el.children.length === 0);
  for (const el of leaves) {
    const t = el.textContent.trim();
    if (t.length > 15 && t.length < 300 && t !== name && !bad.test(t)) return t;
  }
  return '';
}

function send(type, extra) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}
async function fetchLogCached() { return send('fetchLog', {}); }

function normProfileUrl(href) {
  try { const u = new URL(href, location.href); return (u.origin + u.pathname).replace(/\/$/, ''); }
  catch (e) { return href; }
}

/* ---------- 1. shortlist panel on search-results pages ----------
   LinkedIn's result cards use rotated hashed class names, so we anchor on the
   only stable things: /in/ profile links, the profile-photo src pattern, and
   the text layout (name / "· Nth" degree / headline / location). Each result
   card is deduped by its container element so mutual-connection avatar links
   don't create phantom rows. Verified against the live search DOM. */
function extractCards() {
  const INSIGHT = /mutual connection|are mutual|follower|\bfollows\b|View .*profile/i;
  const seenCards = new Set(), seenUrl = new Set(), out = [];
  for (const link of document.querySelectorAll('a[href*="/in/"]')) {
    const href = link.getAttribute('href') || '';
    if (!/\/in\//.test(href)) continue;
    const url = normProfileUrl(link.href);
    if (seenUrl.has(url)) continue;
    let card = link;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      card = card.parentElement;
      if (card.querySelector('img[src*="profile-displayphoto"], img[src*="profile-framedphoto"]') && card.innerText.trim().length > 30) break;
    }
    if (seenCards.has(card)) continue;
    const lines = card.innerText.split('\n').map(s => s.trim()).filter(Boolean);
    const name = lines[0] || '';
    if (!name || name.length > 45 || INSIGHT.test(name)) continue; // secondary/insight link
    const title = lines.slice(1).find(l => !/^[·•]/.test(l) && l !== name && l.length > 4 && !/^\d/.test(l) && !INSIGHT.test(l)) || '';
    const photoEl = card.querySelector('img[src*="profile-displayphoto"], img[src*="profile-framedphoto"]');
    seenCards.add(card); seenUrl.add(url);
    out.push({ profileUrl: url, name, title, company: companyFromTitle(title), photo: (photoEl && photoEl.src) || '', el: card });
  }
  return out;
}

let panel = null;
function ensurePanel() {
  if (panel && document.body.contains(panel)) return panel;
  panel = document.createElement('div');
  panel.id = 'mighty-shortlist-panel';
  panel.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:99999;background:#1D1B26;color:#F4F2EF;'
    + "font:14px 'Schibsted Grotesk',-apple-system,system-ui,sans-serif;padding:10px 12px 10px 18px;border-radius:999px;box-shadow:0 18px 40px -18px rgba(29,27,38,.5);"
    + 'display:flex;align-items:center;gap:12px;';
  const btn = document.createElement('button');
  btn.textContent = 'Send 0 to Mighty';
  btn.style.cssText = "background:#5B4FE9;color:#fff;border:none;border-radius:999px;padding:9px 18px;font-weight:500;font-size:14px;cursor:pointer;font-family:inherit;";
  panel.appendChild(btn);
  document.body.appendChild(panel);
  return panel;
}

// Score badges: real, transparent scores only for profiles already in the
// student's outreach_log (fetched via the authenticated fetchLog relay).
// For anyone NOT yet tracked, only a plain "target company" text match is
// shown - never a fabricated live score for a stranger.
async function decorateCardsWithScores(cards) {
  const r = await fetchLogCached();
  if (!r || !r.ok) return;
  const byUrl = new Map(r.log.map(row => [row.profile_url, row]));
  cards.forEach(c => {
    if (c.el.querySelector('.mighty-badge')) return;
    const row = byUrl.get(c.profileUrl);
    const badge = document.createElement('div');
    badge.className = 'mighty-badge';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;font:11px -apple-system,system-ui,sans-serif;'
      + 'padding:3px 8px;border-radius:99px;font-weight:700;';
    if (row) {
      // Explain before you score: the label, never the number. The reasons ride
      // along as the tooltip, which is where the actual explanation lives.
      const { score, reasons } = mightyComputeScore(row, r.targetCompanies, r.goal);
      const label = mightyMatchLabel(score);
      badge.style.background = TINT; badge.style.color = ACCENT_DEEP;
      badge.title = reasons.join(' · ');
      badge.textContent = label;
    } else {
      const text = (c.title || '') + ' ' + (c.name || '');
      const match = (r.targetCompanies || []).find(co => text.toLowerCase().includes(co.trim().toLowerCase()));
      if (!match) return; // no fabricated score for an untracked stranger
      badge.style.background = '#F4F3F1'; badge.style.color = '#7B7787';
      badge.textContent = `Target: ${match}`;
    }
    if (getComputedStyle(c.el).position === 'static') c.el.style.position = 'relative';
    c.el.appendChild(badge);
  });
}

function renderCardCheckboxes() {
  const cards = extractCards();
  if (!cards.length) { if (panel) panel.remove(); panel = null; return; }
  const p = ensurePanel();
  const btn = p.querySelector('button');
  const checked = new Set();
  decorateCardsWithScores(cards).catch(() => {});

  cards.forEach(c => {
    if (c.el.querySelector('.mighty-check')) return; // already wired
    const box = document.createElement('input');
    box.type = 'checkbox'; box.className = 'mighty-check';
    box.style.cssText = 'position:absolute;top:8px;left:8px;width:18px;height:18px;z-index:10;';
    box.title = 'Shortlist in Mighty';
    box.addEventListener('change', () => {
      if (box.checked) checked.add(c.profileUrl); else checked.delete(c.profileUrl);
      btn.textContent = `Send ${checked.size} to Mighty`;
    });
    if (getComputedStyle(c.el).position === 'static') c.el.style.position = 'relative';
    c.el.appendChild(box);
    box._mightyCard = c;
  });

  btn.onclick = async () => {
    const selected = cards.filter(c => checked.has(c.profileUrl));
    if (!selected.length) return;
    btn.textContent = 'Saving…';
    for (const c of selected) {
      // Encode the photo to a self-contained thumbnail first - the raw
      // licdn.com URL is signed and referrer-locked, so storing it would give
      // the web app a broken image.
      let avatar = '';
      if (c.photo) { try { const enc = await send('encodeAvatar', { url: c.photo }); if (enc && enc.ok) avatar = enc.dataUrl; } catch (e) {} }
      await send('saveProfile', { payload: { profileUrl: c.profileUrl, name: c.name, title: c.title, company: c.company, avatarUrl: avatar || '' } });
    }
    selected.forEach(c => { const b = c.el.querySelector('.mighty-badge'); if (b) b.remove(); });
    checked.clear();
    document.querySelectorAll('.mighty-check').forEach(el => { el.checked = false; });
    btn.textContent = `Saved ✓. Send 0 to Mighty`;
    decorateCardsWithScores(cards).catch(() => {});
  };
}

/* ---------- 2. opt-in compose pre-fill ----------
   The MIghTy web app's "Copy message + open profile" button already puts the
   drafted, placeholder-filled message on the clipboard before it opens this
   tab - so filling the compose box is just reading the clipboard back, on
   explicit click only. No cross-context lookup needed. */
function wireComposeFill() {
  const box = document.querySelector(SELECTORS.composeBox);
  if (!box || box.dataset.mightyWired) return;
  box.dataset.mightyWired = '1';
  const fillBtn = document.createElement('button');
  fillBtn.textContent = 'Fill draft from clipboard (Mighty)';
  fillBtn.style.cssText = 'display:block;margin:6px 0;background:#F4EEE1;border:1px solid #E7DECB;border-radius:8px;'
    + 'padding:6px 10px;font-size:12px;cursor:pointer;';
  fillBtn.onclick = async (e) => {
    e.preventDefault();
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (err) { return; }
    if (!text) return;
    box.focus();
    document.execCommand('insertText', false, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  };
  box.parentElement && box.parentElement.insertBefore(fillBtn, box);
}

/* ---------- 3. profile-page context capture (foreground, passive read only) ----------
   Fires on any profile page the student opens. Reads only what's already
   rendered - no scrolling automation, no expanding hidden sections, no
   navigation. The web app DISCARDS this for any profile not already on the
   student's shortlist, so nothing is retained for someone just browsed past.

   LinkedIn dropped the #about / #experience / #education anchors and rotates
   its class names, so instead of chasing per-section selectors we read the
   main column's visible text (which contains About/Experience/Education/
   activity inline) and trim LinkedIn's global footer. This feeds the AI
   briefing and the MIT/Sloan relevance signal far more durably. */
const PROFILE_PAGE_RE = /^\/in\/[^\/]+\/?$/;
function profileMainText() {
  const main = document.querySelector('main');
  if (!main) return '';
  let t = (main.innerText || '').replace(/\s+/g, ' ').trim();
  const cut = t.search(/Accessibility\s+Talent Solutions|LinkedIn Corporation|©\s*\d{4}\s*LinkedIn|More profiles for you|People also viewed/i);
  if (cut > 200) t = t.slice(0, cut);
  return t.slice(0, 5000);
}
function mutualText() {
  const el = [...document.querySelectorAll('a, span')]
    .map(e => (e.textContent || '').trim())
    .find(t => /mutual connection/i.test(t) && t.length < 160);
  return el || '';
}

/* ---------- section-aware profile read ----------
   A rendered profile already shows far more than a single blob: About,
   the full Experience history with dates and durations, Education, Skills,
   Languages, certifications, and whether they post at all. LinkedIn renders
   each section heading on its own line and rotates its class names, so
   splitting the rendered text on those headings survives redesigns better than
   per-section selectors. Nothing here is expanded, clicked or fetched - this is
   only what is already on screen. */
const PROFILE_SECTIONS = ['Highlights','About','Activity','Featured','Experience','Education',
  'Licenses & certifications','Licenses and certifications','Skills','Languages','Interests',
  'Recommendations','Projects','Publications','Honors & awards','Volunteering','Courses',
  'Organizations','Test scores','Causes','More profiles for you','People you may know',
  'You might like','Explore Premium profiles','Pages for you'];
const STOP_SECTIONS = ['More profiles for you','People you may know','You might like',
  'Explore Premium profiles','Pages for you'];
// "Skills (5)" and "Experience" are the same kind of heading - drop the count.
const normHead = (s) => s.replace(/\s*\(\d+\)\s*$/, '').trim();
function parseProfileSections() {
  const main = document.querySelector('main');
  if (!main) return {};
  const lines = (main.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
  const heads = new Map(PROFILE_SECTIONS.map(s => [s.toLowerCase(), s]));
  const bag = {};
  let cur = 'top';
  for (const line of lines) {
    const head = heads.get(normHead(line).toLowerCase());
    if (head) { if (STOP_SECTIONS.includes(head)) break; cur = head; continue; }
    (bag[cur] = bag[cur] || []).push(line);
  }
  const get = (...names) => {
    for (const n of names) if (bag[n]) return bag[n].join('\n');
    return '';
  };
  const cap = (s, n) => (s.length > n ? s.slice(0, n) : s);
  return {
    top: cap(get('top'), 700),
    about: cap(get('About'), 1600),
    experience: cap(get('Experience'), 2400),
    education: cap(get('Education'), 700),
    skills: cap(get('Skills'), 400),
    languages: cap(get('Languages'), 200),
    certifications: cap(get('Licenses & certifications', 'Licenses and certifications'), 300),
    activity: cap(get('Activity'), 300),
  };
}
// Months from "1 yr 1 mo" / "4 yrs" / "9 mos".
function monthsFrom(s) {
  const y = /(\d+)\s*yrs?/i.exec(s || ''), m = /(\d+)\s*mos?/i.exec(s || '');
  return (y ? +y[1] * 12 : 0) + (m ? +m[1] : 0);
}
/* Timing signals, observed rather than guessed. The current role's own duration
   is printed on the page ("Jul 2025 - Present · 1 yr 1 mo"), and so is whether
   they post. Both change how you open a conversation. */
function timingSignals(sec) {
  const out = [];
  const presents = [...String(sec.experience || '').matchAll(/Present\s*·\s*([^\n]{0,24})/gi)]
    .map(x => monthsFrom(x[1])).filter(n => n > 0);
  if (presents.length) {
    const newest = Math.min(...presents);
    // Only a genuinely recent move is a reason to reach out now. A year in the
    // job is just their job.
    if (newest <= 3) out.push('Just moved into this role');
    else if (newest <= 9) out.push(`About ${newest} months into this role`);
  }
  if (/no recent posts/i.test(sec.activity || '')) out.push('Does not post - do not open with their content');
  return out;
}
let lastContextUrl = '';
// `force` re-pushes for a URL already captured this session. Needed right after
// a save: the first push happened while the profile was still untracked, so the
// app correctly discarded it - without this the brief would stay thin until the
// student happened to open the profile a second time.
function captureProfileContext(force) {
  if (!PROFILE_PAGE_RE.test(location.pathname)) return;
  const profileUrl = normProfileUrl(location.href);
  if (!force && profileUrl === lastContextUrl) return;
  const main = profileMainText();
  if (!main || main.length < 60) return; // page likely hasn't rendered yet - retry on next scan
  lastContextUrl = profileUrl;
  const sec = parseProfileSections();
  const timing = timingSignals(sec);
  const payload = {
    profileUrl,
    // Sections, not one blob - the app writes briefs and drafts from these, and
    // a real career history beats a wall of text.
    aboutText: sec.about || main,
    experienceText: sec.experience || '',
    educationText: sec.education || '',
    skillsText: sec.skills || '',
    languagesText: sec.languages || '',
    certificationsText: sec.certifications || '',
    timingSignals: timing,
    mutualConnectionsRaw: mutualText(),
    location: profileLocation(profileName()),
  };
  send('pushInbox', { kind: 'profile_context', payload });
}

/* ---------- docked sidebar on profile pages ----------
   Shows real MIghTy data if this profile is already tracked (never fabricates
   info for a stranger - that preserves the same discard-if-not-shortlisted
   boundary as profile-context capture). For an untracked profile, only a
   lighter "save?" panel appears. */
/* Design tokens - kept identical to the web app so the panel reads as one
   product. See app/index.html :root. */
const ACCENT = '#5B4FE9';
const ACCENT_DEEP = '#4A3FD1';
const PEACH = '#E87A56';
const TINT = '#EFEDFD';
const INK = '#1D1B26';
const SUB = '#8A8896';
const MUTE = '#B4B1BC';
const LINE = '#F1EFE9';
const FONT = "'Schibsted Grotesk',-apple-system,system-ui,sans-serif";
// The one match ladder, same words as the app. Keep in sync with
// mightyMatchLabel() in scoring.js and VERDICT in app/index.html.
const FIT_DOT = {'Excellent match':'#5B4FE9','Strong match':'#2E8B5F','Potential match':'#E3A23C',
  'Outside your goal':'#B4B1BC'};
// Two-overlapping-circles brand mark, inline so it needs no web-accessible asset.
const MARK_SVG = '<svg width="20" height="20" viewBox="0 0 26 26" fill="none" style="display:block;flex:none"><circle cx="9.5" cy="13" r="7.5" fill="#5B4FE9"></circle><circle cx="16.5" cy="13" r="7.5" fill="#E87A56" fill-opacity="0.85"></circle></svg>';
let sidebarEl = null;
// Profiles the student skipped - the panel stays out of the way until reload.
const skippedThisSession = new Set();
// Profiles we've already auto-enriched this browsing session, so viewing the
// same sparse profile twice doesn't re-write it while the log cache is warm.
const enrichedThisSession = new Set();
function ensureSidebar() {
  if (sidebarEl && document.body.contains(sidebarEl)) return sidebarEl;
  if (!document.getElementById('mighty-panel-css')) {
    const css = document.createElement('style');
    css.id = 'mighty-panel-css';
    css.textContent = '@keyframes mighty-spin{to{transform:rotate(360deg)}}'
      + '#mighty-sidebar button:hover{filter:brightness(.96)}';
    document.head.appendChild(css);
  }
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'mighty-sidebar';
  sidebarEl.style.cssText = 'position:fixed;top:70px;right:16px;width:336px;max-height:86vh;overflow:auto;z-index:99998;'
    + 'background:#fff;border:1px solid #EAE6E0;border-radius:16px;box-shadow:0 18px 44px rgba(26,25,23,.16);'
    + `font:14px ${FONT};color:${INK};padding:20px 20px 18px;box-sizing:border-box;`;
  document.body.appendChild(sidebarEl);
  return sidebarEl;
}
function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// People already in your network at the same company - the thing LinkedIn never
// surfaces in the context of your own relationships. Pure local lookup.
function networkOverlap(log, company) {
  const c = String(company || '').trim().toLowerCase();
  if (!c || c.length < 2) return { count: 0, names: [] };
  const hits = (log || []).filter(r => String(r.company || '').trim().toLowerCase() === c);
  return { count: hits.length, names: hits.slice(0, 3).map(r => r.name || '').filter(Boolean) };
}
// Relationship stated in words, not a bare percentage.
function relationshipWords(row, evs) {
  if (!row) return { icon: '✦', label: 'Not tracked', sub: 'Save to start remembering' };
  const n = (evs || []).length;
  if (row.status === 'prospect' || row.status === 'ready_to_contact')
    return { icon: '🌱', label: 'New relationship', sub: 'No outreach yet' };
  if (row.status === 'contacted') return { icon: '📤', label: 'Reached out', sub: 'Waiting to hear back' };
  if (row.status === 'replied') return { icon: '💬', label: 'In conversation', sub: 'They replied' };
  if (row.status === 'coffee_chat') return { icon: '☕', label: 'Real relationship', sub: `${n} interaction${n === 1 ? '' : 's'} logged` };
  return { icon: '🤝', label: 'Strong relationship', sub: `${n} interaction${n === 1 ? '' : 's'} logged` };
}
function mightyBrandHead(rightHtml) {
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
    ${MARK_SVG}
    <span style="font-weight:600;font-size:15px;letter-spacing:-.02em;">Mighty</span>
    <span style="margin-left:auto;">${rightHtml || ''}</span></div>`;
}
// A readable "last interaction" label from the most recent event or status.
function lastInteractionLabel(row, rowEvents) {
  const ev = rowEvents.slice().sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0];
  if (ev) {
    const map = { stage_change: 'Stage updated', reply: 'They replied', coffee_chat: 'Coffee chat', referral: 'Introduction', interview: 'Meeting', first_message: 'Message sent', connection_request: 'Connection request', note: 'Note added' };
    return map[ev.event_type] || 'Updated';
  }
  if (row.contacted_at) return 'Message sent';
  return 'Saved';
}
/* ---------- relationship fit against the student's own strategy ----------
   Local, instant, and never invented: every line traces back to something the
   student told Mighty (goal, target companies, roles, schools, places) matched
   against what is actually on this page. Same three-rung ladder as the web app. */
function fitFromStrategy(p, r) {
  const prof = r.profile || {};
  const sec = p.sections || {};
  const hay = `${p.title || ''} ${p.company || ''} ${p.text || ''}`.toLowerCase();
  // Matching the right section beats matching the whole page: a school name in
  // Education is a shared school; the same word in a job description is not.
  const eduHay = String(sec.education || '').toLowerCase() || hay;
  const skillHay = `${sec.skills || ''} ${sec.about || ''} ${sec.experience || ''}`.toLowerCase() || hay;
  const why = [];
  let score = 0;
  const push = (s) => { if (why.length < 4) why.push(s); };
  const findIn = (list, text) => (list || []).find(v => { const s = String(v || '').trim(); return s.length > 1 && text.includes(s.toLowerCase()); });
  const find = (list) => findIn(list, hay);

  const co = String(p.company || '').trim();
  const targets = r.targetCompanies || [];
  const hit = co && targets.find(c => mightySameCompany(c, co));
  if (hit) {
    // Working at a company you named is the strongest signal there is: on its
    // own it should read Excellent, not merely Strong.
    score += 65; push(`On your target list: ${co}`);
  } else {
    // The headline may not parse into a company at all (or LinkedIn truncated
    // it). If a target company appears anywhere on the page, that still counts,
    // just less: they work there, or they used to.
    const inPage = targets.find(c => {
      const n = mightyNormCompany(c);
      return n.length > 2 && mightyNormCompany(`${p.title || ''} ${p.text || ''}`).includes(n);
    });
    if (inPage) { score += 30; push(`${inPage} appears on their profile`); }
  }
  const role = find(prof.targetRoles);
  if (role) { score += 25; push(`A role you are targeting: ${role}`); }
  const school = findIn(prof.schools, eduHay);
  if (school) { score += 20; push(`Shared school: ${school}`); }
  const skill = findIn(prof.skills, skillHay);
  if (skill) { score += 10; push(`Shared ground: ${skill}`); }
  const kws = mightyGoalKeywords(r.goal || '');
  const hits = kws.filter(k => hay.includes(k));
  // Short tokens are acronyms ("ai", "vc", "pm") - lowercase reads like a typo.
  const pretty = (k) => (k.length <= 3 ? k.toUpperCase() : k);
  if (hits.length) { score += Math.min(25, 10 * hits.length); push(`Matches your goal: ${hits.slice(0, 3).map(pretty).join(', ')}`); }
  const industry = find(prof.industries);
  if (industry) { score += 10; push(`Industry you care about: ${industry}`); }
  const place = find(prof.targetLocations);
  if (place) { score += 10; push(`Where you are building: ${place}`); }

  return { score, why, label: mightyMatchLabel(score) };
}
// What to do about it, in one sentence, honest about a weak fit.
function fitRecommendation(fit, r) {
  const goal = String(r.goal || '').trim();
  if (fit.label === 'Excellent match')
    return goal ? `Save them. They line up with your goal: ${goal.replace(/\.$/, '')}.` : 'Save them - they line up with what you are building.';
  if (fit.label === 'Strong match')
    return 'Worth saving. Read the brief in Mighty before you write.';
  if (fit.label === 'Potential match')
    return goal
      ? `A stretch against "${goal.replace(/\.$/, '')}". Save only if you have your own reason.`
      : 'A stretch against your current goal. Save only if you have your own reason.';
  // Nothing matched - say that plainly rather than dressing it up.
  return 'Nothing here matches your strategy. Skip, unless you know something Mighty does not.';
}
// Panel section: small caps label above content, hairline rule above.
function panelSection(label, inner, first) {
  return `<div style="margin-top:${first ? 18 : 16}px;padding-top:16px;border-top:1px solid ${LINE};">
      <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${MUTE};">${esc(label)}</div>
      ${inner}</div>`;
}
function panelLines(list) {
  return `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
    ${list.map(x => `<div style="font-size:14px;color:#2A2724;line-height:1.45;">${esc(x)}</div>`).join('')}</div>`;
}
// LinkedIn headlines usually already contain the company (and often the city),
// so joining them again reads as a stutter: "Partner at Antler · Antler".
function personSub(headline, company) {
  const h = String(headline || '').trim(), c = String(company || '').trim();
  if (!h) return c;
  if (!c || h.toLowerCase().includes(c.toLowerCase())) return h;
  return `${h} · ${c}`;
}
function panelPerson(photo, name, sub) {
  const initials = String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<div style="display:flex;align-items:center;gap:12px;margin-top:18px;">
      ${photo
        ? `<img src="${esc(photo)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;">`
        : `<div style="width:44px;height:44px;border-radius:50%;flex:none;background:${TINT};color:${ACCENT_DEEP};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;">${esc(initials)}</div>`}
      <div style="min-width:0;">
        <div style="font-size:16.5px;font-weight:700;letter-spacing:-.015em;">${esc(name || 'This profile')}</div>
        <div style="font-size:13.5px;color:${SUB};line-height:1.35;max-height:34px;overflow:hidden;">${esc(sub || '')}</div>
      </div>
    </div>`;
}
function pbtn(text, kind) {
  const base = 'border:none;border-radius:999px;padding:11px 16px;font-weight:700;font-size:14.5px;cursor:pointer;'
    + `flex:1;font-family:${FONT};line-height:1.2;`;
  if (kind === 'ghost') return base + 'background:#F4F2EE;color:#5B554D;font-weight:600;';
  if (kind === 'outline') return base + `background:#fff;color:${INK};border:1px solid #E2DDD6;font-weight:600;`;
  return base + `background:${ACCENT};color:#fff;`;
}

/* ---------- people already on this page ----------
   A profile page also lists "More profiles for you" and "People you may know":
   colleagues of the person you are looking at, alumni of their school. Those are
   real discovery leads, and they are already rendered - no extra fetch. Each is
   scored against the same strategy (your goal text and target companies), and
   only Strong or Excellent matches are shown, at most three, so the panel never
   turns into a feed. */
/* extractCards() is built for search-results pages: it walks up to a container
   holding a profile photo, which on a PROFILE page swallows the whole recommendation
   block and pins the page owner's name onto someone else's link. Recommendation
   rows need their own reader - the name is the link's own text, and the headline is
   the nearest small container around it. Showing the wrong person's name would be
   worse than showing nobody. */
const NOT_A_NAME = /mutual connection|are mutual|follower|\bfollows\b|View |Show all|Message|Connect|Follow|Contact info|profile$/i;
function nearbyCandidates() {
  const selfName = profileName();
  const seen = new Set();
  const out = [];
  for (const link of document.querySelectorAll('a[href*="/in/"]')) {
    const name = (link.textContent || '').trim().split('\n')[0].trim();
    if (!name || name.length < 3 || name.length > 45) continue;
    if (name === selfName || NOT_A_NAME.test(name)) continue;
    const url = normProfileUrl(link.href);
    if (seen.has(url)) continue;
    let box = link.parentElement, txt = '';
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const t = (box.innerText || '').trim();
      if (t.length > name.length + 8 && t.length < 400) { txt = t; break; }
    }
    const title = txt.split('\n').map(s => s.trim()).filter(Boolean)
      .find(l => l !== name && l.length > 8 && !/^·|^\d|1st|2nd|3rd|^Connect$|^Message$|^Follow$|mutual|follower/i.test(l)) || '';
    if (!title) continue;
    seen.add(url);
    out.push({ profileUrl: url, name, title, company: companyFromTitle(title) });
  }
  return out;
}
function nearbyPeople(r, selfUrl) {
  const already = new Set((r.log || []).map(x => x.profile_url));
  const out = [];
  for (const c of nearbyCandidates()) {
    if (c.profileUrl === selfUrl || already.has(c.profileUrl)) continue;
    const fit = fitFromStrategy({ name: c.name, title: c.title, company: c.company, text: c.title }, r);
    if (fit.score < 35) continue; // Strong or Excellent only
    out.push({ ...c, fit });
  }
  out.sort((a, b) => b.fit.score - a.fit.score);
  return out.slice(0, 3);
}
function renderNearby(el, r, selfUrl) {
  let people = [];
  try { people = nearbyPeople(r, selfUrl); } catch (e) { return; }
  if (!people.length) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = `margin-top:18px;padding-top:16px;border-top:1px solid ${LINE};`;
  wrap.innerHTML = `<div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${MUTE};">Also on this page</div>`
    + `<div style="font-size:12.5px;color:${SUB};margin-top:5px;line-height:1.45;">Scored against your strategy, same as above.</div>`;
  for (const p of people) {
    const initials = String(p.name).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const rowEl = document.createElement('div');
    rowEl.style.cssText = `display:flex;align-items:flex-start;gap:10px;padding:12px 0 0;`;
    rowEl.innerHTML = `<div style="width:32px;height:32px;border-radius:50%;flex:none;background:${TINT};color:${ACCENT_DEEP};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${esc(initials)}</div>
      <div style="flex:1;min-width:0;">
        <a href="${esc(p.profileUrl)}" target="_blank" rel="noopener" style="font-size:14px;font-weight:700;color:${INK};text-decoration:none;">${esc(p.name)}</a>
        <div style="font-size:12.5px;color:${SUB};line-height:1.35;max-height:34px;overflow:hidden;">${esc(p.title)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:5px;">
          <span style="width:7px;height:7px;border-radius:50%;flex:none;background:${FIT_DOT[p.fit.label] || MUTE};"></span>
          <span style="font-size:12.5px;font-weight:700;">${esc(p.fit.label)}</span>
        </div>
        ${p.fit.why.length ? `<div style="font-size:12.5px;color:#5B554D;margin-top:4px;line-height:1.4;">${esc(p.fit.why[0])}</div>` : ''}
      </div>`;
    const btn = document.createElement('button');
    btn.textContent = 'Save';
    btn.style.cssText = `flex:none;background:#fff;border:1px solid #E2DDD6;border-radius:999px;padding:7px 15px;`
      + `font-weight:600;font-size:13px;cursor:pointer;font-family:${FONT};color:${INK};`;
    btn.onclick = async () => {
      btn.textContent = 'Saving…'; btn.disabled = true;
      // No page context for someone whose profile we are not on - name, role and
      // company only. The rest fills in when they open that profile.
      const res = await send('saveProfile', { payload: { profileUrl: p.profileUrl, name: p.name, title: p.title, company: p.company } });
      if (res && res.ok) { btn.textContent = 'Saved ✓'; await send('fetchLog', { force: true }); }
      else { btn.textContent = 'Save'; btn.disabled = false; }
    };
    rowEl.appendChild(btn);
    wrap.appendChild(rowEl);
  }
  el.appendChild(wrap);
}

async function renderProfileSidebar() {
  if (!PROFILE_PAGE_RE.test(location.pathname)) { if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; } return; }
  const profileUrl = normProfileUrl(location.href);
  if (skippedThisSession.has(profileUrl)) { if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; } return; }
  const r = await fetchLogCached();
  if (!r || !r.ok) return;
  const row = r.log.find(x => x.profile_url === profileUrl);
  const el = ensureSidebar();

  // Live-scraped identity - fills gaps if the stored row is sparse.
  const liveName = profileName();
  const liveHeadline = profileHeadline(liveName);
  const liveCompany = companyFromTitle(liveHeadline);
  const livePhoto = profilePhotoUrl();
  const liveLocation = profileLocation(liveName);

  if (!row) {
    const sec = parseProfileSections();
    const person = { name: liveName, title: liveHeadline, company: liveCompany,
      text: [sec.about, sec.experience, sec.education, sec.skills].filter(Boolean).join('\n') || profileMainText(),
      sections: sec };
    const fit = fitFromStrategy(person, r);
    const timing = timingSignals(sec);
    const overlap = networkOverlap(r.log, liveCompany);
    const shared = [];
    if (overlap.count) shared.push(`${overlap.count} ${overlap.count === 1 ? 'person' : 'people'} you know at ${liveCompany}${overlap.names.length ? ` - ${overlap.names.join(', ')}` : ''}`);
    const mut = (mutualText() || '').match(/(\d+)\s*mutual/i);
    if (mut) shared.push(`${mut[1]} mutual connection${mut[1] === '1' ? '' : 's'}`);
    if (liveLocation) shared.push(liveLocation);

    el.innerHTML = mightyBrandHead('')
      + panelPerson(livePhoto, liveName, personSub(liveHeadline, liveCompany))
      + panelSection('Relationship fit',
          `<div style="display:flex;align-items:center;gap:9px;margin-top:7px;">
             <span style="width:8px;height:8px;border-radius:50%;flex:none;background:${FIT_DOT[fit.label] || MUTE};"></span>
             <span style="font-size:17px;font-weight:700;letter-spacing:-.015em;">${esc(fit.label)}</span>
           </div>`, true)
      + panelSection('Why', fit.why.length
          ? panelLines(fit.why)
          : `<div style="font-size:14px;color:${SUB};line-height:1.45;margin-top:8px;">Nothing on this page lines up with your strategy yet.</div>`)
      + (timing.length ? panelSection('Why now', panelLines(timing)) : '')
      + (shared.length ? panelSection('What you share', panelLines(shared)) : '')
      + panelSection('Recommendation',
          `<div style="font-size:14.5px;line-height:1.5;color:#2A2724;margin-top:7px;">${esc(fitRecommendation(fit, r))}</div>`);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:9px;margin-top:20px;';
    const skip = document.createElement('button');
    skip.textContent = 'Skip';
    skip.style.cssText = pbtn('', 'ghost');
    skip.onclick = () => { skippedThisSession.add(profileUrl); el.remove(); sidebarEl = null; };
    const save = document.createElement('button');
    save.textContent = 'Save';
    save.style.cssText = pbtn('', 'primary');
    save.onclick = async () => {
      save.textContent = 'Saving…'; save.disabled = true;
      const avatarData = await profilePhotoDataUrl();
      const res = await send('saveProfile', { payload: { profileUrl, name: liveName, title: liveHeadline, company: liveCompany, avatarUrl: avatarData || livePhoto, location: liveLocation } });
      if (res && res.ok) {
        // Now that a row exists, hand over the page text the app discarded a
        // moment ago - that's what the AI brief is written from.
        captureProfileContext(true);
        await send('fetchLog', { force: true });
        renderProfileSidebar();
        return;
      }
      save.textContent = 'Saved ✓';
    };
    actions.append(skip, save);
    el.appendChild(actions);
    renderNearby(el, r, profileUrl);
    return;
  }

  const rowEvents = r.events.filter(e => e.log_id === row.id);
  const next = mightySuggestedNext(row);
  const rel = relationshipWords(row, rowEvents);
  const overlap = networkOverlap(r.log, row.company || liveCompany);
  const name = row.name || liveName;
  const headline = row.title || liveHeadline;
  const company = row.company || liveCompany;
  const photo = row.avatar_url || livePhoto;
  const statusLabel = row.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Auto-backfill: many rows were saved before we scraped rich details (or via
  // search/import paths that capture less), so they show up in the web app with
  // no name/role/photo. When the student views such a profile, quietly fill the
  // gaps from what's live on the page - no manual re-save needed. We only ever
  // ADD to empty fields (never overwrite), and only once per profile per session.
  if (!enrichedThisSession.has(profileUrl)) {
    const patch = {};
    if (!row.name && liveName) patch.name = liveName;
    if (!row.title && liveHeadline) patch.title = liveHeadline;
    if (!row.company && liveCompany) patch.company = liveCompany;
    // Re-encode the avatar if it's missing OR a stale hotlink (not yet base64) -
    // old rows stored the raw licdn.com URL, which never loads in the web app.
    const avatarStale = !row.avatar_url || !/^data:/.test(row.avatar_url);
    enrichedThisSession.add(profileUrl);
    (async () => {
      let avatarToSave = row.avatar_url;
      if (avatarStale) { const d = await profilePhotoDataUrl(); if (d) { patch.avatar_url = d; avatarToSave = d; } }
      if (!Object.keys(patch).length) return;
      await send('saveProfile', { payload: { profileUrl, name: row.name || liveName, title: row.title || liveHeadline, company: row.company || liveCompany, avatarUrl: avatarToSave, location: ((row.context||{}).location) || liveLocation } });
      Object.assign(row, patch); // keep the warm cache row consistent
    })();
  }

  const sec = parseProfileSections();
  const person = { name, title: headline, company,
    text: [sec.about, sec.experience, sec.education, sec.skills].filter(Boolean).join('\n') || profileMainText(),
    sections: sec };
  const fit = fitFromStrategy(person, r);
  const timing = timingSignals(sec);
  const shared = [];
  if (overlap.count > 1) shared.push(`${overlap.count} people you know at ${company}`);
  const savedMut = ((row.context || {}).mutualConnectionsRaw || '').match(/(\d+)\s*mutual/i);
  if (savedMut) shared.push(`${savedMut[1]} mutual connection${savedMut[1] === '1' ? '' : 's'}`);

  el.innerHTML =
    mightyBrandHead(`<span style="font-size:11.5px;font-weight:700;color:#2E8B5F;background:#E6F4EC;padding:4px 11px;border-radius:999px;">Saved</span>`)
    + panelPerson(photo, name, personSub(headline, company))
    + panelSection('Relationship fit',
        `<div style="display:flex;align-items:center;gap:9px;margin-top:7px;">
           <span style="width:8px;height:8px;border-radius:50%;flex:none;background:${FIT_DOT[fit.label] || MUTE};"></span>
           <span style="font-size:17px;font-weight:700;letter-spacing:-.015em;">${esc(fit.label)}</span>
         </div>
         <div style="font-size:13px;color:${SUB};margin-top:4px;">${esc(rel.label)} · ${esc(rel.sub)}</div>`, true)
    + (fit.why.length ? panelSection('Why', panelLines(fit.why)) : '')
    + (timing.length ? panelSection('Why now', panelLines(timing)) : '')
    + (shared.length ? panelSection('What you share', panelLines(shared)) : '')
    + panelSection('Where you are',
        `<div style="display:flex;flex-direction:column;gap:9px;font-size:13.5px;margin-top:9px;">
           <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:${SUB};">Stage</span><span style="font-weight:700;">${esc(statusLabel)}</span></div>
           <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:${SUB};">Last interaction</span><span style="font-weight:700;">${esc(lastInteractionLabel(row, rowEvents))}</span></div>
           <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:${SUB};">Next step</span><span style="font-weight:700;color:${ACCENT_DEEP};text-align:right;max-width:170px;">${esc(next || ' - ')}</span></div>
         </div>`);

  // Writing and sending happen in the web app, deliberately - the panel's only
  // job is the decision. This button carries the relationship there.
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:20px;';
  const openBtn = document.createElement('button');
  openBtn.textContent = next ? `Open in Mighty · ${next}` : 'Open in Mighty';
  openBtn.style.cssText = pbtn('', 'primary');
  openBtn.onclick = () => window.open(`${(r.appUrl || 'https://yourmighty.com/app/')}?open=${row.id}`, '_blank');
  actions.appendChild(openBtn);
  el.appendChild(actions);
  renderNearby(el, r, profileUrl);
}

/* ---------- 4. passive send/connect observer (never triggers a click) ---------- */
function wireSendObserver() {
  if (document.documentElement.dataset.mightySendObserver) return;
  document.documentElement.dataset.mightySendObserver = '1';
  document.addEventListener('click', (e) => {
    const target = e.target.closest(`${SELECTORS.sendButton}, ${SELECTORS.connectButton}`);
    if (!target) return;
    // Observation only - this listener never calls target.click() or preventDefault().
    send('pushInbox', { kind: 'sent_confirmation', payload: { profileUrl: normProfileUrl(location.href), ts: Date.now() } });
  }, true);
}

/* ---------- 6. passive activity detection (reply / connection-accepted / profile-viewed) ----------
   Three pages the student is already on for reasons that have nothing to do with MIghTy -
   the messaging inbox, the notifications feed, and (Premium only) who's-viewed-your-profile.
   Reads what's already rendered and tells the app what it says; never opens any of these
   pages itself (no timer, no background tab, no tab that closes itself - see the spec's own
   reasoning for why that line matters), never clicks anything on LinkedIn's side, never reads
   message content. Matching runs here rather than in the web app because this script already
   has the student's own outreach_log cached via fetchLogCached() for the sidebar's scoring -
   a certain match ships with a resolved profile URL; an ambiguous one ships every candidate
   and lets the app ask rather than guess. Selectors confirmed against a real, Premium-active
   account on 31 Jul 2026 - LinkedIn's frontend shifts over time, so if this stops finding
   anything, re-inspect the live page and fix ONLY the selectors below. */
const NOTIFICATIONS_PAGE_RE = /^\/notifications\/?/;
const MESSAGING_PAGE_RE = /^\/messaging(\/|$)/;
const PROFILE_VIEWS_PAGE_RE = /^\/analytics\/profile-views\/?/;

function normLinkedInProfileUrl(href) {
  try {
    const u = new URL(href, location.href);
    return ('https://www.linkedin.com' + decodeURIComponent(u.pathname)).replace(/\/$/, '');
  } catch (e) { return null; }
}

// A match is certain or it is a question, never a guess presented as a fact - the one rule
// the spec draws a hard line on. profileUrl match is certain by construction. Name-only match
// is certain only when exactly one candidate shares it; more than one comes back ambiguous
// with every candidate listed, never silently picked. No match (including someone still
// 'prospect', who this student never messaged) returns null and gets discarded upstream.
function matchAgainstLog(log, entity, statuses) {
  const rows = (log || []).filter(r => statuses.indexOf(r.status) >= 0);
  if (entity.profileUrl) {
    const hit = rows.find(r => r.profile_url === entity.profileUrl);
    if (hit) return { confidence: 'certain', matchedProfileUrl: hit.profile_url, candidates: [] };
  }
  if (!entity.name) return null;
  const n = entity.name.trim().toLowerCase();
  const hits = rows.filter(r => (r.name || '').trim().toLowerCase() === n);
  if (hits.length === 1) return { confidence: 'certain', matchedProfileUrl: hits[0].profile_url, candidates: [] };
  if (hits.length > 1) return { confidence: 'ambiguous', matchedProfileUrl: null, candidates: hits.map(r => r.profile_url) };
  return null;
}

// In-memory only, per tab load - a fresh reload naturally lets a still-unread item be seen
// again, which is fine: the app's own dedup (a matching event within the last hour/day) is
// what actually prevents a duplicate log entry, this is just cheap noise reduction.
const pushedActivityKeys = new Set();
function pushActivityOnce(kind, key, payload) {
  const k = kind + ':' + key;
  if (pushedActivityKeys.has(k)) return;
  pushedActivityKeys.add(k);
  send('pushInbox', { kind, payload });
}

async function scanNotificationsForActivity() {
  if (!NOTIFICATIONS_PAGE_RE.test(location.pathname)) return;
  try {
    const cards = document.querySelectorAll('article.nt-card.nt-card--unread');
    if (!cards.length) return;
    const r = await fetchLogCached();
    if (!r || !r.ok) return;
    cards.forEach(card => {
      const text = card.textContent.replace(/\s+/g, ' ').trim();
      const anchor = card.querySelector('a[href*="/in/"]');
      const profileUrl = anchor ? normLinkedInProfileUrl(anchor.getAttribute('href')) : null;
      const name = anchor ? anchor.textContent.replace(/\s+/g, ' ').trim().split('•')[0].trim() : null;
      if (!name && !profileUrl) return;

      if (/sent you a message/i.test(text)) {
        const m = matchAgainstLog(r.log, { name, profileUrl }, ['contacted', 'ready_to_contact']);
        if (!m) return;
        pushActivityOnce('reply_detected', profileUrl || name, Object.assign(
          { name, profileUrl, notificationText: text.slice(0, 200), source: 'notifications' }, m));
      } else if (/accepted your invitation|is now a connection/i.test(text)) {
        const m = matchAgainstLog(r.log, { name, profileUrl }, ['contacted']);
        if (!m) return;
        pushActivityOnce('connection_accepted', profileUrl || name, Object.assign(
          { name, profileUrl, notificationText: text.slice(0, 200) }, m));
      }
    });
  } catch (e) { /* selectors likely drifted - see section 6 comment above */ }
}

async function scanMessagingForActivity() {
  if (!MESSAGING_PAGE_RE.test(location.pathname)) return;
  try {
    const items = document.querySelectorAll('li.msg-conversation-listitem');
    const unread = Array.from(items).filter(li =>
      li.querySelector('.notification-badge.notification-badge--show .notification-badge__count'));
    if (!unread.length) return;
    const r = await fetchLogCached();
    if (!r || !r.ok) return;
    unread.forEach(li => {
      const nameEl = li.querySelector('[class*="participant-names"]');
      const name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : null;
      if (!name) return;
      // Notifications already carries any reply that also showed up there, matched on a real
      // profile URL - this is the weaker, name-only fallback for one that didn't (LinkedIn
      // doesn't always notify, or the student cleared it before the extension saw it).
      const m = matchAgainstLog(r.log, { name, profileUrl: null }, ['contacted', 'ready_to_contact']);
      if (!m) return;
      const snippetEl = li.querySelector('[class*="message-snippet"]');
      const previewText = snippetEl ? snippetEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
      pushActivityOnce('reply_detected', 'msg:' + name, Object.assign(
        { name, previewText, source: 'messaging' }, m));
    });
  } catch (e) { /* selectors likely drifted - see section 6 comment above */ }
}

async function scanProfileViewsForActivity() {
  if (!PROFILE_VIEWS_PAGE_RE.test(location.pathname)) return;
  try {
    const anchors = document.querySelectorAll('a[href^="https://www.linkedin.com/in/"]');
    if (!anchors.length) return;
    const r = await fetchLogCached();
    if (!r || !r.ok) return;
    const seen = new Set();
    anchors.forEach(a => {
      const profileUrl = normLinkedInProfileUrl(a.getAttribute('href'));
      if (!profileUrl || seen.has(profileUrl)) return;
      const row = a.closest('li') || a.parentElement;
      if (!row || !/Viewed\s+.+\s+ago/i.test(row.textContent || '')) return;
      seen.add(profileUrl);
      // Any saved person, any status - a profile view is context, not pipeline progress, so
      // this deliberately does not gate on 'contacted' the way the other two signals do.
      const hit = (r.log || []).find(x => x.profile_url === profileUrl);
      if (!hit) return;
      const label = (row.textContent.match(/Viewed\s+(.+?)\s+ago/i) || [])[1];
      pushActivityOnce('profile_viewed', profileUrl, {
        name: hit.name || a.textContent.split('•')[0].trim(),
        profileUrl,
        viewedAt: label ? label + ' ago' : null,
      });
    });
  } catch (e) { /* selectors likely drifted - see section 6 comment above */ }
}

/* ---------- 5. "Search anywhere" import from a Google results page ----------
   The student runs a normal Google search (MIghTy's "Find people" box opens
   one scoped to LinkedIn profiles). On the results page they're already viewing,
   this reads the visible LinkedIn profile links + titles and offers one-click
   bulk import. We never automate the search or scrape at scale - we only read
   the page the student opened themselves, same human-in-the-loop boundary. */
function extractGoogleProfiles() {
  const seen = new Set(), out = [];
  for (const a of document.querySelectorAll('a[href*="linkedin.com/in/"]')) {
    let href = a.href;
    if (/\/url\?/.test(href)) { try { href = new URL(href).searchParams.get('q') || href; } catch (e) {} }
    if (!/linkedin\.com\/in\//.test(href)) continue;
    const url = normProfileUrl(href);
    if (seen.has(url)) continue;
    let card = a;
    for (let i = 0; i < 5 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('h3')) break; }
    const h3 = card.querySelector('h3');
    let title = ((h3 && h3.textContent) || a.textContent || '').trim();
    title = title.replace(/\s*[|·]?\s*LinkedIn\s*$/i, '').replace(/\s*[.…]+\s*$/, '').trim();
    const parts = title.split(/\s+[-\u2013\u2014]\s+/);
    const name = (parts[0] || '').trim();
    if (!name || name.length > 60 || /^https?:/i.test(name)) continue;
    const headline = parts.slice(1).join(' - ').trim();
    seen.add(url);
    out.push({ profileUrl: url, name, title: headline, company: companyFromTitle(headline) });
  }
  return out;
}
let gPanel = null;
async function renderGoogleImportPanel() {
  const profiles = extractGoogleProfiles();
  if (!profiles.length) { if (gPanel) { gPanel.remove(); gPanel = null; } return; }
  const r = await fetchLogCached();
  const signedIn = r && r.ok;
  const tracked = new Set(signedIn ? r.log.map(x => x.profile_url) : []);

  if (gPanel && document.body.contains(gPanel)) gPanel.remove();
  gPanel = document.createElement('div');
  gPanel.id = 'mighty-google-panel';
  gPanel.style.cssText = 'position:fixed;top:76px;right:16px;width:326px;max-height:78vh;overflow:auto;z-index:99999;'
    + 'background:#fff;border:1px solid rgba(29,27,38,.08);border-radius:20px;box-shadow:0 30px 70px -34px rgba(29,27,38,.32);'
    + "font:14px 'Schibsted Grotesk',-apple-system,system-ui,sans-serif;color:#1D1B26;padding:20px;";
  gPanel.innerHTML = mightyBrandHead(`<span style="font-size:11.5px;font-weight:500;color:#7B7787;background:#F4F3F1;padding:4px 11px;border-radius:999px;">${profiles.length} found</span>`);

  if (!signedIn) {
    const note = document.createElement('div'); note.style.cssText = 'color:#7B7787;font-size:13.5px;line-height:1.5;';
    note.textContent = 'Sign in to the Mighty extension to import these profiles.';
    gPanel.appendChild(note); document.body.appendChild(gPanel); return;
  }

  /* Five per search, deliberately.
     A search results page will happily give ten names, and importing all of
     them is how you end up with two hundred people you have no memory of
     adding. Mighty caps the relationship list for the same reason. The cap is
     on how many can be TICKED, not on how many are shown: seeing the rest is
     what makes choosing five feel like a choice. */
  const SEARCH_SAVE_CAP = 5;
  const checks = new Map();
  const capNote = document.createElement('div');
  capNote.style.cssText = 'font-size:11px;color:#7d7979;margin:2px 0 8px;';

  function tickedCount(){
    let n = 0; checks.forEach(c => { if (c.checked && !c.disabled) n++; }); return n;
  }
  /* Runs after every tick: keeps the count honest, disables what cannot be
     ticked, and never silently un-ticks something the user chose. */
  function syncCap(){
    const n = tickedCount();
    const full = n >= SEARCH_SAVE_CAP;
    checks.forEach(c => {
      if (c.dataset.saved === '1' || c.dataset.already === '1') return;
      c.disabled = full && !c.checked;
      const row = c.closest('label');
      if (row) row.style.opacity = c.disabled ? '.45' : '1';
    });
    capNote.textContent = full
      ? 'Five is the most Mighty will take from one search. Untick one to swap it.'
      : n + ' of ' + SEARCH_SAVE_CAP + ' chosen from this search.';
    if (btn) {
      btn.textContent = n ? 'Import ' + n + ' to Mighty' : 'Choose up to ' + SEARCH_SAVE_CAP;
      btn.disabled = n === 0;
    }
  }

  let btn = null;   // declared before syncCap can touch it
  const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-bottom:10px;';
  profiles.forEach((p, idx) => {
    const already = tracked.has(p.profileUrl);
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;gap:9px;align-items:flex-start;padding:7px 4px;border-bottom:1px solid #f0eded;cursor:pointer;';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    /* Pre-tick the first five only. Ticking everything and then telling the
       user five is the limit is a worse experience than starting at the limit. */
    cb.checked = !already && idx < SEARCH_SAVE_CAP;
    cb.disabled = already;
    if (already) cb.dataset.already = '1';
    cb.addEventListener('change', syncCap);
    cb.style.cssText = 'margin-top:2px;flex:none;'; checks.set(p.profileUrl, cb);
    const info = document.createElement('div'); info.style.cssText = 'min-width:0;flex:1;';
    info.innerHTML = `<div style="font-weight:700;font-size:12.5px;">${esc(p.name)}</div>`
      + `<div style="font-size:11px;color:#605d5d;line-height:1.3;max-height:28px;overflow:hidden;">${esc(p.title || p.company)}</div>`
      + (already ? `<div style="font-size:11px;color:${ACCENT_DEEP};font-weight:500;margin-top:2px;">Already in Mighty</div>` : '');
    row.append(cb, info); list.appendChild(row);
  });
  gPanel.appendChild(list);

  gPanel.appendChild(capNote);

  btn = document.createElement('button');
  btn.style.cssText = `background:${ACCENT};color:#fff;border:none;border-radius:999px;padding:13px 12px;font-weight:500;font-size:14.5px;cursor:pointer;width:100%;font-family:inherit;`;
  btn.onclick = async () => {
    const chosen = profiles
      .filter(p => { const c = checks.get(p.profileUrl); return c && c.checked && !c.disabled; })
      .slice(0, SEARCH_SAVE_CAP);
    if (!chosen.length) return;
    btn.textContent = 'Importing…'; btn.disabled = true;
    let ok = 0;
    for (const p of chosen) {
      const res = await send('saveProfile', { payload: { profileUrl: p.profileUrl, name: p.name, title: p.title, company: p.company } });
      if (res && res.ok) { ok++; const c = checks.get(p.profileUrl); if (c) { c.disabled = true; c.dataset.saved = '1'; } }
    }
    btn.textContent = `Imported ${ok} ✓`;
    setTimeout(() => renderGoogleImportPanel(), 1200);
  };
  gPanel.appendChild(btn);
  syncCap();
  const foot = document.createElement('div'); foot.style.cssText = 'font-size:10.5px;color:#7d7979;margin-top:8px;';
  // Google results carry no profile photos (only a 16px LinkedIn favicon), so
  // imported people start with initials. The photo fills itself in the first
  // time you open their profile - we never fetch LinkedIn pages on your behalf.
  /* Says the quiet part: a search result is a name and a headline. Mighty will
     not pretend it can brief you on someone from that, and opening the profile
     once is what turns a row into something worth reading. */
  foot.textContent = 'A search result is a name and a headline. Open each profile once and Mighty can brief you properly. '
    + 'you properly.';
  gPanel.appendChild(foot);
  document.body.appendChild(gPanel);
}

/* ---------- wiring: re-scan on the student's own SPA navigation ---------- */
const IS_LINKEDIN = /(^|\.)linkedin\.com$/i.test(location.hostname);
const IS_GOOGLE = /(^|\.)google\./i.test(location.hostname);
let lastUrl = '';
function scan() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  setTimeout(() => {
    try {
      if (IS_LINKEDIN) {
        renderCardCheckboxes(); wireComposeFill(); captureProfileContext(); renderProfileSidebar(); wireSendObserver();
        // Async, deliberately not awaited here - each has its own try/catch and just posts to
        // outreach_inbox in the background when it finds something. Never blocks page render.
        scanNotificationsForActivity(); scanMessagingForActivity(); scanProfileViewsForActivity();
      }
      else if (IS_GOOGLE) { renderGoogleImportPanel(); }
    }
    catch (e) { /* selectors likely drifted - see SELECTORS comment above */ }
  }, 1200); // let the SPA render
}

scan();
try {
  const _push = history.pushState; history.pushState = function () { _push.apply(this, arguments); scan(); };
  const _replace = history.replaceState; history.replaceState = function () { _replace.apply(this, arguments); scan(); };
} catch (e) {}
window.addEventListener('popstate', scan);
setInterval(scan, 3000); // catches in-place DOM swaps that don't touch history
