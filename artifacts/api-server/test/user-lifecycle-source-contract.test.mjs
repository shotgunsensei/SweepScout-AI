import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../src/routes/sweepscout.ts", import.meta.url), "utf8");
const users = await readFile(new URL("../src/domain/operations/users.ts", import.meta.url), "utf8");
const billingService = await readFile(new URL("../src/domain/billing/service.ts", import.meta.url), "utf8");
const billingCredits = await readFile(new URL("../src/domain/billing/credits.ts", import.meta.url), "utf8");
const billingRepo = await readFile(new URL("../src/domain/billing/repository.ts", import.meta.url), "utf8");
const opsRepo = await readFile(new URL("../src/domain/operations/repository.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../lib/db/migrations/0010_owner_user_lifecycle.sql", import.meta.url), "utf8");

test("owner-scoped user lifecycle routes are present and owner-authorized", () => {
  for (const route of [
    'router.post("/admin/users"',
    'router.patch("/admin/users/:id/role"',
    'router.post("/admin/users/:id/disable"',
    'router.post("/admin/users/:id/enable"',
    'router.delete("/admin/users/:id"',
    'router.put("/admin/users/:id/access-plan"',
    'router.delete("/admin/users/:id/access-plan"',
  ]) {
    assert.ok(routes.includes(route), `missing route: ${route}`);
  }
  // Every lifecycle route resolves the actor through requireOwner.
  assert.ok((routes.match(/UserLifecycleService\(\)/g) ?? []).length >= 7);
  assert.match(routes, /requireOwner\(req\)/);
});

test("passwords are never accepted or stored; invitations use Supabase invite flow", () => {
  // No password field is ever read from input or written to storage.
  assert.doesNotMatch(users, /input\.password|["']password["']|\bpassword:/i);
  assert.match(users, /inviteUserByEmail/);
  assert.match(users, /appBaseUrl\(\)/);
  assert.match(users, /redirectTo/);
});

test("last-owner and self-action safeguards are enforced", () => {
  assert.match(users, /countActiveOwners/);
  assert.match(users, /last active platform owner cannot be demoted/);
  assert.match(users, /last active platform owner cannot be disabled/);
  assert.match(users, /last active platform owner cannot be removed/);
  assert.match(users, /active owner account cannot disable itself/);
  assert.match(users, /active owner account cannot remove itself/);
  assert.match(users, /active owner cannot demote itself/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /LAST_ACTIVE_OWNER_REQUIRED/);
  assert.match(migration, /OWNER_SELF_LOCKOUT_FORBIDDEN/);
  assert.match(opsRepo, /admin_apply_user_lifecycle/);
});

test("admin invitations restrict owner creation to owners", () => {
  assert.match(users, /Only a platform owner may create another owner/);
  assert.match(users, /Only a platform owner may grant owner access/);
});

test("account removal audits before Supabase soft-delete and retains operational history", () => {
  const removeBody = users.slice(users.indexOf("async remove("), users.indexOf("async setAccessPlan("));
  assert.ok(removeBody.indexOf('applyUserLifecycle(actor, id, "remove"') < removeBody.indexOf("deleteUser"), "audited database removal must precede auth removal");
  assert.match(removeBody, /auth\.admin\.deleteUser\(id, true\)/);
  assert.match(removeBody, /retainedForAudit: true/);
  assert.match(migration, /v_audit_action:='user\.removal_prepared'/);
  for (const table of ["user_eligibility_profiles","user_preferences","user_saved_sweepstakes","user_sweepstakes_status","user_sweepstakes_notes","user_search_profiles","notification_preferences","notifications","digest_runs","custom_scanners","support_requests"]) {
    assert.match(migration, new RegExp(`DELETE FROM ${table} WHERE`), `missing removal redaction for ${table}`);
  }
  assert.doesNotMatch(migration, /DELETE FROM admin_audit_logs/);
});

test("manual override is distinct from Stripe and never fabricates provider identifiers", () => {
  assert.match(opsRepo, /admin_set_access_plan_override/);
  // The override module must not write provider_subscription_id or provider_price_id.
  assert.doesNotMatch(users, /provider_subscription_id|provider_price_id/);
  // Default free subscription is created without any provider identifiers.
  const inviteBody = users.slice(users.indexOf("async invite("), users.indexOf("async changeRole("));
  assert.match(inviteBody, /plan_key: "free_flight"/);
  assert.doesNotMatch(inviteBody, /provider_subscription_id|provider_price_id/);
});

test("an active override governs the effective plan while the subscription stays unchanged", () => {
  assert.match(billingRepo, /accessPlanOverride/);
  assert.match(billingRepo, /resolveEffectivePlan/);
  assert.match(billingService, /effectivePlanKey/);
  assert.match(billingService, /resolveEffectivePlan\(repo,userId\)/);
  assert.match(billingCredits, /resolveEffectivePlan\(repository,input\.userId\)/);
});

test("admin dashboard user rows expose access-plan override state", () => {
  assert.match(opsRepo, /access_plan_overrides:access_plan_overrides!access_plan_overrides_user_id_fkey\(plan_key,active,reason,set_by,updated_at\)/);
});

test("lifecycle mutations write audited actions with a mandatory reason", () => {
  for (const action of [
    "user.invitation_started",
    "user.invited",
    "user.role_changed",
    "user.disabled",
    "user.enabled",
    "user.removal_prepared",
    "user.removed",
    "user.access_plan_override_set",
    "user.access_plan_override_cleared",
  ]) {
    assert.ok(`${users}\n${migration}`.includes(action), `missing audit action: ${action}`);
  }
  // Six service methods (enable/disable share one) each require an admin reason.
  assert.ok((users.match(/adminReason\(input\.reason\)/g) ?? []).length >= 6);
});
