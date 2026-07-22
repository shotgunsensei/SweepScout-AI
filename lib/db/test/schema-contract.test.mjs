import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../migrations/0000_normalized_sweepstakes_sources.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

const requiredTables = [
  "sources",
  "source_scan_jobs",
  "discovered_urls",
  "sweepstakes",
  "sweepstakes_sources",
  "sweepstakes_prizes",
  "sweepstakes_eligibility",
  "sweepstakes_entry_methods",
  "sweepstakes_rules_versions",
  "sweepstakes_categories",
  "sweepstakes_category_links",
  "listing_quality_flags",
  "sweepstakes_change_events",
];

test("migration creates every normalized source and sweepstakes table", () => {
  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `missing ${table}`);
  }
});

test("migration preserves attribution, rules history, and multi-source identity", () => {
  assert.match(migration, /"requires_attribution" boolean/);
  assert.match(migration, /"attribution_text" text/);
  assert.match(migration, /CREATE UNIQUE INDEX "sweepstakes_rules_versions_hash_uidx"/);
  assert.match(migration, /CONSTRAINT "sweepstakes_sources_pk" PRIMARY KEY\("sweepstakes_id","source_id","discovered_url_id"\)/);
});

test("migration includes approval, score, date, and nonnegative constraints", () => {
  assert.match(migration, /sources_approved_before_enable/);
  assert.match(migration, /sweepstakes_scores_valid/);
  assert.match(migration, /sweepstakes_dates_ordered/);
  assert.match(migration, /sweepstakes_prize_value_nonnegative/);
  assert.match(migration, /source_scan_jobs_counts_nonnegative/);
});

test("baseline migration is additive and contains no destructive statements", () => {
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});
