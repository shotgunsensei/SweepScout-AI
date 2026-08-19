import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../migrations/0010_owner_user_lifecycle.sql", import.meta.url), "utf8");

test("access-plan override table exists with actor, reason, and timestamps", () => {
  assert.match(sql, /CREATE TABLE access_plan_overrides/);
  assert.match(sql, /plan_key subscription_plan NOT NULL/);
  assert.match(sql, /reason text NOT NULL CHECK\(char_length\(trim\(reason\)\) BETWEEN 3 AND 1000\)/);
  assert.match(sql, /set_by uuid REFERENCES profiles\(id\)/);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /active boolean NOT NULL DEFAULT true/);
});

test("override table is strictly separate from Stripe and stores no provider identifiers", () => {
  assert.doesNotMatch(sql, /provider_subscription_id|provider_price_id|provider_customer_id/);
});

test("override table has read-own RLS and service-role grants without browser writes", () => {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON access_plan_overrides FROM authenticated,anon/);
  assert.match(sql, /access_plan_overrides_read_own .* FOR SELECT TO authenticated USING\(user_id=auth\.uid\(\)\)/);
  assert.match(sql, /GRANT SELECT,INSERT,UPDATE,DELETE ON access_plan_overrides TO service_role/);
  assert.doesNotMatch(sql, /FOR (?:INSERT|UPDATE|DELETE) TO authenticated/);
});

test("security-definer owner RPCs are revoked from public and granted only to service role", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION admin_apply_user_lifecycle\(uuid,uuid,text,text,text,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION admin_set_access_plan_override\(uuid,uuid,text,text,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION admin_apply_user_lifecycle\(uuid,uuid,text,text,text,text\) TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION admin_set_access_plan_override\(uuid,uuid,text,text,text\) TO service_role/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION admin_(?:apply_user_lifecycle|set_access_plan_override)[^;]+ TO (?:PUBLIC|anon|authenticated)/i);
});

test("migration changes no schema destructively and deletes only user-owned data during audited removal", () => {
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION admin_apply_user_lifecycle/);
  assert.match(sql, /v_audit_action:='user\.removal_prepared'/);
  assert.doesNotMatch(sql, /DELETE FROM (?:subscriptions|billing_customers|billing_events|credit_ledger|admin_audit_logs)/i);
});
