---
name: OpenAI via Replit AI Integrations
description: How SweepScout reaches OpenAI, and a testing gotcha with seed data
---

# OpenAI access in SweepScout (api-server)

OpenAI is reached through the **Replit AI Integrations proxy**, not a user key.
`requireOpenAIAccess()` in `domain/env.ts` returns `{baseUrl, apiKey}`: it prefers
the injected `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`,
and falls back to `https://api.openai.com/v1` + `OPENAI_API_KEY` if those are set.
`openaiConfigured` in `/api/config` is true when either mode is available.

**Why direct fetch, not the SDK template:** both call sites (rules extraction,
form-prefill AI field mapping) use the **Responses API** (`POST ${baseUrl}/responses`)
with `text.format.json_schema` strict schemas. The proxy supports the Responses API
with strict json_schema — the project default is `gpt-5-mini`
(overridable via `OPENAI_MODEL`). The integration's SDK template packages are for
chat/voice apps and were intentionally not adopted.

**Testing gotcha:** the default seed sweepstakes use `https://example.com/...` URLs
that return HTTP 404. Extraction loads the source page *before* calling OpenAI, so a
seed extraction fails with "Could not load ... HTTP 404" without ever exercising the
AI path. To verify the OpenAI path, either use a real/reachable sweepstakes URL or
hit `${baseUrl}/responses` directly with the injected env vars.
