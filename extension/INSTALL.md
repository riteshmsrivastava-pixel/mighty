# MIghTy — MIT Watch (Chrome extension)

The hands-off daily refresh. Runs in **your own browser, in your own logged-in MIT session** — so it can read Touchstone-protected pages that no cloud agent can. Install once; it refreshes daily by itself.

## Install (one time, ~1 min)
1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select this folder (`~/mighty/extension`).
4. The MIghTy icon appears in your toolbar. Pin it.

That's the "do it once." From now on it works by itself.

## Use it
- Click the icon → you'll see your watched pages (SloanHub + Student Funding to start).
- **⚙️ Pages & settings → Add page** to add your own (Canvas, registrar, Tasks, Announcements, MITPAY…) with a "what to watch for."
- Make sure **"Auto-refresh once every 24 hours"** is on.
- Hit **↻ Refresh now** to try it immediately.

### What happens on a refresh
For each page, the extension opens it in a **background tab in your session**, reads the text, closes the tab, and flags it:
- 🟢 **ok** — no change since last time
- 🟠 **changed** — content changed (new task/announcement/deadline)
- 🔴 **attention** — needs action soon (only with Claude summaries on)
- 🟡 **login** — your MIT session expired; open the page, sign in, refresh
- 🔴 **error** — page failed to load

### Two optional add-ons
- **Claude summaries** (Anthropic API key): turns each change into a 1–2 sentence task instead of a raw text preview. Without it, you still get changed/unchanged + a preview, free.
- **Sync to your MIghTy account** (Supabase URL + anon key + your @mit.edu login): pushes results to the web app so they appear on all your devices.

## Honest limits
- It runs when **Chrome is open** and your **MIT session is alive**. If your Touchstone session has expired it can't fake a login — it flags 🟡 **login** and you sign in once.
- SloanHub etc. are single-page apps; the extension waits ~3s for them to render before reading. If a page reads empty, bump the wait in `background.js` (`sleep(2800)`).
- Default pages are best-guess URLs — edit them to the exact pages you care about.
