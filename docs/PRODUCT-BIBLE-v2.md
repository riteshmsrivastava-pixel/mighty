# Mighty Product Bible

**Version 2.0**
Merged 2026-07-26. This is the single evolving Product Bible. It replaces the
structure of v1.2 and absorbs the v1.3 addendum
(`PRODUCT-BIBLE-v1.3-SUPERSEDED.md`, kept for history only). Where anything
conflicts, this document wins.

---

## Specification Precedence

Read this before resolving any ambiguity. The order is deterministic so no
decision depends on institutional memory.

1. **`PRODUCT-BIBLE-v2.md`** - product vision and behavior.
2. **The v1 Design Bundle** (`app-redesign-with-new-principles/`, exported
   from Claude Design) - visual design and interaction for v1.
3. **Engineering implementation.**

If two of them conflict:

- **Product behavior follows the Bible.**
- **v1 UI and interaction follow the design bundle** where the Bible
  explicitly allows design to win (see Part IV, which names the bundle the
  authoritative v1 spec).
- **Engineering never invents behavior** not described by either without
  updating the Bible first.

A corollary: the architecture below is frozen. Information architecture and
navigation are resolved (Appendix A is the decision log). The biggest risk to
Mighty now is not choosing wrong - it is reopening decisions that are already
closed. Build.

**What v2 changes:** v1.x was written from the perspective of the product
(engines, lifecycle, features). v2 is written from the perspective of the
user (what problem am I solving and how does Mighty help me?). The Bible is
now organized around the user journey, not around software modules.

**How to read this document:**

- **Part I - Foundations** is the direction. It is the long-term north star.
- **Part II - The Journey** describes the five stages of the user journey in
  full. This is where the product wants to go.
- **Part III - The Memory Engine** is the cross-cutting capability under
  every stage.
- **Part IV - Product Surfaces and the v1 Specification** describes what we
  build now. The design handoff bundle (`new mighty.zip`,
  `app-redesign-with-new-principles/`) is the authoritative v1 spec: fewer
  options, super simple usage. Where the vision and the design conflict for
  v1, the design wins.
- **Part V - The Unlock Engine** carries forward the v1.3 progressive
  disclosure machinery in its v2 form.
- **Appendix A** is the decision log.

---

# Part I - Foundations

## 1. Vision

**To become the operating system for professional relationships.**

We believe the next generation of career growth, entrepreneurship,
fundraising, hiring, sales, and leadership will not be driven by access to
information. Information is abundant. Artificial intelligence has made
knowledge almost free.

The scarce resource is meaningful relationships.

Every career-changing opportunity - a new job, an investment, a customer, a
mentor, a co-founder, a board seat, a partnership, or a recommendation -
begins with a relationship. Yet despite their importance, professional
relationships remain managed through disconnected tools that were never
designed for them.

Professionals search on LinkedIn, exchange emails, schedule meetings, save
notes in notebooks, store contacts in their phone, maintain spreadsheets,
and rely on memory to remember everything that happened.

Relationships deserve better infrastructure.

We envision a future where every professional has an intelligent
relationship operating system that helps them intentionally discover, build,
remember, and strengthen meaningful professional relationships throughout
their career.

That system is Mighty.

### The Future We Believe In

The future of networking is not about sending more connection requests.
It is about building fewer, better relationships.

The future is not about automating conversations.
It is about helping people have more thoughtful conversations.

The future is not about replacing human interaction with AI.
It is about giving humans perfect memory, better preparation, and better
judgment.

Artificial Intelligence should never replace relationships.
It should help people become better at them.

## 2. Mission

**To help every professional build stronger relationships with less
effort.**

Professional networking today requires enormous mental effort. People have
to remember names. Remember conversations. Remember follow-ups. Remember
birthdays. Remember introductions. Remember opportunities. Remember who
knows whom. Remember why someone mattered.

This cognitive burden prevents people from building the relationships they
actually want.

Mighty removes that burden. Instead of remembering everything, professionals
can focus on being present, curious, and authentic.

Mighty remembers. People build relationships.

### What Success Looks Like

When someone uses Mighty successfully, they should say:

- "I never forget important people anymore."
- "I always know who I should reach out to next."
- "I walk into every meeting prepared."
- "I spend my time talking to people instead of managing spreadsheets."
- "Networking no longer feels overwhelming."

If Mighty disappears for a week, users should immediately feel like they
lost part of their professional memory. That is the standard.

## 3. The Problem

Professional networking is fundamentally broken. Not because there aren't
enough people. Because relationships are incredibly difficult to maintain.

Today's workflow is fragmented:

You discover someone on LinkedIn. You read their profile. You send a
request. You exchange a few messages. You schedule a meeting. You forget to
write notes. Three months later you vaguely remember meeting them. Six
months later you cannot remember what you discussed. A year later they
change companies. You forget to congratulate them. The relationship slowly
disappears.

**The problem is not discovery. The problem is continuity.**

### Existing Tools Solve Individual Problems

- LinkedIn helps you discover people.
- Google helps you find information.
- Email helps you communicate.
- Calendars schedule meetings.
- Contacts store phone numbers.
- Notes store observations.
- CRMs track customers.

None of these tools manage professional relationships as a living, evolving
system. The user becomes the operating system. Memory becomes the database.
That does not scale.

### Why Networking Feels Difficult

Networking feels difficult because every relationship requires people to
manually manage:

- Who someone is.
- Why they matter.
- How they met.
- What they discussed.
- What they promised.
- When to follow up.
- Who introduced them.
- What they have in common.
- What happened since they last spoke.

Multiply that across hundreds of people. It becomes impossible.

## 4. Why Existing Tools Fail

Existing products optimize for activity. Mighty optimizes for relationships.

- LinkedIn optimizes for discovery.
- Email optimizes for communication.
- CRM systems optimize for sales.
- Task managers optimize for completion.
- Calendars optimize for scheduling.

None optimize for relationship quality. The consequence is predictable:
professionals spend more time managing tools than building relationships.

### The CRM Problem

Traditional CRM systems ask users to become data entry operators. Every
interaction requires manual updates: notes, stages, statuses, tasks, tags.
Relationships are reduced to database records. Professionals abandon CRMs
because maintaining them becomes more work than the value they provide.

Mighty takes the opposite approach. Users should never feel like they are
maintaining a database. The database should maintain itself.

### The LinkedIn Problem

LinkedIn is exceptional at helping users find people. It is poor at helping
them build relationships. Searches disappear. Profiles disappear. Messages
become buried. Follow-ups are forgotten. Important people become
indistinguishable from hundreds of other connections.

LinkedIn helps users find people. Mighty helps users remember them.

## 5. What is Mighty?

Mighty is an **Intent-Driven Relationship Operating System.**

Everything begins with one question:

> What are you trying to achieve?

The answer drives everything that follows. A founder raising capital should
discover different people than an MBA student looking for a product role. A
sales executive should prioritize different relationships than an academic
researcher. The product adapts to the user's intention.

From there, Mighty helps users move through a complete relationship
lifecycle:

1. Define your strategy.
2. Discover the right people.
3. Understand who they are.
4. Reach out thoughtfully.
5. Capture every interaction.
6. Remember everything.
7. Strengthen relationships over time.

Instead of isolated tools, Mighty creates one continuous system.

## 6. Product Philosophy

Everything we build should answer one question:

> Does this help people build better professional relationships?

If the answer is no, we should not build it.

### Relationships Over Transactions

Professional success comes from long-term trust, not one-time interactions.
Every feature should strengthen relationships, not simply increase activity.

### Strategy Before Action

Good networking begins with intention. Before Mighty recommends people,
drafts messages, or reminds users to reconnect, it must understand what
success looks like for that individual. The strategy drives the product.

### AI Assists. Humans Decide.

Artificial Intelligence should never replace judgment. It should enhance
it. AI can recommend, summarize, prepare, draft, and remind. The human
always makes the decision.

### You Always Click Send

No message should ever be sent automatically. Trust is built through
intentional communication. The final decision always belongs to the user.
This rule is permanent.

### Capture Is the Product

Everything that makes Mighty valuable depends on memory. Memory depends on
capture. The easier it is to capture interactions, conversations, meetings,
and observations, the smarter Mighty becomes. If capture feels like work,
users will stop doing it. Capture should be nearly effortless.

### Explain Before You Score

Recommendations should never be mysterious.

Instead of showing:

> Relationship Fit: 92

Mighty should explain:

> Strong match because this person is a Boston-based AI founder, graduated
> from MIT, recently raised a Seed round, and regularly mentors
> entrepreneurs.

Trust comes from transparency. If a score exists, it supports the
explanation - it never replaces it.

### Progressive Disclosure

Professional relationships are complex. The interface should not be. Users
should never be overwhelmed by features they do not yet need. Capabilities
should appear naturally as the user's network grows. Complexity belongs
behind the scenes. (Mechanics: Part V, The Unlock Engine.)

### Memory Over Management

People should not spend time maintaining relationships. They should spend
time building them. Mighty exists to remember what people cannot.

### Every Relationship Deserves Context

A name is not a relationship. Before someone reaches out, they should
understand:

- Who this person is.
- Why they matter.
- What they have in common.
- How they discovered them.
- Why they saved them.
- What has happened since they last interacted.

Context creates better conversations. Better conversations create stronger
relationships.

### Relationships Compound

Every interaction adds value. Every conversation creates context. Every
meeting creates memory. Every introduction expands the network. Mighty
should make every interaction increase the value of every future
interaction. The network should become more intelligent over time.

## 7. Core Principles

These principles guide every product decision.

1. **Relationship First.** Every screen should strengthen a relationship or
   help create one.
2. **Intent Drives Everything.** The user's goals determine
   recommendations, search results, prioritization, reminders, and AI
   behavior.
3. **Discover Before You Connect.** Users should first discover the right
   people. Connection comes later.
4. **Evaluate Before You Reach Out.** Not everyone should receive a
   connection request. Mighty helps users decide who deserves their
   relationship capital.
5. **Save Before You Engage.** Interesting people are saved first. Users
   decide later whether to invest in that relationship.
6. **Understand Before You Speak.** Before every outreach, Mighty prepares
   the user with shared context, recent activity, mutual connections,
   conversation ideas, and reasons for connecting. Preparation is part of
   networking.
7. **AI Works in the Background.** The best AI is almost invisible. Users
   should feel assisted, not automated.
8. **One Source of Truth.** Every relationship has one continuously
   evolving profile. Conversations, meetings, notes, introductions, emails,
   LinkedIn activity, reminders, and history all belong in one place.
9. **Never Lose a Person.** Every interesting person discovered through
   search, the browser extension, referrals, QR codes, conferences, or
   imports should be recoverable. Discovery should never disappear.
10. **Every Profile Answers One Question.** "Is this relationship worth
    investing in?" Everything else is secondary.
11. **Every Recommendation Must Be Explainable.** Recommendations should
    never feel like black boxes. Users should always understand why someone
    or something is being recommended.
12. **Humans Build Relationships.** Mighty provides intelligence. People
    provide trust. No AI can replace authenticity.
13. **A Person Is a Face, Not Just a Name.** Wherever someone appears -
    saved or not, in a list, a board, a search result, an AI answer -
    Mighty tries for their real photo automatically, the moment enough is
    known to look them up. Nobody should have to click "add photo" for
    someone who already has one on LinkedIn. Initials are the honest
    fallback for a photo LinkedIn itself did not have to give, never a
    corner Mighty cut.

## 8. What Mighty Will Never Become

Defining what we will not build is as important as defining what we will.

- **Mighty is not a CRM.** Users should never feel like they are updating
  records.
- **Mighty is not a LinkedIn automation tool.** It will never automatically
  send connection requests, messages, or engagement.
- **Mighty is not a mass outreach platform.** Relationships are built one
  person at a time.
- **Mighty is not another social network.** It works with existing networks
  rather than competing with them.
- **Mighty is not a generic AI assistant.** It is purpose-built for
  professional relationships.
- **Mighty is not a note-taking application.** Notes only exist to
  strengthen future conversations.
- **Mighty is not a task manager.** Tasks exist only in the context of
  relationships.
- **Mighty is not an address book.** Contacts are static. Relationships are
  dynamic.
- **Mighty is not about growing the biggest network.** It is about building
  the right network. Quality always wins over quantity.

### The North Star

Every product decision should be tested against a single question:

> Will this help someone build stronger professional relationships with
> greater intention and less cognitive effort?

If the answer is yes, it belongs in Mighty. If the answer is no, it does
not.

### The Defining Sentence

> **Mighty doesn't help you know more people. It helps more people know,
> remember, and trust you.**

That shifts the narrative from contact management to relationship building,
which is the category Mighty is creating.

---

# Part II - The Journey

The user journey has five stages. Underneath all five sits a persistent
Memory Engine (Part III) that continuously captures context, learns from
interactions, and powers the intelligence of the entire platform. Memory is
not a stage; it is infrastructure.

```
Stage 1 - Relationship Strategy
Output: a clear networking strategy.
        |
Stage 2 - Discover People
Output: a curated set of saved people.
        |
Stage 3 - Relationship Evaluation & Outreach
Output: meaningful first conversations.
        |
Stage 4 - Relationship Pipeline
Output: a structured view of every active relationship.
        |
Stage 5 - Network Intelligence
Output: a continuously improving network aligned with the user's goals.

============= The Memory Engine runs under all five =============
```

Each stage builds on the data created by the previous one. Stage 5 is where
the accumulated context starts delivering compounding value. No stage
introduces insights that require data Mighty does not already own.

---

## Stage 1 - Relationship Strategy

> "Before Mighty can help you build relationships, it needs to understand
> what you're trying to build."

### Overview

Relationship Strategy is the foundation of Mighty. It is the very first
experience every user has with the product - the first thing in the product
is not "create an account," it is **"Let's build your relationship
strategy"** - and the single most important step in the entire journey.

Unlike traditional onboarding, Relationship Strategy is not designed to
teach users how to use Mighty. It teaches Mighty how to help the user.

By the end of this stage, Mighty should understand:

- Who the user is.
- What they are trying to achieve.
- Who they want to build relationships with.
- How they naturally network.
- What success looks like.
- What data and platforms are available to support them.

Every recommendation, search result, reminder, relationship score, meeting
brief, AI draft, and notification generated by Mighty is influenced by this
strategy. Relationship Strategy is not completed once and forgotten. It
evolves alongside the user's career.

### Design Principles

Relationship Strategy should feel like a conversation, not a configuration
wizard. The user should never feel like they are filling out forms.

Whenever possible:

- Import instead of asking.
- Infer instead of requesting.
- Recommend instead of forcing.
- Confirm instead of typing.

Every question should have a clear purpose. If an answer is not used later
in the product, it should not be asked.

### Objective

By the end of this stage, Mighty should confidently answer six questions:

1. **Who is this person?** Identity, experience, background, professional
   credibility.
2. **Why are they using Mighty?** Career goals, business goals, networking
   goals, relationship goals.
3. **Who do they want to know?** Companies, industries, roles, communities,
   geographies.
4. **How do they naturally build relationships?** Communication style,
   preferred platforms, networking habits, time commitment.
5. **What does success look like?** Specific measurable outcomes, not vague
   aspirations.
6. **What information can Mighty access?** Connected accounts, imported
   profiles, communication history, calendar, contacts. This determines how
   intelligent Mighty can become.

### Step 1 - Build Your Professional Identity

Everything starts with understanding who the user is. The goal is not
simply to create a profile. The goal is to build a rich professional
identity that Mighty can use to personalize every future recommendation.

**Identity**

- Full name
- Preferred name
- Profile photograph
- Professional headline
- Short biography

**Professional Experience**

- Current company
- Current title
- Previous companies
- Years of experience
- Functional expertise
- Industry experience
- Leadership experience

**Education**

- Schools
- Degrees
- Certifications
- Alumni communities

**Skills & Interests**

- Technical skills
- Business expertise
- Industries of interest
- Research interests
- Personal interests relevant to networking

**Geography**

- Current location
- Preferred work locations
- Countries of interest
- Cities frequently visited

**Digital Presence** - rather than asking users to repeatedly upload
information, Mighty imports wherever possible:

- LinkedIn
- Resume
- Personal website
- Portfolio
- GitHub
- Google Scholar
- Calendly
- Personal QR Code / Digital Business Card

**Connected Accounts** - the more context Mighty has, the more useful it
becomes:

- Communication: Gmail, Outlook, LinkedIn, WhatsApp (optional)
- Scheduling: Google Calendar, Outlook Calendar
- Contacts: Phone Contacts, Google Contacts
- Professional platforms: LinkedIn

Future integrations may include Slack, X, Teams, Notion, and others, but
only when they contribute to relationship context.

**Why this matters.** This information is not collected for profile
completeness. It enables better search ranking, better relationship
matching, better AI recommendations, better introductions, better meeting
preparation, and better conversation starters.

### Step 2 - Define Your Intent

This is the most important question in the product:

> Why are you here?

Everything Mighty recommends depends on this answer. Different goals
require different networks. Someone raising a startup round should not
receive the same recommendations as someone looking for a Chief AI Officer
role. The strategy begins with intention.

**Primary Goal** - each user chooses one primary objective. Examples:

- Find a new job
- Change industries
- Become a founder
- Raise investment
- Find co-founders
- Find customers
- Recruit talent
- Build an executive network
- Meet mentors
- Meet advisors
- Build partnerships
- Expand an alumni network
- Become a better networker
- Build a community
- Explore a new industry

**Secondary Goals** - users may have additional objectives. Example:

- Primary goal: Land a Product Management role.
- Secondary goals: build relationships with founders, find AI mentors, meet
  venture capital investors.

Recommendations should balance both.

### Step 3 - Define Your Target Network

Networking becomes dramatically easier once the destination is clear.
Instead of configuring dozens of filters, users simply describe the people
they hope to know.

- **Organizations:** OpenAI, Microsoft, MIT, YC, Sequoia, BCG
- **Roles:** Product Managers, Founders, Investors, Recruiters, Professors,
  CTOs, Chief AI Officers, Designers
- **Industries:** Artificial Intelligence, Healthcare, Climate,
  Manufacturing, Consumer Tech, FinTech
- **Communities:** MIT Alumni, Women in AI, Deep Tech Founders, Fortune 500
  Executives
- **Geography:** Boston, London, Bengaluru, San Francisco, Singapore
- **Experience:** First-time founders, Ex-McKinsey consultants, Series A
  CEOs, AI researchers, Manufacturing executives

This becomes the foundation for discovery.

### Step 4 - Relationship Preferences

Not everyone networks the same way. Some people love coffee chats. Others
prefer thoughtful emails. Others build relationships almost entirely
through conferences. Mighty should adapt to the user's style rather than
forcing one.

- **Preferred communication channels:** LinkedIn, Email, WhatsApp, coffee
  meetings, virtual meetings, conferences, alumni events, warm
  introductions.
- **Networking frequency:** 15 minutes/day, 30 minutes/day, 1 hour/day,
  weekly only.
- **Relationship style:** Structured, opportunistic, long-term, deep
  relationships, broad network building.

### Step 5 - Define Success

Most networking fails because there is no destination. Success must be
measurable.

**MBA Student**

- 40 coffee chats.
- 10 referrals.
- 15 interviews.
- One Product Management offer.

**Founder**

- 30 investor meetings.
- Raise ₹8 crore.
- Hire a CTO.

**Sales Executive**

- 100 target accounts.
- 20 executive introductions.
- 10 enterprise customers.

**Academic**

- 15 collaborators.
- 5 keynote invitations.
- 3 funded research partnerships.

These outcomes become Mighty's long-term objective for that user.

### Step 6 - Generate the Relationship Strategy

Instead of dropping users onto a dashboard, Mighty presents a strategy:

> **Your Relationship Strategy**
>
> **You are** - Product Manager with five years of FinTech experience and
> an MBA candidate at MIT Sloan.
>
> **Primary Goal** - Land a Product role in AI.
>
> **Target Network** - OpenAI. Anthropic. Figma. Stripe. Senior Product
> Leaders. Hiring Managers. MIT Alumni.
>
> **Preferred Networking Style** - Coffee chats. Warm introductions.
> LinkedIn.
>
> **Weekly Commitment** - 30 minutes.
>
> **Definition of Success** - 40 conversations. 10 referrals. One offer.

The user confirms or edits the strategy.

### Living Strategy

Relationship Strategy is never complete. People change jobs. Goals evolve.
Industries change. Interests shift. Mighty should continuously detect
changes and recommend updates. Examples:

- "You've changed your primary goal from fundraising to hiring."
- "You've recently started networking with healthcare executives. Would you
  like to update your target network?"
- "You've moved from Boston to London. Should discovery prioritize Europe?"

The strategy is a living document, not a static settings page. In the
product it lives on the **Strategy** screen (see Part IV) - permanent
navigation, because everything references it.

### AI Responsibilities During This Stage

By the time onboarding is complete, the AI should be capable of:

- Explaining the user's professional profile.
- Understanding their goals.
- Identifying ideal relationships.
- Prioritizing future discoveries.
- Personalizing search rankings.
- Recommending networking opportunities.
- Tailoring meeting preparation.
- Drafting outreach that aligns with the user's objectives.

This is where Mighty stops being a profile manager and becomes a
relationship strategist.

### Success Criteria

Relationship Strategy is complete when Mighty can answer, without
ambiguity: Who is this user? What are they trying to accomplish? Who should
they meet? Why should they meet them? How do they prefer to build
relationships? What defines success? Which connected accounts can enrich
their network?

Only then does the user move to Stage 2.

---

## Stage 2 - Discover People

> "The hardest part of networking isn't talking to people. It's knowing who
> is worth talking to in the first place."

### Overview

Every meaningful professional relationship begins with discovery. Whether
someone is looking for a new job, raising investment, hiring executives,
finding customers, building partnerships, or expanding their network, the
first challenge is always the same:

> Who should I meet?

Today's tools solve this poorly. LinkedIn can search people. Google can
search the web. Conference websites list speakers. Alumni directories list
graduates. Every source is isolated. Every search is temporary. Every
discovery disappears.

Mighty transforms discovery from a one-time search into a permanent part of
the user's relationship strategy. Every interesting person becomes part of
a deliberate pipeline for future relationships.

### Philosophy

Discovery is not about finding the most people. It is about finding the
right people. Every recommendation should answer one simple question:

> "Is this someone worth investing a relationship in?"

The purpose of discovery is not outreach. The purpose of discovery is
better decision making. Messaging comes later.

The job the user is hiring Mighty for:

> "Help me identify the right people before I spend my relationship
> capital."

### Objectives

By the end of this stage, Mighty should help users:

- Discover people aligned with their goals.
- Understand why those people matter.
- Prioritize who deserves attention.
- Save interesting people without immediately contacting them.
- Build a curated set of saved people that becomes the starting point for
  future engagement.

### Discovery Is Driven by Strategy

Everything begins with the Relationship Strategy created in Stage 1. The
user's objectives determine who is recommended, which searches are
prioritized, which industries matter, which companies appear first, which
people receive higher relevance, and which opportunities are surfaced.
Discovery is never generic. It is personalized from the very first search.

### Two Modes of Discovery

People naturally discover relationships in two very different ways. Mighty
supports both.

#### Mode 1 - Intent Discovery

Intent Discovery begins with a goal. The user knows what they are looking
for but not necessarily who. Examples:

- Find AI founders in Boston.
- Find MIT alumni working at OpenAI.
- Find executive recruiters hiring Chief AI Officers.
- Find investors interested in manufacturing AI.
- Find professors researching autonomous systems.

Users describe people naturally. Mighty translates that intent into
structured searches across multiple sources.

**Natural Language Search.** Users should never have to construct
complicated Boolean searches or configure dozens of filters. Instead they
simply describe who they want:

- Deep-tech founders from MIT.
- Product leaders who moved from Google to OpenAI.
- Healthcare executives interested in AI.
- Manufacturing CEOs in Germany.
- Investors funding robotics startups.

The AI understands intent rather than keywords.

#### Mode 2 - Organic Discovery

This is how most networking actually happens. Users are already browsing:
reading LinkedIn posts, following comments, watching conference talks,
reading newsletters, exploring company websites. Someone interesting
appears. Instead of losing that discovery forever, Mighty captures it.
Organic Discovery transforms spontaneous browsing into intentional
networking.

Organic discovery also yields richer data: when the user is on a live
profile, the extension can capture far more context about that person than
a search result carries, which produces a better evaluation.

### The Mighty Browser Extension

The browser extension is not a messaging tool. It is a relationship
evaluation tool.

Whenever a user opens a LinkedIn profile, the extension quietly answers one
question:

> Should this person become part of your network?

Without leaving LinkedIn, Mighty provides: relationship relevance, shared
background, common interests, shared schools, shared companies, mutual
connections, why this person matches your goals, and a recommended next
action.

The user makes one decision. **Save. Or skip.** Nothing else. The extension
never clicks Connect, never clicks Message, never sends anything.

### The Relationship Filter

Every profile viewed through Mighty should feel like a recommendation, not
a CRM. Instead of showing dozens of fields, Mighty presents a concise
summary:

> **Strong Match**
>
> Why this person matters:
> - MIT alumnus.
> - Product Leader at OpenAI.
> - Based in Boston.
> - Frequently mentors founders.
> - Matches your goal of transitioning into AI Product Management.
>
> Common Ground:
> - Both worked in FinTech.
> - Shared alumni community.
> - Mutual interest in Generative AI.
>
> Action: [ Save ]  [ Skip ]

No notes. No stages. No CRM. One decision.

### Discovery Sources

Discovery should not depend on a single platform. Over time, Mighty should
discover people from multiple sources while presenting a consistent
experience:

- LinkedIn
- Google
- Company websites
- Conference speaker lists
- Event attendee lists
- Research papers
- Podcasts
- News articles
- Alumni directories
- Existing network
- Email introductions
- QR code exchanges
- Business cards
- Internal imports

The source changes. The experience does not.

### Discovery Sessions

Searching should never be disposable. Every search becomes a **Discovery
Session.** Each session remembers:

- Original search query.
- Date.
- Relationship objective.
- Search filters.
- Results.
- Saved people.
- AI recommendations.
- Notes.

Users should be able to revisit previous searches at any time. Discovery
becomes cumulative rather than repetitive.

### Relationship Evaluation

Finding someone is only the first step. Before investing time in a
relationship, users should understand why that person matters. Every
discovered profile includes an AI-generated evaluation. Not a popularity
score. A relevance explanation.

Each profile includes:

- Professional summary.
- Why this person matches your goals.
- Shared companies, schools, interests, connections.
- Recent activity.
- Suggested conversation starters.
- Potential relationship path.

**Explain Before You Score** applies everywhere here. Instead of
"Relationship Fit: 91," Mighty explains: "Strong match because this person
is a manufacturing executive in Boston, graduated from MIT, recently
started leading AI transformation, and regularly mentors startup founders."

### Save Before You Connect

One of Mighty's core principles is intentional networking. Users should
never feel pressured to send a connection request immediately. The workflow
is:

```
Discover -> Evaluate -> Save -> Continue Exploring
```

Notice what doesn't happen: no drafting, no messaging, no follow-up. The
user stays in flow. Networking decisions happen later. Discovery remains
lightweight and uncluttered.

**Where saved people go.** Every saved person enters **Relationships** at
the **Saved** stage of the pipeline (Stage 4). There is no separate inbox
surface and no second status system - one person, one stage field, one
list. Saving is zero-commitment, like bookmarking an article; "Saved" simply
means "I decided this person might matter. I'll decide the rest later."

Regardless of source - search, LinkedIn browsing, conference lists, QR
scans, referrals, email introductions, business cards, manual entry -
everyone enters the same place. This creates a single mental model:

> Every relationship starts with a Save.

Each saved person carries: professional profile, discovery source, why they
were saved, AI summary, relationship relevance, and their pipeline stage.

**How this solves clutter.** A search for "AI founders Boston" might
return 300 results. Nobody works through 300 people. Search results are raw
material; only deliberate Saves enter the product. Discovery becomes
iterative - save 3 on Monday, 2 on Tuesday - and after two weeks the user
has 25 carefully selected people. That is valuable.

### AI Responsibilities

During discovery, Mighty should:

- Understand the user's goals.
- Search across available sources.
- Recommend people aligned with those goals.
- Explain every recommendation.
- Detect duplicate discoveries.
- Suggest additional searches.
- Identify hidden opportunities.
- Continuously improve recommendations based on user behavior.

The AI never contacts anyone automatically. Its role is to improve
judgment, not replace it.

### Design Principles for This Stage

- **Discovery over Search.** Users are not looking for search results.
  They are looking for future relationships.
- **Quality over Quantity.** Twenty highly relevant people are more
  valuable than two thousand irrelevant profiles.
- **Explain over Score.** Always justify recommendations. Never rely
  solely on numerical rankings.
- **Save over Connect.** Discovery should reduce pressure. Saving someone
  should feel as effortless as bookmarking an article.
- **Extension over Automation.** The browser extension exists to help
  users evaluate people while they naturally browse. It is not designed to
  automate networking.
- **Never Lose a Person.** If someone was interesting enough to notice
  once, they should never disappear simply because the browser tab was
  closed.

### Success Criteria

Discovery is successful when users:

- Find people they would not have discovered easily elsewhere.
- Understand why each person is relevant.
- Build a high-quality saved list rather than a large one.
- Return to previous Discovery Sessions instead of repeating searches.
- Feel more confident about who deserves their time and attention.

### Stage Outcome

By the end of Stage 2, the user has a curated set of saved people who align
with their goals - not because an algorithm maximized search results, but
because Mighty helped them make thoughtful decisions about where to invest
their limited relationship capital. This sets up Stage 3, where the focus
shifts from "Who should I meet?" to "How should I build a relationship with
this person?"

---

## Stage 3 - Relationship Evaluation & Outreach

> "You found someone worth knowing. Now let Mighty help you turn that
> opportunity into a meaningful first conversation."

### Overview

Every saved person enters Relationships at the Saved stage. The purpose of
this stage is to help users decide whether, when, and how to start a
relationship.

Unlike traditional CRMs that immediately encourage outreach, Mighty helps
users understand the person, evaluate the opportunity, and prepare a
thoughtful first interaction. By the time a user clicks Send, they should
feel confident - not because AI wrote a message, but because AI helped them
understand the relationship.

**Outreach is an action, not a destination.** There is no global Outreach
screen. You never think "I'm going to Outreach" - you think "I'm going to
message Sarah." The draft belongs to the relationship, not to some global
queue. A global outreach surface would encourage batch messaging, generic
templates, and detached drafting - exactly what Mighty must never become.
All drafting lives inside the individual Relationship Profile.

### Philosophy

The best outreach starts long before the first message. It starts with
understanding.

- Who is this person?
- Why do they matter?
- Why do they matter to me?
- What should we talk about?
- Why would they respond?

The objective is not to maximize connection requests. The objective is to
maximize meaningful conversations.

### Every Saved Person Is a Relationship Card

The saved list is not a list of contacts. It is a queue of opportunities.
Each card immediately answers the questions users naturally have:

**Who is this person?** Current company, current role, location, industry,
professional summary.

**Why did I save them?** The reason never disappears. Examples: "Strong
match for AI Product role," "Potential investor," "Manufacturing leader,"
"MIT alumnus," "Future hiring manager." The original reason for saving
someone remains attached to the relationship forever.

**When did I discover them?** "Saved 2 days ago." "Saved at MIT AI
Conference." "Imported from LinkedIn." "Referred by Sarah." Discovery
context matters.

**Relationship match.** The evaluation from discovery remains visible, but
the explanation leads and any score is secondary - hovering explains
"Strong match because..." rather than showing a bare number.

### Relationship Intelligence - The AI Brief

Once a profile is opened, Mighty expands into an AI Brief. Instead of
making users search LinkedIn, Google, ChatGPT, company websites, and news
articles separately, everything is assembled in one place. The AI prepares
the user before they ever write a message.

**Professional Overview** - a concise summary of career journey, current
responsibilities, previous companies, education, areas of expertise, public
achievements.

**Shared Context** - networking works best with common ground. Mighty
identifies shared schools, shared employers, shared communities, shared
interests, mutual connections, similar career paths, common industries,
geographic overlap. These become natural conversation starters.

**Recent Activity** - what is happening in this person's professional
world: new job, promotion, company funding, recent LinkedIn posts,
podcasts, articles, speaking engagements, awards, product launches. Good
outreach is timely.

### Intent, Not Personas

The user's objective shapes every recommendation - but the user should
never have to pick "Founder mode" or "MBA mode" or "Sales mode." The
Relationship Strategy already captures intent (looking for a job, raising
funding, hiring, customers, advisors), and it quietly influences AI
behavior. Goal-based persona pickers are an implementation detail Mighty
does not surface. **Less UI. More intelligence.**

(Goal-Based Personas as a visible feature are explicitly cut from v1; if
multiple simultaneous objectives ever need distinct voices, that
intelligence derives from the primary and secondary goals in the Strategy.)

### AI Drafting

Once the user understands the relationship, Mighty helps craft the first
interaction - inside the profile's Draft Message tab. Unlike generic AI
tools, users never need to copy profiles into another application or write
long prompts. Mighty already knows:

- Who the user is.
- Who the recipient is.
- Why they are relevant.
- What they have in common.
- Why they were saved.
- The user's networking objective.

Everything needed to generate a thoughtful message already exists inside
the platform.

**Message approaches.** Instead of generating a single response, Mighty
presents several approaches:

- **Warm Introduction** - built around shared connections.
- **Curiosity** - asking about something specific in their work.
- **Shared Experience** - built around common background or interests.
- **Value First** - offering something useful before asking for anything.
- **Coffee Chat** - a concise request for a short conversation.

Users choose the style that feels most authentic.

**Icebreakers.** Rather than writing an entire message immediately, Mighty
first suggests ways to begin the conversation: a recent article they
published, a conference talk, a shared industry trend, a mutual connection,
a career transition, a company announcement, an interesting project, a
shared alma mater. Strong openings create stronger conversations.

**Subject lines and hooks** (email outreach): "Shared Interest," "Mutual
Connection," "Loved Your Talk at...," "Quick Question About...," "Fellow
MIT Sloan Student," "Curious About Your Work at...". The goal is to
increase relevance, not cleverness.

**Personalization.** Every draft includes dynamic elements pulled
automatically from the relationship context: their company, their recent
achievement, their published work, shared background, mutual connections,
shared interests, the user's current networking goal. Users never manually
research and paste this information.

### Human Review

AI prepares. Humans decide. Every message remains fully editable. Nothing
is sent automatically. The user reviews every recommendation before
sending.

**Sending flow:** Draft -> Copy & open LinkedIn (or prefill where
technically possible) -> highlight Send -> user reviews -> user clicks
Send. The product never sends messages automatically.

### Success Criteria

Stage 3 is successful when the user can answer three questions confidently:

- Why am I contacting this person?
- Why are they likely to respond?
- What is the best way to start this relationship?

When those questions are clear, sending the message becomes the easiest
part.

---

## Stage 4 - Relationship Pipeline

> "Building relationships is a process, not a single message."

### Overview

The first message is not the finish line. It is the beginning. Once
outreach has started, Mighty helps users track every relationship through
its lifecycle - from the first interaction to a long-term professional
connection.

Unlike traditional CRMs, the Relationship Pipeline is not designed to
manage sales opportunities. It is designed to manage human relationships.
Every person progresses at a different pace. Some respond immediately. Some
take months. Some become mentors. Some become customers. Some never reply.
Mighty helps users stay organized without making relationships feel
transactional.

### Philosophy

Relationships evolve through conversations. Not through contacts. Not
through spreadsheets. Not through reminders. Every interaction adds
context. Every conversation creates momentum. The Relationship Pipeline
visualizes that momentum.

### One Stage Field, Three Views

Every person in Mighty has exactly one pipeline stage. The Relationships
screen shows the same people three ways - List, Board, Timeline - and all
three views read and write the same stage field. There is no separate
inbox, no parallel status system, no second list to maintain.

The board answers one simple question:

> "Where am I with each person?"

### Default Pipeline

```
Saved
  |
Ready to Reach Out
  |
First Message Sent
  |
Conversation Started
  |
Meeting Scheduled
  |
Relationship Growing
  |
Long-Term Relationship
```

Users are free to rename, reorder, add, or remove stages to match their own
networking style. A founder raising capital may want stages like "Intro
Call" and "Partner Meeting," while a job seeker may prefer "Coffee Chat,"
"Referral," and "Interview." The pipeline adapts to the user's goals, not
the other way around. (v1 ships the default stages; customization unlocks
later.)

### Automatic Progress Tracking

Wherever possible, Mighty reduces manual updates. For example:

- A message is drafted in the profile.
- The user clicks Copy & Open LinkedIn.
- Mighty opens the recipient's profile with the message on the clipboard.

At that point, Mighty can reasonably assume the user is sending the message
and automatically move the relationship to First Message Sent. If the user
decides not to send it, they can easily move the card back. The system
optimizes for convenience while always allowing manual correction.
Relationships move automatically only when Mighty has high confidence;
otherwise the user drags cards between columns. Automation with
transparency.

### Relationship Timeline

Every relationship has a complete timeline:

- 12 July - Saved from LinkedIn Search.
- 13 July - Generated outreach message.
- 13 July - First message sent.
- 16 July - Recipient replied.
- 18 July - Coffee chat completed.
- 20 July - Meeting notes added.
- 1 August - Follow-up sent.
- 10 September - Congratulated on promotion.

The timeline is the living history of the relationship.

### Conversation History

Every interaction is stored in one place: drafted messages, sent messages
(where available or confirmed), replies, meeting notes, voice memos,
follow-up reminders, documents shared, links exchanged, personal
observations. Nothing is lost.

### Smart Suggestions

The pipeline actively helps users move relationships forward:

- "It's been two weeks since your first message. Consider following up."
- "They viewed your LinkedIn profile after you reached out."
- "You met them three months ago and haven't reconnected."
- "They've recently changed companies - this is a natural opportunity to
  reach out."

Suggestions should feel like coaching, not nagging.

### Relationship Health

Rather than measuring activity alone, Mighty surfaces indicators of
relationship health: time since last interaction, response history, meeting
frequency, shared engagements, career updates, follow-through on
commitments. The goal is not to score people but to highlight relationships
that may benefit from attention.

### Success Criteria

This stage is successful when users no longer ask:

- "Did I ever message them?"
- "When did we last talk?"
- "Have they replied?"
- "Did I already follow up?"
- "Where is this relationship right now?"

Instead, they open Mighty and immediately know the answer.

---

## Stage 5 - Network Intelligence

> "Your network is more than a collection of relationships. It's an
> ecosystem. Mighty helps you understand and grow it."

### Overview

By this stage, Mighty has accumulated valuable knowledge. It understands
who you know, who you want to know, how your relationships have evolved,
which conversations have happened, which opportunities are active, which
parts of your network are thriving, and which parts need attention.

Instead of helping users manage individual relationships, Mighty now helps
them manage their network as a whole.

Every insight in this stage is grounded in data Mighty already owns:
Relationship Strategy (Stage 1), discovery history (Stage 2), outreach
activity (Stage 3), pipeline state (Stage 4), and the notes, timelines, and
reminders in the Memory Engine. No insight requires capabilities that
haven't been built elsewhere.

### Philosophy

Networks compound. One relationship creates another. One introduction
creates five more. One conversation opens unexpected opportunities. The
value of a network is not measured by its size. It is measured by its
quality, diversity, and relevance to the user's goals.

### Objectives

Network Intelligence helps users answer questions that become difficult as
their network grows:

- Where are the gaps in my network?
- Who should I reconnect with?
- Who can introduce me?
- Which relationships have become inactive?
- Am I making progress toward my networking goals?
- Which new opportunities should I pursue?

### Goal Progress

If the user's objective is "Build relationships with 50 AI leaders," Mighty
can display: 42 discovered, 18 contacted, 11 conversations, 5 ongoing
relationships. The network is measured against the user's goals - not
generic activity. This lives on the Strategy screen, which grows from an
onboarding summary into a progress dashboard.

### Network Composition

Help users understand who they actually know. Breakdowns by industry (AI,
Healthcare, Manufacturing, Finance), by role (Founders, Investors, Product
Leaders, Recruiters), by geography (Boston, Bengaluru, London), and by
company. This helps users identify concentrations and blind spots.

### Opportunity Detection

As the network evolves, Mighty surfaces opportunities:

- "Three people in your network recently joined the same company."
- "Five saved contacts are attending the conference you're registered for."
- "A former colleague is now hiring for a role that matches your goals."
- "An investor you've been following recently announced a new fund."

These are not notifications for the sake of engagement. They are timely
opportunities tied to the user's objectives.

### Warm Introduction Engine

One of the highest-value capabilities is identifying potential
introductions. Rather than simply showing mutual connections, Mighty
highlights the strongest paths:

- "Sarah has worked closely with both you and Amit."
- "John invested in both companies."
- "Professor Lee knows everyone involved."

Mighty recommends the introduction. The user decides whether to ask.

### Relationship Health at Network Scale

As networks grow, some relationships naturally become inactive. Mighty
helps users maintain important connections:

- "You haven't spoken with Priya in nine months."
- "You promised to reconnect after her product launch."
- "Rahul recently changed companies."
- "Meera was promoted this week."

These are natural moments to reconnect.

### Personalized Recommendations

Recommendations are always grounded in the user's Relationship Strategy:

> "Your goal is to build an enterprise AI network. You have strong
> relationships with founders but very few enterprise technology leaders.
> Consider discovering CIOs and CTOs in manufacturing."

> "You're actively fundraising. You have met 12 investors, but only two
> specialize in your sector. Would you like Mighty to recommend more?"

### Weekly Network Review

Instead of constantly interrupting users, Mighty provides a concise
review:

> This week: 12 new people discovered, 5 first messages sent, 3 replies
> received, 2 meetings completed, 4 follow-ups due.
>
> AI recommendations: Reconnect with Sarah. Follow up with David after your
> coffee chat. Three new people match your Relationship Strategy.

This becomes a lightweight habit rather than a stream of notifications.

### Success Criteria

Network Intelligence is successful when users no longer wonder:

- "Am I networking effectively?"
- "Who should I meet next?"
- "Who have I neglected?"
- "Am I getting closer to my goals?"

Instead, Mighty gives them a clear understanding of where their network
stands and where to invest their time next.

---

# Part III - The Memory Engine

> "Relationships are built through conversations. Strong relationships are
> built by remembering them."

Memory is not a stage in the journey. It is the cross-cutting capability
that powers every stage:

- During Discovery, it remembers why you saved someone.
- During Evaluation & Outreach, it remembers every message and draft.
- During the Pipeline, it remembers every interaction and status change.
- During Network Intelligence, it uses that memory to make smarter
  recommendations.

The user moves through five clear stages; memory quietly supports every one
of them.

### Overview

Professional relationships are not lost because people stop caring. They
are lost because people forget. They forget where they met. They forget
what they discussed. They forget what they promised. They forget to follow
up. They forget why someone mattered in the first place.

Mighty exists to become the memory layer for every professional
relationship. Instead of relying on scattered notes, emails, LinkedIn
messages, and memory, every interaction is captured and organized into a
single living relationship history.

### Philosophy

Memory should happen automatically whenever possible. The user should spend
time having conversations - not documenting them. Every interaction should
enrich the relationship without creating additional work.

### The Relationship Timeline

Every relationship has a timeline. Instead of opening multiple apps, users
see the complete history in one place. The timeline is the single source of
truth for the relationship. Later, as Mighty integrates with Gmail,
Calendar, LinkedIn, and other services, those interactions simply appear in
the same timeline without changing the user's mental model - the Timeline
remains the center; the data feeding it becomes richer over time.

### Capture Moments

The easiest way to lose context is to postpone documentation. Immediately
after a meaningful interaction - coffee chats, meetings, conferences, phone
calls, video calls, introductions - Mighty encourages the user to capture
what matters. The capture experience should take less than a minute.

The ideal capture experience:

```
Meeting ends -> phone vibrates -> "How did it go?" -> voice note
-> AI extracts promises, follow-ups, interests, introductions, reminders
-> timeline updated -> memory updated -> notifications scheduled
```

The user never fills out a CRM.

### Quick Capture

Users can quickly record:

- **Summary** - what happened?
- **Key takeaways** - what did you learn?
- **Commitments** - did either person promise anything?
- **Follow-up** - is another action required?
- **Personal notes** - anything worth remembering? ("Loves Formula 1."
  "Daughter starts college this year." "Interested in manufacturing AI."
  "Visiting Boston in September.")

These details often make future conversations more meaningful.

### AI Meeting Summary

Instead of writing everything manually, users can jot down a few bullet
points or dictate a short voice note. Mighty converts this into structured
notes: a meeting summary, topics discussed, action items (who owes what?),
and future opportunities (potential introductions, collaborations,
follow-ups). The user reviews and edits before saving.

Voice Capture is a core workflow, not a future enhancement. Voice, text,
and quick notes all flow through the same extraction pipeline. Future:
calendar completion, mobile notification, WhatsApp voice notes.

### The Living Relationship Profile

Over time, each person develops a living profile. Rather than static
contact information, the profile grows with every interaction:
professional background, timeline, shared interests, meeting history,
conversation history, personal notes, introductions, follow-ups,
attachments, relationship stage. Nothing is overwritten. Everything adds
context.

### Universal Search

As the network grows, remembering becomes harder. Users search naturally:

- "Show everyone I met at MIT."
- "Who was interested in enterprise AI?"
- "Who mentioned hiring next year?"
- "Which founders work in healthcare?"

Search works across notes, meetings, messages, relationship profiles, and
timeline events. The goal is retrieval, not storage.

### Smart Reminders

Memory should lead to action. Based on previous interactions, Mighty
suggests simple reminders: follow up after the conference, send the article
you promised, reconnect in three months, wish them luck before their
product launch. Users can edit, dismiss, or create reminders manually.

### Language Rule

The knowledge belongs to the user; Mighty simply remembers it. "Mighty
knows" is banned wording, everywhere, permanently. Always: **"Things
you've learned."**

### What We Intentionally Don't Do (Yet)

The Memory Engine is not trying to read every email, transcribe every
meeting, or infer every detail automatically. The first version focuses on
information the user chooses to capture or explicitly confirms. This keeps
the experience simple, accurate, and trustworthy. Automation can increase
over time as integrations mature.

### Success Criteria

The Memory Engine is successful when users no longer ask themselves:

- "How do I know this person?"
- "What did we talk about last time?"
- "Did I promise to send something?"
- "When did we last meet?"
- "Why did I save them in the first place?"

Instead, every relationship carries its own history, making each new
conversation feel like a continuation rather than a fresh start.

---

# Part IV - Product Surfaces and the v1 Specification

The design handoff bundle (`app-redesign-with-new-principles/`, exported
from Claude Design) is the authoritative v1 spec: `Mighty.dc.html` (the
app), `Mighty Landing.dc.html` (marketing site), `Mighty Login.dc.html`.
Recreate the visual output faithfully; don't copy the prototype's internal
structure. v1 is deliberately simple: fewer options, super simple usage.

## 1. First Principle of the Interface

**Every screen answers exactly one question.** Not a place. Not a feature.
A question.

Mighty is not a database. It is a daily operating system. Every page begins
with an action, not information. There are no pages whose primary purpose
is "show data." Every page exists to help the user make progress. The
interface is a series of decisions and actions, not a collection of records
and reports.

## 2. Navigation

Navigation does not represent features. It represents where the user is in
the relationship lifecycle - each item is a question the user naturally
asks:

| Nav item | Question | Journey role |
| --- | --- | --- |
| **Today** | What deserves my attention? | Act on what matters now |
| **Strategy** | Why am I networking? | Decide where you're going |
| **Discover** | Who should I know? | Find the right people |
| **Relationships** | Where am I with everyone? | Build and manage them |
| **Ask Mighty** | What should I do? | Get help anywhere |
| **Settings** | How does Mighty work for me? | Configure the system |

Six items. All visible from Day 1 - navigation is the mental model of the
product, and hiding items makes it feel inconsistent. Depth unlocks (Part
V), never navigation.

**There is no Outreach nav item.** Outreach is an action attached to a
specific human, not a destination. The draft belongs to the relationship.
A global outreach screen would encourage batch messaging, generic
templates, and detached drafting - it breaks Relationships over Contacts,
Context before Communication, and One Relationship at a Time.

**The Strategy screen** (labeled "Strategy," not "Goal" - a goal is
static; this page is not) is one of the smartest pages in the product. It
contains the current objective, target people, progress, strategy,
recommendations, and AI adjustments. Every recommendation in Today, every
ranking in Discover, every AI draft - everything references Strategy. That
is foundational enough to deserve permanent navigation.

The Extension entry point and the signed-in account sit at the bottom of
the sidebar, outside the six-item nav.

## 3. Screen Specifications

### Today (Home)

The home screen is almost empty. It doesn't look like Notion, HubSpot, or
Salesforce. It feels like Apple Reminders or Linear - one screen, one
purpose. Users open Mighty with a single question - "What should I do
next?" - and the home screen answers it immediately.

Structure:

```
Good morning, Ritesh

TODAY'S FOCUS
Build relationships with AI Product Leaders

Today's plan                                    30 minutes

  Reply to Sarah Johnson                 5 min   [ Reply ]
  She replied to your message yesterday.

  Send your first message to David Chen  8 min   [ Review & send ]
  Message drafted and ready.

  Prepare for coffee chat with Ankit    10 min   [ View brief ]
  Meeting brief is ready.

  Summarize yesterday's meeting          5 min   [ Add notes ]
  No notes have been added.

  Find one AI Product Leader             2 min   [ Discover ]
  Continue today's discovery.

Total: 30 minutes

UPCOMING
  Coffee chat with Rahul Verma
  Tomorrow · 2:00 PM                             [ Open brief ]
```

Each action card is like an email inbox item: title, one line of context,
time estimate, one button. No extra metadata. No widgets. No charts. No
notifications. No "recent activity." No analytics. No dashboard.

As actions complete, they collapse into a checked row ("Completed just
now," with Undo) and the next action moves up. Eventually:

> **You're all caught up.**
> You've completed today's recommended actions.
> [ Discover someone new ]

The hero is Today's Plan. Nothing competes with it.

### Strategy

The living strategy document from Stage 1, plus goal progress from Stage 5
as data accumulates: current objective, target network, preferences,
success metrics, progress, and AI recommendations for improving the
strategy. Editable at any time. In the prototype this is the guided
strategy flow (`isStrategy` / `isFirstStep`); over time it grows into the
progress view.

### Discover

The entire page is search. The hero is the search box:

> **Describe who you want to meet.**
> One sentence. That's all.
>
> [ Product leaders building AI infrastructure in Boston ]  [ Discover ]

Below: a few example chips, and "Today's focus" as context. Results are
match cards - name, role, Save/Skip, a "Strong match" explanation box, and
common-ground chips, with the reassurance "Save now, decide later." Saving
puts the person in Relationships at Saved. Nothing else on the page: no
recent searches, no recent people, no analytics, no recommendations.

### Relationships

The category page - not "People," not contacts, not an address book.
Question: where am I with every relationship?

Three views over the same people and the same single stage field:

- **List** (default, available Day 1). Columns in priority order: Person,
  Stage, Last activity, Next best action. The stage and next action are
  the dominant elements - not company or location. The next best action is
  rendered in accent color, bold: "Send follow-up," "Review draft."
- **Board** (unlocks). Kanban columns matching the pipeline stages, cards
  showing person + next action. Drag to move stages.
- **Timeline** (unlocks). A feed of everything that has happened across
  all relationships, newest first.

### Relationship Profile

Where the magic happens. Header: person, role, current stage pill, and
action buttons - **Draft a message**, **Prepare me**, **Set a reminder**,
advance stage. Tabs:

1. **Overview** - why you saved them (never disappears), professional
   overview, shared context.
2. **AI Brief** - why this person matters to you, recent activity,
   conversation starters.
3. **Draft Message** - approach chips (Warm Intro, Curiosity, Shared
   Experience, Value First, Coffee Chat), the draft with subject, "You
   always click send" note, and [ Copy & open LinkedIn ] / [ Edit ].
4. **Timeline** - every interaction, dated.
5. **Notes** - meeting notes, voice notes, AI summaries, quick capture.

No random information. Everything about communicating with this person
lives here.

### Ask Mighty

Not another AI chat. The conversational interface to the whole operating
system - every answer uses relationship memory: the strategy, saved
people, notes, timelines, meetings, drafts.

Day 1 it is real, not fake. If it doesn't know something, it says so
honestly:

> "I don't know yet. Save a few more relationships and I'll start
> recognizing patterns."

That honesty is the magic. Starter prompts (not restrictive - free-form
input always works):

- Who should I reach out to today?
- Who have I forgotten?
- Which introductions should I follow up on?
- Summarize Rajiv.
- Prepare me for tomorrow's meeting.
- Why was Sarah ranked highly?
- Which investors have gone cold?
- Rewrite this draft.

It spans the entire product, and it becomes smarter as the graph grows.
This page eventually becomes the product.

### Settings

Fine as settings. Profile, connected accounts, integrations, preferences.

### The Extension

Sidebar entry demonstrates and installs the Chrome extension. The
extension itself follows Stage 2: evaluate and save, never message, never
click Connect. Send-flow assist (prefill + highlight Send) follows the
Stage 3 sending flow.

### Landing and Login

`Mighty Landing.dc.html` becomes the new marketing site, replacing the
current one at the repo root. One design language, one product. Login per
`Mighty Login.dc.html`.

## 4. Design Language

The product already feels calm; keep it. Schibsted Grotesk, warm paper
background (#FBFAF8), white cards with 16px radius and hairline borders,
generous white space, indigo accent (#5B4FE9).

**Rule 1: every screen gets ONE hero.** Today -> Today's Plan. Discover ->
Search. Relationships -> the pipeline. Ask Mighty -> the conversation.
Nothing competes with the hero. Remove every unnecessary section.

**Color has meaning, not decoration:**

- Purple - AI, guidance, recommendations, actions.
- Green - progressing, completed, healthy.
- Amber - waiting on someone else, follow-up due, attention soon.
- Red - overdue or at risk.
- Neutral grays - everything else.

**Typography:** high contrast between action and metadata. "Send the first
message" is bold; "Saved 2 days ago" almost disappears. Users scan actions
first and details second.

## 5. v1 Build Plan

**Rebuild the UI. Keep the platform.**

Keep: Supabase, authentication, the data model where possible, existing
APIs, existing integrations (ai-proxy edge function, people-search, etc.).

Replace: screens, navigation, flows, information architecture.

Nothing gets deleted. Capability gets hidden until needed - the permanent
founder rule.

**Explicitly in v1:**

- Six-item navigation, all visible.
- Today with the daily plan.
- Strategy (guided setup + summary).
- Discover with natural-language search, Save/Skip match cards.
- Relationships List view; default pipeline stages; single stage field.
- Relationship Profile with the five tabs; drafting with approach chips;
  Copy & open LinkedIn flow.
- Ask Mighty, real from Day 1, honest about what it doesn't know yet.
- Extension: evaluate-and-save on LinkedIn profiles.
- New landing page as the marketing site.

**Explicitly cut or deferred from v1:**

- Goal-Based Personas (intent derives from Strategy instead).
- A global Outreach surface (never - by principle, not just scope).
- Custom pipeline stages (default stages only at first).
- Board and Timeline views at Day 1 (unlock on data).
- Network Intelligence dashboards (unlock on data floors).
- Deep passive capture (email reading, meeting transcription) - capture is
  explicit and user-confirmed first.

## 6. Build Order - Vertical Slices, Not Screens

Build in slices that each prove one model end to end. Building isolated pages
validates nothing; a slice can be used, and therefore judged.

**Slice 0 - Minimal intent.** Capture just enough strategy for ranking to
mean anything: primary goal, target roles, target companies, geography. Not
the full six-step flow - the smallest input that makes Discover personal
rather than generic. Intent Drives Everything is a principle from the first
search, so this cannot wait for Slice 5.

**Slice 1 - Discover to Save.** Search, evaluate, save. Natural-language
query, match cards with explanation-first reasoning, Save and Skip. Proves the
discovery model: can Mighty find people worth meeting, and explain why?

**Slice 2 - The saved relationship.** Open a saved person: profile, AI Brief,
a Draft tab (simple is fine), Notes, Timeline placeholder. Proves the
relationship model: is a saved person genuinely more useful inside Mighty than
as a LinkedIn tab?

**Slice 3 - Relationship management.** List, Board, Timeline, all backed by
the same single stage field. Proves the pipeline model: can a user answer
"where am I with everyone?" at a glance?

**Slice 4 - Today.** Only now. Today recommends against real relationship
data - "what should I recommend based on what actually exists?" Built earlier,
Today is forced to fake work, and a faked daily plan teaches users to ignore
it.

**Slice 5 - Strategy, fully wired.** The living Strategy surface with progress
and AI adjustments, threaded into Discover ranking, AI drafts, Today
priorities, and Ask Mighty context. Now the product feels personalized rather
than merely functional.

This sequence validates the core loop - Strategy, Discover, Save, Understand,
Build Relationship - early. The unlock engine, Ask Mighty depth, the
extension, and richer intelligence all layer on top of a relationship
operating system that already works.

Note for Slices 3 and 4: Board, Timeline, and several Today behaviors sit
behind unlocks, so development needs a seeded account to see them. Use the
mock harness, not lowered thresholds.

---

# Part V - The Unlock Engine

Carried forward from v1.3, adapted to v2. Features never unlock based on
time. They unlock based on meaningful user events.

**v2 rule: navigation is always visible. Depth unlocks.**

The unlock engine should feel like:

> "The more you invest in Mighty, the more helpful it becomes."

Not:

> "You aren't allowed to use this feature."

Per surface:

- **Today** - fully usable from Day 1.
- **Strategy** - fully usable from Day 1; grows into a progress dashboard
  as data accumulates.
- **Discover** - fully usable from Day 1.
- **Relationships** - List available immediately; Board, Timeline, and
  richer AI Briefs unlock with data.
- **Drafting** (inside profiles) - one draft initially; templates,
  history, and tone memory unlock.
- **Ask Mighty** - available immediately; becomes smarter as the graph
  grows; answers honestly when it doesn't know yet.
- **Settings** - always available.

Example gates (thresholds live in one config - `UNLOCKS` in the app - so
they can be tuned without hunting through the UI):

| Event | Unlock |
| --- | --- |
| First saved person | Profile Timeline |
| First note | Things You've Learned |
| First meeting | Voice Capture |
| Three messages sent | Relationship Health |
| Five relationships | Board view |
| First warm path | Warm Introductions |
| Sustained capture | Network Intelligence insights |

Deeper analytics keep their own data floors: never show an empty
dashboard, never show analytics without data, never show recommendations
without confidence. An insight with too little data behind it simply does
not appear.

**Engineering rule:** every new feature must name its unlock milestone and
its empty-state behavior before being built.

**One win first:** every new user should experience one meaningful success
within the first 90 seconds - a great search result, a great brief, or a
great draft. Nothing else matters until that happens.

---

# Appendix A - Decision Log

Decisions of 2026-07-25/26 that shaped v2:

1. **Bible rewritten user-first.** Organized around the journey, not
   features. The Bible is the direction; the design bundle is the v1 spec.
2. **Inbox merged into pipeline.** No separate Relationship Inbox surface
   or status system; "Saved" is the first pipeline stage. One person, one
   stage field. (Follows the web design.)
3. **Memory demoted from stage to engine.** The journey is five stages;
   the Memory Engine runs under all of them.
4. **Navigation: Today, Strategy, Discover, Relationships, Ask Mighty,
   Settings.** Six items, all visible Day 1. "Strategy" chosen over "Goal"
   (a goal is static; this page is strategy, objectives, target network,
   metrics, progress, and AI recommendations).
5. **No Outreach destination.** Outreach is an action on a relationship;
   all drafting lives in the Relationship Profile. A global outreach
   surface is contrary to principle, permanently.
6. **Goal-Based Personas cut.** Intent derives silently from the
   Relationship Strategy. Less UI, more intelligence.
7. **Unlock engine kept, v2 form.** Navigation always visible; depth
   unlocks on data milestones, never time.
8. **Ask Mighty real from Day 1.** Grounded in whatever data exists;
   honest "I don't know yet" answers; starter prompts plus free-form.
9. **Rebuild UI, keep platform.** Supabase, auth, data model, APIs, and
   integrations stay; screens, nav, flows, and IA are replaced. Nothing
   deleted; capability hidden until needed. New landing page becomes the
   marketing site.
10. **Old IA erased from the Bible.** The earlier home-screen draft (nav:
    Home, Discover, Pipeline, People, AI Studio) is superseded by the
    Today spec in Part IV. The Bible describes one product, one
    navigation, one philosophy.
11. **One evolving document.** This file is overwritten in place as the
    Bible evolves; no v3 file. Git history is the version history.
12. **Build in vertical slices, not screens** (Part IV.6). Each slice proves
    one model end to end, in this order: minimal intent, Discover-to-Save,
    the saved relationship, relationship management, Today, then Strategy
    fully wired. Today comes late deliberately - built early it would have to
    fake work.
13. **Design phase closed.** The Bible is stable. New ideas earn their way in
    through implementation and user feedback, not further restructuring.
    Changing the architecture means changing the Bible first.

Permanent rules restated: You Always Click Send. Capture is the product.
"Mighty knows" is banned - always "Things you've learned." Never delete
backend capability - hide it. Not a CRM, not automation, not a task
manager.
