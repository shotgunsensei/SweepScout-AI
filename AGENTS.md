# Play Pack Pilot repository instructions

## Authoritative product boundary

Play Pack Pilot is an AI-assisted sweepstakes and giveaway discovery SaaS for
`playpackpilot.com`. It discovers promotions from explicitly approved public
sources, normalizes and analyzes their rules, helps users decide what fits, and
links users to the sponsor's official site.

Play Pack Pilot does not administer promotions, accept entries, choose winners,
hold prizes, collect entry fees, sell improved odds, or automatically submit
entries. Never describe the product as a sweepstakes operator or entrant
management system.

## Required working rules

- Read this file and the relevant documentation under `docs/` before changing a
  product boundary, database table, auth flow, billing flow, scanner, or public
  claim.
- Preserve source attribution, sponsor links, official-rules links, and the
  review-only handling of verification and claim links.
- Use only approved source adapters. Do not bypass authentication, CAPTCHAs,
  anti-bot controls, paywalls, robots/terms review, or configured rate limits.
- Derive the user and organization from an authenticated server session. Never
  trust a browser-supplied user or organization identifier.
- Enforce plan limits, Pilot Credit costs, and platform roles server-side.
- Keep billing separate from promotion entry. Pilot Credits are non-transferable
  internal usage units with no cash or prize value.
- Use additive, reversible migrations. Do not use destructive database resets.
- Do not store secrets, full birth dates in logs, or unnecessary promotion-page
  personal data.
- Do not auto-open inbox links. Verification, claim, and suspicious links must
  remain review-only.
- Keep pricing, plan limits, credit grants, operation costs, and Stripe Price IDs
  configuration-driven.
- Add automated tests for material behavior and run the available typecheck,
  build, tests, migration validation, and smoke checks before claiming a phase is
  complete.

## Repository map

- `artifacts/sweepscout`: Vite, React 19, Tailwind CSS 4 web application. This is
  being migrated to the Play Pack Pilot brand.
- `artifacts/api-server`: Express 5 API and background monitor entrypoint.
- `artifacts/sweepscout-extension`: existing review/prefill browser-extension
  experiment; not part of the launch product until it is re-scoped and approved.
- `artifacts/sweepscout-mobile`: obsolete Expo/Android concept. Do not extend it.
- `lib/db`: target PostgreSQL/Drizzle schema and migrations.
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`: API contract/codegen
  scaffolding.
- `.migration-backup`: historical Next/Supabase implementation reference only;
  do not treat it as active runtime code.

## Validation commands

Use pnpm through Corepack.

```text
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm --dir artifacts/api-server run build
corepack pnpm --dir artifacts/sweepscout run build
git diff --check
```

The current repository does not yet provide lint, unit-test, integration-test,
or E2E scripts. Add those gates as behavior is migrated.

