# Myo Family Health — Main Hub

The single link that lives in the Myo Family Health Instagram bio. One page that gathers
every Myo Family Health resource — assessment, games, research library, contact and
locations — plus a dedicated self-assessment tool.

**Breathe Better…Live Better!**

## Pages

| File | Contents |
|---|---|
| `index.html` | The hub. Hero, six tappable link tiles (the Linktree layer), self-assessment feature, the free research library, both games, "what is myofunctional therapy", booking band, contact & locations, footer. |
| `assess.html` | The free myofunctional self-assessment — 18 questions across 4 sections, scored, with a personalised result and next steps. |

## What links where

| Destination | URL |
|---|---|
| Book a free consultation | `https://amy-rondoni.clientsecure.me` |
| Phone | `707.631.1550` |
| Sleep Lab game | `https://myofamilyhealth.github.io/Sleep-Lab-Game/` |
| MyoLand game (ages 4–8) | `https://myofamilyhealth.github.io/myo-family-health-game/` |
| Brevo list | `sibforms.com` — reached only through the email gate; the hub has no on-page signup form |
| Free guides (site) | `https://myofamilyhealth.github.io/instagramfree/` — the guides landing page |
| Free guides (PDFs) | `…/instagramfree/pdfs/{breathing,tongue-posture,growing-smiles,sleep-airway}.pdf` |
| Social | Instagram, Facebook, YouTube — all `@myofamilyhealth` |

Outbound links to the games carry `utm_source` / `utm_medium` / `utm_content` so hub
traffic can be told apart from Instagram traffic in analytics.

## Analytics

GoatCounter, cookieless, on the same account as the free guides site so everything lands
on one dashboard: **https://nathanrondoni.goatcounter.com**

Page views are automatic. Click events are named and sent for the games, the assessment,
each guide PDF, booking, the phone number, social, the email gate — and any other outbound
link, including ones added later, which are picked up automatically from the URL.

Every event from this site is prefixed `hub-` so it stays separate from the guides site,
which posts bare `guide-<slug>` events to the same account.

| Event | Fires when |
|---|---|
| `hub-assessment-open` | a link into the assessment is clicked |
| `hub-assess-start-self` / `-child` | the visitor picks who they're answering for |
| `hub-assess-complete-low` / `-mod` / `-high` | the result screen is reached |
| `hub-assess-print` | "Save or print my result" |
| `hub-game-sleep-lab`, `hub-game-myoland` | a game is opened |
| `hub-guide-<slug>` | a guide PDF is opened |
| `hub-guides-site` | the guides landing page is opened |
| `hub-booking`, `hub-call` | booking page, phone number |
| `hub-gate-shown` / `-unlocked` | email gate lifecycle |
| `hub-breathe-start` / `-3` | breathing pacer started / three breaths completed |
| `hub-assess-sent` | a visitor chose to send their result to Amy |
| `hub-out-<host><path>` | any other outbound link |

Configured at the top of `js/analytics.js`: `window.GC_CODE` (same variable name the guides
site uses), plus `prefix`, `trackResultBand` and `debug`. Setting `GC_CODE` to `""` turns
tracking off entirely with no other change.

`analytics.js` must stay ahead of `gate.js` in the `<head>` — deferred scripts run in
document order, and the gate reports `hub-gate-shown` on its very first call.

**What it can and cannot tell you.** GoatCounter gives counts, not people: "23 opened Sleep
Lab today", never "this visitor opened Sleep Lab". No cookies, no identifier, no way to
follow one person between events. Never sent: the email entered at the gate, any assessment
answer, or anything typed into any field. The assessment reports only its outcome band; set
`trackResultBand: false` to stop even that.

## The email access gate

Visitors give an email address before the site unlocks. The address goes straight to the
Brevo mailing list, so an unlock and a list subscription are the same event. Since the hub
no longer carries an on-page signup form, this gate is the only route onto the list — which
is why the overlay's fine print has to keep saying what the address is used for.

- Configured at the top of `js/gate.js`. `scope: "site"` gates everything; `scope: "assess"`
  leaves the hub open and gates only the assessment; `enabled: false` turns it off.
- An unlocked visitor is remembered for a year (`localStorage`), so they are asked once.
- The email is validated client-side before anything is sent. Brevo answers
  `{"success":true}` to *any* input including malformed addresses, so that check is the
  only thing keeping typos off the list.
- A honeypot field (`email_address_check`) matches Brevo's own bot protection.

**It fails open, deliberately.** If storage is blocked, if `gate.js` 404s, if Brevo is
unreachable, or if the script never executes at all, the visitor gets in. A lead-capture
gate that locks people out of a healthcare site on a network error is worse than no gate.

> **This is lead capture, not access control.** The site is public and static — the HTML,
> CSS and JS are readable by anyone who views source, and the gate is bypassed by turning
> JavaScript off. Never put anything confidential behind it.

## The breathing pacer

A circle that grows for four seconds on the inhale and shrinks for six on the exhale.
The long exhale is the point — it is the half that settles the nervous system, and the
half people skip. There are deliberately **no breath-holds**: this audience includes
people being screened for sleep-disordered breathing, and a hold is the one phase that
can make air hunger worse.

`js/breathe.js` defines it once and mounts it in two places:

- **Inside the email gate**, compact, *above* the form. It is the first thing a visitor
  can actually do, and it needs no email — so the address is asked for by a site that has
  already given something. The gate's own copy leads with it ("Breathe with us for one
  minute").
- **On the hub** as the `#breathe` section, which is the reason to come back on an
  ordinary day rather than once.

Any `.breathe-panel` on the page is mounted automatically; the gate mounts its own copy
by hand with `{ compact: true }`.

- It is presentation only. Nothing is timed against a hidden clock, stored, or sent.
- The pacer **cannot unlock the site** — only submitting a valid address does.
- `gate.js` mounts it inside a `try`, so a missing or broken `breathe.js` leaves a
  working gate behind.
- It stops itself when the tab is hidden, rather than drifting out of sync with a person
  who walked away.
- Under `prefers-reduced-motion` the circle stops resizing entirely and the phase word
  plus a second-by-second countdown carry the pace instead — the exercise still works, it
  just stops moving.
- A safety line sits under it: breathe gently, stop if you feel light-headed.

## Collecting assessment results

The assessment stays private by default. `js/collect.js` adds one thing: a card on
the result screen offering to send that result to Amy, and it **only ever sends when
the visitor taps it**. Finishing the assessment sends nothing.

**It is off until configured, and the page's copy follows the switch.** With
`CONFIG.action` empty, `mfhCollect.ready()` is false, no card renders, nothing is
transmitted, and assess.html's "Nothing you answer is sent anywhere" stands unaltered
and true. Fill the config in and `collect.js` rewrites those two lines itself — the
badge becomes "Private — you choose what to send" and the intro gains "nothing is sent
unless you do". The promise on the page and the behaviour of the code are driven by the
same switch, so they cannot drift apart. Never hand-edit one without the other.

### Setting it up

1. **Build a Google Form** with a short-answer question per column you want. A
   sensible order: email, who it's for, score, percent, band, flags, then one per
   assessment question (18). Point its responses at a Sheet.
2. **Pull the field IDs** — Google hides them in the page source, so:
   ```bash
   tools/form-fields.sh 'https://docs.google.com/forms/d/e/YOUR_FORM/viewform'
   ```
   It prints the `formResponse` action URL and every `entry.NNNNNNN` with its question
   title, in form order.
3. **Paste them into the CONFIG block** at the top of `js/collect.js`. `answers` takes
   18 ids in assessment order. Any field left blank is simply omitted from the POST, so
   a half-filled config sends less rather than failing.

Google's `formResponse` endpoint takes an ordinary POST and needs no API key — which
matters here, because anything secret placed in this file would be readable by anyone
viewing source on a static site.

### What gets sent, and what doesn't

Sent, and only on a tap: the email (reused from the gate, never re-typed), whether the
answers were for themselves or a child, the score, percentage, band, which red flags
fired, and all 18 answers **as the words the visitor saw** — "Yes" / "Sometimes" /
"No", not indices — so the Sheet is readable without a decoder.

Never sent: anything at all before the tap. The reply is unreadable by design (Google
sends no CORS headers on `formResponse`, so the request goes out `no-cors`), which
means the card can honestly say "sent" and nothing more. The button disables itself
afterwards so a result cannot be submitted twice.

> **This is identifiable health information.** Snoring, witnessed apneas, a child's
> feeding history — tied to an email address. Before switching it on, the site needs a
> privacy policy that says you collect it, and the destination needs to be somewhere
> appropriate to keep it. A consumer Google account is not covered by a HIPAA business
> associate agreement; if this data informs care you provide, take advice on where it
> is allowed to live.

## The self-assessment

Eighteen questions in four sections — **Breathing & Airway** (6), **Sleep & Rest** (6),
**Tongue & Mouth** (2), and **Eating & Habits** (4). Each is answered
Yes (2) / Sometimes (1) / No (0), for a maximum of 36.

- The visitor first picks whether they're answering for **themselves** or for **their
  child**; every question is re-worded to match.
- Result bands: **under 20 %** few signs · **20–44 %** some signs · **45 %+** many signs.
- A per-section breakdown explains which area is showing the most signs.
- Five specific answers raise a **"worth raising with a provider soon"** flag — witnessed
  apneas or gasping, habitual snoring, daytime sleepiness, a known tongue tie, and a
  tongue that can't reach the palate.
- Answers never leave the browser on their own, and no email is required to see a
  result. Result sharing is opt-in and off unless configured — see above. "Save or print my result" uses the browser's own
  print dialog, and a print stylesheet strips the navigation and buttons.

The result page ends on a single next step: book a free consultation.

A medical disclaimer sits under the assessment and in the site footer: this is an
educational screening tool, not a diagnosis, and not a substitute for evaluation by a
qualified provider.

## Design

Brand tokens are shared with the newsletter landing page and the games, sampled from the
Myo Family Health logo — teal `#78B4B4`, deep teal `#457F7C`, mint `#EAF4F3`, charcoal
`#3C4242`, warm sand `#F0EDE5`. Type is DM Sans with Newsreader italic for accents.

Mobile-first, since the link sits in an Instagram bio: single-column tiles below 640 px,
a slide-in drawer for navigation below 1080 px, no horizontal overflow at 390 px, and
`prefers-reduced-motion` respected throughout.

## Structure

```
index.html      hub page
assess.html     self-assessment
css/site.css    design tokens + every component, shared by both pages
js/gate.js      email access gate (config block at the top of the file)
js/breathe.js   guided nasal breathing pacer (gate + hub section)
js/collect.js   opt-in result sharing (config block at the top of the file)
tools/          form-fields.sh — pulls entry IDs out of a Google Form
js/site.js      nav shadow, mobile drawer, reveal-on-scroll
js/assess.js    assessment questions, scoring, result rendering
assets/         brand marks (logo, tree, square social image)
```

Both HTML files carry a small inline script in `<head>` that flags the document before
first paint, so page content is never flashed behind the gate.

No build step, no dependencies, no framework. Plain HTML, CSS and JavaScript.

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

The site is static and deploys as-is to GitHub Pages. In **Settings → Pages**, set the
source to this branch with the folder set to `/ (root)`. It will then serve at
`https://myofamilyhealth.github.io/MyoFamilyHealthMain/`, which is the URL the canonical
tags and social preview images already point at. If the site ends up on a different path
or a custom domain, update the `og:image` and `canonical` URLs in the two HTML heads.
