import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sql=await readFile(new URL("../migrations/0008_administration_operations.sql",import.meta.url),"utf8");
test("Phase 10 creates durable audit, feature flag, support, and error records",()=>{for(const table of ["admin_audit_logs","feature_flags","support_requests","application_errors"])assert.match(sql,new RegExp(`CREATE TABLE ${table}`));});
test("admin audit records are append-only and browser roles have no direct access",()=>{assert.match(sql,/admin_audit_logs_immutable/);assert.match(sql,/BEFORE UPDATE OR DELETE/);assert.match(sql,/REVOKE ALL ON admin_audit_logs,feature_flags,support_requests,application_errors FROM authenticated,anon/);});
test("credit corrections remain append-only signed ledger entries",()=>{assert.match(sql,/CREATE OR REPLACE FUNCTION adjust_pilot_credits/);assert.match(sql,/entry_type='adjustment' AND amount<>0/);assert.match(sql,/ADJUSTMENT_WOULD_CREATE_NEGATIVE_BALANCE/);assert.doesNotMatch(sql,/UPDATE credit_ledger SET/);});
test("manual merge and reversal are transactional and restore source links",()=>{assert.match(sql,/CREATE OR REPLACE FUNCTION admin_merge_sweepstakes/);assert.match(sql,/sourceBefore/);assert.match(sql,/sourceLinks/);assert.match(sql,/CREATE OR REPLACE FUNCTION admin_undo_merge/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/DELETE FROM sweepstakes_sources WHERE sweepstakes_id=v_event\.target_sweepstakes_id/);});
test("Phase 10 migration does not drop tables or historical rows",()=>{assert.doesNotMatch(sql,/\bDROP\s+(TABLE|TYPE|SCHEMA)\b/i);assert.doesNotMatch(sql,/\bTRUNCATE\b/i);assert.doesNotMatch(sql,/\bDELETE FROM credit_ledger\b/i);});
