# Mighty: a design brief

Read this first. It is written for a designer or a design AI who has never seen this product, and it tries to
be honest about what is settled and what is genuinely open.

## What Mighty is

An operating system for professional relationships. LinkedIn helps you *discover* people. Mighty helps you
remember them, follow through, and turn conversations into something. It is not a CRM and it is not a job-hunt
tool: job hunting is one use case.

The user imports their LinkedIn history, states a goal, and Mighty tells them who is worth their time and
helps them write the first message. Every send is the user's own click. Mighty never sends anything.

## The one sentence that shapes every screen

**Capture is the product.** Everything intelligent Mighty does depends on the user writing down what happened
after a conversation. So the design job is not to make an impressive dashboard, it is to make a one-minute
habit feel worth doing on day four hundred.

## The four surfaces, and the single question each answers

Navigation is the user's questions, not our features. This is settled and worth preserving. Discover and
Relationships merged into one list - a name either is saved or is not, and asking the user to decide which
kind of person they were thinking about before they could even search was the wrong first question. Strategy
and Settings merged into You for the same reason: both answer "how does this work for me," one about what
Mighty knows, the other about the mechanics.

| Surface | The only question it answers |
|---|---|
| Today | What should I do right now? |
| Relationships | Where am I with everyone, and who is worth adding? |
| A person | Is this worth investing in, and what do I say? |
| You | How does this work for me? (Mirror, Patterns, Goal, Account) |
| Ask Mighty | Anything, conversationally |

## What is in this package

```
app/index.html          The whole web app. One file, ~3,300 lines.
index.html              Marketing landing page.
pricing/index.html      Pricing.
install/index.html      Extension install walkthrough.
extension/              Chrome extension: popup plus the panels injected into LinkedIn.
assets/modernist.css    The stylesheet the marketing pages share.
assets/*.png            Logo lockup, favicons, two app screenshots.
docs/WRITING.md         How Mighty writes. Please read this - it constrains copy, not layout.
prototype.html          A clickable prototype of onboarding and all six surfaces. Open this first.
```

`prototype.html` is the fastest way to understand the product. Open it in a browser and click through: it
holds state, so adding a person changes what other screens show.

## Hard technical constraints

These are not preferences. Breaking them means the work cannot ship.

1. **The app is one HTML file with no build step.** React 18 via CDN UMD plus Babel-standalone compiling JSX in
   the browser. There is no bundler, no npm install, no PostCSS, no Tailwind build. If you want Tailwind you
   would have to justify a build pipeline that does not exist today.
2. **No external font or asset requests on the app.** Fonts must be system stacks or inlined as data URIs.
3. **Design tokens are CSS custom properties** defined once at the top of each file. There is a checker,
   `tools/check-tokens.sh`, that fails if a retired colour value reappears anywhere. Add tokens, do not
   hard-code hex values.
4. **Light theme only, deliberately.** The owner asked for a white background and it stuck. If you want to
   propose dark mode, propose it, do not assume it.
5. **The extension panels are built with plain DOM in `extension/content.js`** and injected onto pages we do
   not control. They cannot use the app's stylesheet, and they must not look like a LinkedIn native element.

## The current visual language, for reference not for reverence

Brand purple `#5B46E5`, a peach `#F2A78E` used only in the logo mark, near-black ink `#16151A`, warm neutrals,
generous whitespace, pill buttons, 11-14px monospace eyebrow labels in uppercase. Type is a system stack.

The logo is two overlapping circles - purple and peach - with the peach set to multiply, which is the one piece
of visual wit in the product and is worth keeping or beating.

## Where the design genuinely needs help

Ranked by how much a better answer would change the product.

1. **Relationships.** One search box now does the job Discover and Relationships used to split between them:
   type into it and it filters who is saved while it searches who is not, at once. The ranked suggestions
   still carry a one-line reason like *"Was at Novartis while you were. Matched on boston, partner."* Those
   reasons are the product. They deserve better than a list row.

2. **First run.** Onboarding is five steps: privacy, history, resume, goal, questions, on a vertical rail with
   rounded cards. It is correct and it is plain. The payoff screen after it - landing in Relationships with
   people to add - is where a new user either gets it or leaves.

3. **A person.** Brief, draft, notes, timeline behind four tabs. The draft is the moment the user pays us,
   and the notes tab is the habit the whole product depends on. Neither feels special.

4. **Today.** Derived action cards. Works, looks like a to-do list, and should feel like a short conversation
   with someone who knows your week.

5. **Empty states.** There are many and they matter more than usual, because a new account is empty by
   definition and Mighty deliberately refuses to fake data.

## Where the design should not go

- **No relationship scores, health percentages, or streaks.** Mighty says things in words or not at all. A
  number implies a precision we cannot honestly claim. This is a product principle, not a style choice.
- **No feed.** Today is a short list that ends. If it scrolls forever, it is wrong.
- **Nothing that implies Mighty acts on your behalf.** No "send" affordance, no automation imagery, no robots.
- **No fake data in empty states.** Show nothing and say why.

## The copy rules, briefly

Full version in `docs/WRITING.md`. Every sentence must explain why, build trust, tell the user what to do, or
show value; anything else is cut. If your design needs more words than the current copy to make sense, that is
usually a sign the design is not carrying its weight.

## What is deliberately not in this package

The business plan, the pricing rationale, the data analysis and the patent disclosure. None of it is needed to
design the product, and one of them should not be handed around.
