import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migration = await readFile(path.resolve("lib/db/migrations/0001_authentication_profiles.sql"), "utf8");

test("authentication migration creates profiles, preferences, eligibility, organizations, and deletion requests", () => {
  for (const table of ["profiles", "user_preferences", "user_eligibility_profiles", "organizations", "organization_memberships", "account_deletion_requests"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
});

test("profiles retain private eligibility fields and server-controlled roles", () => {
  assert.match(migration, /"birth_date" date/);
  assert.match(migration, /"platform_role" "platform_role" DEFAULT 'user' NOT NULL/);
  assert.match(migration, /"terms_accepted_at" timestamp with time zone/);
  assert.match(migration, /"privacy_accepted_at" timestamp with time zone/);
  assert.match(migration, /"sponsor_disclaimer_accepted_at" timestamp with time zone/);
  assert.doesNotMatch(migration, /PLATFORM_OWNER_EMAIL|john@shotgunninjas\.com/i);
});

test("Supabase deployments link auth.users and install read-own RLS policies", () => {
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 6);
  assert.match(migration, /profiles_read_own/);
  assert.match(migration, /user_preferences_read_own/);
  assert.match(migration, /user_eligibility_read_own/);
  assert.match(migration, /memberships_read_own/);
  assert.match(migration, /organizations_read_member/);
  assert.match(migration, /deletion_requests_read_own/);
});

test("authenticated browser roles cannot mutate identity tables directly", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
  assert.match(migration, /GRANT SELECT ON public\.profiles/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE)/);
});
