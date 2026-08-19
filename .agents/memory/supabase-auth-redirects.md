---
name: Supabase Auth redirects
description: Production recovery links depend on Supabase Auth URL configuration as well as the app redirectTo value.
---

Supabase Auth can fall back to its configured Site URL when a requested redirect is not in the project's URI allowlist. Production must set the Site URL to the canonical HTTPS app URL and allow the recovery and callback paths explicitly; the API should fail closed instead of silently using localhost when its base URL is missing.

**Why:** A recovery email previously contained a localhost redirect even though the application requested the production reset route, causing the token to land on the homepage and appear inert.

**How to apply:** When changing production domains or auth flows, update Supabase Auth URL settings and verify a newly generated recovery link before reusing any older token.