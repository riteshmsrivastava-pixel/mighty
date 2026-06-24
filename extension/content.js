// MIghTy — MIT Watch · content script
// Runs inside every MIT page you open (in your own session). Captures the page's
// real, rendered content + links and hands it to the extension. This is how pages
// get added — by you simply browsing — instead of blind background crawling.

(function(){
  function extract(){
    const links = []; const seen = new Set();
    const walk = (root) => {
      let nodes; try { nodes = root.querySelectorAll('a[href]'); } catch(e){ nodes = []; }
      nodes.forEach(a => {
        let href = a.href; if (!href) return;
        try { href = new URL(href, location.href).href; } catch(e){ return; }
        if (!/^https?:/i.test(href) || seen.has(href)) return;
        seen.add(href);
        links.push({ href, label: (a.textContent || '').trim().replace(/\s+/g,' ').slice(0,60) });
      });
      let all; try { all = root.querySelectorAll('*'); } catch(e){ all = []; }
      all.forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
    };
    try { walk(document); } catch(e){}

    let text = '';
    try {
      const main = document.querySelector('main, [role=main], #content, #main, .content, .page-content, article');
      // read the content region's text WITHOUT permanently mutating the live page
      const src = main || document.body;
      text = (src && src.innerText) || '';
    } catch(e){ try { text = document.body.innerText; } catch(_){} }
    text = (text || '').replace(/\s+/g,' ').trim().slice(0, 12000);
    return { url: location.href, title: document.title, text, links };
  }

  function looksLikeLogin(){
    const t = (document.body && document.body.innerText || '');
    return /touchstone/i.test(t) && /password/i.test(t) && t.length < 4000;
  }

  let lastUrl = '';
  function capture(){
    if (location.href === lastUrl) return;
    setTimeout(() => {
      try {
        if (looksLikeLogin()) return;
        const data = extract();
        if (data.text && data.text.length > 60){
          lastUrl = location.href;
          chrome.runtime.sendMessage({ type:'capture', data }, () => void chrome.runtime.lastError);
        }
      } catch(e){}
    }, 1600); // let the SPA render
  }

  capture();
  // catch single-page-app route changes
  try {
    const _push = history.pushState; history.pushState = function(){ _push.apply(this, arguments); capture(); };
    const _replace = history.replaceState; history.replaceState = function(){ _replace.apply(this, arguments); capture(); };
  } catch(e){}
  window.addEventListener('popstate', capture);
  setInterval(() => { if (location.href !== lastUrl) capture(); }, 3000);
})();
