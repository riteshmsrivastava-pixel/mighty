# Mighty Events - a spec, not yet built

Draft. Written 2026-09-19 from a voice conversation with Ritesh. Nothing in this
document is implemented. This is the plan to agree on before any code gets written.

---

## 1. The problem

Sloan runs events with 300-600 people in a room. You know almost none of them. The
people worth meeting are in there somewhere, but there is no way to find them short
of wandering with a drink in your hand and hoping for a good conversation to start
itself. Everyone in the room has the same problem, at the same time, in the same
building.

This is a Discover problem with a twist the rest of Mighty does not have: the people
worth meeting are not on LinkedIn yet. They are ten feet away, right now, and gone in
two hours. The information that matters ("I'm here, I want to meet an investor, I
have forty minutes") does not exist anywhere until someone types it in, and it stops
mattering the moment the event ends.

## 2. What it is

**Mighty Events**: a per-event, time-boxed, opt-in live directory. Anyone at the
event who chooses to turn it on shows up to everyone else who turned it on, as an
anonymous card: initials, a couple of tags for what they are looking for, how much
time they have. You can request time with someone; they accept, decline, or snooze.
Identity (name, photo, LinkedIn) is revealed only after both sides accept - never
before, never automatically.

It is not proximity-based. Nothing here uses Bluetooth, GPS, or scans for nearby
phones. "Who's around" means "who else at this event has the toggle on right now,"
not "who is physically standing near me." That distinction is what makes this
buildable as a web page instead of a native app, and it is explained fully in
Section 8.

## 3. Where this sits relative to the rest of Mighty

Mighty Events is a new, separate surface - not a Discover filter, not a rebuild of
the existing **Rooms** feature.

**Rooms** (already live) reads a public event page after the fact and surfaces
people it thinks you'd want to know, the way Discover surfaces a LinkedIn search
result: a name, a headline, a reason, a Save button. It is passive and asynchronous
- the event doesn't know Mighty is looking at it, and neither do the people
mentioned on the page.

**Mighty Events** is the opposite shape: synchronous, opt-in on both sides, and
anonymous until mutual consent. Nobody's identity is visible to Mighty Events
without them actively choosing to be visible for that one event, for that one
session. A saved person in Rooms is exactly like a saved person anywhere else in
Mighty. A person in the Mighty Events directory is not saved anywhere until the
other person accepts and both sides choose to save the connection - that is a new
kind of object this product has never had.

This tension is worth naming directly against the Bible's own principle 13 ("A
Person Is a Face, Not Just a Name") - everywhere else in Mighty, hiding a person's
identity would be a bug. Here it is the point: a room full of strangers is exactly
the place where showing your name and photo to everyone by default is the wrong
default. The Bible's actual governing rule is the one above it - **you always click
send** - extended to identity itself: nobody sees your name until you decide they
can.

## 4. The core loop

```
Organizer (or a QR stand at the door)
  -> attendee scans QR, fills a 30-second form
  -> attendee turns the event toggle ON when they want to be visible
  -> live directory: cards for everyone with the toggle on, initials + tags + time
     available, refreshed live for the length of the event
  -> attendee browses cards, requests time with one
  -> the other attendee gets a request: accept / decline / "ask me in 15"
  -> on accept: both sides see full identity, choose what to share (Section 6), and
     get a short chat scoped to that match - just enough to find each other in the
     room ("I'm by the bar," "corner near the door")
  -> either side can turn the toggle off at any time - "not networking right now"
     is a first-class, guilt-free state, not a hidden setting
  -> event ends -> a single prompt: "you met N people today - save them and keep
     working on your goals?" - one tap saves every match into Relationships; if the
     attendee has no Mighty account yet, this is the moment one is created
```

### The check-in form

Kept to what actually changes matching, per `docs/WRITING.md` rule 1 - every field
earns its place or it doesn't ship:

- Name and one line of context (role / what you do) - shown only after a match, never before
- What you're here for (short tags, organizer-configurable per event: "raising,"
  "hiring," "job hunting," "just here to learn," "meeting people in ~," etc.)
- Who you'd like to meet (same tag set, the other direction)
- How long you're around (5 / 15 / 30 / 60+ min, editable any time during the event)

No photo is collected or shown pre-match. No LinkedIn URL is required to
participate, though one can be attached so a match becomes a real Mighty person
automatically.

### Setup: organizer or self-serve

Two ways an event gets created, same underlying object:

1. **Organizer-configured.** An organizer (a club, a conference, a company) creates
   the event in advance: name, time window, the tag vocabulary attendees pick from,
   optionally a pre-loaded attendee/speaker list. They get one QR code to display or
   print.
2. **Self-serve / ad hoc.** Anyone opens Mighty Events, taps "Start an event here,"
   picks a duration, and gets a QR code immediately - no advance setup. Good for the
   version of this that just needs to exist at Wednesday's mixer with no lead time.

Both produce the same live directory and the same loop from here on.

## 5. The toggle, not a wristband

The "switch on/off" framing from the original idea is the right one and it survives
into this spec unchanged: visibility in the live directory is a single toggle inside
the web app, on the event's page. On means "list me, I'm open to a request." Off
means invisible, instantly, no explanation owed. A person can be checked into an
event and toggled off the whole time - that's a legitimate way to use this, not a
broken state.

The toggle has no memory across events. Turning it on at one event says nothing
about the next one; nothing here is a standing "always discoverable" setting,
because Mighty Events lives inside one event's time window and nowhere else.

## 6. Anonymity and reveal rules

- Before a match: initials only, plus whatever tags they chose to show. No photo, no
  name, no company, no LinkedIn.
- A request carries a one-line reason, free text, capped short - "you said you're
  hiring, I'm looking for a PM role" - so a request never arrives as a bare ping.
- On accept, both sides see full name and the context line they wrote at check-in.
  Beyond that, each side independently chooses what to hand over - LinkedIn only,
  LinkedIn plus phone, email, any combination, or none of it - and the choice is not
  symmetric: you can see what they chose to share with you without it dictating what
  you share back. Neither side's Mighty saved-person data (goals, notes, history
  with other people) is ever exposed to the other side. This event, and only what
  they actively chose to hand over, is shared.
- The post-accept chat (Section 4) is scoped to that one match, text only, no media,
  and exists only to coordinate finding each other in the room. It is not a general
  messaging feature and nothing about it persists past the event.
- Declining a request tells the requester nothing beyond "declined" - no reason, no
  seen-but-ignored signal, matching the Bible's existing pattern for the "not
  interested" outcomes on Discover matches.
- Everything - the directory entry, the requests, the reveal - expires at the
  event's end time. What survives past the event is only what the user explicitly
  chooses to keep: an accepted match they save as a real person.

## 7. What happens after the event, and when an account gets created

**Checking in and using the live directory needs no Mighty account at all.** That is
deliberate - the entire value of the event has to be available in the thirty seconds
after scanning a QR code, with zero signup friction, or nobody in a 600-person room
bothers.

The account question only comes up once, at the end: "you met N people today - save
them and keep working on your goals?" One tap saves every accepted match into
Relationships, exactly like a Discover save - name, the reason (drawn from what they
said they were there for and what was shared back), source tagged "Met at [event
name]." If the person doing the saving has no Mighty account yet, this single action
is what creates it - not the act of checking in, not the act of matching, only the
explicit choice to keep what they got.

**This account is created for real, immediately - resolved, no waitlist.** The
hand-curated waitlist exists only because Mighty currently has no real user base to
open the gates to; it is a today constraint, not a permanent policy. Mighty Events is
explicitly the acquisition channel meant to change that, so it gets real self-serve
signup from day one. Mechanically: check-in uses a Supabase anonymous session (no
account, no email, just a device-scoped identity for the length of the event) -
already-logged-in users check in with their real account directly instead. At save
time, if the session is still anonymous, it is upgraded in place to a permanent
account via Supabase's anonymous-to-permanent linking (the same `auth.users` row
gains an email and a confirmation step; nothing needs to be copied or re-attached,
because the user id never changes). If a fully signed-out person's device somehow
loses that session before they save, the fallback is the ordinary "Mighty emails you
a link" pattern already used elsewhere in this product for account confirmation, not
a new invention.

This is the only place Mighty Events data crosses into the rest of the product.
Attendees seen in the directory but never matched with leave no trace anywhere in
Mighty. Matches never saved leave no trace either - the event data expires with the
event (Section 6), and nothing here ever creates an account or a saved-person record
for the *other* side of a match without that person independently choosing to save
it themselves, the same way, on their own device.

## 8. Why this is buildable as a web page (the Bluetooth question, resolved)

The original idea described phone-to-phone Bluetooth so the directory would show
who's physically nearby. That does not work from a browser: Web Bluetooth requires
an explicit device-picker dialog per connection (no passive scanning), and Safari on
iPhone does not implement Web Bluetooth at all. Any room with iPhones in it - which
is every room - breaks that approach completely, and going native is a different,
much larger project.

What we're building instead gets the same felt experience without any of that:

- **"Live" means genuinely live**, via Supabase Realtime (Postgres change
  subscriptions over the existing Supabase project - not polling, not new
  infrastructure). A toggle flip, a new attendee, or a request appears on other
  attendees' screens within about a second. The app does not currently use Realtime
  anywhere, so this is new plumbing, but it is a documented, supported part of the
  stack already in use.
- **"Nearby" becomes "at this event."** Precise physical distance was never
  actually load-bearing in the original idea - what mattered was "these are the
  people in the room right now who also want to talk to someone," which an event-
  scoped directory delivers exactly.
- **No app install.** A link and a QR code work on every phone in the room, iPhone
  included, with nothing to download - which matters enormously for a feature whose
  entire value is a room full of strangers being able to join in under a minute.

## 9. Design

Same system as the rest of the product, no new visual language: dark paper
background, Schibsted Grotesk, the existing card/pill/badge components, the same
indigo-for-AI / green-for-good / amber-for-waiting color meaning already defined in
the Bible's Design Language section. A live-event screen is the one place a small
amount of new motion is justified - cards appearing as people toggle on - and even
that should be restrained: a fade-in, not a flashing "new person!" animation. This
is a calm product; a room full of strangers is stressful enough without the app
adding urgency.

One new visual idiom, because the object is new: the **initials-only card**. Same
shape as every person-card elsewhere in Mighty (avatar circle, one line of context,
an action), except the avatar circle holds two letters on a neutral fill instead of
a photo, and it upgrades to a real avatar the instant a match is accepted - the card
itself doesn't change shape, only what's allowed to render inside it.

## 10. Data sketch (for engineering discussion, not final)

New tables, none of which reuse `outreach_log` - this is deliberately not a person
record until a match makes it one:

- `event_sessions` - id, name, organizer_user_id (nullable, for self-serve), tag
  vocabulary, starts_at, ends_at, qr_token
- `event_checkins` - event_id, user_id, display_initials, context_line, looking_for
  tags, offering tags, minutes_available, visible (the toggle), checked_in_at
- `event_requests` - event_id, from_user_id, to_user_id, reason, status
  (pending/accepted/declined/expired), created_at, responded_at
- `event_matches` - event_id, user_a, user_b, matched_at, share_a (which channels
  user_a chose to reveal), share_b (same for user_b), saved_by_a (bool), saved_by_b
  (bool) - the record that survives the event and drives the post-event save offer
- `event_messages` - match_id, from_user_id, text, created_at - only insertable
  while the parent event is still open; the row becomes unreadable (not necessarily
  deleted, but inaccessible via RLS) once the event's end time passes

All scoped by RLS the same way every other table in this product is: a user reads
their own check-in fully, but only the fields Section 6 says are pre-match-visible
for everyone else's check-ins at the same event, until an `event_matches` row exists
between them.

## 11. Explicitly not in this version

- Bluetooth or any real physical-proximity signal (Section 8).
- A native mobile app.
- Photos before a match, under any setting.
- Any standing "always visible at events" preference - the toggle is per-event,
  every time.
- Group requests / group sessions - v1 is one-to-one only, matching the rest of
  Mighty's "one relationship at a time" principle.
- General-purpose or persistent chat - the post-match chat (Section 4) is text-only,
  one match at a time, exists to coordinate a physical meetup, and is gone when the
  event ends. It does not become a standing way to message someone through Mighty.
- True peer-to-peer (WebRTC/direct device) connections of any kind, for the chat or
  anything else - every "live" piece of this runs through Supabase, the same as the
  directory itself (Section 8).
- Organizer visibility into who requested whom - organizers get attendance counts
  and tag distribution, never the request graph.

## 12. Open questions - only Ritesh can answer these

1. **Name.** "Mighty Events" was the working name in conversation. Confirm, or pick
   something else before it shows up in code and copy.
2. ~~**Who can create an event?**~~ **Resolved:** gated, permanently, not just for
   now. Only accounts on an organizer allow-list can create an event - Ritesh grants
   that access by hand, the same way invite codes and the waitlist already work.
   This is the opposite of the account-creation answer above on purpose: attendee
   signup should be wide open because that's the acquisition funnel, but event
   *creation* staying curated is what keeps the surface from filling with junk or
   impersonation events. Early testing uses one manually-created organizer row.
3. ~~**Does check-in require a Mighty account?**~~ **Resolved:** no. Check-in uses a
   Supabase anonymous session; a real account only gets created at save time
   (Section 7).
4. ~~**Request limits.**~~ **Resolved:** 10 pending requests per person per event,
   stored per-event so it can be tuned per event later. Raising the cap for paying
   plans (Pro gets more requests, matching how Assists already scale by plan) is a
   real direction but not a v1 requirement - the column exists on `event_sessions`
   precisely so this can change without a schema migration later.
5. ~~**First pilot.**~~ **Resolved:** the MIT Sloan Alumni mixer. That's the real
   deadline for a usable v1 - find the date and work backward from it.

All five original open questions are resolved. Nothing is blocking the build.

## 13. Success criteria

Borrowing the Bible's own standard for a stage rather than inventing a new one: this
is working when someone can leave a 600-person event able to say, truthfully, "I met
two people I actually wanted to meet, and I know who they are and why we should talk
again" - and when at least one of the open questions above didn't have to become a
blocker because the defaults in this document were good enough to ship a pilot with.
