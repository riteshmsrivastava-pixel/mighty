# Product Bible Addendum v1.3 - The Maturity Model

Merged 2026-07-25. These sections extend the Product Bible v1.2. Where they
conflict with v1.2, this addendum wins.

---

## 3.5 Product Maturity Model

### Philosophy

Mighty is designed like a relationship. It earns complexity over time.

The product should feel incredibly simple on Day 1 and incredibly powerful on
Day 100. Users should never see empty screens, unused features, or concepts
they don't yet understand. Every capability should unlock only when it becomes
valuable.

### Level 0 - Visitor
- Goal: understand the idea.
- Visible: landing page, demo search, product philosophy, extension demo.

### Level 1 - New User
- Requirements: sign up, import LinkedIn, upload resume (optional), define intent.
- Visible: Home, Discover, Search, Relationship Profile.
- Hidden: Intelligence, Pipeline, Relationship Health, Analytics, Warm Introductions.
- Goal: experience the first "wow" within 90 seconds.

### Level 2 - Explorer
- Requirements: save 5 people.
- Unlock: People, Timeline, Things You've Learned.
- Goal: relationships begin forming.

### Level 3 - Active Networker
- Requirements: first conversation, first meeting, first note.
- Unlock: Relationship Health, Voice Capture, Morning Digest, Meeting Preparation.
- Goal: capture becomes habit.

### Level 4 - Growing Network
- Requirements: multiple conversations, notes, follow-ups.
- Unlock: Recommendations, Warm Paths, Opportunity Detection, Relationship Intelligence.
- Goal: AI begins creating value.

### Level 5 - Power User
- Requirements: long-term usage.
- Unlock: Network Graph, Advanced Search, Advanced Intelligence, Relationship Analytics.
- Goal: relationships compound automatically.

---

## Progressive Disclosure Engine

Features never unlock based on time. They unlock based on meaningful user events.

```
Event -> Unlock Engine -> Evaluate milestones -> Enable feature
      -> Explain why it unlocked -> Guide user
```

| Event              | Unlock                |
| ------------------ | --------------------- |
| First saved person | Timeline              |
| First note         | Things You've Learned |
| First meeting      | Voice Capture         |
| Three messages     | Relationship Health   |
| Five relationships | People view           |
| First warm path    | Warm Introductions    |
| Twenty meetings    | Intelligence (full)   |

Implementation note (engineering): the unlock thresholds live in one config
(`UNLOCKS` in the app) so they can be tuned without hunting through the UI.
Intelligence has a two-step gate in practice - the screen itself appears at
3 sent messages (the statistical floor where the pattern engine has anything
honest to say), and the deeper analytics inside it keep their own data floors.
Twenty logged meetings as the sole gate would hide the screen for months for a
normal user; the Bible's intent (never show analytics without data) is served
by the data-floor approach.

---

## Updated Relationship Lifecycle

### Stage 0 - Define Intent (new)

Everything starts here. Before Mighty recommends anyone, it needs to
understand why the user is here.

Examples: find my next job, build an AI network, raise funding, find mentors,
build a sales pipeline, meet founders, build my executive network.

Intent powers: Search, Match Score, Recommendations, Notifications, Morning
Digest, Relationship Health, AI Briefs. The user can update intent at any time.

The lifecycle becomes:

```
Define Intent -> Discover -> Understand -> Engage -> Capture -> Remember -> Grow
```

---

## Updated Navigation

The application never exposes every capability immediately.

Default navigation: **Home, Discover, People, Settings.**

- Pipeline -> a view inside People
- Tasks -> a section inside Home
- Intelligence -> unlocks later
- Relationship Health -> inside the Relationship Profile
- Warm Paths -> inside the Relationship Profile and Intelligence

No dedicated navigation until earned.

---

## Updated Design Principles

- **Progressive disclosure.** Don't remove complexity. Reveal it only when it
  becomes valuable.
- **Data before UI.** Never show an empty dashboard. Never show analytics
  without data. Never show recommendations without confidence.
- **One win first.** Every new user should experience one meaningful success
  within the first 90 seconds - a great search result, a great brief, or a
  great draft. Nothing else matters until that happens.

---

## Updated Roadmap Priorities

1. **Day-1 value:** Intent engine, Search, Chrome extension, Relationship
   Brief, AI drafting.
2. **The foundation:** Capture engine - voice notes, meeting notes, calendar
   detection, memory extraction.
3. **Compounding value:** Timeline, Relationship Memory, Things You've
   Learned, Morning Digest, Relationship Health.
4. **Network effects:** Opportunity engine, Warm Introductions, Relationship
   Intelligence, Recommendations, Relationship Graph.
5. **Expansion:** Enterprise, recruiting, sales, fundraising, team
   collaboration.

---

## Capture Philosophy (updated)

Capture is the foundation of Mighty. Every intelligent feature depends on it.
If capture is difficult, the product fails.

The ideal capture experience:

```
Meeting ends -> phone vibrates -> "How did it go?" -> voice note
-> AI extracts promises, follow-ups, interests, introductions, reminders
-> timeline updated -> memory updated -> notifications scheduled
```

The user never fills out a CRM.

### Voice Capture (priority feature)

Voice Capture is no longer a future enhancement. It is a core workflow.
Supported inputs: voice, text, quick notes - all through the same extraction
pipeline. Future: calendar completion, mobile notification, WhatsApp voice notes.

---

## Updated Messaging Flow

Mighty always respects **"You Always Click Send."**

Preferred flow: Draft -> open LinkedIn message -> prefill message (where
technically possible) -> highlight Send -> user reviews -> user clicks Send.

Fallback: Copy -> open LinkedIn -> paste -> send.

The product never sends messages automatically.

---

## Language Update

Replace throughout the product:

- Old: "Mighty knows"
- New: **"Things you've learned"**

Reason: the knowledge belongs to the user. Mighty simply remembers it.

---

## UX Principles

Users should never feel like they are operating software. Every screen
answers exactly one question.

| Screen       | Question                                  |
| ------------ | ----------------------------------------- |
| Home         | What deserves my attention?               |
| Discover     | Who should I know?                        |
| Relationship | Should I invest in this relationship?     |
| Meeting      | What should I talk about?                 |
| Timeline     | What has happened?                        |
| Capture      | What happened today?                      |

---

## Product North Star

Mighty is an **Intent-Driven Relationship Operating System.**

Everything begins with user intent. Everything else exists to help users
build meaningful professional relationships that move them toward that intent.

---

## Founder Principle

Mighty is not trying to become another CRM. It is trying to become the
**memory layer for professional relationships.**

Users should never feel like they are maintaining data. They should feel like
they are simply meeting people, having conversations, and living their
professional lives. Everything else - memory, timelines, reminders,
relationship health, recommendations, opportunity detection, follow-ups - is
Mighty's responsibility.

---

## What We Will Not Build

Long-term guardrail. Mighty is not:

- A traditional CRM
- A LinkedIn automation bot
- An email marketing tool
- A task manager
- A note-taking app
- A social media scheduler

Every proposed feature must answer one question:

> Does this help someone build better professional relationships, or are we
> drifting into another product category?
