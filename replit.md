# Play Pack Pilot

Play Pack Pilot is an AI-assisted sweepstakes discovery and research product
that helps users discover, evaluate, organize, and track opportunities while
keeping every entry user-controlled on the sponsor's official site.

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

- `artifacts/sweepscout` — React/Vite web product and public marketing site.
- `artifacts/api-server` — Express API and domain services.
- `artifacts/sweepscout-extension` — optional Chrome companion.
- `artifacts/sweepscout-mobile` — Expo companion app.
- `docs/BRAND_SYSTEM.md` — customer-facing naming and visual language.

## Architecture decisions

- Customer-facing naming uses Play Pack Pilot; stable internal package names,
  routes, database identifiers, migrations, and `SWEEPSCOUT_*` environment
  variables stay unchanged when renaming would add migration risk.
- Sponsor pages remain the only place users submit entries. The product
  researches, organizes, reminds, and supports user-controlled prefill.

## Product

Play Pack Pilot discovers candidate sweepstakes, analyzes rules, helps users
build a focused plan, and tracks user-reported activity. It never auto-submits:
manual action is always required for every entry. Frontend artifact
`sweepscout` (Vite+React, previewPath `/`) talks to the `api-server` Express
backend under `/api`.

## User preferences

- Use the **Refined Flight Deck** visual direction: trustworthy SaaS polish,
  deep aviation navy, cyan signal colors, restrained gold for prize/value
  moments, and selective aviation imagery.
- Pair aviation feature names with clear plain-English explanations.
- Keep the product informational and research-focused: direct sponsor links,
  no auto-entry, and no casino or gambling imagery.

## Gotchas

- Inbox monitoring parses and classifies incoming email but never opens URLs. Claim, verification, and confirmation links stay review-only in the dashboard.
- Rules-change monitoring ignores script/style/layout-only changes by hashing normalized visible text and only notifying for meaningful extracted field changes.
- SQLite stores generated aliases on sweepstakes and entry logs. Supabase needs an `entry_attempts.email_alias` migration before remote entry attempts can persist aliases durably.
- SQLite stores ROI timing fields on entry log payloads. Supabase needs entry-attempt timing columns or metadata storage before remote entry attempts can persist explicit timing durably.
- SQLite stores rules snapshots and rules-change alerts. Supabase needs `rules_snapshots` and `rules_change_alerts` tables before remote mode can persist this monitor durably.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
