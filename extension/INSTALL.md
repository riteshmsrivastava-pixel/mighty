# MIghTy - LinkedIn Outreach (Chrome extension)

## Human-in-the-loop, on purpose

LinkedIn's terms prohibit automating clicks, connection requests, or messages -
and doing so risks **your own account** being restricted, right when you need
it most for your job search. So this extension never simulates a click on
Connect or Message, no matter how much more it can now show you. It only:

1. Reads profile cards on a LinkedIn search-results page **you** opened, and
   shows a real match score for anyone already tracked in MIghTy (or a plain
   "target company" note for someone not yet tracked - never a made-up score
   for a stranger).
2. Reads a profile page's About/Experience/Education text - but **only** to
   enrich a contact already tracked. If you view someone you haven't
   shortlisted, this is discarded; nothing is retained for a profile you
   merely browsed past.
3. Shows a docked panel on tracked profiles with your status, next step, and
   notes - editable right there, no need to open the web app.
4. Optionally fills a compose box with your drafted message, **only** when
   you click "Fill draft" - never automatically.
5. **Watches** for you clicking the real Send/Connect button, so it can log
   the send back to your MIghTy account. It observes; it never triggers.

You are always the one clicking Connect and Send.

## Install (one time, ~1 min)
1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select this folder (`~/mighty/extension`).
4. The MIghTy icon appears in your toolbar. Pin it.
5. Click the icon → sign in with your `@mit.edu` email and password - same
   account as the web app. That's it; no URLs or keys to paste.

## Use it
1. Search LinkedIn as you normally would (search bar, filters - all manual).
2. On the results page, each card gets a checkbox and, if you already track
   that person, a real score badge. Check who you want, click **Send N to
   MIghTy** (bottom-right).
3. Open a tracked profile once - the extension reads their About/Experience/
   Education and sends it back so MIghTy can generate a grounded briefing and
   draft. A docked panel on the right shows your status, next step, and notes
   for that person, editable right there.
4. In the MIghTy web app (People or Pipeline → open the profile), click
   **Draft message**, pick an objective and tone, then **Copy & open
   LinkedIn** - this copies the drafted message and opens their profile.
5. On LinkedIn, open Connect or Message as you normally would. Click
   **Fill draft (MIghTy)** above the compose box to paste in your drafted
   message from the clipboard, edit it if you like, then click **Send** or
   **Connect** yourself.
6. That click is detected automatically and moves the contact to
   **Contacted** in your Pipeline - no extra step. If detection ever misses
   (LinkedIn's markup changes), drag the card in Pipeline as a fallback. Log
   coffee chats, replies, referrals, and interviews from the person's Drawer
   in the web app (or right from the docked panel's notes) as they happen.

## Honest limits
- Only acts on pages you manually open - there's no background crawling or
  auto-navigation between profiles.
- LinkedIn's DOM can change without notice. If shortlisting, score badges,
  profile-context capture, the docked panel, or send-detection stops working,
  the fix lives in one place: the `SELECTORS` object at the top of
  `content.js`. Open DevTools on the broken page, find the right class names,
  and update just that object.
- Your weekly cap (100 contacted/week) is enforced by the web app and backed
  by a database rule - this extension itself has no cap logic, it just
  reports what you did.
- Score badges and the docked panel only ever show real data for profiles
  already in your MIghTy log - an untracked stranger gets, at most, a plain
  "target company" text match, never a fabricated score.
