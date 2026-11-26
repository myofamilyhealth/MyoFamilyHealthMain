# Thought Sorter

Talk into your phone. Claude sorts what you said into **reminders** (with dates), a **to-do checklist**, and **notes grouped by topic**.

- **Talk tab:** tap the mic and ramble. Your words appear live, and you can fix anything before you tap **Organize**.
- **Organized tab:** reminders sorted by date, to-dos you can check off, and notes by topic. Tap the pencil to edit or the trash can to delete (with undo).

It's a web app you add to your home screen, so there's no App Store. A small Cloudflare Worker serves it and holds your Anthropic API key, so the key never sits on the phone.

## Set it up (about 10 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up), an Anthropic API key from [console.anthropic.com](https://console.anthropic.com), and Node.js on your computer.

```bash
cd voice-notes-app
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key
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
- **Cost:** each Organize is one Claude request, typically well under a cent for a minute or two of talking.
- **Privacy:** what you say goes to Anthropic's API to be sorted. Don't use it for patient health information.

## Files

| Path | What it is |
| --- | --- |
| `public/` | The app: `index.html`, `app.js`, `styles.css`, plus the offline service worker and icons |
| `src/index.js` | The Worker: serves `public/` and handles `POST /api/organize` (calls Claude) |
| `wrangler.toml` | Cloudflare config |

To change how things get sorted, edit `SYSTEM_PROMPT` in `src/index.js` and run `npx wrangler deploy` again.
