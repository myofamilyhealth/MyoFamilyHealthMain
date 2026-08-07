# Myo Family Health — Main Hub

The single link that lives in the Myo Family Health Instagram bio. One page that gathers
every Myo Family Health resource — assessment, games, newsletter, research library,
contact and locations — plus a dedicated self-assessment tool.

**Breathe Better…Live Better!**

## Pages

| File | Contents |
|---|---|
| `index.html` | The hub. Hero, nine tappable link tiles (the Linktree layer), self-assessment feature, both games, "what is myofunctional therapy", newsletter signup, the free research library, booking band, contact & locations, footer with legal links. |
| `assess.html` | The free myofunctional self-assessment — 24 questions across 4 sections, scored, with a personalised result and next steps. |

## What links where

| Destination | URL |
|---|---|
| Book a free consultation | `https://amy-rondoni.clientsecure.me` |
| Phone | `707.631.1550` |
| Main website | `https://www.myofamilyhealth.com/` |
| Sleep Lab game | `https://myofamilyhealth.github.io/Sleep-Lab-Game/` |
| MyoLand game (ages 4–8) | `https://myofamilyhealth.github.io/myo-family-health-game/` |
| Newsletter form | Brevo (`sibforms.com`) embed — the same form as the newsletter landing page |
| Research library | Individual `myofamilyhealth.com/resource/...` pages, grouped by topic |
| Social | Instagram, Facebook, YouTube — all `@myofamilyhealth` |

Outbound links to the games carry `utm_source` / `utm_medium` / `utm_content` so hub
traffic can be told apart from Instagram traffic in analytics.

## The self-assessment

Twenty-four questions in four sections — **Breathing & Airway**, **Sleep & Rest**,
**Mouth, Tongue & Jaw**, and **Eating, Speech & Habits**. Each is answered
Yes (2) / Sometimes (1) / No (0), for a maximum of 48.

- The visitor first picks whether they're answering for **themselves** or for **their
  child**; every question is re-worded to match.
- Result bands: **under 20 %** few signs · **20–44 %** some signs · **45 %+** many signs.
- A per-section breakdown explains which area is showing the most signs.
- Six specific answers raise a **"worth raising with a provider soon"** flag — witnessed
  apneas or gasping, habitual snoring, daytime sleepiness, a known tongue tie, a tongue
  that can't reach the palate, and ongoing jaw pain.
- Answers never leave the browser. Nothing is submitted, stored or transmitted, and no
  email is required to see a result. "Save or print my result" uses the browser's own
  print dialog, and a print stylesheet strips the navigation and buttons.

The result page ends on four next steps: book a free consultation, join the newsletter,
play Sleep Lab, or read the research.

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
js/site.js      nav shadow, mobile drawer, reveal-on-scroll
js/assess.js    assessment questions, scoring, result rendering
assets/         brand marks (logo, tree, square social image)
```

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
