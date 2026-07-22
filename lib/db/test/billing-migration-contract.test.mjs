import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sql=await readFile(new URL("../migrations/0006_stripe_credits.sql",import.meta.url),"utf8");
test("billing migration creates the required authoritative records",()=>{for(const table of ["billing_customers","subscriptions","entitlements","billing_events","credit_ledger"])assert.match(sql,new RegExp(`CREATE TABLE ${table}`));assert.match(sql,/provider_event_id text PRIMARY KEY/);assert.match(sql,/idempotency_key text NOT NULL UNIQUE/);});
test("credit functions use per-user transaction locks and signed append-only entries",()=>{assert.match(sql,/CREATE OR REPLACE FUNCTION consume_pilot_credits/);assert.match(sql,/pg_advisory_xact_lock/g);assert.match(sql,/INSUFFICIENT_PILOT_CREDITS/);assert.match(sql,/CREATE OR REPLACE FUNCTION refund_pilot_credits/);assert.doesNotMatch(sql,/UPDATE credit_ledger|DELETE FROM credit_ledger/);});
test("billing tables expose read-own RLS without browser write policies",()=>{assert.ok((sql.match(/ENABLE ROW LEVEL SECURITY/g)??[]).length>=5);assert.ok((sql.match(/FOR SELECT TO authenticated USING\(user_id=auth\.uid\(\)\)/g)??[]).length>=5);assert.doesNotMatch(sql,/FOR (?:INSERT|UPDATE|DELETE) TO authenticated/);});
test("migration is additive and documents no destructive reset",()=>{assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\b/i);});
