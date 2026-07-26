// MIghTy - LinkedIn Outreach · scoring
// Ports index.html's computeScore() verbatim. Keep these two in sync - this
// is the one piece of logic that intentionally lives in two places, since
// the extension has no bundler/shared-module story with the web app.
const MIGHTY_GOAL_STOPWORDS = new Set(['the','a','an','to','in','into','at','for','of','and','or','with','on','my','me','get','got','want','looking','look','find','people','person','someone','who','that','this','break','move','role','job','work','working','company','companies','around','near','new']);
function mightyGoalKeywords(goal) {
  return [...new Set((goal || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w && !MIGHTY_GOAL_STOPWORDS.has(w) && (w.length >= 3 || ['vc', 'ai', 'pm', 'ux', 'hr'].includes(w))))].slice(0, 8);
}
/* Company names never match on the nose. Someone types "Bain"; the profile says
   "Bain & Company". Exact string equality silently loses the single strongest
   signal we have, so compare on a normalised form: punctuation and legal
   suffixes stripped, then whole-word prefix containment. */
const MIGHTY_CO_NOISE = /\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|bv|nv|group|holding|holdings|llp|lp|the)\b/g;
function mightyNormCompany(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(MIGHTY_CO_NOISE, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function mightySameCompany(a, b) {
  const x = mightyNormCompany(a), y = mightyNormCompany(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = x.split(' '), ys = y.split(' ');
  const n = Math.min(xs.length, ys.length);
  return n > 0 && xs.slice(0, n).join(' ') === ys.slice(0, n).join(' ');
}
function mightyComputeScore(row, targetCompanies, goal) {
  const reasons = []; let score = 0;
  const ctx = row.context || {};
  if (row.company && (targetCompanies || []).some(c => mightySameCompany(c, row.company))) {
    score += 40; reasons.push(`Target company: ${row.company}`);
  }
  const kws = mightyGoalKeywords(goal);
  if (kws.length) {
    const hay = `${row.title || ''} ${row.company || ''} ${ctx.aboutText || ''} ${ctx.experienceText || ''} ${ctx.educationText || ''}`.toLowerCase();
    const hits = kws.filter(k => hay.includes(k));
    if (hits.length) { score += Math.min(30, 12 * hits.length); reasons.push(`Matches your goal: ${hits.slice(0, 3).join(', ')}`); }
  }
  const mutualMatch = (ctx.mutualConnectionsRaw || '').match(/(\d+)\s*mutual/i);
  if (mutualMatch) {
    const n = Math.min(parseInt(mutualMatch[1], 10) || 0, 3);
    if (n > 0) { score += 15 * (n / 3); reasons.push(`${mutualMatch[1]} mutual connection${mutualMatch[1] === '1' ? '' : 's'}`); }
  }
  if (/sloan|\bmit\b/i.test(`${ctx.educationText || ''} ${ctx.aboutText || ''}`)) { score += 15; reasons.push('MIT / Sloan connection'); }
  if (row.priority === 'high') { score += 10; reasons.push('High priority'); }
  const daysAgo = Math.max(0, (Date.now() - new Date(row.shortlisted_at).getTime()) / 864e5);
  score += 10 * Math.max(0, 1 - daysAgo / 30);
  if (ctx.aboutText || ctx.experienceText || ctx.educationText) { score += 10; reasons.push('Profile context captured'); }
  return { score: Math.round(score), reasons: reasons.slice(0, 3) };
}

// What's next for an already-tracked contact - a small, extension-safe subset
// of index.html's suggestedNextAction (no coffee-chat next-touch lookups here,
// that needs the full events history; the docked sidebar keeps it simple).
function mightySuggestedNext(row) {
  switch (row.status) {
    case 'prospect': case 'ready_to_contact': return 'Send the first message';
    case 'contacted': return 'Waiting for reply - follow up if it has been a while';
    case 'replied': return 'Propose a coffee chat';
    case 'coffee_chat': return 'Send a thank-you note';
    case 'referral': return 'Check in on referral status';
    case 'interview': return 'Prep for interview / check in';
    case 'offer': return 'Say thank you';
    default: return null;
  }
}

// One match ladder across the whole product. Keep in sync with VERDICT in
// app/index.html and the panel mockups on the app's Extension page.
// The bottom rung is separate on purpose: "Potential" means a loose fit, while
// nothing at all should say so rather than hint at promise that isn't there.
function mightyMatchLabel(score) {
  if (score >= 65) return 'Excellent match';
  if (score >= 35) return 'Strong match';
  if (score >= 10) return 'Potential match';
  return 'Low potential';
}

Object.assign(window, { mightyComputeScore, mightySuggestedNext, mightyMatchLabel,
  mightyNormCompany, mightySameCompany });
