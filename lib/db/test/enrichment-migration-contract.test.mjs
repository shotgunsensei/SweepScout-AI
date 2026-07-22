import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0003_ai_enrichment_audit.sql", import.meta.url), "utf8");

test("AI runs retain model, prompt, token, cost, and failure metadata", () => {
  for (const column of ["provider", "model", "prompt_version", "input_tokens", "output_tokens", "estimated_cost_usd", "error_code"]) assert.match(migration, new RegExp(`"${column}"`));
});
test("every extracted field can retain evidence and confidence", () => {
  for (const column of ["field_value", "confidence", "source_reference", "evidence_text", "evidence_location", "authoritative", "extracted_at"]) assert.match(migration, new RegExp(`"${column}"`));
  assert.match(migration, /sweepstakes_field_evidence_confidence_valid/);
});
test("merge audit is reversible and protected from cascade deletion", () => {
  assert.match(migration, /CREATE TABLE "sweepstakes_merge_events"/);
  assert.match(migration, /"source_snapshot" jsonb NOT NULL/);
  assert.match(migration, /ON DELETE restrict/);
  assert.match(migration, /merge_events_undo_valid/);
});
test("enrichment migration is additive", () => assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i));
