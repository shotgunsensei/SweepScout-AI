---
name: Supabase recovery throttling
description: Supabase password-reset email rate limits and the safe application response.
---

Supabase may reject `resetPasswordForEmail` with HTTP 429 and the `over_email_send_rate_limit` code even when the recovery configuration and redirect are correct.

**Why:** Repeated recovery attempts can exhaust Supabase's email-send quota; presenting this as a generic server outage obscures the cause and encourages more retries.

**How to apply:** Keep the response account-enumeration safe, return a rate-limit response with a wait-and-retry message, and avoid requesting additional reset emails until the provider window resets.