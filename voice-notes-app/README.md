# Thought Sorter

Talk into your phone. AI sorts what you said into **reminders** (with dates), a **to-do checklist**, and **notes grouped by topic**.

- **Talk tab:** tap the mic and ramble. Your words appear live, and you can fix anything before you tap **Organize**.
- **Organized tab:** reminders sorted by date, to-dos you can check off, and notes by topic. Tap the pencil to edit or the trash can to delete (with undo).
- **Plan tab:**
  - **Party lists.** Pick the occasion, guest count, Minimal / Standard / Elaborate, and indoors or outdoors, and add notes ("two vegetarians, already have plates"). The AI builds a "don't forget" checklist, from the turkey down to extra ice and a tablecloth for the outdoor table. Check things off, add your own, or send what's left to To-dos.
  - **Where to buy.** Each item shows where to get it. A deal you logged comes first (cheapest first), then one of *your* stores (set in Settings) if the AI suggested it, then the AI's top suggestion. **Shop by store** groups everything still needed by store, so in Trader Joe's you see exactly what to grab there.
  - **Deals & gift ideas.** Log a deal you spotted: photo, item, store, price, and whether it's a gift idea and for whom. Party lists match items to your deals automatically.

It's a web app you add to your home screen, so there's no App Store. A small Cloudflare Worker serves it and does the sorting with **Cloudflare's free Workers AI** (Llama 3.3 70B). There's no API key and nothing to pay for normal personal use.

## Set it up (about 10 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node.js on your computer.

```bash
cd voice-notes-app
npm install
npx wrangler login
npx wrangler secret put APP_PASSCODE        # make one up; you'll type it once on your phone
npx wrangler deploy
```

Wrangler prints a URL like `https://thought-sorter.<you>.workers.dev`.

## Put it on your phone

1. Open that URL on your phone.
   - **iPhone:** use Safari, tap Share, then **Add to Home Screen**.
   - **Android:** use Chrome, tap the ⋮ menu, then **Add to Home screen** or **Install app**.
2. Open it from the home screen, tap the ⚙️ gear, and enter your passcode.
3. Tap the mic and allow microphone access.

## Good to know

- **Your notes live only on that phone** (in the browser's storage). Use Settings, then **Download a backup**, now and then. If you delete the app or clear Safari data, the notes go with it.
- **Reminder alerts:** turn on notifications in Settings. They fire while the app is open or was used recently. Phones don't let web apps wake themselves up on a schedule, so for a reminder that must alert you, tap the 📅 calendar button. It adds the reminder to your phone's calendar with an alert.
- **Speech-to-text** uses your phone's built-in recognition. If the mic doesn't work in your browser, tap the text box and use the keyboard's own mic key to dictate. It works the same way.
- **Cost:** free. Workers AI gives every account 10,000 "neurons" a day, which by rough estimate is about 100 recordings. Past that, sorting stops until midnight UTC, and your words stay saved. Nothing is charged unless you upgrade to Cloudflare's paid plan.
- **Store suggestions are general knowledge**, not live inventory or prices. Only deals you log have real prices. The free AI is good but not perfect, so read the list over and add anything it missed.
- **Privacy:** what you say is sent to Cloudflare's AI to be sorted. Don't use it for patient health information.

## Files

| Path | What it is |
| --- | --- |
| `public/` | The app: `index.html`, `app.js`, `styles.css`, plus the offline service worker and icons |
| `public/plan.js` | The Plan tab: party lists, where-to-buy matching, deals and photos |
| `src/index.js` | The Worker: serves the app and handles `POST /api/organize` and `POST /api/party` (calls Workers AI) |
| `scripts/bundle-public.mjs` | Packs `public/` into the Worker before each deploy |
| `wrangler.toml` | Cloudflare config |

To change how things get sorted or how party lists are built, edit `SYSTEM_PROMPT` or `PARTY_PROMPT` in `src/index.js` and run `npx wrangler deploy` again.

## Before a public launch

This version keeps everything on each person's phone, which is fine for trying it out. To launch it publicly you'd want:
- **Accounts and sync**, so lists and photos survive a lost phone and work across devices (e.g. Cloudflare D1 for data and R2 for photos).
- **Per-user limits instead of one shared passcode.** The free AI allowance (about 10,000 neurons a day) is shared by everyone using your Cloudflare account, so it won't stretch to many users without the paid plan.
- **A privacy policy and terms**, since people's voice notes and photos pass through the service.
- **A native app** (App Store / Play Store) if you want location reminders ("you're near Trader Joe's") or reliable background notifications. Web apps can't do either.
