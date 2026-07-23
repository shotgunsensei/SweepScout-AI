# Implementation plan

This plan preserves working discovery and analysis code while replacing unsafe
or obsolete product boundaries. Each phase gets its own migration(s), automated
tests, validation record, and commit. A phase is not complete because a page
exists; its server-side behavior and persistence must work.

## Phase status

| Phase | Scope | Status after audit |
| ---: | --- | --- |
| 0 | Audit and product reset | Complete in documentation; validation required before commit |
| 1 | Logo and design system | Complete; originals preserved, public experience and app shell migrated |
| 2 | Authentication and profiles | Blocked on normalized PostgreSQL schema/session middleware |
| 3 | Sweepstakes/source data model | Required; active Drizzle schema is empty |
| 4 | Compliant scanner | Reuse discovery primitives; source registry/queue missing |
| 5 | AI extraction, dedupe, scoring | Substantial reusable code; evidence model/provider ledger missing |
| 6 | Radar and opportunity detail | Existing data UI is reusable but needs real normalized queries |
| 7 | Hangar, Mission Log, personalization | Manual entry code reusable; user isolation and save model missing |
| 8 | Subscriptions and Pilot Credits | Legacy billing must be replaced |
| 9 | Alerts, digests, custom scans | Complete: duplicate-safe alerts, opt-in email digests, server scheduler, approved-source scans, plan limits, and Pilot Credit enforcement |
| 10 | Administration and operations | Complete: normalized operations dashboard, source/listing/user/billing controls, provider health, dead letters, feature flags, and immutable audits |
| 11 | Security, privacy, policies | Required after the request-context and scanner changes |
| 12 | E2E and deployment readiness | Cannot be claimed until prior gates pass |

## Dependency order

1. Establish brand/tokens and remove obsolete public/PWA navigation without
   deleting reusable backend code.
2. Create versioned PostgreSQL schema and migration runner.
3. Add authenticated request context and tenant-scoped repository interfaces.
4. Migrate source/opportunity data and approved scanning.
5. Attach AI evidence, dedupe, scoring, and review to normalized records.
6. Build Radar, details, Hangar, Mission Log, and reminders on real APIs.
7. Add catalog, Stripe event synchronization, entitlements, and Pilot Credits.
8. Add alerts/digests, operations, policy pages, hardening, and full E2E proof.

## Phase acceptance gates

- No unprotected tenant/user data routes.
- No browser-trusted entitlement, price, balance, or organization ID.
- No automatic entry submission or inbox-link opening.
- No source fetch without an approved source and bounded destination policy.
- Migration forward path and rollback notes exist.
- Typecheck, unit tests, integration tests, production build, and relevant browser
  smoke pass; unavailable external integrations are reported as gated.
- Responsive QA at 375, 768, 1024, and 1440 pixels for changed customer flows.

## Phase 0 validation record

Audit date: 2026-07-22.

- Worktree began clean on `main` at `14275a2`.
- No repository-owned `AGENTS.md` existed before this phase; dependency-owned
  files under `node_modules` are out of scope.
- Supplied style sheet: 1536x1024 PNG, 1,807,449 bytes.
- Supplied logo: 1024x1024 PNG, 1,367,544 bytes.
- Neither supplied asset was previously stored in the repository.
- Safe baseline validation and post-change results are recorded in the commit
  handoff rather than overstated here.

## Phase 9 validation record

Implementation date: 2026-07-23.

- Migration `0007_alerts_digests_custom_scans.sql` adds user-owned notifications,
  read-only RLS, channel delivery state, digest runs, scanner profiles, scan-run
  audit history, duplicate prevention, and safe concurrent scanner claims.
- Email remains explicit opt-in and disabled until both the scheduler and the
  Resend transport are configured server-side.
- Custom scans use only policy-approved source adapters, are limited by paid
  plan, consume the central Pilot Credit ledger, and refund all-source failures
  idempotently.
- API, database, UI contract, production-build, clean PostgreSQL migration, and
  mobile/desktop browser gates are recorded in the Phase 9 commit handoff.

## Phase 10 validation record

Implementation date: 2026-07-23.

- Migration `0008_administration_operations.sql` adds append-only admin audits,
  feature flags, support review, safe application errors, signed credit
  adjustments, and transactional manual merge/reversal functions.
- Every Phase 10 route derives the admin or owner role and actor ID from the
  authenticated server session. Account access and feature flags require owner.
- Sources, listing evidence and decisions, user billing and credit history,
  queue/provider health, dead letters, support, and audit evidence are available
  through the protected Platform Operations console.
- API, database, UI, clean-migration, production-build, and browser validation
  results are recorded in the Phase 10 commit handoff.
