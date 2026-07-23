# Data model

## Principles

- PostgreSQL is the production system of record; SQLite is a local demo and test
  adapter only.
- UUID primary keys, UTC timestamps, explicit foreign keys, check constraints,
  and indexes are used for operational records.
- User and organization ownership is explicit on private records and enforced by
  server authorization plus RLS where Supabase is used.
- Source evidence and rules versions are append-only. Duplicate merges and
  ledger corrections are reversible/additive and audited.
- Promotion identity is not inferred from title alone.

## Identity and tenancy

- `profiles`: private user profile, role, timezone, coarse eligibility location,
  onboarding state.
- `organizations`: personal or household workspace.
- `organization_memberships`: user, organization, role, status.
- `user_preferences`: categories, prize/effort/frequency, notification choices.
- `user_eligibility_profiles`: minimum required matching attributes and notes.

Full birth dates are private and excluded from public APIs and logs. Prefer a
derived age threshold or encrypted/private value when product requirements allow.

## Source and ingestion

- `sources`: approved source, access method, policy review, cadence, rate limit,
  attribution, enabled/health state.
- `source_scan_jobs`: immutable execution summary and transitions.
- `discovered_urls`: source URL, canonical URL, content hash, fetch state.
- `fetch_attempts`: bounded request evidence, response metadata, retry/error.
- `dead_letter_jobs`: failed work requiring operator review.

Unique/index inputs include `(source_id, canonical_url)`, source scheduling
fields, scan status/time, content hash, and health state.

## Normalized opportunities

- `sweepstakes`: normalized identity, sponsor, summary, official/rules URLs,
  dates, value, currency, frequency, effort/legitimacy/source scores, lifecycle.
- `sweepstakes_sources`: many-to-many source evidence for a promotion.
- `sweepstakes_prizes`: prize names, quantities, estimated values.
- `sweepstakes_eligibility`: age, countries/regions, residency and exclusions.
- `sweepstakes_entry_methods`: method, entry URL, frequency, purchase/social
  requirements, effort estimate.
- `sweepstakes_rules_versions`: immutable raw/cleaned rules evidence and hash.
- `sweepstakes_categories` and `sweepstakes_category_links`.
- `listing_quality_flags`: typed severity, evidence, review state.
- `sweepstakes_change_events`: append-only field changes and source.

Lifecycle states include `upcoming`, `active`, `expired`, `canceled`, and
`unverifiable`. Search indexes cover normalized title, sponsor, summary,
categories, prizes, eligibility, deadline, status, scores, and verification time.

## AI evidence and deduplication

- `ai_runs`: provider/model/prompt version, status, token/cost/latency, cache key.
- `extracted_fields`: typed value, confidence, source reference, evidence
  location, extraction time, review state.
- `duplicate_candidates`: signal breakdown, score, disposition.
- `sweepstakes_merges`: surviving/merged IDs, before state, actor, reason,
  reversal record.

Deduplication uses canonical/rules URLs, sponsor, normalized title, official ID,
dates, prize composition, and content similarity. Title similarity alone cannot
merge records.

## Personal workflow

- `user_saved_sweepstakes`: user, opportunity, saved time, priority, notes.
- `user_sweepstakes_status`: user-reported Interested/Saved/Entered/Enter Again/
  Skipped/Hidden/Won/Expired state and recurrence data.
- `user_sweepstakes_notes`: private notes.
- `user_search_profiles`: saved filters and alert state.
- `reminders`: timezone-aware deadline or recurring-entry schedule.
- `calendar_exports`: revocable export tokens or generated artifact metadata.

Uniqueness on `(user_id, sweepstakes_id)` prevents duplicate save/status rows.
Every query is scoped to the authenticated user and authorized organization.

## Catalog, billing, entitlements, and credits

- `plan_catalog`: configuration snapshot for Free Flight, Co-Pilot, Ace Pilot,
  Squadron; server-managed.
- `billing_customers`: user/org to provider customer.
- `subscriptions`: provider subscription/price, internal plan, status, periods.
- `entitlements`: feature limits and effective window.
- `billing_events`: unique provider event ID, processing status, error.
- `credit_ledger`: signed amount, type, reason, source, unique idempotency key,
  expiration, metadata.

The credit balance is the transactional sum of unexpired ledger entries. Feature
code cannot write a cached balance directly. Consumption and idempotent refund
run through one service and lock the owning account/ledger scope.

## Notifications and operations

- `notifications`: user, type, payload, dedupe key, read state.
- `notification_preferences`: in-app and email consent, digest/category
  preferences, unsubscribe timestamp.
- `notification_deliveries`: channel, provider ID, attempt/status/error.
- `digest_runs`: duplicate-safe daily/weekly delivery windows, item count,
  provider failure, completion.
- `custom_scanners`: approved filters/source scope, plan limit, cadence.
- `custom_scan_runs`: scheduled time, exact source scope, results, errors, and
  Pilot Credit idempotency reference.
- `audit_logs`: actor, action, target, before/after, reason, request correlation.
- `feature_flags`: controlled rollout and emergency disable.
- `admin_audit_logs`: immutable actor, action, target, before/after state,
  reason, correlation ID, timestamp.
- `support_requests`: user request, priority, status, assignment, resolution.
- `application_errors`: redacted route/error metadata for recent operations
  health; never request bodies or stack traces.

## Existing-data migration map

| Existing runtime table | Target |
| --- | --- |
| `organizations`, `organization_memberships` | Normalize and retain |
| `billing_subscriptions` | `billing_customers`, `subscriptions`, `billing_events`, entitlements |
| `sweepstakes` JSON payload | Normalized opportunity tables and source evidence |
| `discovery_jobs` | `source_scan_jobs` plus fetch attempts/dead letters |
| `assistant_tasks`, `extraction_jobs` | `ai_runs`, extracted fields, review queue |
| `entry_logs` | user status/history; reinterpret “submitted” as user-reported entered |
| `user_profiles` | profiles/preferences/eligibility |
| `app_settings` | user preferences plus operator configuration |
| `blocked_domains` | source/risk denylist with audit |
| `audit_logs` | normalized append-only audit records |
| `inbox_alerts` | notifications and review evidence |
| `rules_snapshots`, `rules_change_alerts` | rules versions, change events, notifications |

No Phase 0 data is deleted or rewritten.

