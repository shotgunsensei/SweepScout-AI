"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { getRegistrableDomain } from "@/lib/discovery/url";
import { approveAssistantTask, recordEntryAttempt } from "@/lib/services/assistant";
import { assertNoForbiddenVaultFields, assertNoForbiddenVaultValues } from "@/lib/profile-safety";
import { runDiscoveryJob } from "@/lib/services/discovery";
import { markEntryStatus } from "@/lib/services/entry-tracking";
import { runAssistedFormPrefill } from "@/lib/services/form-prefill";
import { runRulesExtraction } from "@/lib/services/openai-extraction";
import { scoreSweepstake } from "@/lib/scoring";
import { getStore } from "@/lib/storage/store";

export async function approveTaskAction(formData: FormData) {
  await approveAssistantTask(String(formData.get("taskId")));
  revalidateAll();
}

export async function recordEntryAction(formData: FormData) {
  await recordEntryAttempt({
    sweepstakeId: String(formData.get("sweepstakeId")),
    userApproved: formData.get("userApproved") === "on",
    reviewConfirmed: formData.get("reviewConfirmed") === "on",
    purchaseRequiredAcknowledged: formData.get("purchaseRequiredAcknowledged") === "on",
    notes: String(formData.get("notes") ?? ""),
  });
  revalidateAll();
}

export async function markEntryStatusAction(formData: FormData) {
  await markEntryStatus({
    sweepstakeId: String(formData.get("sweepstakeId")),
    status: String(formData.get("status")) as "submitted" | "skipped" | "suspicious" | "winner_notification" | "expired",
    userApproved: formData.get("userApproved") === "on",
    reviewConfirmed: formData.get("reviewConfirmed") === "on",
    purchaseRequiredAcknowledged: formData.get("purchaseRequiredAcknowledged") === "on",
    notes: String(formData.get("notes") ?? ""),
  });
  revalidateAll();
}

export async function prefillFormAction(formData: FormData) {
  const result = await runAssistedFormPrefill({
    sweepstakeId: String(formData.get("sweepstakeId")),
    formUrl: String(formData.get("formUrl") || "") || undefined,
    userApproved: formData.get("prefillApproved") === "on",
    useAiFallback: formData.get("useAiFallback") === "on",
  });
  revalidateAll();
  redirect(result.reviewUrl);
}

export async function runDiscoveryAction(formData: FormData) {
  await runDiscoveryJob(String(formData.get("jobId")));
  revalidateAll();
}

export async function runExtractionAction(formData: FormData) {
  await runRulesExtraction(String(formData.get("sweepstakeId")));
  revalidateAll();
}

export async function rescoreSweepstakeAction(formData: FormData) {
  await rescoreSweepstakeById(String(formData.get("sweepstakeId")));
  revalidateAll();
}

export async function adminRetryExtractionAction(formData: FormData) {
  await requireAdmin();
  await runRulesExtraction(String(formData.get("sweepstakeId")));
  revalidateAll();
}

export async function adminRescoreSweepstakeAction(formData: FormData) {
  await requireAdmin();
  await rescoreSweepstakeById(String(formData.get("sweepstakeId")));
  revalidateAll();
}

export async function adminBlockDomainAction(formData: FormData) {
  await requireAdmin();
  const store = await getStore();
  const domain = normalizeDomainInput(String(formData.get("domain") ?? ""));
  await store.saveBlockedDomain({
    id: randomUUID(),
    domain,
    reason: String(formData.get("reason") ?? "Blocked from admin debug panel.").trim() || "Blocked from admin debug panel.",
    createdAt: new Date().toISOString(),
  });
  await writeAuditLog({
    actorId: null,
    action: "admin.domain_blocked",
    entityType: "blocked_domain",
    entityId: domain,
    severity: "block",
    message: `Domain ${domain} was added to the blocklist from the admin panel.`,
    metadata: { domain },
  });
  revalidateAll();
}

async function rescoreSweepstakeById(sweepstakeId: string) {
  const store = await getStore();
  const sweepstake = await store.getSweepstake(sweepstakeId);
  if (!sweepstake) {
    throw new Error("Sweepstake not found.");
  }
  const profile = await store.getUserProfile();
  const scored = scoreSweepstake(sweepstake, profile, undefined, await store.listSweepstakes());
  const updated = await store.saveSweepstake({ ...sweepstake, ...scored, updatedAt: new Date().toISOString() });
  await writeAuditLog({
    actorId: null,
    action: "sweepstake.rescored",
    entityType: "sweepstake",
    entityId: sweepstake.id,
    severity: updated.status === "suspicious" || updated.status === "ineligible" || updated.status === "expired" ? "warn" : "info",
    message: `Sweepstake re-scored as ${updated.status}.`,
    metadata: { scamScore: updated.scamScore, eligibilityScore: updated.eligibilityScore },
  });
}

export async function updateProfileAction(formData: FormData) {
  assertNoForbiddenVaultFields(formData.keys());
  assertNoForbiddenVaultValues(formData.values());
  const store = await getStore();
  const current = await store.getUserProfile();
  const wantsPrefill = formData.get("consentToPrefill") === "on";
  const confirmedPrefill = formData.get("prefillConfirmation") === "on";

  if (wantsPrefill && !current.consentToPrefill && !confirmedPrefill) {
    throw new Error("Confirm the prefill safety warning before enabling form prefill.");
  }

  const saved = await store.saveUserProfile({
    ...current,
    email: String(formData.get("email")),
    alternateEmail: String(formData.get("alternateEmail") ?? ""),
    firstName: String(formData.get("firstName")),
    lastName: String(formData.get("lastName")),
    dob: String(formData.get("dob")),
    state: String(formData.get("state")),
    country: String(formData.get("country")),
    phone: String(formData.get("phone") ?? ""),
    address1: String(formData.get("address1") ?? ""),
    address2: String(formData.get("address2") ?? ""),
    city: String(formData.get("city") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    consentToPrefill: wantsPrefill,
    preferences: {
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      maxDailyEntries: Number(formData.get("maxDailyEntries") ?? 12),
      avoidPurchaseRequired: formData.get("avoidPurchaseRequired") === "on",
      allowSocialActions: formData.get("allowSocialActions") === "on",
    },
    updatedAt: new Date().toISOString(),
  });
  await writeAuditLog({
    actorId: null,
    action: "profile.updated",
    entityType: "user_profile",
    entityId: saved.id,
    severity: saved.consentToPrefill ? "warn" : "info",
    message: saved.consentToPrefill ? "Profile vault updated with prefill consent enabled." : "Profile vault updated.",
    metadata: { consentToPrefill: saved.consentToPrefill, categories: saved.preferences.categories },
  });
  revalidateAll();
  redirect("/vault");
}

export async function updateSettingsAction(formData: FormData) {
  const store = await getStore();
  const saved = await store.saveSettings({
    automatedDiscoveryEnabled: formData.get("automatedDiscoveryEnabled") === "on",
    formPrefillEnabled: formData.get("formPrefillEnabled") === "on",
    discoveryCadence: String(formData.get("discoveryCadence")),
    minEligibilityScore: Number(formData.get("minEligibilityScore") ?? 72),
    maxScamScore: Number(formData.get("maxScamScore") ?? 54),
    requireApprovalForEveryEntry: true,
    dailyEntryLimit: Number(formData.get("dailyEntryLimit") ?? 12),
    notificationsEmail: String(formData.get("notificationsEmail")),
  });
  await writeAuditLog({
    actorId: null,
    action: "settings.updated",
    entityType: "settings",
    entityId: "default",
    severity: saved.formPrefillEnabled || saved.automatedDiscoveryEnabled ? "warn" : "info",
    message: "Safety settings updated. Manual approval remains locked on.",
    metadata: {
      automatedDiscoveryEnabled: saved.automatedDiscoveryEnabled,
      formPrefillEnabled: saved.formPrefillEnabled,
      requireApprovalForEveryEntry: saved.requireApprovalForEveryEntry,
    },
  });
  revalidateAll();
  redirect("/dashboard/settings");
}

function revalidateAll() {
  for (const path of [
    "/",
    "/sweepstakes",
    "/dashboard/sweepstakes",
    "/discovery",
    "/dashboard/discovery",
    "/extraction",
    "/scoring",
    "/queue",
    "/dashboard/queue",
    "/entries",
    "/dashboard",
    "/dashboard/entries",
    "/dashboard/entries/queue",
    "/dashboard/admin",
    "/vault",
    "/settings",
    "/dashboard/settings",
  ]) {
    revalidatePath(path);
  }
}

function normalizeDomainInput(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/^www\./, "");
  if (!trimmed) {
    throw new Error("Domain is required.");
  }

  const url = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  return getRegistrableDomain(url);
}
