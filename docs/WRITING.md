# How Mighty writes

Decided 27 July 2026. This is not a tone-of-voice document. It is a test any sentence in the product has to
pass before it ships.

## The test

Every sentence must do one of four things.

1. **Explain why.** *Your goal decides who Mighty recommends.*
2. **Build trust.** *Your data stays in your account and never trains AI.*
3. **Tell the user what to do.** *Drop the .zip here.*
4. **Show value.** *Eleven people worth reconnecting with.*

A sentence that does none of these comes out. Not shortened - out.

The standard to aim for: **removing a sentence should make the experience worse, and adding one should make
it weaker.**

## The five rules

**1. Every sentence teaches one thing.**

Not *Mighty needs to know you before it can help with anyone else* - abstract.
Instead *Help Mighty understand you before it recommends people* - immediately obvious.

**2. Say why you are asking.** Every screen that asks for something answers "why do you want this?" in one
sentence, before the input.

- History: *Your LinkedIn history shows Mighty who you already know.*
- Resume: *Your biggest achievements usually are not on LinkedIn.*
- Goal: *Your goal decides who Mighty recommends.*
- Questions: *A few things only you can tell us.*

**3. Concrete over conceptual.** *Everything it learns goes into your Knowledge Base* is technically true and
means nothing to a new user. Name the thing they can picture, not the thing we built.

**4. Do not explain the implementation.** Tell them what to do. Put the mechanics one click away for the
people who want them.

Cut: *LinkedIn emails a link. Choose the larger archive. It is read on this machine.*
Keep: *Request your data from LinkedIn, choosing the archive that includes connections.*

**5. Headlines promise value, not process.** Not *Consent, History, Resume, Questions*. Instead *Before we
begin, Import your LinkedIn history, Complete your profile, A few things only you can tell us.*

## Two patterns to watch

**Mighty as the subject, where "you" is stronger.** *Mighty needs to know you* is a demand. *Help Mighty get
to know you* is collaborative. Same meaning, and the second one reads like a person wrote it.

**Documentation tone.** Strings of facts with no verb doing any work. *Read from your own files, not guessed*
is three facts in a row. *Built from your files, not assumptions* is a sentence.

## The one exception to Rule 4

Rule 4 and category 2 collide in exactly one place: what we do with someone's data is implementation detail,
and it is also the thing a person most wants to know before agreeing to anything.

So: **mechanics go behind a link. Anything we do with a person's data stays on the surface.**

How the archive is parsed, which file the parser reads, where the zip is stored - behind a link. That Mighty
reads the messages you sent and keeps forty of them - on the screen, in full, before the checkbox. Burying
that would make the product less honest rather than tighter, which is not what any of these rules are for.

## Words we do not use on screen

**Knowledge Base.** It is the internal name and it stays the internal name: in the code, in the schema, in
the plan, in our own conversations. A user never sees it. On screen it is *your profile in Mighty*, or more
often nothing at all - the screen shows what Mighty knows, which is more convincing than a noun for the
container it lives in.

**Consent.** A legal word for a screen that must not feel legal. The step is called Privacy.

**Assist**, used without context. It is a unit of billing. On a screen where someone is trying to write to a
person, say what it costs them in plain terms - *one assist covers all ten takes* - rather than assuming the
noun carries meaning.

## Formatting

No em dashes. Spaced hyphen instead. This applies to every file in the repository, including this one.
