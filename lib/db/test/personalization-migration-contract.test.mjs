import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../migrations/0005_personalized_hangar.sql", import.meta.url), "utf8");
test("personal workflow migration creates notes and saved-search persistence", () => { assert.match(sql, /CREATE TABLE IF NOT EXISTS user_sweepstakes_notes/); assert.match(sql, /CREATE TABLE IF NOT EXISTS user_search_profiles/); assert.match(sql, /filters jsonb NOT NULL/); assert.match(sql, /alert_enabled boolean NOT NULL/); });
test("notes and search profiles enforce own-row RLS", () => { assert.match(sql, /ENABLE ROW LEVEL SECURITY/g); assert.ok((sql.match(/user_id = auth\.uid\(\)/g) ?? []).length >= 4); });
test("personal workflow migration remains additive", () => { assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i); });
