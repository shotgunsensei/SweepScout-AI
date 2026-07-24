# Play Pack Pilot authentication

Play Pack Pilot uses Supabase Auth for production credentials and PostgreSQL for
private profile data. The Express API exchanges Supabase sessions for secure,
HTTP-only cookies; credentials and refresh tokens are never written to product
tables or client-readable storage.

## Required production configuration

Set these values in the deployment secret manager, not in source control:

```text
APP_BASE_URL=https://your-production-origin.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_GOOGLE_OAUTH_ENABLED=false
PLATFORM_OWNER_EMAIL=john@shotgunninjas.com
```

The service-role key is server-only. Never prefix it with `VITE_` or expose it
through `/api/config`. Production fails closed with HTTP 503 when the Supabase
configuration is incomplete. Local development uses a deterministic local pilot
only when `NODE_ENV` is not `production`.

## Supabase setup

1. Apply the migrations in `lib/db/migrations` to a fresh Supabase project.
2. Enable email/password authentication and require email verification.
3. Add `${APP_BASE_URL}/auth/callback` and `${APP_BASE_URL}/reset-password` to
   the allowed redirect URLs.
4. Configure SMTP and branded verification/recovery templates before launch.
5. Optionally configure the Google provider, add the same callback URL, and set
   `SUPABASE_GOOGLE_OAUTH_ENABLED=true` only after the provider is verified.
6. Keep leaked-password detection, refresh-token rotation, and reasonable
   password controls enabled in Supabase.

## Session and authorization controls

- Access and refresh cookies are HTTP-only, `SameSite=Lax`, and `Secure` in
  production.
- Cookie-backed mutations require a matching `X-CSRF-Token` double-submit
  token. Bearer-token API clients are not subject to the cookie CSRF check.
- Login, signup, password reset, token exchange, and refresh routes are rate
  limited without storing raw emails in rate-limit keys.
- All application routes except health, auth flows, and the verified Stripe
  webhook require authenticated request context.
- Platform roles come from `profiles.platform_role`. User metadata and email
  addresses do not grant administrator access.
- Identity tables use RLS for read-own access. Direct writes by `authenticated`
  and `anon` PostgREST roles are revoked; validated mutations use the server.
- Full birth dates are returned only from the authenticated personal-profile
  endpoint and are not included in request logs.

## Secure platform-owner promotion

`PLATFORM_OWNER_EMAIL` identifies the intended owner for operational checks but
does not auto-promote any account. After John has signed up, verified the email,
enabled MFA in Supabase, and provided the immutable Supabase user UUID, run the
following through the Supabase SQL editor as a database administrator:

```sql
begin;

select id, email, platform_role
from public.profiles
where id = '<verified-supabase-user-uuid>'
for update;

update public.profiles
set platform_role = 'owner', updated_at = now()
where id = '<verified-supabase-user-uuid>'
  and email = lower('<verified-owner-email>');

commit;
```

Verify the selected UUID and email before committing. Do not promote by email
alone, do not create a password in SQL, and do not place a promotion endpoint in
the public API. Record the change in the production audit process.

## Account deletion

`POST /api/auth/account-deletion` records a reviewable deletion request. It does
not immediately destroy billing, audit, or compliance evidence. An authorized
operator must verify subscription state and retention requirements before
processing the request and disabling or deleting the Supabase identity.

The request is transaction-locked and idempotently reuses an existing requested
or reviewing item. Migration `0009` adds `scheduled_for`, `retention_until`,
`retention_reason`, and `identity_redacted_at` lifecycle hooks.

`GET /api/auth/data-export` produces a no-store JSON export scoped exclusively
to the authenticated server session. Export contents and the operator workflow
are documented in `docs/SECURITY_PRIVACY_AND_POLICIES.md`.

## Validation boundaries

Automated tests prove local cookie/CSRF behavior, protected routes, fail-closed
production configuration, onboarding, role denial, migration constraints, and
RLS contracts. Live signup, verification email delivery, OAuth consent, password
recovery email delivery, and refresh-token rotation still require a configured
Supabase test project and must be completed before production release.
