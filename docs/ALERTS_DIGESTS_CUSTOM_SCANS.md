# Alerts, digests, and custom scans

Phase 9 turns Play Pack Pilot into an ongoing monitoring service. It creates in-app notifications, optional email briefings, user-reported entry reminders, and plan-gated custom scans. It never submits an entry, opens inbox links, represents a sponsor, or bypasses source policy.

## Architecture

- `notifications` is the user-owned, duplicate-safe in-app event stream.
- `notification_preferences` stores channel and digest consent. Disabling email writes `email_unsubscribed_at`; in-app alerts can remain enabled.
- `notification_deliveries` reserves idempotent per-channel delivery state for email now and browser/SMS/mobile providers later.
- `digest_runs` prevents duplicate daily or weekly briefings and retains failures.
- `custom_scanners` stores allowlisted filters, approved source IDs, cadence, and the next server run.
- `custom_scan_runs` retains sources, filters, match counts, result summaries, errors, and the exact Pilot Credit idempotency key.
- `generate_phase9_notifications` creates ending-soon, entry-due, rules/deadline change, cancellation, confidence, scan-completion, low-credit, and payment-failure alerts with unique dedupe keys.
- Saved search profiles produce high-match alerts through the existing personalized Radar query.

The scheduler claims due scanners with `FOR UPDATE SKIP LOCKED`, uses the existing approved-source adapters, and charges through the Phase 8 `withPilotCredits` service. An all-source failure creates an auditable failed run and triggers the exact idempotent refund path.

## Plan limits

Free Flight and Co-Pilot cannot create custom scanners. Ace Pilot defaults to five profiles, 25 runs per month, and a minimum daily cadence. Squadron defaults to 20 profiles, 100 runs per month, and a minimum six-hour cadence. All values are server-configurable through `.env.example`. Each execution consumes `PILOT_CREDIT_COST_CUSTOM_SCAN`.

## Email and schedules

Email is disabled unless all of the following are set:

```text
PLAYPACKPILOT_ALERTS_ENABLED=true
PLAYPACKPILOT_EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
EMAIL_FROM=verified-sender@example.com
EMAIL_API_KEY=server-secret
```

Daily briefings are claimed at 08:00 in the profile timezone. Weekly briefings are claimed Monday at 09:00. Empty digests are recorded as skipped. Provider errors are recorded as failed without marking delivery successful. Emails include sponsor/official-rules safety copy, a preference-management link, and a `List-Unsubscribe` header. Resend is the only implemented email transport; browser push, SMS, and mobile push remain interfaces only and cannot send.

## Operations

Apply `lib/db/migrations/0007_alerts_digests_custom_scans.sql` after `0006`. Set `PLAYPACKPILOT_ALERTS_ENABLED=true` only after Supabase, approved sources, scheduler ownership, and observability are configured. In horizontally scaled deployments, the database claim function prevents the same due scanner from being claimed concurrently.

To suspend monitoring, set `PLAYPACKPILOT_ALERTS_ENABLED=false`. To stop outbound email independently, set `PLAYPACKPILOT_EMAIL_ENABLED=false`. Preserve notification, delivery, digest, scan-run, and credit-ledger records during rollback; they are operational and billing evidence.
