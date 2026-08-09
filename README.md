# Myo Family Health — Main Hub

The single link that lives in the Myo Family Health Instagram bio. One page that gathers
every Myo Family Health resource — assessment, games, newsletter, research library,
contact and locations — plus a dedicated self-assessment tool.

**Breathe Better…Live Better!**

## Pages

| File | Contents |
|---|---|
| `index.html` | The hub. Hero, nine tappable link tiles (the Linktree layer), self-assessment feature, both games, "what is myofunctional therapy", newsletter signup, the free research library, booking band, contact & locations, footer with legal links. |
| `assess.html` | The free myofunctional self-assessment — 18 questions across 4 sections, scored, with a personalised result and next steps. |

## What links where

| Destination | URL |
|---|---|
| Book a free consultation | `https://amy-rondoni.clientsecure.me` |
| Phone | `707.631.1550` |
| Sleep Lab game | `https://myofamilyhealth.github.io/Sleep-Lab-Game/` |
| MyoLand game (ages 4–8) | `https://myofamilyhealth.github.io/myo-family-health-game/` |
| Newsletter form | Brevo (`sibforms.com`) embed — the same form as the newsletter landing page |
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
| `hub-gate-shown` / `-unlocked` / `-bypassed` | email gate lifecycle |
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
same Brevo list the newsletter form feeds, so an unlock and a newsletter subscription are
the same event.

- Configured at the top of `js/gate.js`. `scope: "site"` gates everything; `scope: "assess"`
  leaves the hub open and gates only the assessment; `enabled: false` turns it off.
- An unlocked visitor is remembered for a year (`localStorage`), so they are asked once.
- **"I already submitted my email"** lets returning subscribers — a second device, or
  someone who joined through the newsletter form — straight through without asking again.
- The email is validated client-side before anything is sent. Brevo answers
  `{"success":true}` to *any* input including malformed addresses, so that check is the
  only thing keeping typos off the list.
- A honeypot field (`email_address_check`) matches Brevo's own bot protection.

**It fails open, deliberately.** If storage is blocked, if `gate.js` 404s, if Brevo is
unreachable, or if the script never executes at all, the visitor gets in. A lead-capture
gate that locks people out of a healthcare site on a network error is worse than no gate.

> **This is lead capture, not access control.** The site is public and static — the HTML,
> CSS and JS are readable by anyone who views source, and the gate is bypassed by turning
> JavaScript off or by clicking the bypass link. Never put anything confidential behind it.

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
- Answers never leave the browser. Nothing is submitted, stored or transmitted, and no
  email is required to see a result. "Save or print my result" uses the browser's own
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
