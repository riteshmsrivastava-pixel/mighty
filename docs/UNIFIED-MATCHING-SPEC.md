# Unified matching: one ranking system, not two

## The problem, concretely

Today Mighty scores "is this person relevant to me" in two different, disagreeing ways:

- **Discover** (`evaluate()` in `app/index.html`): one real LLM call per search, grading
  every candidate against `strategyBrief()` with an honest verdict
  (excellent/strong/potential/low), grounded common-ground, no fabricated number. This is
  already close to best practice - it reasons in plain language about your actual goal.
- **Extension popup** (`fitFromStrategy()` + `GOAL_VOCAB` in `extension/content.js`): a
  local, instant, keyword/pattern scorer - company match, role match, goal-keyword hits,
  school/skill overlap, plus a hand-curated vocabulary of known VC firms for the
  fundraising goal specifically. No network call, no LLM.

Same person, same goal, two different judges. The extension's version also needs a manual
vocabulary patch every time it misses a category of entity (this week it was VC firms;
next time it could be accelerators, media outlets, whatever a future goal type needs) -
that doesn't scale, and it can't do the thing an LLM does for free: recognize a firm or
role it's never been told about by name.

## Proposed shape: a two-stage funnel, shared by both surfaces

**Stage 1 - embedding pre-filter (fast, cheap, always runs).**
One "you" vector per account, built from `strategyBrief()` (goal text, target
roles/companies/locations, résumé/LinkedIn summary) and recomputed only when that
changes - rare, so this is nearly free over time. Each candidate (a Discover search
result, or the one profile open in the extension) gets embedded the same way from
headline + company + About/experience snippet. Rank by cosine similarity.

This alone is what should replace `GOAL_VOCAB`'s hand-typed firm list: a VC-flavored
profile clusters near a fundraising-goal embedding on its own, without anyone having
enumerated every fund by name. It generalizes where a keyword list never can.

**Stage 2 - grounded LLM judgment (real reasoning, only on the close matches).**
Feed just the top-K from stage 1 (above a similarity threshold, or top 10-15) into the
*same* `evaluate()`-style prompt Discover already uses: honest verdict, grounded
common-ground, no invented score. For Discover this is closer to what happens today,
just gated by stage 1 once result counts grow past what fits comfortably in one prompt.
For the extension, this is new - see the open question below on whether it always runs.

## What actually has to get built

- A new embeddings call. **Not available today** - `ai-proxy` wraps Anthropic only, and
  Anthropic doesn't offer a public embeddings endpoint, so this needs a new provider
  (OpenAI `text-embedding-3-small`, Voyage, Cohere) and a new secret/edge function. This
  is the one genuinely new piece of infrastructure in this plan.
- `you_embedding`, stored per account (in `settings`/`knowledge`), recomputed on
  goal/profile edit.
- Per-candidate embeddings: computed on the fly for Discover's batch and the extension's
  one profile; not worth persisting unless we start caching per `profile_url`.
- Extension: `GOAL_VOCAB`'s scoring role gets taken over by stage-1 similarity. Whether
  the extension calls stage 2 (the LLM judgment) automatically or on demand is an open
  product question, not an engineering one - see below.
- Discover: mechanically close to unchanged; stage 1 just gates what reaches `evaluate()`
  once a search returns more than ~15-20 candidates.

## Decisions this needs before any of it gets built

1. **Does the extension call the LLM stage automatically for every profile you open,
   or only on demand (a button, like today's "Save" but for "get the real read")?**
   Automatic means a short loading state replaces today's instant popup, and very likely
   an Assist (or a cheaper metered unit) gets spent on every LinkedIn profile you glance
   at - that's a real behavior and cost change, not just a technical one.
2. **Stage 1 implementation - decided.** Rather than a new embeddings vendor (real
   cost, real setup, and nothing in the stack today), stage 1 is a cheap/fast model call
   through the existing `ai-proxy` (Haiku tier) doing lightweight triage on the full
   candidate batch, with stage 2 staying the existing Sonnet-tier `evaluate()` call on
   just the top of that. No new vendor, no new secret - both stages run through
   infrastructure that already exists. Revisit true embeddings only if candidate volumes
   get large enough that even Haiku-tier triage on the whole batch gets slow or costly.
3. **Billing** - should the cheap stage-1 pass ever cost an Assist on its own? Almost
   certainly not, given how cheap a Haiku call is relative to a full Assist - but worth
   saying explicitly rather than leaving it implicit.

## Testing plan, before writing any of this for real

Tried this first, honestly: at Discover's current candidate volumes (~8-10 results per
search), a single `evaluate()` call already reasons carefully - there isn't a clear
failure case for a pre-filter stage to fix yet. Confirmed against a real search
("Boston-based deep tech investors who went to MIT") in the live product - results
looked right. Conclusion: **hold off building the cascade until a real batch actually
strains the one-shot call** (larger candidate counts, or a query type that reveals
shallow reasoning), rather than building a second scoring stage with nothing yet to fix.
This doc stays as the plan for when that day comes.
