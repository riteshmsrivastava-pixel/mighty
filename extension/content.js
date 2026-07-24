// MIghTy — LinkedIn Outreach · content script
//
// Human-in-the-loop only. Everything here is foreground, on a page the
// student themselves navigated to:
//   1. Shortlist visible search-result cards (student checks boxes, clicks one button).
//   2. Optionally pre-fill a drafted message into a compose box (only on explicit click).
//   3. Passively OBSERVE the real Send/Connect click (never calls .click() ourselves)
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
  composeBox: 'div.msg-form__contenteditable, div[role="textbox"][contenteditable="true"]',
  sendButton: 'button.msg-form__send-button, button[aria-label*="Send" i]',
  connectButton: 'button[aria-label*="Connect" i], button[aria-label^="Invite"]',
};

function send(type, extra) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

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
    if (!linkEl) return null;
    return {
      profileUrl: normProfileUrl(linkEl.href),
      name: (nameEl && nameEl.textContent || '').trim(),
      title: (titleEl && titleEl.textContent || '').trim(),
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

function renderCardCheckboxes() {
  const cards = extractCards();
  if (!cards.length) { if (panel) panel.remove(); panel = null; return; }
  const p = ensurePanel();
  const btn = p.querySelector('button');
  const checked = new Set();

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
    btn.textContent = 'Sending…';
    for (const c of selected) {
      await send('pushInbox', { kind: 'profile', payload: { profileUrl: c.profileUrl, name: c.name, title: c.title } });
    }
    checked.clear();
    document.querySelectorAll('.mighty-check').forEach(el => { el.checked = false; });
    btn.textContent = `Sent ✓ — Send 0 to MIghTy`;
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

/* ---------- 3. passive send/connect observer (never triggers a click) ---------- */
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
    try { renderCardCheckboxes(); wireComposeFill(); wireSendObserver(); }
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
