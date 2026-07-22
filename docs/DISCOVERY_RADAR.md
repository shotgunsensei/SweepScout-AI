# Discovery radar and opportunity details

The customer radar reads normalized PostgreSQL records through authenticated API routes. It does not fall back to legacy SQLite cards or static promotion fixtures.

## Routes

- `GET /api/radar` returns an expired-safe, paginated opportunity page.
- `GET /api/opportunities/:id` returns normalized prizes, eligibility, entry methods, warnings, attribution, evidence, and the current user's state.
- `PUT /api/opportunities/:id/save` saves or unsaves the opportunity for the authenticated user.
- `PUT /api/opportunities/:id/status` records a permitted user status; the radar's hide action uses `hidden`.
- `/dashboard/sweepstakes` is the shareable radar UI.
- `/dashboard/sweepstakes/:id` is the opportunity detail UI.

The server always derives `user_id` from the authenticated session. Browser-supplied user or tenant identifiers are not accepted.

## Search, filters, and ordering

Migration `0004_discovery_radar.sql` adds a generated PostgreSQL `tsvector`, a GIN full-text index, trigram indexes for sponsor/prize/category/entry/eligibility text, and array GIN indexes for locations. The `search_sweepstakes_radar` function searches title, sponsor, description, prize, category, eligibility, and entry methods.

Supported query-string fields are `q`, `category`, `minPrize`, `deadlineBefore`, `startAfter`, `frequency`, `maxEffort`, `country`, `region`, `age`, `sponsor`, `purchaseRequired`, `socialRequired`, `minLegitimacy`, `minSourceConfidence`, `saved`, `entered`, `sort`, `page`, and `pageSize`. Inputs are allowlisted and bounded before reaching the RPC.

Sort modes support recommended/best match, new, ending soon, highest prize, lowest effort, recently verified, and popular saves. Daily and one-time opportunities use the frequency filter. Recommended order combines quality/effort scores with the authenticated user's preferred categories, minimum prize, and maximum effort.

The SQL boundary always excludes expired statuses and past deadlines. It uses invoker security so direct authenticated RPC calls remain subject to the user's RLS policies.

## Customer safety and outbound links

Cards and details display eligibility status, match score, effort, legitimacy, source confidence, and open quality warnings as decision support—not certification. Sponsor links use a new browsing context with `noopener`, `noreferrer`, `external`, and no referrer. Detail pages state that Play Pack Pilot is not the sponsor, sponsor rules control, listings can change, AI can be wrong, and eligibility or winnings are never guaranteed.

## Validation

The test suite covers filter parsing, allowlisted sorting, pagination bounds, expired exclusion, indexed search, RLS ownership, personalized ordering, UI loading/error/empty states, required card fields, safe outbound behavior, and mobile layout. The browser smoke uses intercepted authenticated API fixtures only to exercise rendering; database query behavior is separately validated against PostgreSQL with normalized records.
