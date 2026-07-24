// MIghTy — LinkedIn Outreach · content script
//
// Human-in-the-loop only. Everything here is foreground, on a page the
// student themselves navigated to:
//   1. Shortlist visible search-result cards (student checks boxes, clicks one button).
//   2. Optionally pre-fill a drafted message into a compose box (only on explicit click).
//   3. Passively read a profile page's About/Experience/Education text to enrich a
//      contact's briefing — but ONLY if that profile is already on the student's
//      shortlist; the app discards this for anyone not already added, so nothing
//      is retained for a profile the student merely browsed past.
//   4. Passively OBSERVE the real Send/Connect click (never calls .click() ourselves)
//      and log a confirmed send.
//
// LinkedIn's DOM changes without notice and isn't verifiable from this dev
// environment. If shortlisting or send-detection breaks, inspect the live
// page and fix ONLY this SELECTORS object.
const SELECTORS = {
  searchResultCard: 'li.reusable-search__result-container, div[data-chameleon-result-urn]',
  cardName: '.entity-result__title-text a span[aria-hidden="true"], .entity-result__title-text a',
  cardTitle: '.entity-result__primary-subtitle',
  cardProfileLink: 'a.app-aware-link[href*="/in/"]',
  cardPhoto: 'img.presence-entity__image, img.EntityPhoto-circle-3, img[class*="entity-result__universal-image"]',
  composeBox: 'div.msg-form__contenteditable, div[role="textbox"][contenteditable="true"]',
  sendButton: 'button.msg-form__send-button, button[aria-label*="Send" i]',
  connectButton: 'button[aria-label*="Connect" i], button[aria-label^="Invite"]',
  profileAbout: '#about ~ .display-flex .inline-show-more-text, section.summary .inline-show-more-text',
  profileExperience: '#experience ~ .pvs-list__container, section.experience-section',
  profileEducation: '#education ~ .pvs-list__container, section.education-section',
  profilePhoto: 'img.pv-top-card-profile-picture__image, img.pv-top-card-profile-picture__image--show, .pv-top-card__photo img, button[aria-label*="profile photo" i] img',
  mutualConnections: 'a[href*="facetNetwork"] span, .entity-result__simple-insight-text, .member-insights',
};

// LinkedIn headlines are "Title at Company", "Title @ Company", or
// "Company | tagline | ..." — good enough to split without a real parser.
// Returns '' rather than guessing when no company pattern is present.
function companyFromTitle(title) {
  const t = title || '';
  const at = t.match(/\bat\s+(.+?)(?:\s*[·|]|$)/i);
  if (at) return at[1].trim();
  const atSign = t.match(/@\s*(.+?)(?:\s*[·|]|$)/);
  if (atSign) return atSign[1].trim();
  if (t.includes('|')) { const b = t.split('|')[0].trim(); if (b && b.length < 50) return b; }
  return '';
}

/* ---------- robust profile-page extraction ----------
   LinkedIn ships obfuscated, frequently-rotated class names (e.g. "_699ffef9")
   and renders the name in an <h2>, not <h1> — so fixed class selectors rot fast.
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
  panel.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:99999;background:#2A2320;color:#F3ECDC;'
    + 'font:13px -apple-system,system-ui,sans-serif;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);'
    + 'display:flex;align-items:center;gap:10px;';
  const btn = document.createElement('button');
  btn.textContent = 'Send 0 to MIghTy';
  btn.style.cssText = 'background:#A31F34;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;';
  panel.appendChild(btn);
  document.body.appendChild(panel);
  return panel;
}

// Score badges: real, transparent scores only for profiles already in the
// student's outreach_log (fetched via the authenticated fetchLog relay).
// For anyone NOT yet tracked, only a plain "target company" text match is
// shown — never a fabricated live score for a stranger.
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
      const { score, reasons } = mightyComputeScore(row, r.targetCompanies);
      badge.style.background = '#E7EDFB'; badge.style.color = '#3B55B8';
      badge.title = reasons.join(' · ');
      badge.textContent = `${score}% · ${mightyMatchLabel(score)}`;
    } else {
      const text = (c.title || '') + ' ' + (c.name || '');
      const match = (r.targetCompanies || []).find(co => text.toLowerCase().includes(co.trim().toLowerCase()));
      if (!match) return; // no fabricated score for an untracked stranger
      badge.style.background = '#F1F0EC'; badge.style.color = '#57544C';
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
    box.title = 'Shortlist in MIghTy';
    box.addEventListener('change', () => {
      if (box.checked) checked.add(c.profileUrl); else checked.delete(c.profileUrl);
      btn.textContent = `Send ${checked.size} to MIghTy`;
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
      await send('saveProfile', { payload: { profileUrl: c.profileUrl, name: c.name, title: c.title, company: c.company, avatarUrl: c.photo } });
    }
    selected.forEach(c => { const b = c.el.querySelector('.mighty-badge'); if (b) b.remove(); });
    checked.clear();
    document.querySelectorAll('.mighty-check').forEach(el => { el.checked = false; });
    btn.textContent = `Saved ✓ — Send 0 to MIghTy`;
    decorateCardsWithScores(cards).catch(() => {});
  };
}

/* ---------- 2. opt-in compose pre-fill ----------
   The MIghTy web app's "Copy message + Open profile" button already puts the
   drafted, placeholder-filled message on the clipboard before it opens this
   tab — so filling the compose box is just reading the clipboard back, on
   explicit click only. No cross-context lookup needed. */
function wireComposeFill() {
  const box = document.querySelector(SELECTORS.composeBox);
  if (!box || box.dataset.mightyWired) return;
  box.dataset.mightyWired = '1';
  const fillBtn = document.createElement('button');
  fillBtn.textContent = '✉️ Fill draft from clipboard (MIghTy)';
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
   rendered — no scrolling automation, no expanding hidden sections, no
   navigation. The web app DISCARDS this for any profile not already on the
   student's shortlist, so nothing is retained for someone just browsed past. */
const PROFILE_PAGE_RE = /^\/in\/[^\/]+\/?$/;
function textOf(selector) {
  return Array.from(document.querySelectorAll(selector))
    .map(el => (el.textContent || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 2000);
}
let lastContextUrl = '';
function captureProfileContext() {
  if (!PROFILE_PAGE_RE.test(location.pathname)) return;
  const profileUrl = normProfileUrl(location.href);
  if (profileUrl === lastContextUrl) return;
  lastContextUrl = profileUrl;
  const payload = {
    profileUrl,
    aboutText: textOf(SELECTORS.profileAbout),
    experienceText: textOf(SELECTORS.profileExperience),
    educationText: textOf(SELECTORS.profileEducation),
    mutualConnectionsRaw: textOf(SELECTORS.mutualConnections),
  };
  if (!payload.aboutText && !payload.experienceText && !payload.educationText) return; // page likely hasn't rendered yet
  send('pushInbox', { kind: 'profile_context', payload });
}

/* ---------- docked sidebar on profile pages ----------
   Shows real MIghTy data if this profile is already tracked (never fabricates
   info for a stranger — that preserves the same discard-if-not-shortlisted
   boundary as profile-context capture). For an untracked profile, only a
   lighter "save?" panel appears. */
const ACCENT = '#ec3013';
let sidebarEl = null;
function ensureSidebar() {
  if (sidebarEl && document.body.contains(sidebarEl)) return sidebarEl;
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'mighty-sidebar';
  sidebarEl.style.cssText = 'position:fixed;top:70px;right:16px;width:320px;max-height:85vh;overflow:auto;z-index:99998;'
    + 'background:#fff;border:1px solid rgba(0,0,0,.14);box-shadow:0 12px 40px rgba(0,0,0,.18);'
    + "font:13px 'Archivo',-apple-system,system-ui,sans-serif;color:#201e1d;padding:16px;";
  document.body.appendChild(sidebarEl);
  return sidebarEl;
}
function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mightyBrandHead(rightHtml) {
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <img src="${chrome.runtime.getURL('icons/logo-32.png')}" style="width:22px;height:22px;display:block;">
    <span style="font-weight:800;font-size:15px;">MIghTy</span>
    <span style="margin-left:auto;">${rightHtml || ''}</span></div>`;
}
// A readable "last interaction" label from the most recent event or status.
function lastInteractionLabel(row, rowEvents) {
  const ev = rowEvents.slice().sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0];
  if (ev) {
    const map = { stage_change: 'Stage updated', reply: 'They replied', coffee_chat: 'Coffee chat', referral: 'Referral', interview: 'Interview', first_message: 'Message sent', connection_request: 'Connection request', note: 'Note added' };
    return map[ev.event_type] || 'Updated';
  }
  if (row.contacted_at) return 'Message sent';
  return 'Saved';
}
async function renderProfileSidebar() {
  if (!PROFILE_PAGE_RE.test(location.pathname)) { if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; } return; }
  const profileUrl = normProfileUrl(location.href);
  const r = await fetchLogCached();
  if (!r || !r.ok) return;
  const row = r.log.find(x => x.profile_url === profileUrl);
  const el = ensureSidebar();

  // Live-scraped identity — fills gaps if the stored row is sparse.
  const liveName = profileName();
  const liveHeadline = profileHeadline(liveName);
  const liveCompany = companyFromTitle(liveHeadline);
  const livePhoto = profilePhotoUrl();

  if (!row) {
    el.innerHTML = mightyBrandHead(`<span style="font-size:11px;font-weight:700;color:#605d5d;background:#eae7e7;padding:3px 9px;">Not tracked</span>`)
      + `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          ${livePhoto ? `<img src="${esc(livePhoto)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none;">` : ''}
          <div style="min-width:0;"><div style="font-weight:800;font-size:15px;">${esc(liveName) || 'This profile'}</div>
          <div style="font-size:11.5px;color:#605d5d;line-height:1.35;max-height:32px;overflow:hidden;">${esc(liveHeadline)}</div></div>
        </div>
        <div style="color:#605d5d;margin-bottom:12px;font-size:12.5px;">Not yet tracked in MIghTy. Save it to see match, status, and notes here.</div>`;
    const btn = document.createElement('button');
    btn.textContent = 'Save to MIghTy';
    btn.style.cssText = `background:${ACCENT};color:#fff;border:none;padding:9px 12px;font-weight:800;font-size:13px;cursor:pointer;width:100%;font-family:inherit;`;
    btn.onclick = async () => {
      btn.textContent = 'Saving…';
      const res = await send('saveProfile', { payload: { profileUrl, name: liveName, title: liveHeadline, company: liveCompany, avatarUrl: livePhoto } });
      if (res && res.ok) { renderProfileSidebar(); return; }
      btn.textContent = 'Saved ✓'; btn.disabled = true;
    };
    el.appendChild(btn);
    return;
  }

  const rowEvents = r.events.filter(e => e.log_id === row.id);
  const next = mightySuggestedNext(row);
  const { score, reasons } = mightyComputeScore(row, r.targetCompanies);
  const name = row.name || liveName;
  const headline = row.title || liveHeadline;
  const company = row.company || liveCompany;
  const photo = row.avatar_url || livePhoto;
  const statusLabel = row.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  el.innerHTML =
    mightyBrandHead(`<span style="font-size:11px;font-weight:700;color:#605d5d;background:#eae7e7;padding:3px 9px;">Saved</span>`)
    + `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        ${photo ? `<img src="${esc(photo)}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;flex:none;">` : ''}
        <div style="min-width:0;">
          <div style="font-weight:800;font-size:15px;">${esc(name)}</div>
          <div style="font-size:11.5px;color:#605d5d;line-height:1.35;max-height:32px;overflow:hidden;">${esc(company || headline)}</div>
        </div>
      </div>
      <div style="font-weight:800;font-size:18px;color:${ACCENT};line-height:1.1;">${mightyMatchLabel(score)}</div>
      <div style="font-size:11.5px;color:#605d5d;margin-bottom:12px;">${score}%${reasons.length ? ' · ' + esc(reasons.join(' · ')) : ''}</div>
      <div style="border-top:1px solid rgba(0,0,0,.12);padding-top:11px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#605d5d;">Status</span><span style="font-weight:600;background:#eae7e7;padding:1px 8px;">${esc(statusLabel)}</span></div>
        <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#605d5d;">Last interaction</span><span style="font-weight:600;">${esc(lastInteractionLabel(row, rowEvents))}</span></div>
        <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#605d5d;">Next action</span><span style="font-weight:700;color:${ACCENT};text-align:right;max-width:170px;">${esc(next || '—')}</span></div>
      </div>`;

  // notes
  const notesWrap = document.createElement('div');
  notesWrap.style.cssText = 'background:#f8f4f4;border:1px solid rgba(0,0,0,.1);padding:9px 10px;margin-bottom:12px;';
  notesWrap.innerHTML = `<div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7d7979;margin-bottom:5px;">Your notes</div>`;
  const notesBox = document.createElement('textarea');
  notesBox.value = row.notes || ''; notesBox.placeholder = 'Jot anything…';
  notesBox.style.cssText = 'width:100%;min-height:52px;border:none;background:transparent;padding:0;font:12.5px inherit;color:#201e1d;resize:vertical;outline:none;';
  let notesTimer;
  notesBox.addEventListener('input', () => { clearTimeout(notesTimer); notesTimer = setTimeout(() => send('patchNotes', { logId: row.id, notes: notesBox.value }), 900); });
  notesWrap.appendChild(notesBox);
  el.appendChild(notesWrap);

  // actions
  const draftBtn = document.createElement('button');
  draftBtn.textContent = row.status === 'prospect' || row.status === 'ready_to_contact' ? 'Draft message' : 'Draft follow-up';
  draftBtn.style.cssText = `background:${ACCENT};color:#fff;border:none;padding:9px 12px;font-weight:800;font-size:13px;cursor:pointer;width:100%;font-family:inherit;margin-bottom:8px;`;
  draftBtn.onclick = () => window.open(`${(r.appUrl || 'https://yourmighty.com/app/')}?open=${row.id}`, '_blank');
  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open in MIghTy';
  openBtn.style.cssText = 'background:#fff;color:#201e1d;border:1px solid rgba(0,0,0,.2);padding:9px 12px;font-weight:800;font-size:13px;cursor:pointer;width:100%;font-family:inherit;';
  openBtn.onclick = () => window.open('https://yourmighty.com/app/', '_blank');
  el.append(draftBtn, openBtn);
}

/* ---------- 4. passive send/connect observer (never triggers a click) ---------- */
function wireSendObserver() {
  if (document.documentElement.dataset.mightySendObserver) return;
  document.documentElement.dataset.mightySendObserver = '1';
  document.addEventListener('click', (e) => {
    const target = e.target.closest(`${SELECTORS.sendButton}, ${SELECTORS.connectButton}`);
    if (!target) return;
    // Observation only — this listener never calls target.click() or preventDefault().
    send('pushInbox', { kind: 'sent_confirmation', payload: { profileUrl: normProfileUrl(location.href), ts: Date.now() } });
  }, true);
}

/* ---------- wiring: re-scan on the student's own SPA navigation ---------- */
let lastUrl = '';
function scan() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  setTimeout(() => {
    try { renderCardCheckboxes(); wireComposeFill(); captureProfileContext(); renderProfileSidebar(); wireSendObserver(); }
    catch (e) { /* selectors likely drifted — see SELECTORS comment above */ }
  }, 1200); // let LinkedIn's SPA render
}

scan();
try {
  const _push = history.pushState; history.pushState = function () { _push.apply(this, arguments); scan(); };
  const _replace = history.replaceState; history.replaceState = function () { _replace.apply(this, arguments); scan(); };
} catch (e) {}
window.addEventListener('popstate', scan);
setInterval(scan, 3000); // catches in-place DOM swaps that don't touch history
