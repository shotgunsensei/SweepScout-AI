# SweepScout AI

SweepScout AI is a personal sweepstakes discovery, compliance, and assisted-entry tracker built with Next.js App Router, TypeScript, TailwindCSS, Supabase Postgres/Auth, Playwright, and the OpenAI API.

The core safety rule is enforced throughout the codebase: the app does not bypass CAPTCHAs, bot protection, rate limits, purchase requirements, or submit entries without explicit user approval.

## Features

- Landing dashboard with risk, eligibility, queue, and entry metrics
- Sweepstakes database with rules, prize, eligibility, and risk metadata
- Discovery jobs backed by a pluggable, rate-limited search provider
- OpenAI Responses API rules extraction with strict JSON schema and Zod validation
- Scam and eligibility scoring with explicit risk flags
- Form assistant queue that stages fields but preserves manual approval
- Entry log with per-entry review confirmation and manual submission records
- Secure profile vault with default-hidden sensitive fields, prefill consent, alternate email, and eligibility preferences
- Settings page for thresholds, automation toggles, locked manual approval, and runtime status
- Local owner admin/debug panel with job logs, failed URLs, blocklist controls, raw extraction JSON, and CSV export
- Service-side audit log for discovery, extraction, scoring, settings, prefill, blocklist, and entry events
- Supabase Postgres/Auth when configured
- SQLite local fallback when Supabase env vars are missing
- Vercel-compatible background job route at `/api/jobs/discovery`

## Environment

Copy the example file and fill in the values you have:

```bash
cp .env.example .env.local
```

```bash
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BROWSER_HEADLESS=true
OPENAI_MODEL=gpt-4.1-mini
LOCAL_SQLITE_PATH=.data/sweepscout.sqlite
CRON_SECRET=
SWEEPSCOUT_USER_ID=
SWEEPSCOUT_ADMIN_EMAILS=
SWEEPSCOUT_ADMIN_USER_IDS=
SWEEPSCOUT_LOCAL_ADMIN=
SEARCH_PROVIDER=mock
SEARCH_PROVIDER_ENDPOINT=
SEARCH_PROVIDER_API_KEY=
```

If the three Supabase variables are missing, the app uses `.data/sweepscout.sqlite`. If `OPENAI_API_KEY` is missing, rules extraction is disabled at runtime and records a clear configuration error instead of making a live API call.

## Local Setup

```bash
pnpm install
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Supabase Setup

1. Create a Supabase project.
2. Apply the SQL files in `supabase/migrations` in filename order.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`.

The migration enables RLS on every public table and uses ownership policies based on `auth.uid() = user_id`. Server-side app operations use the service role so the personal seed data can be created without exposing privileged credentials in the browser.

Generated-style Supabase types live in `src/lib/database.types.ts`. If you run Supabase CLI type generation later, replace that file with the CLI output.

## Admin Debug Panel

The admin/debug panel lives at `/dashboard/admin`. It includes discovery logs, extraction logs, failed URLs, blocked domains, raw AI extraction JSON, retry extraction controls, re-score controls, and an entry CSV export at `/api/admin/export/entries`.

It also includes an audit log timeline for safety-relevant events such as discovery completion, extraction failures, blocked domains, profile/settings changes, assisted prefill, and manual entry status changes.

Admin access is checked in the page, server actions, and CSV route. In Supabase mode, grant a trusted role through `auth.users.raw_app_meta_data`, such as:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"sweepscout_role":"owner"}'::jsonb
where email = 'you@example.com';
```

`sweepscout_role`, `role`, or `roles` may include `owner` or `admin`. You can also set `SWEEPSCOUT_ADMIN_EMAILS` or `SWEEPSCOUT_ADMIN_USER_IDS` as a server-only allowlist. SQLite development mode grants local-owner access by default outside production; set `SWEEPSCOUT_LOCAL_ADMIN=true` only if you intentionally need local admin in a production-like SQLite deployment.

## Background Jobs

The Vercel cron config calls:

```text
POST /api/jobs/discovery
```

Set `CRON_SECRET` to require:

```text
Authorization: Bearer <CRON_SECRET>
```

Local manual run:

```bash
pnpm job:discovery
```

Direct API run:

```bash
curl -X POST http://localhost:3000/api/discovery/run \
  -H "content-type: application/json" \
  -d '{"maxResults":10,"domainBlacklist":["example-spam.test"]}'
```

Discovery uses `SEARCH_PROVIDER=mock` by default. A custom JSON provider can be enabled with `SEARCH_PROVIDER=json-http`, `SEARCH_PROVIDER_ENDPOINT`, and optional `SEARCH_PROVIDER_API_KEY`. The endpoint should return either `results` with `{ title, url, snippet }` entries or SerpAPI-style `organic_results` with `{ title, link, snippet }`.

## Rules Extraction

Run extraction for a discovered sweepstake:

```bash
curl -X POST http://localhost:3000/api/sweepstakes/<id>/extract
```

The pipeline performs a read-only load of the sweepstakes page, checks robots.txt, finds an official-rules link when present, extracts visible text, sends the text to OpenAI with structured JSON output, validates the response with Zod, and stores the normalized fields back on the sweepstakes record.

Records are marked `suspicious` when extraction finds sensitive-data requests, payment or purchase requirements, hidden rules, missing sponsor or deadline, unrealistic prize claims, or sponsor/form domain mismatch. The legacy `/api/extraction/<id>` endpoint remains available as a compatibility alias.

## Eligibility & Risk Scoring

Run scoring for a tracked sweepstake:

```bash
curl -X POST http://localhost:3000/api/scoring/<id>
```

The response includes `status`, `scam_score`, `compliance_notes`, and the updated sweepstake. Scoring compares each item to the profile vault, marks expired and profile-ineligible records, flags purchase/no-purchase issues as suspicious, preserves CAPTCHA as manual-only, detects duplicate source/form URLs, and writes reminder guidance from entry frequency.

## Assisted Form Prefill

Start a user-approved prefill:

```bash
curl -X POST http://localhost:3000/api/forms/prefill \
  -H "content-type: application/json" \
  -d '{"sweepstakeId":"<id>","formUrl":"https://example.com/enter","userApproved":true}'
```

The UI entry point is `/dashboard/entries/queue`, and completed prefill attempts open at `/dashboard/entries/<entry-id>/review`. Playwright fills only profile-backed fields, never submits forms, never solves CAPTCHA, leaves terms and consent checkboxes for the user, captures a screenshot, and saves the attempt as `prefilled`.

Prefill is gated by three controls: form prefill must be enabled in Settings, the profile vault must have confirmed prefill consent, and the individual entry must be approved by the user.

Blocked domains are honored before a browser session opens. The assistant does not click submit controls, press Enter to submit, accept terms, hide automation, use proxies, or solve CAPTCHA.

## Secure Profile Vault

The vault lives at `/vault` and stores legal name, email, optional alternate email, phone, mailing address, date of birth, state/country, and sweepstakes category preferences. Sensitive contact fields are collapsed by default.

SweepScout intentionally does not store SSN, banking information, payment cards, or payment credentials. Legitimate sweepstakes should not request SSN or banking information until verified winner processing.

Settings at `/settings` include:

- Enable or disable automated discovery jobs
- Enable or disable assisted form prefill
- Manual approval required for every entry, locked on

## Entry Tracking

The entry tracker lives at `/entries`. It computes an eligible queue from scored sweepstakes, enforces daily/weekly/monthly/one-time entry windows, blocks duplicate submitted entries inside the active window, and lets the user mark records as submitted manually, skipped, suspicious, winner notification received, or expired.

Every status change requires a per-entry review confirmation. Submitted entries additionally require the user to confirm they personally submitted the live form. Purchase-required items and items missing a clear no-purchase method cannot be recorded as submitted.

The page includes:

- Eligible queue
- Submitted entries
- Expiring soon
- Suspicious/rejected
- Won/notification tracking
- Calendar-style reminders for daily, weekly, and monthly repeat entries

## Safety Model

- Discovery reads search-result metadata through a provider interface and stores candidates only.
- Discovery stops on CAPTCHA, bot-protection, or rate-limit signals.
- Mutation API routes have lightweight request rate limits and the discovery worker delays between provider calls.
- Rules extraction summarizes official rules; it does not submit forms or grant permission to bypass site controls.
- Extraction stops on robots.txt disallow, access-denied, bot-protection, rate-limit responses, or owner-blocked domains.
- Form assistant tasks can be approved and logged, but final entry submission remains manual.
- Purchase-required flows, missing no-purchase methods, gambling/lottery/betting language, payment requests, SSN requests, and banking requests are suspicious and cannot be recorded as submitted.
- Profile vault writes reject SSN, banking, payment-card, and payment field names; profile and entry-note writes also reject SSN-looking values and likely payment card numbers.
- Assisted prefill refuses to run unless global prefill and vault prefill consent are both enabled.
- Admin/debug routes require a local-owner or trusted Supabase admin/owner role before reading logs or running admin mutations.
- Audit logs are service-role-only in Supabase and persisted in local SQLite development.
- Scoring decisions write a `compliance_notes` array explaining accepted, rejected, suspicious, and manual-only outcomes.
- Assisted prefill requires explicit user approval and stops before final submit.
- Entry tracking records only manual status changes; automated entry submission is not implemented.

## Safe Usage

SweepScout AI is designed for personal compliance tracking and assisted review, not automated entry farming. Read official rules yourself, confirm eligibility, and use the app only for lawful no-purchase sweepstakes where manual entry is permitted.

Do not use SweepScout to bypass CAPTCHA, bot protection, waiting rooms, paywalls, rate limits, purchase requirements, or account/social-action requirements. Do not store SSN, banking information, payment cards, or payment credentials in the vault or notes. Legitimate sweepstakes should not ask for SSN or banking details until verified winner processing.

The included `pnpm test` command runs static safety guardrail checks for submit automation, stealth/proxy patterns, review-confirmation enforcement, audit schema, and forbidden profile-storage columns.

## Project Structure

```text
src/app                  App Router pages and API routes
src/components           Shared app shell and UI primitives
src/lib/storage          Supabase and SQLite adapters
src/lib/services         Discovery, extraction, assistant workflows
src/lib/supabase         Server-side Supabase Auth helper
supabase/migrations      Postgres schema and RLS policies
scripts                  Local seed and job runners
```
