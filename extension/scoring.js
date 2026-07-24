// MIghTy — LinkedIn Outreach · scoring
// Ports index.html's computeScore() verbatim. Keep these two in sync — this
// is the one piece of logic that intentionally lives in two places, since
// the extension has no bundler/shared-module story with the web app.
function mightyComputeScore(row, targetCompanies) {
  const reasons = []; let score = 0;
  const ctx = row.context || {};
  if (row.company && (targetCompanies || []).some(c => c.trim().toLowerCase() === row.company.trim().toLowerCase())) {
    score += 40; reasons.push(`Target company: ${row.company}`);
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

// What's next for an already-tracked contact — a small, extension-safe subset
// of index.html's suggestedNextAction (no coffee-chat next-touch lookups here,
// that needs the full events history; the docked sidebar keeps it simple).
function mightySuggestedNext(row) {
  switch (row.status) {
    case 'prospect': case 'ready_to_contact': return 'Message for the first time';
    case 'contacted': return 'Waiting for reply — follow up if it has been a while';
    case 'replied': return 'Propose a coffee chat';
    case 'coffee_chat': return 'Send a thank-you note';
    case 'referral': return 'Check in on referral status';
    case 'interview': return 'Prep for interview / check in';
    case 'offer': return 'Say thank you';
    default: return null;
  }
}

Object.assign(window, { mightyComputeScore, mightySuggestedNext });
