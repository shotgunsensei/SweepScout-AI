# Architecture

## Audit snapshot — 2026-07-22

### Detected stack

- Monorepo: pnpm workspace, Node.js 24, TypeScript 5.9.
- Web: React 19, Vite 7, Wouter, TanStack Query, Tailwind CSS 4, Radix UI,
  Lucide, Recharts, Sonner.
- API: Express 5, Zod, Pino, esbuild.
- Persistence: local `better-sqlite3` JSON-payload store is the practical
  development runtime. A Supabase/PostgreSQL adapter and a historical SQL
  migration exist, but the active Drizzle schema currently exports no tables.
- Auth: Supabase packages and an auth-client helper exist, but the Express cookie
  adapter is intentionally a no-op. There is no production user session
  middleware protecting the product routes.
- Billing: direct Stripe Checkout and signature verification exist for legacy
  Free/Pro/Power organization plans. There is no event ledger, customer portal,
  Play Pack Pilot catalog, or Pilot Credit ledger.
- AI: typed OpenAI extraction with structured validation, retry/fallback logic,
  scoring, risk flags, and configured model support.
- Background work: in-process inbox and rules-change polling. There is no durable
  queue, scheduler, lease, or dead-letter service.
- Discovery: mock and generic JSON search providers, canonical URL cleanup,
  imports, and browser-based extraction. There is no approved source registry or
  per-source adapter contract.
- Hosting: Replit autoscale configuration with frontend assets bundled into the
  Express build. No other deployment or monitoring provider is configured.
- Monitoring: Pino request/application logs and UI health summaries; no external
  error tracking, metrics, or tracing backend.
- Tests: no active lint, unit-test, integration-test, or E2E scripts. Typecheck,
  builds, HTTP smoke, and whitespace checks were the prior gates.

### Reusable systems

- Canonical URL normalization, source-domain blocking, discovery/import flows.
- AI rules extraction, structured validation, score calculation, risk flags,
  sponsor reputation, and low-confidence review concepts.
- Rules snapshots and meaningful-change monitoring.
- Manual, user-reported entry history and daily workflow calculations.
- Review-only IMAP inbox parsing with message de-duplication and no link opening.
- Audit-log model, organization concepts, server-side plan checks, and Stripe raw
  body/signature verification.
- Responsive React shell, reusable Radix primitives, loading states, toasts, and
  accessible confirmation dialogs.

### Obsolete or incorrect concepts

| Existing concept | Classification | Migration decision |
| --- | --- | --- |
| SweepScout AI name and compliance-console copy | Rename | Migrate to Play Pack Pilot language and aviation navigation |
| Form prefill and prefill queue | Remove from launch surface | Replace with non-mutating entry checklists; do not extend |
| Browser extension prefill experiment | Preserve offline only | Re-scope later; not an entitled launch capability |
| Expo/Android application | Remove | Stop building and remove workspace package after web migration |
| PWA companion route, manifest, service worker | Remove | Remove product route and packaging assumptions |
| “Submitted” records | Migrate | Treat as user-reported `Entered`, never sponsor-confirmed receipt |
| Winner-notification records | Migrate | Keep as review-only inbox/user status; never winner selection |
| Legacy Free/Pro/Power billing | Migrate | Replace with Free Flight/Co-Pilot/Ace Pilot/Squadron catalog |
| Process-wide active organization/user | Replace | Resolve identity and organization from authenticated request |
| SQLite JSON-payload schema | Preserve for demo/dev | Production data moves through versioned PostgreSQL migrations |
| Historical `.migration-backup` app | Preserve as reference | Never mount or deploy directly |

### Critical gaps and risks

1. Most API routes are unauthenticated and share a process-wide active tenant.
   Production use would permit cross-user state access.
2. The active Drizzle schema is empty; the historical Supabase schema is partial
   and does not represent current runtime tables.
3. Supabase auth does not persist/refresh Express cookies. Admin checks cannot
   identify a real production session as implemented.
4. CORS is permissive and API errors can disclose raw exception messages.
5. Stripe events are not stored idempotently, invoice events are not handled,
   and access can be changed without an append-only billing record.
6. The scanner lacks an approved-source registry, durable queue, SSRF controls,
   download limits, and redirect revalidation.
7. There is no authoritative Pilot Credit ledger or atomic consumption service.
8. In-process monitors are unsuitable for autoscale without distributed leases
   and duplicate-delivery controls.
9. Seeded demo data and a default Power subscription can resemble real
   entitlement unless production startup is hardened.

## Target architecture

```text
Browser
  -> Vite React application
  -> Express /api
       -> authenticated request context (user, org, role)
       -> service modules (catalog, credits, radar, saved, alerts, admin)
       -> PostgreSQL via Drizzle and versioned migrations
       -> durable jobs (scanner, AI, email, reminders)
       -> external providers (Supabase Auth, Stripe, OpenAI, email)

Approved source registry
  -> source adapter
  -> bounded fetch and evidence capture
  -> discovery URL + scan job
  -> extraction / normalization
  -> duplicate and risk review
  -> published opportunity
```

### Bounded modules

- `auth`: Supabase sign-in/session verification, request context, protected
  routes, owner promotion, account lifecycle.
- `profiles`: private profile, eligibility, preferences, household profiles.
- `catalog`: configuration-driven plans, limits, entitlements, operation costs.
- `billing`: Stripe customers/subscriptions/events and customer portal.
- `credits`: append-only ledger, atomic consume/grant/refund, idempotency.
- `sources`: approved source registry, policy review, cadence, health.
- `scanning`: scheduler, adapters, rate limiting, retries, dead letters.
- `extraction`: raw evidence, rules versions, typed AI provider, uncertainty.
- `opportunities`: normalized sweepstakes, prizes, eligibility, methods,
  categories, sources, quality flags, changes.
- `recommendations`: user match calculation and explanations.
- `tracking`: saves, notes, user-reported statuses, calendar/reminders.
- `alerts`: in-app/email notifications, digest scheduling, delivery records.
- `administration`: source/listing/billing/user/operations controls.
- `audit`: append-only material action history and correlation IDs.

## Security boundaries

- The API derives user, organization, role, subscription, and credit balance on
  the server for every protected operation.
- Service-role credentials never reach the browser.
- Stripe webhooks use the raw body, signature verification, a unique provider
  event ID, and transactional idempotent processing.
- Scanner destinations are selected from approved sources and revalidated after
  redirects. Private, loopback, link-local, metadata, and unsupported protocol
  destinations are denied.
- Sponsor links use safe external-link behavior. Inbox links never auto-open.
- Full birth dates and precise location are minimized, encrypted/protected by
  database policy, and redacted from logs.

