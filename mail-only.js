const FREEMAIL = {'gmail.com':1,'googlemail.com':1,'yahoo.com':1,'yahoo.co.in':1,'hotmail.com':1,
  'outlook.com':1,'live.com':1,'msn.com':1,'icloud.com':1,'me.com':1,'aol.com':1,'protonmail.com':1,
  'proton.me':1,'rediffmail.com':1,'zoho.com':1,'gmx.com':1,'mail.com':1,'yandex.com':1};

/* Gmail treats dots and any +tag in a gmail.com local part as noise, and the
   same human turns up spelled both ways across a decade of mail. Without this
   the same person appears three times in the correspondent list. */
function normEmail(e){
  const s = String(e||'').toLowerCase().trim();
  const at = s.lastIndexOf('@');
  if(at < 1) return '';
  let local = s.slice(0,at), dom = s.slice(at+1);
  local = local.split('+')[0];
  if(dom === 'googlemail.com') dom = 'gmail.com';
  if(dom === 'gmail.com') local = local.replace(/\./g,'');
  return (local && dom) ? local + '@' + dom : '';
}

/* TextDecoder throws RangeError on a label it does not know, and mail headers
   carry plenty it does not ("unknown-8bit", vendor charsets, RFC 2231 language
   tags). Anything unrecognised falls back to utf-8 rather than losing the
   whole message. */
function mimeCharset(cs){
  const c = String(cs||'').toLowerCase().replace(/\*.*$/,'').replace(/^["']|["']$/g,'');
  if(!c || c==='us-ascii' || c==='ascii' || c==='unknown-8bit' || c==='x-unknown') return 'utf-8';
  return c;
}
function decodeBytes(bytes, cs){
  try{ return new TextDecoder(mimeCharset(cs), {fatal:false}).decode(bytes); }
  catch(e){ return new TextDecoder('utf-8', {fatal:false}).decode(bytes); }
}
function bytesFromLatin1(str){
  const out = new Uint8Array(str.length);
  for(let i=0;i<str.length;i++) out[i] = str.charCodeAt(i) & 0xFF;
  return out;
}

/* RFC 2047 encoded words - "=?UTF-8?B?SGVsbG8=?=". Every From and Subject
   header is full of these the moment a name has an accent in it, and leaving
   them raw means storing "=?UTF-8?B?4KSw?=" as somebody's name. */
function decodeMimeWords(s){
  const str = String(s||'');
  if(str.indexOf('=?') < 0) return str;
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, txt)=>{
    try{
      if(enc.toUpperCase()==='B') return decodeBytes(bytesFromLatin1(atob(txt.replace(/\s+/g,''))), cs);
      /* Q encoding: underscore means space, =XX means one byte. */
      const out = [];
      for(let i=0;i<txt.length;i++){
        const c = txt[i];
        if(c === '_') out.push(32);
        else if(c === '=' && /^[0-9A-Fa-f]{2}$/.test(txt.substr(i+1,2))){ out.push(parseInt(txt.substr(i+1,2),16)); i += 2; }
        else out.push(txt.charCodeAt(i) & 0xFF);
      }
      return decodeBytes(new Uint8Array(out), cs);
    }catch(e){ return m; }
  }).replace(/\?=\s+=\?/g,'?==?');
}

function decodeQuotedPrintable(s, cs){
  const text = String(s||'').replace(/=\r?\n/g,'');       // soft line breaks
  const out = [];
  for(let i=0;i<text.length;i++){
    if(text[i]==='=' && /^[0-9A-Fa-f]{2}$/.test(text.substr(i+1,2))){ out.push(parseInt(text.substr(i+1,2),16)); i += 2; }
    else out.push(text.charCodeAt(i) & 0xFF);
  }
  return decodeBytes(new Uint8Array(out), cs);
}
function decodeBase64Text(s, cs){
  try{ return decodeBytes(bytesFromLatin1(atob(String(s||'').replace(/[^A-Za-z0-9+/=]/g,''))), cs); }
  catch(e){ return ''; }
}

/* Unfold first (a header continues for as long as the next line starts with
   whitespace), then split on the first colon. A repeated header keeps the
   first occurrence - none of the headers read here are legitimately plural. */
function parseMailHeaders(raw){
  const h = {};
  const lines = String(raw||'').split(/\r?\n/);
  let cur = null;
  for(let i=0;i<lines.length;i++){
    const ln = lines[i];
    if(/^[ \t]/.test(ln)){ if(cur) h[cur] += ' ' + ln.trim(); continue; }
    const m = ln.match(/^([!-9;-~]+)[ \t]*:[ \t]*(.*)$/);
    if(!m){ cur = null; continue; }
    const k = m[1].toLowerCase();
    if(k in h){ cur = null; continue; }
    h[k] = m[2]; cur = k;
  }
  return h;
}

/* "Ritesh Srivastava" <r@x.com>, r2@y.com  ->  [{name, email}]
   Split by hand rather than on /,/ because a quoted display name ("Srivastava,
   Ritesh") legitimately contains the separator, and splitting first puts half
   a name on one address and half on the next. */
function parseAddresses(s){
  const raw = decodeMimeWords(String(s||''));
  if(!raw) return [];
  const parts = []; let buf = '', inQ = false, depth = 0;
  for(let i=0;i<raw.length;i++){
    const c = raw[i];
    if(c === '"') inQ = !inQ;
    else if(c === '<') depth++;
    else if(c === '>') depth--;
    else if(c === ',' && !inQ && depth <= 0){ parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  if(buf.trim()) parts.push(buf);
  const out = [];
  parts.forEach(p=>{
    const t = p.trim();
    const m = t.match(/^([\s\S]*?)<([^>]+)>\s*$/);
    let name = '', email = '';
    if(m){ name = m[1].trim().replace(/^"([\s\S]*)"$/,'$1').trim(); email = m[2].trim(); }
    else email = t.replace(/^<|>$/g,'').trim();
    email = email.toLowerCase();
    if(!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(email)) return;
    /* "Srivastava, Ritesh" is how Outlook writes it. Stored the way a human
       would say it, since this name is what a draft will address them by. */
    if(/^[^,]+,\s*[^,]+$/.test(name) && !/\bltd\b|\binc\b/i.test(name)){
      const bits = name.split(','); name = (bits[1]||'').trim() + ' ' + (bits[0]||'').trim();
    }
    out.push({name: clean(name).slice(0,80), email});
  });
  return out;
}

function stripHtml(s){
  return String(s||'')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#0?39;/gi,"'").replace(/&#8217;/gi,'’')
    .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
}

/* Walk down to the first text/plain part. Nested multiparts (an alternative
   inside a mixed, which is what most clients send once there is an
   attachment) recurse. text/html is a last resort with the tags stripped,
   because the plain-text alternative is missing often enough to matter and an
   HTML-only mail still carries the words. */
function mimePart(headers, body, depth){
  depth = depth || 0;
  const ct  = String(headers['content-type'] || 'text/plain');
  const cte = String(headers['content-transfer-encoding'] || '').toLowerCase().trim();
  const csM = ct.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  const cs  = csM ? csM[1] : 'utf-8';

  if(/^\s*multipart\//i.test(ct)){
    if(depth >= 4) return {kind:'other', text:''};
    const bm = ct.match(/boundary\s*=\s*"([^"]+)"/i) || ct.match(/boundary\s*=\s*([^";\s]+)/i);
    if(bm){
      const chunks = body.split('--' + bm[1]);
      let html = '';
      for(let i=1;i<chunks.length;i++){
        if(/^--/.test(chunks[i])) break;                     // closing delimiter
        const sub = chunks[i].replace(/^\r?\n/,'');
        const sep = sub.search(/\r?\n\r?\n/);
        if(sep < 0) continue;
        const inner = mimePart(parseMailHeaders(sub.slice(0,sep)), sub.slice(sep).replace(/^\r?\n\r?\n/,''), depth+1);
        if(inner.kind === 'text' && clean(inner.text)) return inner;
        if(inner.kind === 'html' && !html) html = inner.text;
      }
      return {kind:'html', text:html};
    }
  }
  const decoded = cte === 'base64' ? decodeBase64Text(body, cs)
    : cte === 'quoted-printable' ? decodeQuotedPrintable(body, cs)
    : body;
  if(/^\s*text\/html/i.test(ct)) return {kind:'html', text:stripHtml(decoded)};
  if(/^\s*text\//i.test(ct) || !headers['content-type']) return {kind:'text', text:decoded};
  return {kind:'other', text:''};
}

/* What the user actually wrote, with the thread they were replying to and
   their sign-off removed. Without this every sample taken from a reply is
   mostly somebody else's words quoted back, which is worse than having no
   sample: it teaches the draft prompt the wrong voice. */
function ownWords(text){
  let t = String(text||'').replace(/\r/g,'');
  [ /\n[ \t]*On\s[\s\S]{0,160}?\swrote:/,
    /\n[ \t]*-{2,}\s*Original Message\s*-{2,}/i,
    /\n[ \t]*-{2,}\s*Forwarded message\s*-{2,}/i,
    /\n[ \t]*_{10,}/,
    /\nFrom:[ \t]*\S[\s\S]{0,200}?\nSent:[ \t]/i,
    /\n[ \t]*>{1,}[ \t]?\S/,
  ].forEach(re=>{ const m = t.match(re); if(m && m.index > 40) t = t.slice(0, m.index); });
  const sig = t.search(/\n--[ \t]*\n/);
  if(sig > 40) t = t.slice(0, sig);
  t = t.replace(/\n[ \t]*(Sent from my [\w ]+|Get Outlook for \w+)[\s\S]{0,40}$/i,'');
  /* Postgres text and jsonb reject a null byte outright, and it does not throw
     on the way in - it comes back as res.error, which is how a resume upload
     once looked successful and was never actually saved. Stripping C0 controls
     generally closes the class rather than the one byte that got caught. */
  return t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}

/* Mail addressed to a list is not a relationship. Counting it per recipient
   would put every all-hands alias at the top of "people you actually talk
   to", and the automated half of any inbox outnumbers the human half. */
const NOREPLY = /^(no-?reply|do-?not-?reply|noreply|donotreply|notifications?|notify|alerts?|support|info|admin|billing|receipts?|invoice|news|newsletter|updates?|mailer|postmaster|bounce|automated|robot|jobs-listings|team|hello|contact)([._-]|@|$)/i;
const BULK_HEADERS = ['list-id','list-unsubscribe','precedence','x-campaign-id','x-mailer-id','feedback-id','x-autoreply'];

function mailAccumulator(myEmails){
  const mine = Object.create(null);
  (myEmails||[]).forEach(e=>{ const n = normEmail(e); if(n) mine[n] = 1; });

  const byPerson = Object.create(null), threads = Object.create(null), domains = Object.create(null);
  let samples = [], subjects = [];
  let count=0, sent=0, received=0, skippedBulk=0, labelled=0, dated=0;
  let firstAt=null, lastAt=null, truncated=false;

  const touch = (addr, dir, t)=>{
    const key = normEmail(addr.email);
    if(!key || mine[key]) return;
    if(NOREPLY.test(key.split('@')[0])) return;
    let r = byPerson[key];
    if(!r) r = byPerson[key] = {email:key, name:'', sent:0, received:0, firstAt:null, lastAt:null};
    /* Keep the fullest spelling seen. Some senders put only a first name on
       some mails and the full name on others. */
    if(addr.name && addr.name.length > r.name.length) r.name = addr.name;
    r[dir]++;
    if(t){ if(!r.firstAt || t < r.firstAt) r.firstAt = t; if(!r.lastAt || t > r.lastAt) r.lastAt = t; }
    const dom = key.split('@')[1];
    if(dom && !FREEMAIL[dom]) domains[dom] = (domains[dom]||0) + 1;
  };

  /* Bodies are decoded lazily and only for messages the user wrote, and only
     when the message is recent enough to survive into the 40 that get kept -
     decoding base64 for 20,000 sent messages to then throw away 19,960 of
     them is minutes of the main thread for nothing. */
  const SAMPLE_POOL = 400;
  let minSampleT = 0;
  const pushSample = (t, body)=>{
    samples.push({t: t || 0, text: body.slice(0,900)});
    if(samples.length >= SAMPLE_POOL * 2){
      samples.sort((a,b)=>a.t-b.t);
      samples = samples.slice(-SAMPLE_POOL);
      minSampleT = samples[0].t;
    }
  };

  function add(raw){
    count++;
    const sep = raw.search(/\r?\n\r?\n/);
    if(sep < 0) return;
    const H = parseMailHeaders(raw.slice(0, sep));

    const labels = String(H['x-gmail-labels'] || '');
    if(labels) labelled++;
    /* Chats, drafts, spam and trash are not correspondence. Drafts especially:
       they would count as messages the user sent that nobody ever received. */
    if(/(^|,)\s*(Chat|Draft|Spam|Trash)\s*(,|$)/i.test(labels)) return;

    const from = parseAddresses(H['from'])[0];
    if(!from) return;
    const to = parseAddresses(H['to']).concat(parseAddresses(H['cc']));

    /* Direction. Takeout stamps X-Gmail-Labels on every message and "Sent" is
       on exactly the ones the account holder wrote, so this is read rather
       than guessed - unlike messageGraph, which has to match a display name
       against LinkedIn's FROM column and keeps nothing at all when it cannot.
       The address check is the fallback for a plain mbox with no labels, and
       also catches mail sent from an alias. */
    const isSent = /(^|,)\s*Sent\s*(,|$)/i.test(labels) || !!mine[normEmail(from.email)];

    if(!isSent){
      const bulk = BULK_HEADERS.some(k=>k in H) || NOREPLY.test(normEmail(from.email).split('@')[0]);
      if(bulk){ skippedBulk++; return; }
    }

    const d = new Date(String(H['date']||'').replace(/\s*\([^)]*\)\s*$/,''));
    const t = isNaN(d.getTime()) ? null : d.getTime();
    if(t){
      dated++;
      if(!firstAt || t < firstAt) firstAt = t;
      if(!lastAt  || t > lastAt)  lastAt  = t;
    }

    const broadcast = to.length > 8;

    if(isSent){
      sent++;
      if(!broadcast) to.forEach(a=>touch(a,'sent',t));
      if(!broadcast && to.length && (samples.length < SAMPLE_POOL || (t||0) > minSampleT)){
        const part = mimePart(H, raw.slice(sep).replace(/^\r?\n\r?\n/,''), 0);
        const body = ownWords(part.text);
        if(body.length >= 60 && body.length <= 1400) pushSample(t, body);
      }
      const s = clean(decodeMimeWords(H['subject']||''));
      if(s && subjects.length < 220 && !/^(re|fwd?)\s*:/i.test(s)) subjects.push(s);
    }else{
      received++;
      if(!broadcast) touch(from,'received',t);
    }

    /* X-GM-THRID is Gmail's own thread id, so threading is exact rather than
       inferred from a normalised subject line. The subject fallback is for a
       non-Takeout mbox. */
    if(t){
      const thr = clean(H['x-gm-thrid'])
        || ('s:' + clean(decodeMimeWords(H['subject']||'')).toLowerCase().replace(/^(re|fwd?)\s*:\s*/i,'').slice(0,90));
      if(thr && thr !== 's:'){
        let th = threads[thr];
        if(!th) th = threads[thr] = {t0:t, mine0:isSent, minMineT:null, minTheirsT:null};
        if(t < th.t0){ th.t0 = t; th.mine0 = isSent; }
        if(isSent){ if(!th.minMineT   || t < th.minMineT)   th.minMineT   = t; }
        else      { if(!th.minTheirsT || t < th.minTheirsT) th.minTheirsT = t; }
      }
    }
  }

  function done(){
    const iso = ms => ms ? new Date(ms).toISOString() : null;

    const persons = Object.keys(byPerson).map(k=>byPerson[k]).filter(p=>p.sent + p.received > 0);
    /* Ranked the way messageGraph ranks counterparts: real exchange first,
       then how much of it the user initiated, then recency. Someone the user
       wrote to ten times outranks a mailing list that wrote to them fifty. */
    persons.sort((a,b)=>
      (Math.min(b.sent,b.received) - Math.min(a.sent,a.received))
      || (b.sent - a.sent)
      || ((b.sent+b.received) - (a.sent+a.received))
      || ((b.lastAt||0) - (a.lastAt||0)));

    samples.sort((a,b)=>b.t-a.t);
    const keptSamples = samples.slice(0,40).map(s=>s.text);
    const lens = samples.map(s=>s.text.length);

    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const TOD = [
      {key:'morning',   label:'Morning (5am–noon)',   test:h=>h>=5&&h<12},
      {key:'afternoon', label:'Afternoon (noon–5pm)', test:h=>h>=12&&h<17},
      {key:'evening',   label:'Evening (5–9pm)',      test:h=>h>=17&&h<21},
      {key:'night',     label:'Night (9pm–5am)',      test:h=>h>=21||h<5},
    ];
    const byDow = DOW.map(label=>({label, sent:0, replied:0}));
    const byTod = {}; TOD.forEach(b=>{ byTod[b.key] = {label:b.label, sent:0, replied:0}; });
    const myGaps = [], theirGaps = [];
    let iStarted=0, iStartedReplied=0, theyStarted=0, threadCount=0;

    Object.keys(threads).forEach(k=>{
      const th = threads[k]; threadCount++;
      if(th.mine0){
        iStarted++;
        const replied = !!th.minTheirsT && th.minTheirsT > th.t0;
        if(replied){ iStartedReplied++; theirGaps.push(th.minTheirsT - th.t0); }
        const dt = new Date(th.t0);
        byDow[dt.getDay()].sent++; if(replied) byDow[dt.getDay()].replied++;
        const b = TOD.find(x=>x.test(dt.getHours()));
        if(b){ byTod[b.key].sent++; if(replied) byTod[b.key].replied++; }
      }else{
        theyStarted++;
        if(th.minMineT && th.minMineT > th.t0) myGaps.push(th.minMineT - th.t0);
      }
    });

    /* Same "counts only once it is real" rule the LinkedIn timing uses - a
       per-bucket reply rate is withheld below 5 threads in that bucket, and a
       "best" pick below 20 threads opened in total. */
    const MIN_BUCKET = 5;
    const rate = b => b.sent >= MIN_BUCKET ? Math.round(b.replied/b.sent*100) : null;
    const byDowRated = byDow.map(b=>({...b, pct:rate(b)}));
    const byTodRated = TOD.map(b=>({key:b.key, ...byTod[b.key], pct:rate(byTod[b.key])}));
    const enoughData = iStarted >= 20;
    const best = list => enoughData ? (list.filter(b=>b.pct!=null).sort((a,b)=>b.pct-a.pct)[0] || null) : null;

    const topDomains = Object.keys(domains).map(d=>({domain:d, count:domains[d]}))
      .sort((a,b)=>b.count-a.count).slice(0,40);

    return {
      source: 'gmail_takeout',
      capturedAt: new Date().toISOString(),
      messagesRead: count,
      truncated,
      skippedBulk,
      /* Low coverage means this was not a Takeout export, so direction rested
         entirely on the addresses the user typed. Recorded so the UI can say
         so instead of quietly reporting a smaller number as if it were whole. */
      labelCoverage: count ? Math.round(labelled/count*100) : 0,
      sent, received, dated,
      identified: sent > 0,
      firstAt: iso(firstAt), lastAt: iso(lastAt),
      medianSentLength: median(lens) || 0,
      styleSamples: keptSamples,
      /* Capped for the same reason connections are: this lives inside the one
         jsonb blob that gets rewritten on every settings save. */
      correspondents: persons.slice(0,600).map(p=>({
        email:p.email, name:p.name, sent:p.sent, received:p.received,
        firstAt: iso(p.firstAt), lastAt: iso(p.lastAt),
      })),
      correspondentCount: persons.length,
      twoWayCount: persons.filter(p=>p.sent>0 && p.received>0).length,
      /* Companies the user demonstrably has live email into, which is a much
         stronger signal than a LinkedIn connection at the same company. */
      domains: topDomains,
      subjects: subjects.slice(0,60),
      showUp: threadCount > 0 ? {
        totalThreads: threadCount,
        iWroteFirstCount: iStarted,
        iWroteFirstReplyPct: iStarted > 0 ? Math.round(iStartedReplied/iStarted*100) : null,
        theyWroteFirstPct: threadCount > 0 ? Math.round(theyStarted/threadCount*100) : null,
        myMedianReplyMs: median(myGaps),
        theirMedianReplyMs: median(theirGaps),
        sendTiming: {enoughData, byDow:byDowRated, byTod:byTodRated,
          bestDow:best(byDowRated), bestTod:best(byTodRated)},
      } : null,
    };
  }

  return {add, done,
    get count(){ return count; },
    markTruncated(){ truncated = true; }};
}

/* A Takeout mail export is one mbox file and it is routinely several
   gigabytes. Reading it into a string the way readArchive reads a 4MB CSV
   takes the tab down, so it is read in 8MB slices, each message is reduced
   into the accumulator the moment it is parsed, and nothing but 40 samples and
   the per-correspondent tallies is ever retained. Memory stays flat whether
   the file is 20MB or 6GB. */
const MBOX_CHUNK = 8 * 1024 * 1024;
const MBOX_MAX_MESSAGES = 120000;

async function readMbox(file, myEmails, onProgress){
  const acc = mailAccumulator(myEmails);
  /* One decoder for the whole file, in streaming mode, so a multi-byte
     character landing across a slice boundary is held over rather than
     turning into two replacement characters. */
  const dec = new TextDecoder('utf-8', {fatal:false});
  let tail = '', offset = 0;
  const total = file.size;

  while(offset < total){
    const buf = await file.slice(offset, Math.min(offset + MBOX_CHUNK, total)).arrayBuffer();
    offset += buf.byteLength;
    const text = tail + dec.decode(buf, {stream: offset < total});
    /* A message begins at a line reading "From <something> <weekday> ..." -
       the mbox postmark. Anything the same shape inside a body was escaped to
       ">From " by the exporter. Matching the weekday as well as the "From "
       is what keeps a line of prose beginning "From Sarah" from splitting a
       message in half. The final piece is held over because the slice
       boundary has almost certainly cut it. */
    const pieces = text.split(/\n(?=From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[ ,])/);
    tail = pieces.pop() || '';
    for(let i=0;i<pieces.length;i++){
      if(acc.count >= MBOX_MAX_MESSAGES){ acc.markTruncated(); tail = ''; offset = total; break; }
      acc.add(pieces[i]);
    }
    if(onProgress) onProgress(Math.round(offset/total*100), acc.count);
    /* Yield, or a multi-gigabyte file freezes the tab for its whole duration
       and the progress line never paints. */
    await new Promise(r=>setTimeout(r,0));
  }
  if(tail.trim() && acc.count < MBOX_MAX_MESSAGES) acc.add(tail);
  return acc.done();
}

/* Takeout hands over either a .zip or, once unzipped, the .mbox itself.
   Reading the mbox directly is the path that scales - JSZip has to hold the
   whole decompressed entry in memory, which is exactly the thing readMbox
   exists to avoid - so a large zip is refused with the one instruction that
   fixes it rather than crashing the tab trying. */
const MAIL_ZIP_LIMIT = 250 * 1024 * 1024;

async function readMailExport(file, myEmails, onProgress){
  const name = String(file.name||'').toLowerCase();
  if(/\.mbox$/.test(name) || !/\.zip$/.test(name)) return readMbox(file, myEmails, onProgress);

  if(file.size > MAIL_ZIP_LIMIT)
    throw new Error('That zip is ' + Math.round(file.size/1048576) + 'MB, too big to unpack in the browser. '
      + 'Unzip it and drop the .mbox file inside (Takeout/Mail/) instead - that one can be any size.');
  if(!window.JSZip) throw new Error('The archive reader did not load. Reload the page and try again.');

  if(onProgress) onProgress(0, 0);
  const zip = await window.JSZip.loadAsync(file);
  const hit = Object.keys(zip.files).find(k => /\.mbox$/i.test(k) && !k.includes('__MACOSX'));
  if(!hit) throw new Error('No .mbox file inside that zip. In Takeout, choose Mail, then export - '
    + 'the file lands at Takeout/Mail/All mail Including Spam and Trash.mbox.');
  const blob = await zip.files[hit].async('blob');
  return readMbox(blob, myEmails, onProgress);
}

/* Joins the mail correspondents onto the LinkedIn connections already on
   file, by name, because LinkedIn's export carries no email address anywhere.
   The point is not the count - it is that a connection who also turns up in
   mail with a real two-way exchange is a warm contact, and one who does not
   is a name in a list. Exact full-name match only: a first-name or fuzzy
   match here would attach one person's history to another, which is worse
   than no match. */
function mailConnectionOverlap(mail, connections){
  if(!mail || !(mail.correspondents||[]).length || !(connections||[]).length) return null;
  const byName = Object.create(null);
  (mail.correspondents||[]).forEach(c=>{
    const k = clean(c.name).toLowerCase();
    if(k && k.indexOf(' ') > 0 && !byName[k]) byName[k] = c;
  });
  let matched = 0, twoWay = 0;
  const examples = [];
  connections.forEach(c=>{
    const k = clean((c.first_name||'') + ' ' + (c.last_name||'')).toLowerCase();
    const hit = k ? byName[k] : null;
    if(!hit) return;
    matched++;
    if(hit.sent > 0 && hit.received > 0){
      twoWay++;
      if(examples.length < 12) examples.push({name:hit.name, email:hit.email,
        sent:hit.sent, received:hit.received, lastAt:hit.lastAt});
    }
  });
  return {matched, twoWay, examples};
}

module.exports={readMailExport,readMbox,parseAddresses,decodeMimeWords,parseMailHeaders,ownWords,mimePart,normEmail,mailConnectionOverlap,MBOX_MAX_MESSAGES};
