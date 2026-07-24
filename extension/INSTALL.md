# MIghTy — LinkedIn Outreach (Chrome extension)

## Human-in-the-loop, on purpose

LinkedIn's terms prohibit automating clicks, connection requests, or messages —
and doing so risks **your own account** being restricted, right when you need
it most for your job search. So this extension never simulates a click on
Connect or Message. It only:

1. Reads profile cards on a LinkedIn search-results page **you** opened.
2. Optionally fills a compose box with your drafted message, **only** when
   you click "Fill draft" — never automatically.
3. **Watches** for you clicking the real Send/Connect button, so it can log
   the send back to your MIghTy account. It observes; it never triggers.

You are always the one clicking Connect and Send.

## Install (one time, ~1 min)
1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select this folder (`~/mighty/extension`).
4. The MIghTy icon appears in your toolbar. Pin it.
5. Click the icon → **Connect your MIghTy account** → paste your Supabase
   URL + anon key (same ones you used in the web app's Settings) and sign in
   with your `@mit.edu` email.

## Use it
1. Search LinkedIn as you normally would (search bar, filters — all manual).
2. On the results page, checkboxes appear on each visible card. Check the
   ones you want, then click **Send N to MIghTy** (bottom-right).
3. In the MIghTy web app's **Shortlist** tab, pick a template per profile and
   click **Copy message + Open profile** — this copies the drafted message
   to your clipboard and opens their profile in a new tab.
4. On LinkedIn, open Connect or Message as you normally would. Click
   **Fill draft (MIghTy)** above the compose box to paste in your drafted
   message from the clipboard, edit it if you like, then click **Send** or
   **Connect** yourself.
5. That click is detected automatically and logged back to your MIghTy Log
   as "Sent" — no extra step needed. If detection ever misses (LinkedIn's
   markup changes), use the manual "Mark Sent" button in the Shortlist tab
   as a fallback.

## Honest limits
- Only acts on pages you manually open — there's no background crawling or
  auto-navigation between profiles.
- LinkedIn's DOM can change without notice. If shortlisting or send-detection
  stops working, the fix lives entirely in one place: the `SELECTORS` object
  at the top of `content.js`. Open DevTools on the broken page, find the
  right class names, and update just that object.
- Your weekly cap (100 sends) is enforced by the web app and backed by a
  database rule — this extension itself has no cap logic, it just reports
  what you did.
