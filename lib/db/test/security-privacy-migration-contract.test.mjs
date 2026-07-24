import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../migrations/0009_security_privacy_policies.sql", import.meta.url), "utf8");

test("Phase 11 adds export evidence and deletion retention hooks", () => {
  for (const term of ["privacy_export_events", "scheduled_for", "retention_until", "retention_reason", "identity_redacted_at"]) assert.match(sql, new RegExp(term));
});
test("privacy export evidence is immutable and browser-write protected", () => {
  assert.match(sql, /privacy_export_events_immutable/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE/);
  assert.match(sql, /privacy_export_events_read_own/);
});
test("deletion requests are transaction-locked and idempotently reuse open work", () => {
  assert.match(sql, /request_account_deletion/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /status IN \('requested', 'reviewing'\)/);
  assert.match(sql, /IF NOT FOUND/);
});
test("Phase 11 migration remains additive", () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|TYPE|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /^\s*TRUNCATE\s+/im);
});
