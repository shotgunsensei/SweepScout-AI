---
name: Discovery via Replit connectors
description: Durable constraints for the Brave/YouTube sweepstakes research pipeline
---
- **YouTube quota rule:** `search.list` allows ~100 calls/day shared across manual runs, reruns, and the scheduler. New YouTube-touching features must go through the provider's daily budget guard, never around it. **Why:** one careless loop can exhaust a full day's research capacity for paid users.
- **Dual-store contract:** every new persisted field must round-trip through BOTH storage backends (local and Supabase), and discovery jobs must keep their provider so reruns never silently switch search sources. **Why:** the Supabase schema is narrower than the local one, so fields silently drop unless explicitly mapped.
- **How to apply:** route all discovered results through the existing safety pipeline (HTTPS, blocked domains, sponsor reputation, dedupe); the app is information-only — never add auto-entry behavior.
