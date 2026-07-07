# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/sweepscout-extension run build` — build the Chrome Manifest V3 companion extension to `artifacts/sweepscout-extension/dist`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional inbox monitoring env:
  - `SWEEPSCOUT_INBOX_ENABLED=true`
  - `SWEEPSCOUT_INBOX_PROVIDER=gmail` or `imap`
  - `SWEEPSCOUT_INBOX_EMAIL=<dedicated sweepstakes inbox>`
  - `SWEEPSCOUT_IMAP_USER=<imap login>`
  - `SWEEPSCOUT_IMAP_PASSWORD=<gmail app password or imap password>`
  - `SWEEPSCOUT_IMAP_HOST=imap.gmail.com`
  - `SWEEPSCOUT_IMAP_PORT=993`
  - `SWEEPSCOUT_INBOX_MAILBOX=INBOX`
  - `SWEEPSCOUT_INBOX_MAX_MESSAGES=25`
  - `SWEEPSCOUT_INBOX_LOOKBACK_DAYS=14`
- Email aliases are configured in Settings. Gmail-style aliases use `<local>+<prefix>-<sequence>@gmail.com`, for example `john+sweep-001@gmail.com`.
- Prize ROI estimates are configured in Settings. Expected value uses observed win rate when available, otherwise the configured baseline probability; time spent and hours saved use per-entry estimates unless an entry stores explicit timing.
- Rules-change monitoring is configured in Settings. It periodically re-checks saved official rules URLs, hashes normalized visible page text, stores extracted snapshots, and only alerts when deadline, eligibility, prize, or entry-frequency fields change.
- Chrome extension: load `artifacts/sweepscout-extension/dist` as an unpacked extension after building. It defaults to `http://localhost:5000/api`, stores only the approved profile fields synced from `/api/profile`, never clicks submit, and leaves SSN, banking, payment, terms, consent, and CAPTCHA fields manual.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

SweepScout AI — a sweepstakes discovery, compliance, and manual entry-tracking tool. It discovers candidate sweepstakes, extracts/scoring rules, stages an approval queue, and tracks manual entries. It never auto-submits: manual approval is always required for every entry. Frontend artifact `sweepscout` (Vite+React, previewPath `/`) talks to the `api-server` Express backend under `/api`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Inbox monitoring parses and classifies incoming email but never opens URLs. Claim, verification, and confirmation links stay review-only in the dashboard.
- Rules-change monitoring ignores script/style/layout-only changes by hashing normalized visible text and only notifying for meaningful extracted field changes.
- SQLite stores generated aliases on sweepstakes and entry logs. Supabase needs an `entry_attempts.email_alias` migration before remote entry attempts can persist aliases durably.
- SQLite stores ROI timing fields on entry log payloads. Supabase needs entry-attempt timing columns or metadata storage before remote entry attempts can persist explicit timing durably.
- SQLite stores rules snapshots and rules-change alerts. Supabase needs `rules_snapshots` and `rules_change_alerts` tables before remote mode can persist this monitor durably.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
