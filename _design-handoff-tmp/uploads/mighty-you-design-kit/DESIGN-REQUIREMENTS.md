# Mighty - design requirements: the You section

**Handoff document for a designer. 30 Jul 2026.**

You are designing one of the four surfaces of Mighty, a relationship OS that sits on top of a user's
LinkedIn history. This document is self-contained: everything you need is in here or in the `data/`
folder next to it. All people in the sample data are fictional; the column names and data shapes are
real, taken from actual LinkedIn exports and the live product schema.

---

## 1. What Mighty is, in five sentences

LinkedIn helps people connect; Mighty helps them stay connected. The user imports their LinkedIn
archive (a .zip LinkedIn emails them), states a goal, and Mighty tells them who is worth their time,
drafts outreach in their own writing voice, and remembers every conversation and promise. Nothing is
ever sent automatically; the user always clicks Send. The product's one-line soul: **relationships do
not fail loudly, they fade.** Capture is the product: everything intelligent depends on what the user
writes down after a conversation.

The app has four surfaces, listed in a permanent left sidebar tree:

```
Today                      what deserves my attention?
Relationships        9     where am I with everyone?
  List / Board / Timeline / Explore
You                        how does this work for me?      <- YOU ARE DESIGNING THIS
  Mirror
  Patterns
  Goal
  Account
  Extension
Ask Mighty                 anything, conversationally
```

The sidebar itself is fixed and out of scope. Everything to the right of it, when any You item is
active, is yours.

## 2. Hard rules - break none of these

1. **No scores, no health percentages, no progress bars, no streaks.** Mighty says things in words or
   not at all. A percentage is allowed only as a counted fact ("73% of the time, they wrote first"),
   never as a judgment ("network health: 73%").
2. **No invented data, ever.** Every number on screen must be traceable to the user's own files or
   actions. Empty states show nothing and say why - they never show fake sample content.
3. **Nothing implies Mighty acts on the user's behalf.** No send imagery, no automation metaphors,
   no robots.
4. **Light theme only.** Deliberate product decision, not an omission.
5. **Copy voice:** every sentence must explain why, build trust, direct the user, or show value.
   Sentence case. No em dashes anywhere - a spaced hyphen instead. "Consent" and "Knowledge Base"
   never appear on screen.
6. The words in this document's card mockups are approved copy shape. You may propose better words,
   but propose them explicitly - do not silently lorem-ipsum them.

## 3. The visual system you are extending

One CSS token set drives the app. Work in these; add tokens if you need them, never hard-code hex.

```
Background   --paper #FAF9F7      Rail --rail #F6F4F1     Card #FFFFFF, card2 #FCFBF9
Ink          --ink #1A1917        body #3B3833            sub #948E85    mute #A39C93
Brand        --brand #5B46E5      brand-ink #5540D8       brand-soft #F7F5FE   soft2 #EFEBFE
Greens       #14805A / #22916A    Amber #D9971C           Red #B5675A
Peach        #F2A78E  (logo + rare accent strokes only)
Radii        cards 16px, inputs 14px, pills 999px
Type         Plus Jakarta Sans 400-800, system fallback. Eyebrows: 11px/700/13% tracking/uppercase.
Gradient     linear-gradient(135deg, #EFEBFE 0%, #F7F1F4 55%, #FBEFE9 100%)
             (used on Today's hero and the landing finale - available to you for one moment, not many)
```

Existing components you should reuse rather than reinvent: `card` (white, 1px #EAE6E0 border, 16px
radius, soft shadow), `eyebrow` label, `pill` (stage badges), `chip` (selectable pills), `seg`
(segmented control), person rows with 34px avatars, and an avatar hover-preview card (photo, name,
headline, stage, location, brief summary, shared tags) that appears app-wide - assume it exists on
every avatar you draw.

Existing screens worth matching in spirit: Today opens with the gradient hero, a big greeting, an
"Ask Mighty anything" bar, and a card grid. Relationships is a stage-grouped list. Your work should
feel like the same product on its most reflective, personal surface.

## 4. What the You section is for

Today is *urgent*, Relationships is *operational*, Ask is *conversational*. You is **reflective**: it
answers "what does this product know about me, what has it noticed, and what am I steering toward."
A user comes here deliberately, maybe once a week. It should reward that visit with the feeling of
being *read* - accurately, respectfully, and with at least one thing they did not know about
themselves.

The five items and the single job of each:

| Item      | Job                                                              | Today's state |
|-----------|------------------------------------------------------------------|---------------|
| Mirror    | Show exactly what Mighty has read about me, and what it has not  | Functional, plain |
| Patterns  | Show what the data says about how I network - the wow surface    | Three small finding cards; being replaced by "Decoded" (section 6) |
| Goal      | State and edit what I am building toward                         | Functional, form-like |
| Account   | Mechanics: email, sign out, export everything, product principles| Functional, plain |
| Extension | Install and preview the Chrome extension                         | Functional, plain |

Patterns is where the ambition is - sections 6 and 7 are most of this document. But the brief is the
whole section: the five tabs should feel like one designed place, not five leftovers.

## 5. Per-tab requirements (Mirror, Goal, Account, Extension)

### 5.1 Mirror - "what Mighty holds about you"

Content, in priority order (all present in `data/you.sample.json`):

- A counts strip: 6 roles, 2 schools, 34 skills, 4 honours, 2 publications, 1,928 connections,
  40 writing samples, 3 answers given. Numbers are facts; display them with confidence but without
  celebration.
- The career as read: position list (title, company, dates), newest first, capped at 6 with the rest
  behind "show all".
- **The signature move - "what it still does not know":** an ordered list of gaps, each phrased as
  what the gap costs ("a sample of how you write, so drafts sound like you rather than like a
  product"). This honesty is the product's differentiator. Give it real visual dignity - it must not
  look like an error list.
- One correction path: "Correct this" leading to the Goal tab's edit form.
- Provenance line: "Built from your archive and resume, not assumptions. Anything wrong here is wrong
  everywhere after it."

States: rich (sample data), and empty (no archive: one card, why importing changes everything, one
button). Design both.

### 5.2 Goal - "what am I building toward"

- Goals are **multi-select** from five fixed types (find a new job / raise investment / find
  customers / find mentors and advisors / build my network) plus one free-text sentence that
  overrides everything in display.
- Read state shows: the sentence big, then the detail rows that exist (ideal relationships, target
  organizations, places, you are, schools, how you network, what success looks like) - rows with no
  content disappear entirely.
- An activity strip, deliberately labelled activity and not progress: Added 9, Reached out 1,
  In conversation 1, Met 0. Caption: "Activity, not progress. Only you can judge how close you are."
- Edit state: the five goal types as large selectable cards (multi-select), the sentence input, then
  chip-input rows for the details. Currently a long form; make it feel lighter without hiding the
  optional depth.

### 5.3 Account

Rows: account email + sign out; export everything (one JSON, one click, no confirmation theatre);
then a "How Mighty works" block of four principles (always click Send / capture is the product /
explanations not scores / your data is yours). Footer fact line: "9 relationships · 14 timeline
entries · 2 open commitments". Keep it quiet; this tab should feel like a well-organized drawer,
not a settings labyrinth.

### 5.4 Extension

A preview of the Chrome extension's panels (five preview tabs exist today: Discover, Profile, Popup,
After saving, Install) plus the install walkthrough. Your job is layout polish and making "what the
extension does on LinkedIn" legible at a glance - the panel mockups themselves are supplied
engineering-side and can be treated as embeddable rectangles of roughly phone-panel proportions.

## 6. Patterns - "Your Network, Decoded" (the centerpiece)

### 6.1 Concept

A one-time **reading** of the user's LinkedIn archive with the pacing of a story, then a living
compact reference on every later visit. Not a dashboard: a dashboard shows the same numbers forever
and dies of familiarity. The model is Spotify Wrapped with the theatrics swapped for honesty - every
number is verifiable in the user's own export.

Emotional arc, in order: **scale** (you built something big) → **recognition** (it has a shape you
never saw) → **discomfort** (most of it is asleep) → **warmth** (a few people kept showing up) →
**agency** (here is exactly where to start). It must end on action, never on trivia.

### 6.2 The eight chapters

Each chapter is one full-attention moment - one dominant fact, one supporting layer, generous air.
All numbers below come from `data/decoded.sample.json` and are internally consistent; design against
them exactly.

**Chapter 1 - The frame.**
"You started building this network in March 2014. Since then: **1,928 people**, across 640 companies,
in 212 different roles." Sets scale. The number 1,928 is the hero; everything else whispers.

**Chapter 2 - The eras.**
Your network's growth mapped onto your own career: Bain years 287, Novartis years 412, Stripe years
534, MIT Sloan 312 in a single year (the fastest), founder chapter 383 so far. Quietest year: 2019,
eleven people. A year-by-year strip may visualize counts (counts are facts; this is not a progress
bar). This is the "it read my resume through my relationships" moment.

**Chapter 3 - The sleep. The card the whole view exists for.**
"**1,406** of your 1,928 connections have never exchanged a single message with you. Another **344**
started a conversation that went quiet - the median silence is now four years. Relationships do not
fail loudly." 178 remain active. The three buckets must be felt, not just stated - but no donut
charts, no gauges. Consider weight, scale, and negative space doing the work. This chapter earns a
mood shift (the one place the palette may cool or dim).

**Chapter 4 - How you show up.**
Across 812 conversations: they wrote first **73%** of the time. When you wrote first, you got a reply
64% of the time. Your median reply: 6 hours. Theirs: 2 days. Two or three confident typographic
facts. This is data nobody has ever seen about themselves.

**Chapter 5 - The ones who kept showing up.**
The warm turn. "Your longest-running conversation is Sarah Chen: 214 messages across six years. Five
people account for a third of everything you have ever written here." Then the five, with avatars
(hover-preview applies), name, years-spanned, message count. Ordering is explained in words, never
scored.

**Chapter 6 - The shape of the room.**
Clusters read off titles: pharma and life sciences 31%, consulting 18%, early-stage tech 11%. One in
nine connections is director-or-above. 87 people at companies you once worked at. Labelled honestly:
"read from titles, not inferred." Deliberate omission: no geography (the export has none - do not
design a map).

**Chapter 7 - The doors you knocked on.**
420 invitations sent, 611 received. "At least 58% of the ones you sent became connections." Busiest
outreach year: 2023. The "at least" is contractual - name matching undercounts and the copy says so.

**Chapter 8 - The turn.**
Through the user's goal (sample persona: raising investment): "**41 people** in this network hold
investing titles. **29** of them have not heard from you in over two years. Mighty ranked the five
most worth waking up." Then five real person-rows with Add buttons - the same row component
Relationships uses. This chapter converts the reading into the product's loop; it must feel like a
beginning, not a summary.

### 6.3 Two renderings of the same content

**A. The reading (first visit after import, and replayable).** Full-height sequential chapters,
scroll-driven, desktop and mobile. Numbers settle in with a soft fade - no count-up animations, no
confetti; precision theatre is off-brand. Chapter transitions are yours to design. A quiet exit
affordance and a scroll-position sense ("chapter 3 of 8") without gamifying it.

**B. The compact stack (every later visit).** The same eight facts as calm cards above two existing
elements that must be incorporated: a "Since your last visit" delta card ("2 added, 1 reached out,
1 started talking") and the small standing findings (reply rate, message share, gone-quiet count).
Include a low-key "Read it again" affordance and a timestamp ("read from your archive of 12 Mar
2026") with a "Re-read archive" action.

### 6.4 States you must design

1. Full data (the sample JSON).
2. **No messages in export**: chapters 3, 4, 5 collapse into one honest card ("Your export did not
   include messages, so Mighty cannot see which connections became conversations") with the remaining
   chapters intact. Never silently skipped.
3. Small network (80 connections, 2 years): same structure, humbler numbers - make sure the layout
   does not mock small lives.
4. No archive at all: single invitation card pointing to Mirror's import.
5. Mobile (375) for everything; the sidebar collapses to chips at <900px and is not your problem.

### 6.5 Explicitly not in scope for the reading

Sharing/export images (other people's names are on these cards - it is a mirror, not a poster),
dark theme, sound, count-up animation, comparison to other users, any AI-generated prose.

## 7. Sample data - the `data/` folder

| File | What it is |
|---|---|
| `you.sample.json` | Everything the four non-Patterns tabs render: persona, counts, positions, gaps, goal, activity, account facts |
| `decoded.sample.json` | The exact design contract for the eight chapters - every number the reading shows |
| `Connections.sample.csv` | 15 rows shaped like the real LinkedIn export, including its notes preamble |
| `messages.sample.csv` | 12 rows with the real columns (CONVERSATION ID, FROM, SENDER PROFILE URL, DATE, ...) |
| `Invitations.sample.csv` | 10 rows, real columns (From, To, Sent At, Message, Direction) |
| `Positions.sample.csv` | The persona's own career, real columns |

The CSVs exist so you understand provenance - what the raw material looks like. The two JSON files
are what the UI actually receives; design against those. The persona throughout is **Jayati Mehra**
(fictional), founder, ex-Stripe, ex-Novartis, MIT Sloan, raising a seed round. All other names are
the product's standing demo cast (Sarah Chen, James Whitfield, Luiza Ferreira, Sukrit Bansal, Ashley
Chen) plus fictional filler.

## 8. Deliverables

1. Desktop (1280) and mobile (375) comps for: the reading (all eight chapters), the compact Patterns
   stack, Mirror (rich + empty), Goal (read + edit), Account, Extension.
2. A motion spec for the reading: what moves, what does not, durations and easings, in words or
   prototype.
3. Redlines in the token vocabulary of section 3 (name new tokens if you introduce any).
4. A short rationale note: where you deviated from this document and why.

**Fixed:** chapter order and content, the copy's factual claims, the hard rules, the token palette's
hue family, reuse of the existing person-row and hover-preview components.
**Yours:** layout, typographic scale and hierarchy, the visual metaphor of each chapter, motion,
how the two renderings relate, everything about the four quieter tabs within their stated content.

## 9. Questions worth asking us before you start

1. Should the reading also be the very first thing a new user sees after onboarding (before Today),
   or only live inside You? (Currently: inside You only.)
2. Chapter 5 puts real names front and center. We believe warmth beats squeamishness here, but push
   back if the design tells you otherwise.
3. If you find a ninth chapter hiding in the sample data, propose it - with its data lineage.
