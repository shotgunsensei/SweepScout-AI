import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getStore } from "@/lib/storage/store";
import { getAppConfig } from "@/lib/env";
import { getAdminSession, requireAdmin, entriesToCsv } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { getRegistrableDomain } from "@/lib/discovery/url";
import { scoreSweepstake } from "@/lib/scoring";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertNoForbiddenVaultFields, assertNoForbiddenVaultValues } from "@/lib/profile-safety";
import { approveAssistantTask, recordEntryAttempt } from "@/lib/services/assistant";
import { runDiscoveryJob, createAndRunDiscovery } from "@/lib/services/discovery";
import { getEntryTrackingData, markEntryStatus } from "@/lib/services/entry-tracking";
import { runAssistedFormPrefill } from "@/lib/services/form-prefill";
import { runRulesExtraction } from "@/lib/services/openai-extraction";

const router: IRouter = Router();

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

function fail(res: Response, error: string, status = 400) {
  res.status(status).json({ ok: false, error });
}

function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function clientKey(req: Request) {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return forwarded || req.socket.remoteAddress || "local";
}

function bool(value: unknown) {
  return value === true || value === "on" || value === "true";
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
  return updated;
}

function normalizeDomainInput(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/^www\./, "");
  if (!trimmed) {
    throw new Error("Domain is required.");
  }
  const url = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  return getRegistrableDomain(url);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

router.get("/config", handler(async (_req, res) => {
  ok(res, getAppConfig());
}));

router.get("/dashboard", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.getDashboardData());
}));

router.get("/sweepstakes", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.listSweepstakes());
}));

router.get("/sweepstakes/:id", handler(async (req, res) => {
  const store = await getStore();
  const item = await store.getSweepstake(req.params.id);
  if (!item) {
    fail(res, "Sweepstake not found.", 404);
    return;
  }
  ok(res, item);
}));

router.get("/discovery/jobs", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.listDiscoveryJobs());
}));

router.get("/queue", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.listAssistantTasks());
}));

router.get("/prefill-queue", handler(async (_req, res) => {
  const store = await getStore();
  const [tasks, sweepstakes] = await Promise.all([store.listAssistantTasks(), store.listSweepstakes()]);
  ok(res, { tasks, sweepstakes });
}));

router.get("/entries", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.listEntryLogs());
}));

router.get("/entries/tracking", handler(async (_req, res) => {
  ok(res, await getEntryTrackingData());
}));

router.get("/entries/:id/review", handler(async (req, res) => {
  const store = await getStore();
  const entries = await store.listEntryLogs();
  const entry = entries.find((item) => item.id === req.params.id);
  if (!entry) {
    fail(res, "Entry not found.", 404);
    return;
  }
  const sweepstake = await store.getSweepstake(entry.sweepstakeId);
  const formUrl = entry.formUrl ?? sweepstake?.formUrl ?? sweepstake?.extractedRules?.formUrl ?? sweepstake?.url ?? null;
  ok(res, { entry, sweepstake, formUrl });
}));

router.get("/extraction", handler(async (_req, res) => {
  const store = await getStore();
  const [sweepstakes, jobs] = await Promise.all([store.listSweepstakes(), store.listExtractionJobs()]);
  ok(res, { sweepstakes, jobs, config: getAppConfig() });
}));

router.get("/scoring", handler(async (_req, res) => {
  const store = await getStore();
  const [sweepstakes, settings] = await Promise.all([store.listSweepstakes(), store.getSettings()]);
  ok(res, { sweepstakes, settings });
}));

router.get("/profile", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.getUserProfile());
}));

router.get("/settings", handler(async (_req, res) => {
  const store = await getStore();
  const [settings, config] = await Promise.all([store.getSettings(), Promise.resolve(getAppConfig())]);
  ok(res, { settings, config, mode: store.mode });
}));

router.get("/admin", handler(async (_req, res) => {
  const admin = await getAdminSession();
  if (!admin) {
    fail(res, "Admin access required.", 403);
    return;
  }
  const store = await getStore();
  const [discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs] = await Promise.all([
    store.listDiscoveryJobs(),
    store.listExtractionJobs(),
    store.listSweepstakes(),
    store.listBlockedDomains(),
    store.listEntryLogs(),
    store.listAuditLogs(30),
  ]);
  ok(res, { admin, discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs, config: getAppConfig() });
}));

router.get("/admin/export/entries", handler(async (_req, res) => {
  const admin = await getAdminSession();
  if (!admin) {
    fail(res, "Admin access required.", 403);
    return;
  }
  const store = await getStore();
  const entries = await store.listEntryLogs();
  const csv = entriesToCsv(entries);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sweepscout-entries.csv"');
  res.status(200).send(csv);
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

router.post("/discovery/run", handler(async (req, res) => {
  const rate = checkRateLimit(`discovery:${clientKey(req)}`, 6, 60_000);
  if (!rate.allowed) {
    fail(res, "Discovery is rate limited. Try again shortly.", 429);
    return;
  }
  const jobId = String(req.body?.jobId ?? "");
  const job = jobId ? await runDiscoveryJob(jobId) : await createAndRunDiscovery();
  ok(res, job);
}));

router.post("/extraction/run", handler(async (req, res) => {
  const sweepstakeId = String(req.body?.sweepstakeId ?? "");
  const job = await runRulesExtraction(sweepstakeId);
  ok(res, job);
}));

router.post("/scoring/rescore", handler(async (req, res) => {
  const updated = await rescoreSweepstakeById(String(req.body?.sweepstakeId ?? ""));
  ok(res, updated);
}));

router.post("/assistant/approve", handler(async (req, res) => {
  const task = await approveAssistantTask(String(req.body?.taskId ?? ""));
  ok(res, task);
}));

router.post("/entries/record", handler(async (req, res) => {
  const result = await recordEntryAttempt({
    sweepstakeId: String(req.body?.sweepstakeId ?? ""),
    userApproved: bool(req.body?.userApproved),
    reviewConfirmed: bool(req.body?.reviewConfirmed),
    purchaseRequiredAcknowledged: bool(req.body?.purchaseRequiredAcknowledged),
    notes: String(req.body?.notes ?? ""),
  });
  ok(res, result);
}));

router.post("/entries/status", handler(async (req, res) => {
  const result = await markEntryStatus({
    sweepstakeId: String(req.body?.sweepstakeId ?? ""),
    status: String(req.body?.status ?? "") as "submitted" | "skipped" | "suspicious" | "winner_notification" | "expired",
    userApproved: bool(req.body?.userApproved),
    reviewConfirmed: bool(req.body?.reviewConfirmed),
    purchaseRequiredAcknowledged: bool(req.body?.purchaseRequiredAcknowledged),
    notes: String(req.body?.notes ?? ""),
  });
  ok(res, result);
}));

router.post("/forms/prefill", handler(async (req, res) => {
  const rate = checkRateLimit(`prefill:${clientKey(req)}`, 8, 60_000);
  if (!rate.allowed) {
    fail(res, "Prefill is rate limited. Try again shortly.", 429);
    return;
  }
  const result = await runAssistedFormPrefill({
    sweepstakeId: String(req.body?.sweepstakeId ?? ""),
    formUrl: String(req.body?.formUrl ?? "") || undefined,
    userApproved: bool(req.body?.prefillApproved ?? req.body?.userApproved),
    useAiFallback: bool(req.body?.useAiFallback),
  });
  ok(res, result);
}));

router.put("/profile", handler(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  assertNoForbiddenVaultFields(Object.keys(body));
  assertNoForbiddenVaultValues(Object.values(body).map((value) => (value == null ? "" : String(value))));
  const store = await getStore();
  const current = await store.getUserProfile();
  const wantsPrefill = bool(body.consentToPrefill);
  const confirmedPrefill = bool(body.prefillConfirmation);

  if (wantsPrefill && !current.consentToPrefill && !confirmedPrefill) {
    fail(res, "Confirm the prefill safety warning before enabling form prefill.");
    return;
  }

  const saved = await store.saveUserProfile({
    ...current,
    email: String(body.email ?? current.email),
    alternateEmail: String(body.alternateEmail ?? ""),
    firstName: String(body.firstName ?? current.firstName),
    lastName: String(body.lastName ?? current.lastName),
    dob: String(body.dob ?? current.dob),
    state: String(body.state ?? current.state),
    country: String(body.country ?? current.country),
    phone: String(body.phone ?? ""),
    address1: String(body.address1 ?? ""),
    address2: String(body.address2 ?? ""),
    city: String(body.city ?? ""),
    postalCode: String(body.postalCode ?? ""),
    consentToPrefill: wantsPrefill,
    preferences: {
      categories: String(body.categories ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      maxDailyEntries: Number(body.maxDailyEntries ?? 12),
      avoidPurchaseRequired: bool(body.avoidPurchaseRequired),
      allowSocialActions: bool(body.allowSocialActions),
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
  ok(res, saved);
}));

router.put("/settings", handler(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const store = await getStore();
  const saved = await store.saveSettings({
    automatedDiscoveryEnabled: bool(body.automatedDiscoveryEnabled),
    formPrefillEnabled: bool(body.formPrefillEnabled),
    discoveryCadence: String(body.discoveryCadence ?? ""),
    minEligibilityScore: Number(body.minEligibilityScore ?? 72),
    maxScamScore: Number(body.maxScamScore ?? 54),
    requireApprovalForEveryEntry: true,
    dailyEntryLimit: Number(body.dailyEntryLimit ?? 12),
    notificationsEmail: String(body.notificationsEmail ?? ""),
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
  ok(res, saved);
}));

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

router.post("/admin/retry-extraction", handler(async (req, res) => {
  await requireAdmin();
  const job = await runRulesExtraction(String(req.body?.sweepstakeId ?? ""));
  ok(res, job);
}));

router.post("/admin/rescore", handler(async (req, res) => {
  await requireAdmin();
  const updated = await rescoreSweepstakeById(String(req.body?.sweepstakeId ?? ""));
  ok(res, updated);
}));

router.post("/admin/block-domain", handler(async (req, res) => {
  await requireAdmin();
  const store = await getStore();
  const domain = normalizeDomainInput(String(req.body?.domain ?? ""));
  const saved = await store.saveBlockedDomain({
    id: randomUUID(),
    domain,
    reason: String(req.body?.reason ?? "Blocked from admin debug panel.").trim() || "Blocked from admin debug panel.",
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
  ok(res, saved);
}));

export default router;
