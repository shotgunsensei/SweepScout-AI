# Play Pack Pilot brand system

## Source assets

The supplied originals are preserved without cropping, recoloring, stretching,
or destructive optimization:

| Asset | Repository path | Dimensions | Format | Use |
| --- | --- | ---: | --- | --- |
| Logo | `artifacts/sweepscout/public/brand/play-pack-pilot-logo-original.png` | 1024x1024 | PNG | Public navigation, app shell, and footer |
| Visual reference | `artifacts/sweepscout/public/brand/play-pack-pilot-visual-reference-original.png` | 1536x1024 | PNG | Internal design reference only |

Generated flight-deck artwork is stored as optimized WebP in
`artifacts/sweepscout/public/brand/illustrations/`. Use the wide social image
for Open Graph/Twitter metadata and reserve the other scenes for the public
hero, preflight setup, and a small number of high-value empty states.

The visual-reference image includes obsolete sweepstakes-administration copy,
so it is never rendered as product content. Its palette, typography direction,
aviation energy, icon line weight, and surface treatments informed the active
design system.

## Naming system

### Canonical product name

Use **Play Pack Pilot** in every customer-facing surface: web, mobile, browser
extension, reports, exports, metadata, support copy, and onboarding.

- Write the full name on first reference.
- Do not use “SweepScout,” “SweepScout AI,” “PPP,” or “PlayPackPilot” in prose.
- `PlayPackPilot` is acceptable only where spaces are technically invalid, such
  as a user-agent label.
- Internal package names, routes, database identifiers, migrations, and
  `SWEEPSCOUT_*` environment variables may keep their existing names when
  changing them would add migration risk without customer benefit.

Preferred plain-English descriptors are **AI sweepstakes discovery**, **AI
sweepstakes discovery and research**, and—where space is limited—**AI
opportunity radar**. Avoid “compliance console,” “command center,” gambling
language, and claims that imply entry submission or sponsor affiliation.

### Feature vocabulary

| Branded feature | Plain-English meaning | Preferred actions |
| --- | --- | --- |
| **Flight Deck** | Dashboard and today's opportunity plan | Review, prioritize, continue |
| **Opportunity Radar** | Sweepstakes and giveaway feed | Discover, filter, review |
| **Hangar** | Saved opportunities | Save, remove, organize |
| **Mission Log** | Entered, skipped, won, and expired activity | Report, update, review |
| **Flight Plan** | Schedule, reminders, and repeat-entry timing | Schedule, plan, remind |
| **Co-Pilot** | AI research assistant grounded in available sources | Ask, research, explain |
| **Source Radar** | Discovery jobs and source operations | Scan, monitor, review |
| **Pilot Credits** | Plan usage for metered actions | Use, review, manage |

Branded labels are navigation aids, not substitutes for clarity. Pair an
aviation term with a direct explanation in page descriptions, onboarding, empty
states, and first-use copy.

### Capitalization, actions, and status language

- Capitalize canonical feature names exactly as listed above.
- Use sentence case for buttons, secondary headings, status labels, and helper
  text. Use **AI** in uppercase.
- Prefer active, user-controlled verbs: **Visit Official Sweepstakes**, **Save
  to Hangar**, **Report entered**, **Review rules**, and **Run Source Radar**.
- Do not say that Play Pack Pilot “enters,” “submits,” “wins,” “guarantees,” or
  “verifies eligibility” for a user.
- Prefer **Eligible after review** or **Potential match** over “Guaranteed
  eligible.”
- Prefer **Rules reviewed**, **Source checked**, or **Last checked** over
  “Officially verified” unless the sponsor supplied that status.
- Use **User reported entered** and **User reported won**, not “Entry confirmed”
  or “Winner confirmed.”
- Use **Needs review**, **Source unavailable**, and **Details pending** for
  uncertainty. Use **High-risk signal** or **Review warning** rather than an
  unqualified “scam” declaration.

The canonical external action is **Visit Official Sweepstakes**. It opens the
sponsor-controlled page, remains visually distinct from internal “View details”
actions, and keeps a nearby explanation that Play Pack Pilot is not the sponsor
or promotion administrator.

## Semantic tokens

The source of truth is `artifacts/sweepscout/src/index.css`.

- Background: Midnight `#0D1624` with deep flight-deck `#07101E`.
- Navigation: `#091426`.
- Elevated panel/card: `#101E32` / `#10223C`.
- Primary action/data signal: Signal cyan `#22D3EE`.
- Secondary action: Electric blue `#2563EB`.
- Accent: Flight violet `#7C3AED`.
- Reward CTA: Reward gold `#FBBF24`.
- Primary text: Cloud white `#F8FAFC`.

Additional semantic tokens cover success, warning, danger, information, focus,
charts, match scores, source confidence, and listing risk. Components must use
tokens instead of introducing local brand hex values.

## Typography

- Display: Plus Jakarta Sans 600-800 for major headings and brand lockups.
- Body: Inter 400-800 for readable product and data copy.
- Fallback: system sans-serif remains usable when the external font host is
  blocked. No content or layout depends on a font download.

## Product posture

The UI uses aviation/radar metaphors, not casino mechanics. Gold is reserved for
rewards and high-intent CTAs, never animated betting cues. Opportunity cards
show sponsor identity, deadline, evidence/risk language, and a safe external
action labeled `Visit Official Sweepstakes`.

Thematic navigation always retains a clear description:

- Flight Deck — dashboard.
- Opportunity Radar — sweepstakes and giveaway feed.
- Hangar — saved opportunities.
- Mission Log — entered and skipped tracking.
- Flight Plan — daily schedule and reminders.
- Co-Pilot — AI research assistant.
- Source Radar — approved discovery operations.
- Pilot Credits & Billing — plan and usage.

## Accessibility and responsive behavior

- One semantic `main` and one `h1` on the public page.
- Heading hierarchy contains no skipped levels.
- Interactive controls have accessible names and at least 40px targets.
- Focus uses a 3px signal-cyan outline.
- Motion is disabled through `prefers-reduced-motion`.
- The public page has no horizontal overflow at 375, 768, 1024, or 1440px.
- Sponsor links use a new tab with `noopener noreferrer`.

