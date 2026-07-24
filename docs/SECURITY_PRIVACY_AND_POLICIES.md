# Security, privacy, attribution, and policy controls

Phase 11 is a defense-in-depth pass over the existing authenticated discovery
product. It does not introduce a second identity, billing, scanner, or audit
system.

## API and session controls

- Production identity remains Supabase Auth. Product routes derive the user and
  platform role from the validated server session.
- Cookies are HTTP-only where appropriate, Secure in production, SameSite=Lax,
  path-scoped, and protected by a double-submit CSRF token for cookie-backed
  mutations.
- CORS accepts only configured `APP_BASE_URL` origins. Express trusts forwarded
  client addresses only when `TRUST_PROXY=true`; rate-limit keys no longer trust
  raw forwarding headers directly.
- All authenticated product traffic has a bounded per-user and server-resolved
  client rate limit. Authentication, discovery, imports, AI, prefill, deletion,
  and export retain stricter route-specific limits.
- API responses disable framework disclosure and set MIME-sniffing, framing,
  referrer, permissions, opener/resource isolation, CSP, and production HSTS
  headers. The web document adds its own restrictive CSP; the deployment edge
  must repeat equivalent headers because meta CSP cannot express every header.
- Body-bearing API requests must use JSON. Production error logs retain only an
  error class, request correlation ID, method, and path. Request bodies, query
  strings, cookies, authorization headers, stack traces, birth dates, and
  location fields are excluded.

The in-memory limiter is a process-level safety net, not a replacement for an
edge, gateway, or distributed rate limiter in a multi-instance deployment.

## Scanner and content controls

The scanner still requires an enabled source with approved terms and robots
reviews. It enforces approved origin, HTTP(S), standard ports, manual redirects,
DNS resolution checks, private/link-local/reserved/metadata address rejection,
15-second timeout, 2 MB decompressed response limit, supported text/JSON/XML
content types, and bounded retries.

Phase 11 additionally limits each source response to 500 candidates, 100 JSON-LD
blocks, 20 structured-data nesting levels, 2,048-character URLs, 500-character
titles, and 5,000-character summaries. Production infrastructure must also deny
private and metadata network egress to mitigate DNS rebinding below the
application transport layer.

## Privacy lifecycle

`GET /api/auth/data-export` returns the authenticated user’s machine-readable
profile, activity, notification, subscription, entitlement, Pilot Credit,
support, and deletion-request records. Every table query is scoped by the
server-derived user ID, capped at 5,000 rows per collection, delivered with
`Cache-Control: no-store`, and recorded in immutable
`privacy_export_events`. Credentials, sessions, server secrets, and payment-card
data are not included.

`POST /api/auth/account-deletion` is transaction-locked and idempotently reuses
an open request. Migration `0009_security_privacy_policies.sql` adds scheduling,
retention-until, retention-reason, and identity-redaction hooks. An operator must
verify identity and subscription state, document any lawful retention, cancel
or preserve provider records as required, redact removable personal fields, and
record completion. The application does not silently destroy billing or audit
evidence.

The repository includes `lib/db/test/phase11-live-smoke.sql` to prove duplicate
requests converge on one open request, export evidence cannot be mutated, and
browser roles cannot call the privileged deletion function or insert audit rows.

The current web application uses only essential authentication, refresh, and
CSRF cookies. Optional analytics and advertising cookies are not enabled. A
consent manager is required before any optional cookie is introduced where
applicable.

## Public policy routes

The public trust center is `/policies`. It includes attorney-review drafts for:

- `/policies/terms`
- `/policies/privacy`
- `/policies/acceptable-use`
- `/policies/subscriptions`
- `/policies/credits`
- `/policies/attribution`
- `/policies/copyright`
- `/policies/disclaimer`
- `/policies/affiliate`

Before production publication, counsel must approve the legal entity name,
addresses, governing law, dispute terms, jurisdiction-specific privacy rights,
refund rules, statutory renewal notices, copyright agent/process, and effective
dates.

## Regulatory drafting notes

The drafts use current conservative product controls rather than claiming one
universal legal standard. The FTC reopened review of negative-option practices
in March 2026, so recurring terms emphasize clear pre-purchase disclosure and a
direct Stripe cancellation path without asserting that the superseded 2024
rule text is universally controlling. The affiliate draft requires clear,
proximate disclosure of material relationships. Privacy controls support
electronic access/export and reviewed erasure requests while allowing a
documented lawful-retention exception.

Primary review references:

- FTC Negative Option Rule: https://www.ftc.gov/legal-library/browse/rules/negative-option-rule
- FTC endorsement guidance: https://www.ftc.gov/news-events/topics/truth-advertising/advertisement-endorsements
- European Commission individual rights: https://commission.europa.eu/law/law-topic/data-protection/reform/rights-citizens/how-my-personal-data-protected/how-should-my-consent-be-requested_en
- European Commission erasure exceptions: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals/do-we-always-have-delete-personal-data-if-person-asks_en

These references inform a draft for counsel; they are not a representation that
every cited regime applies to every user.
