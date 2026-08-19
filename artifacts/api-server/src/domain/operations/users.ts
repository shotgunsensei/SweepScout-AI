import { getSupabaseServiceClient } from "@/lib/auth/session";
import { BillingRepository, getPlan } from "@/lib/billing";
import type { PlatformRole } from "@/lib/auth/session";
import type { AdminActor } from "./types";
import { OperationsRepository } from "./repository";
import { adminReason } from "./service";

// Owner-scoped user lifecycle. Every mutation is deliberate, safeguarded, and
// audited. Passwords are never accepted or stored: new accounts are created
// through Supabase's secure invitation/reset flow only.

export type InvitableRole = "user" | "admin" | "owner";

function appBaseUrl() {
  const first = (process.env.APP_BASE_URL ?? "http://localhost:5173").split(",")[0]!.trim();
  const url = new URL(first);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("APP_BASE_URL must be HTTP or HTTPS.");
  return url.origin;
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email address is required.");
  return email;
}

function cleanName(value: unknown) {
  const name = typeof value === "string" ? value.trim().slice(0, 120) : "";
  return name;
}

function role(value: unknown): InvitableRole {
  if (value === "user" || value === "admin" || value === "owner") return value;
  throw new Error("Role must be user, admin, or owner.");
}

// Safeguard: never disable/remove/demote the last active owner, and owners may
// not act destructively on their own account.
export class UserLifecycleService {
  constructor(private readonly repo = new OperationsRepository(), private readonly client: any = getSupabaseServiceClient()) {}

  private async countActiveOwners(excludeUserId?: string) {
    const result = await this.client.from("profiles").select("id").eq("platform_role", "owner").is("account_disabled_at", null);
    if (result.error) throw new Error("Unable to verify platform owners.");
    const owners = (result.data ?? []).filter((row: any) => row.id !== excludeUserId);
    return owners.length;
  }

  private async loadProfile(id: string) {
    const result = await this.client.from("profiles").select("id,email,display_name,platform_role,account_disabled_at,account_removed_at").eq("id", id).maybeSingle();
    if (result.error) throw new Error("Unable to load the account.");
    if (!result.data) throw new Error("User was not found.");
    return result.data;
  }

  async invite(actor: AdminActor, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const email = normalizeEmail(input.email);
    const displayName = cleanName(input.displayName);
    const desiredRole = input.role === undefined ? "user" : role(input.role);
    // Admins may only create user/admin roles. Creating another owner is owner-only.
    if (desiredRole === "owner" && actor.role !== "owner") throw new Error("Only a platform owner may create another owner.");
    await this.repo.audit(actor, {
      action: "user.invitation_started",
      targetType: "invitation",
      targetId: `pending:${actor.correlationId}`,
      after: { platformRole: desiredRole },
      reason,
    });

    const redirectTo = `${appBaseUrl()}/auth/callback`;
    const invited = await this.client.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: displayName || email.split("@")[0] },
    });
    if (invited.error || !invited.data?.user) throw new Error(`Unable to send the invitation. ${invited.error?.message ?? ""}`.trim());

    const userId = String(invited.data.user.id);
    const now = new Date().toISOString();
    const name = displayName || email.split("@")[0];

    // Bootstrap application-owned rows safely and idempotently. The invitation
    // already succeeded, so failures here must surface explicitly.
    const profile = await this.client.from("profiles").upsert(
      { id: userId, email, display_name: name, platform_role: desiredRole, updated_at: now },
      { onConflict: "id" },
    );
    if (profile.error) throw new Error("Unable to create the invited profile.");
    const [preferences, eligibility, subscription] = await Promise.all([
      this.client.from("user_preferences").upsert({ user_id: userId, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
      this.client.from("user_eligibility_profiles").upsert({ user_id: userId, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
      // Default free subscription without any fabricated Stripe identifiers.
      this.client.from("subscriptions").upsert({ user_id: userId, plan_key: "free_flight", status: "none", updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
    ]);
    if (preferences.error || eligibility.error || subscription.error) throw new Error("Unable to initialize the invited account.");

    const after = { id: userId, email, displayName: name, platformRole: desiredRole };
    await this.repo.audit(actor, { action: "user.invited", targetType: "profile", targetId: userId, after, reason });
    return { ...after, invitationSent: true };
  }

  async changeRole(actor: AdminActor, id: string, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const nextRole = role(input.role);
    const before = await this.loadProfile(id);
    if (before.account_removed_at) throw new Error("Removed accounts cannot be reassigned.");
    if (nextRole === "owner" && actor.role !== "owner") throw new Error("Only a platform owner may grant owner access.");
    if (id === actor.userId && nextRole !== "owner" && before.platform_role === "owner") throw new Error("The active owner cannot demote itself.");
    if (before.platform_role === "owner" && nextRole !== "owner") {
      if ((await this.countActiveOwners(id)) < 1) throw new Error("The last active platform owner cannot be demoted.");
    }
    if (before.platform_role === nextRole) return { id, platformRole: nextRole, unchanged: true };
    return this.repo.applyUserLifecycle(actor, id, "role", nextRole, reason);
  }

  async setDisabled(actor: AdminActor, id: string, disabled: boolean, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const before = await this.loadProfile(id);
    if (before.account_removed_at) throw new Error(disabled ? "Removed accounts are already inaccessible." : "Removed accounts cannot be re-enabled.");
    if (disabled) {
      if (id === actor.userId) throw new Error("The active owner account cannot disable itself.");
      if (before.platform_role === "owner" && (await this.countActiveOwners(id)) < 1) throw new Error("The last active platform owner cannot be disabled.");
    }
    return this.repo.applyUserLifecycle(actor, id, disabled ? "disable" : "enable", null, reason);
  }

  async remove(actor: AdminActor, id: string, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const before = await this.loadProfile(id);
    if (id === actor.userId) throw new Error("The active owner account cannot remove itself.");
    if (before.platform_role === "owner" && (await this.countActiveOwners(id)) < 1) throw new Error("The last active platform owner cannot be removed.");

    const anonymized = await this.repo.applyUserLifecycle(actor, id, "remove", null, reason);
    const deleted = await this.client.auth.admin.deleteUser(id, true);
    if (deleted.error) throw new Error(`The account was disabled and anonymized, but Supabase removal failed. ${deleted.error.message ?? ""}`.trim());
    await this.repo.audit(actor, { action: "user.removed", targetType: "profile", targetId: id, after: { removed: true, retainedForAudit: true, databaseState: anonymized }, reason });
    return { id, removed: true, retainedForAudit: true, personalDataRedacted: true };
  }

  async setAccessPlan(actor: AdminActor, id: string, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const planKey = getPlan(input.planKey).key; // validates against the catalog
    const target = await this.loadProfile(id);
    if (target.account_removed_at) throw new Error("Removed accounts cannot receive access overrides.");
    const saved = await this.repo.setAccessPlanOverride(actor, id, planKey, reason);
    await new BillingRepository(this.client).replaceEntitlements(id, planKey, "admin_override", null);
    // The manual override governs effective app plan/features; the Stripe
    // subscription record is intentionally left unchanged.
    return saved;
  }

  async clearAccessPlan(actor: AdminActor, id: string, input: Record<string, unknown>) {
    const reason = adminReason(input.reason);
    const target = await this.loadProfile(id);
    if (target.account_removed_at) throw new Error("Removed accounts cannot receive access overrides.");
    await this.repo.setAccessPlanOverride(actor, id, null, reason);
    const entitlements = await this.client.from("entitlements").delete().eq("user_id", id).eq("source", "admin_override");
    if (entitlements.error) throw new Error("Unable to clear the access-plan entitlements.");
    return { userId: id, cleared: true };
  }
}

export function invitableRoles(): PlatformRole[] {
  return ["user", "admin", "owner"];
}
