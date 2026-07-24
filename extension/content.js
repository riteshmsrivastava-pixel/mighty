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

// LinkedIn headlines are almost always "Title at Company" — good enough to
// split without a real parser; left blank rather than guessed wrong.
function companyFromTitle(title) {
  const m = (title || '').match(/\bat\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function send(type, extra) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}
async function fetchLogCached() { return send('fetchLog', {}); }

function normProfileUrl(href) {
  try { const u = new URL(href, location.href); return (u.origin + u.pathname).replace(/\/$/, ''); }
  catch (e) { return href; }
}

/* ---------- 1. shortlist panel on search-results pages ---------- */
function extractCards() {
  const cards = Array.from(document.querySelectorAll(SELECTORS.searchResultCard));
  return cards.map(card => {
    const linkEl = card.querySelector(SELECTORS.cardProfileLink);
    const nameEl = card.querySelector(SELECTORS.cardName);
    const titleEl = card.querySelector(SELECTORS.cardTitle);
    const photoEl = card.querySelector(SELECTORS.cardPhoto);
    if (!linkEl) return null;
    const title = (titleEl && titleEl.textContent || '').trim();
    return {
      profileUrl: normProfileUrl(linkEl.href),
      name: (nameEl && nameEl.textContent || '').trim(),
      title,
      company: companyFromTitle(title),
      photo: (photoEl && photoEl.src) || '',
      el: card,
    };
  }).filter(Boolean);
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
let sidebarEl = null;
function ensureSidebar() {
  if (sidebarEl && document.body.contains(sidebarEl)) return sidebarEl;
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'mighty-sidebar';
  sidebarEl.style.cssText = 'position:fixed;top:70px;right:16px;width:290px;max-height:80vh;overflow:auto;z-index:99998;'
    + 'background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);'
    + 'font:13px -apple-system,system-ui,sans-serif;color:#1F1E1B;padding:14px;';
  document.body.appendChild(sidebarEl);
  return sidebarEl;
}
async function renderProfileSidebar() {
  if (!PROFILE_PAGE_RE.test(location.pathname)) { if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; } return; }
  const profileUrl = normProfileUrl(location.href);
  const r = await fetchLogCached();
  if (!r || !r.ok) return;
  const row = r.log.find(x => x.profile_url === profileUrl);
  const el = ensureSidebar();

  if (!row) {
    el.innerHTML = '';
    const title = document.createElement('div'); title.style.cssText = 'font-weight:700;margin-bottom:6px;'; title.textContent = 'MIghTy';
    const note = document.createElement('div'); note.style.cssText = 'color:#6E6B64;margin-bottom:10px;'; note.textContent = 'Not yet tracked in MIghTy.';
    const btn = document.createElement('button');
    btn.textContent = 'Save to MIghTy'; btn.style.cssText = 'background:#4661D8;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer;width:100%;';
    btn.onclick = async () => {
      const nameEl = document.querySelector('h1');
      const titleEl = document.querySelector('.text-body-medium');
      const photoEl = document.querySelector(SELECTORS.profilePhoto);
      const title = (titleEl && titleEl.textContent || '').trim();
      const res = await send('saveProfile', { payload: {
        profileUrl, name: (nameEl && nameEl.textContent || '').trim(), title,
        company: companyFromTitle(title), avatarUrl: (photoEl && photoEl.src) || '',
      } });
      if (res && res.ok) { renderProfileSidebar(); return; }
      btn.textContent = 'Saved ✓'; btn.disabled = true;
    };
    el.append(title, note, btn);
    return;
  }

  const rowEvents = r.events.filter(e => e.log_id === row.id);
  const next = mightySuggestedNext(row);
  const { score, reasons } = mightyComputeScore(row, r.targetCompanies);
  el.innerHTML = '';
  const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';
  head.innerHTML = `<span style="font-weight:700;">MIghTy</span><span style="margin-left:auto;font-size:11px;font-weight:700;color:#1F6F54;background:#E2F1EC;padding:2px 8px;border-radius:99px;">${row.status.replace('_',' ')}</span>`;
  el.appendChild(head);
  const matchTitle = document.createElement('div'); matchTitle.style.cssText = 'font-weight:700;font-size:15px;color:#A31F34;margin-bottom:2px;';
  matchTitle.textContent = `${mightyMatchLabel(score)} · ${score}%`;
  el.appendChild(matchTitle);
  if (reasons.length) {
    const matchReasons = document.createElement('div'); matchReasons.style.cssText = 'font-size:11.5px;color:#6E6B64;margin-bottom:10px;';
    matchReasons.textContent = reasons.join(' · ');
    el.appendChild(matchReasons);
  }
  if (next) {
    const nextBox = document.createElement('div');
    nextBox.style.cssText = 'background:#E7EDFB;border-radius:8px;padding:9px 10px;margin-bottom:10px;font-size:12.5px;color:#3B55B8;';
    nextBox.textContent = next;
    el.appendChild(nextBox);
  }
  if (row.briefing && row.briefing.careerSummary) {
    const brief = document.createElement('div'); brief.style.cssText = 'font-size:12px;color:#3D3B35;margin-bottom:10px;line-height:1.5;';
    brief.textContent = row.briefing.careerSummary;
    el.appendChild(brief);
  }
  const notesLabel = document.createElement('div'); notesLabel.style.cssText = 'font-size:10.5px;font-weight:700;text-transform:uppercase;color:#8A867C;margin-bottom:4px;'; notesLabel.textContent = 'Your notes';
  const notesBox = document.createElement('textarea');
  notesBox.value = row.notes || ''; notesBox.placeholder = 'Jot anything…';
  notesBox.style.cssText = 'width:100%;min-height:60px;border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:7px 9px;font:12px inherit;margin-bottom:10px;';
  let notesTimer;
  notesBox.addEventListener('input', () => { clearTimeout(notesTimer); notesTimer = setTimeout(() => send('patchNotes', { logId: row.id, notes: notesBox.value }), 900); });
  el.append(notesLabel, notesBox);

  if (rowEvents.length === 0) { /* no timeline yet */ }
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
