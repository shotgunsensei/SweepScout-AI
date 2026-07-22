# AI enrichment, scoring, and duplicate resolution

The normalized enrichment pipeline processes only administrator-queued discoveries from policy-approved sources. It acquires the public page through the same bounded, SSRF-resistant fetcher used by source scanning, cleans visible text, detects an official-rules link, invokes a replaceable structured-output provider, validates the response, scores the result, checks duplicates, routes uncertainty to review, and writes the normalized record.

## Evidence contract

Every extracted field stores `value`, `confidence`, `sourceReference`, supporting `evidence`, a page/section/offset `location`, and `extractedAt`. Missing facts remain explicit `null` values. Evidence is preserved in `sweepstakes_field_evidence`; only non-null values at or above the `0.70` authoritative threshold update normalized facts.

The schema covers promotion and rules URLs, identifier, sponsor, dates/timezone, prizes, eligibility and ages, entry methods/frequency, purchase and social requirements, employee exclusions, maximum entries, sponsor contact, prohibited-jurisdiction language, tax disclosures, winner notification, and categories.

## Provider boundary

`EnrichmentProvider` defines typed input/output, provider/model identity, and prompt version. `OpenAIEnrichmentProvider` uses the Responses API with strict JSON schema output and a privacy-minimized payload containing only source content required for extraction. The wrapper enforces an 80,000-character input ceiling, 20-second attempt timeout, three attempts with bounded backoff, and Zod validation.

Configuration:

- `OPENAI_MODEL` selects the model (default `gpt-5-mini`).
- `OPENAI_API_KEY`, or the Replit OpenAI integration variables, enables the provider.
- `OPENAI_INPUT_COST_PER_MILLION_USD` and `OPENAI_OUTPUT_COST_PER_MILLION_USD` enable deployment-specific estimated-cost accounting without hardcoding volatile model prices.

Runs retain prompt version, model, provider, token counts, estimated cost, status, and non-sensitive error code in `ai_enrichment_runs`. Logs and errors do not include raw source content.

## Duplicate and review policy

Duplicate resolution combines canonical URL, official promotion ID, rules URL, sponsor, normalized title, dates, prize composition, and content fingerprint. A title match alone cannot merge. Scores at or above `0.82` automatically attach the new source/evidence to the existing record; `0.55–0.8199` routes to human review; lower scores remain separate.

Automatic merges create a `sweepstakes_merge_events` snapshot with the signals and pre-merge target. Administrators can undo an applied merge through `POST /api/admin/merges/:id/undo`; the target facts are restored and the audit event remains immutable except for its undo status and actor/timestamp.

## Scoring disclaimer

Legitimacy, entry effort, and source confidence are configurable decision-support scores. They are not legal review, certification, or a guarantee that a promotion is safe, lawful, or winnable. Conflicting dates, low average confidence, and uncertain duplicate matches always route to review.

## Administrative API

- `POST /api/admin/discovered-urls/:id/enrich` enriches a queued discovery.
- `POST /api/admin/merges/:id/undo` reverses an applied automatic merge.

Both routes require the existing authenticated admin/owner boundary. Apply `lib/db/migrations/0003_ai_enrichment_audit.sql` before enabling enrichment in a Supabase deployment.
