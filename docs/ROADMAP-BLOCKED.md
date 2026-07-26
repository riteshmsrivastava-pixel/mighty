# Mighty - the three things left, and what each actually takes

Everything in the prioritized roadmap (Tiers 1–5) is built and deployed **except** three
items that need infrastructure or credentials that don't exist yet. This is the honest
brief on each: what it needs, the realistic options, the effort, the risks, and a
recommendation. Written 2026-07-25.

None of these are "hard to code." They're gated on **data access, a second platform, or a
migration whose payoff we already captured a cheaper way.** That's why they weren't built.

---

## 1. Full warm-intro graph (your real LinkedIn network)

### What exists today
The **connector engine** (`connectorPaths` in `app/index.html`) already finds warm paths -
but only *among people you already track*. If a prospect shares a company or school with
one of your strong contacts, Mighty surfaces "X could introduce you to Y." That's real and
useful, but it's blind to your actual 1st-degree LinkedIn connections - the 500–2,000 people
who are your genuine intro capital.

### What "done" looks like
For any prospect, Mighty says: *"You're not connected, but **Dana Wu** (your former colleague)
is - ask her."* That requires knowing who you're actually connected to.

### Why it's blocked
LinkedIn does not expose a 1st-degree connection list through any permitted API. The old
partner API was shut to new apps years ago, and scraping the connections page violates
their terms and would get the extension flagged. We deliberately never scrape connections -
that boundary is a product principle, not an oversight.

### The realistic options
| Option | How | Effort | Verdict |
|---|---|---|---|
| **A. Manual CSV import** | LinkedIn lets *you* export your own connections (Settings → Data Privacy → Get a copy → Connections). User uploads `Connections.csv`; Mighty parses name/company/position into a `connections` table and matches against prospects. | ~1 day | **Recommended.** Permitted (it's the user's own data export), no scraping, no OAuth. Stale between exports, but that's acceptable. |
| **B. Extension-side, on-page only** | When the user *visits* a profile that shows "1st" degree, capture that single fact (already partly done via `networkOverlap`). Never enumerate the list. | ~0.5 day | Partial - only learns a connection when you happen to view them. Good complement to A, not a replacement. |
| **C. Official LinkedIn API** | Apply to LinkedIn's Marketing/Partner program. | Weeks-to-never | Not viable for an indie tool; connection data isn't offered even to approved partners. |

### Recommendation
Build **A + B**. New `connections` table (`user_id, name, company, title, linkedin_url,
source, imported_at`), an upload control in Settings, and extend `connectorPaths` to search
connections as well as tracked contacts. One day of work, fully within terms. Flag clearly
that the import is a point-in-time snapshot.

### Data/privacy note
The CSV holds names + employers of everyone you know. It must live under the same RLS scoping
as every other table (user-owned rows only) and be included in the existing `exportData()`
and any delete path. Never send it to the community-stats aggregation.

---

## 2. Live WhatsApp / mobile capture

### What exists today
Capture is desktop-web only: log a coffee chat, and the extraction engine turns your notes
into memories. Great at your laptop, useless the moment you walk out of the actual coffee.

### What "done" looks like
Right after a meeting, on your phone, you send a voice note or text - "just met Amit, he's
introing me to a GP at Lowercarbon, I owe him the Form Energy teardown" - and it lands in
Mighty as structured memories + promises, without opening a laptop.

### Why it's blocked
This is a **second platform**, not a feature. The single-file web app can't receive WhatsApp
messages or run as a mobile app. Two genuinely different builds:

### The realistic options
| Option | How | Effort | Verdict |
|---|---|---|---|
| **A. WhatsApp Business API inbound** | Provision a WhatsApp Business number (via Meta or a BSP like Twilio). A new edge function receives the webhook, identifies the sender by phone number → user, runs the *existing* extraction prompt, writes memories. | ~3–5 days + ongoing per-message cost + Meta business verification | Strong if you live in WhatsApp. The verification + number provisioning is the slow part, not the code. |
| **B. Mobile PWA** | The web app is already a single page - add a manifest + service worker so it "installs" to the home screen, plus a mobile-first capture screen with the device mic (Web Speech API → text → existing extraction). | ~2–3 days | **Recommended first step.** No new platform account, no per-message fees, works offline-ish, reuses 100% of the extraction pipeline. Gets you 80% of the value. |
| **C. Native iOS/Android app** | Full app-store build. | Weeks | Overkill until there's real usage. |

### Recommendation
Ship **B (PWA + voice capture)** first - it's mostly manifest + a mic button + a mobile
layout, and it needs zero new credentials. Revisit **A (WhatsApp)** only if you find yourself
wanting to capture without even opening the app. The extraction backend is identical for both,
so neither is wasted work.

### The one real dependency for A
A verified WhatsApp Business account + number. That's a Meta business-verification process
*you* have to complete (same shape as provisioning the Anthropic key or a search CSE) - I
can write the webhook and the routing, but I can't create the account.

---

## 3. Event-sourcing database rewrite

### Status: deliberately deferred, not blocked
This one is different - nothing external gates it. I chose not to do it, and I'd advise
against doing it now. Here's the honest reasoning so the decision is yours.

### What it means
The Bible imagined a fully event-sourced core: every fact (a memory, a stage change, a shared
asset) stored as an immutable event, with current state derived by replaying the log. Today,
memories live in `outreach_log.context.memories`, assets in `settings.assets`, etc. - mutable
JSON columns.

### Why it was meant to matter, and why it already doesn't
The payoff of event-sourcing is **history and analytics** - "how did this relationship evolve,
what's working across my whole pipeline." But `outreach_events` **is already an append-only
event log** for interactions, and the Tier 4 pattern engine reads exactly that. So the main
user-visible benefit is already delivered on the cheap tables.

### What a real migration would cost
| | |
|---|---|
| Effort | ~1–2 weeks |
| Risk | High - it touches every read and write in the app, plus a data migration of live user rows. Bugs here lose or corrupt real relationship data. |
| User-visible payoff **right now** | Near zero |
| When it becomes worth it | When you need full audit history of *every* field (not just interactions), multi-device conflict resolution, or "undo any change ever" - none of which are current asks. |

### Recommendation
**Don't.** Keep the JSON-column model until a concrete feature *requires* event-sourcing.
Re-architecting for architecture's sake trades weeks of risk for no user benefit. If/when the
need is real, the migration path is: add an `events` table, dual-write for a release, backfill
from existing JSON, then flip reads. Cheap to start when there's an actual reason.

---

## Summary

| Item | Blocked on | Cheapest real path | Effort | Do it? |
|---|---|---|---|---|
| Warm-intro graph | LinkedIn connection data | User's own `Connections.csv` export | ~1 day | **Yes, when you want it** |
| WhatsApp / mobile | A second platform | PWA + voice capture (no WhatsApp needed) | ~2–3 days | **Yes - PWA first** |
| Event-sourcing | Nothing (self-imposed) | - | ~1–2 wks | **No, until a feature needs it** |

The two worth doing (CSV import, PWA capture) are each a day or few and need no new
credentials except - for WhatsApp specifically - a Meta business account you'd set up
yourself. The third is a trap; skip it.
