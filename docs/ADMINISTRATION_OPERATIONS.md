# Administration and operations

Phase 10 replaces the legacy debug-oriented admin surface with a production
operations console backed by normalized PostgreSQL records. Every route derives
the actor from the authenticated server session. Browser-supplied roles, user
IDs, credit balances, and audit actors are ignored.

## Authorization

- `admin` and `owner` can view operational metrics, sources, listing evidence,
  user billing state, queues, support requests, feature flags, and audits.
- Both roles can maintain sources, review listings, perform reviewed merges,
  adjust Pilot Credits through append-only entries, resolve support, and retry
  dead-letter scan jobs.
- Only `owner` can disable or re-enable accounts and mutate feature flags.
- The active owner cannot disable its own account.
- All mutation routes pass through the existing authenticated and CSRF
  middleware before the platform-role check.

## Durable records

Migration `0008_administration_operations.sql` adds:

- `admin_audit_logs`: immutable actor, action, target, before/after state,
  reason, correlation ID, and timestamp.
- `feature_flags`: server-controlled rollout state. New flags default off.
- `support_requests`: review status, priority, assignment, and resolution.
- `application_errors`: safe operational error metadata without request bodies,
  secrets, stack traces, or query strings.

The migration extends the existing credit ledger so corrections can be signed
positive or negative `adjustment` rows. Historical rows are never rewritten.
The database rejects a correction that would create a negative balance.

## Listing review and merge safety

Listing corrections use an allowlist and preserve before/after state in the
audit. Sponsor URLs are revalidated by the existing public-URL boundary.
Administrators can approve, reject, mark suspicious, expire, or cancel a
listing. Evidence, official-rules versions, quality flags, and change history
remain visible.

Manual merge and reversal are PostgreSQL functions so source-link movement,
snapshots, and merge state change atomically. A merge retains both listing rows,
moves source attribution to the target, and stores restorable target, source,
and source-link snapshots. Undo restores both listing snapshots and attribution.

## Operational metrics

The console reports enabled accounts, paid subscribers, configuration-derived
MRR, current-month AI usage and Pilot Credit consumption, source and scanner
health, review/risk counts, Stripe webhook failures, queue failures, safe
application errors, failed URLs, dead letters, support requests, and provider
configuration health.

MRR is an operational estimate using the configured monthly catalog price for
active, trialing, and past-due paid subscriptions. Stripe remains authoritative
for settled revenue.

## Deployment and rollback

Apply `0008` after `0007`. The API service role requires the migration grants;
browser roles receive no direct access to Phase 10 tables or functions.

Rollback application code before database objects. Preserve audit logs, support
records, application errors, merge events, and credit-ledger adjustments as
operational evidence. Feature flags can be disabled without deleting them.

For a disposable PostgreSQL 16 validation database, apply migrations `0000`
through `0008` in filename order, then execute
`lib/db/test/phase10-live-smoke.sql` with `ON_ERROR_STOP` enabled. The smoke
proves signed credit idempotency, merge and undo attribution restoration, audit
immutability, and browser-role denial without using production data.
