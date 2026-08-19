import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const source = await readFile(path.resolve("src/scripts/provision-owner.ts"), "utf8");
const build = await readFile(path.resolve("build.mjs"), "utf8");
const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));

test("owner provisioning uses secure Supabase invitation or reset flows", () => {
  assert.match(source, /inviteUserByEmail/);
  assert.match(source, /resetPasswordForEmail/);
  assert.doesNotMatch(source, /password\s*:/i);
  assert.doesNotMatch(source, /john@shotgunninjas\.com/i);
});

test("owner provisioning requires secure runtime configuration and records an audit event", () => {
  for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PLATFORM_OWNER_EMAIL", "APP_BASE_URL"]) {
    assert.match(source, new RegExp(`required\\(\"${key}\"\\)`));
  }
  assert.match(source, /platform_role: "owner"/);
  assert.match(source, /admin_audit_logs/);
  assert.match(source, /provider_subscription_id: null/);
  assert.match(source, /provider_price_id: null/);
});

test("owner provisioning is a dedicated built command", () => {
  assert.match(build, /"provision-owner"/);
  assert.match(packageJson.scripts["provision:owner"], /provision-owner\.mjs/);
});