import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migration = await readFile(path.resolve("lib/db/migrations/0002_scanner_job_lock.sql"), "utf8");

test("scanner migration prevents concurrent active jobs per source", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "source_scan_jobs_one_active_per_source_uidx"/);
  assert.match(migration, /WHERE "source_scan_jobs"\."status" in \('queued', 'running'\)/);
});

test("scanner concurrency migration is additive", () => {
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});
