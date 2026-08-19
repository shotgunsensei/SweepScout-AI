---
name: Supabase privileged RPC grants
description: Privilege behavior to preserve for SECURITY DEFINER functions exposed through Supabase
---

Security-sensitive `SECURITY DEFINER` RPCs must explicitly revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, then grant it only to `service_role`.

**Why:** In the PlayPackPilot Supabase project, revoking from `PUBLIC` alone still left `anon` and `authenticated` with explicit execute privileges. A live `has_function_privilege` check caught the bypass.

**How to apply:** Include explicit role revocations in the initial migration and add a follow-up corrective migration when repairing an already-applied schema. Verify both browser roles are false and `service_role` is true before using the RPC.