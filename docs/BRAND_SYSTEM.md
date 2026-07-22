# Play Pack Pilot brand system

## Source assets

The supplied originals are preserved without cropping, recoloring, stretching,
or destructive optimization:

| Asset | Repository path | Dimensions | Format | Use |
| --- | --- | ---: | --- | --- |
| Logo | `artifacts/sweepscout/public/brand/play-pack-pilot-logo-original.png` | 1024x1024 | PNG | Public navigation, hero, app shell, footer, social and icon source |
| Visual reference | `artifacts/sweepscout/public/brand/play-pack-pilot-visual-reference-original.png` | 1536x1024 | PNG | Internal design reference only |

The visual-reference image includes obsolete sweepstakes-administration copy,
so it is never rendered as product content. Its palette, typography direction,
aviation energy, icon line weight, and surface treatments informed the active
design system.

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

- Display: Orbitron 600-800 for major headings and brand lockups.
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
- Radar — opportunity feed.
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

