# Approved-source scanner architecture

The scanner is a registry-driven pipeline backed by `sources`,
`source_scan_jobs`, and `discovered_urls`.

## Runtime flow

1. The scheduler polls due, enabled sources once per minute only when
   `PLAYPACKPILOT_SCANNER_ENABLED=true` and Supabase is fully configured.
2. The policy gate rejects disabled or unapproved sources before a job exists.
3. A durable queued job is created and transitioned to running.
4. The adapter returns normalized discovery candidates. Adapters never write
   unrelated product tables.
5. The fetcher enforces origin, protocol, port, response-size, timeout,
   application identity, per-source rate, retry, and exponential-backoff rules.
6. Candidate URLs are canonicalized, stripped of known tracking parameters, and
   hashed with their normalized content evidence.
7. The repository records new, changed, or unchanged discoveries under the
   source/canonical-URL unique key.
8. The job completes, partially completes, fails, or moves to dead letter after
   exhausted transient fetch retries. Source health and next-scan time update.

## Adapters

- RSS/Atom: public feed items or entries.
- JSON API: configurable public array and field paths; no stored credentials.
- Structured HTML: JSON-LD blocks on an approved listing page.
- Administrator URL/import: explicitly submitted URL arrays, with no fetch.

Fixture integration tests cover every adapter, malformed responses, partial
candidate rejection, canonical duplicate handling, content changes, policy
rejection, rate delay, retry/backoff, SSRF controls, and dead-letter status.

## Administration API

All endpoints require an authenticated `admin` or `owner` profile role:

- `GET/POST /api/admin/sources`
- `PUT /api/admin/sources/:id`
- `POST /api/admin/sources/:id/run`
- `GET /api/admin/sources/:id/jobs`
- `GET /api/admin/discovered-urls?status=new`
- `PUT /api/admin/discovered-urls/:id/review`

New sources always begin disabled with both policy reviews pending. Production
source administration requires the normalized PostgreSQL/Supabase deployment;
the local SQLite compatibility store is not used as a second source registry.
