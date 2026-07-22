# Implementation plan

This plan preserves working discovery and analysis code while replacing unsafe
or obsolete product boundaries. Each phase gets its own migration(s), automated
tests, validation record, and commit. A phase is not complete because a page
exists; its server-side behavior and persistence must work.

## Phase status

| Phase | Scope | Status after audit |
| ---: | --- | --- |
| 0 | Audit and product reset | Complete in documentation; validation required before commit |
| 1 | Logo and design system | Next; assets supplied outside repo |
| 2 | Authentication and profiles | Blocked on normalized PostgreSQL schema/session middleware |
| 3 | Sweepstakes/source data model | Required; active Drizzle schema is empty |
| 4 | Compliant scanner | Reuse discovery primitives; source registry/queue missing |
| 5 | AI extraction, dedupe, scoring | Substantial reusable code; evidence model/provider ledger missing |
| 6 | Radar and opportunity detail | Existing data UI is reusable but needs real normalized queries |
| 7 | Hangar, Mission Log, personalization | Manual entry code reusable; user isolation and save model missing |
| 8 | Subscriptions and Pilot Credits | Legacy billing must be replaced |
| 9 | Alerts, digests, custom scans | Rules/inbox alerts reusable; delivery/scheduler missing |
| 10 | Administration and operations | Partial UI/audit concepts; role and operations controls incomplete |
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

