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
import { answerSweepScoutAssistant } from "@/lib/services/assistant-insights";
import { analyzeExtensionPage, saveExtensionPage } from "@/lib/services/browser-extension";
import { billingSummary, changeStripeSubscription, createStripeCheckoutSession, createStripePortalSession, handleStripeWebhook, setStripeCancellation, withPilotCredits } from "@/lib/services/billing";
import type { CreditOperation } from "@/lib/billing";
import { normalizeCategoryPreferences } from "@/lib/services/category-classifier";
import {
  complianceReportToCsv,
  complianceSweepstakeReportToCsv,
  complianceSweepstakeReportToPdf,
  getComplianceReport,
  getComplianceSweepstakeReport,
} from "@/lib/services/compliance-report";
import { getDailyWorkflowData } from "@/lib/services/daily-workflow";
import { runDiscoveryJob, createAndRunDiscovery, createAndRunLocalDiscovery } from "@/lib/services/discovery";
import { generateMissingSweepstakeAliases, getSpamSourceReport } from "@/lib/services/email-aliases";
import { getEntryTrackingData, markEntryStatus } from "@/lib/services/entry-tracking";
import { runAssistedFormPrefill } from "@/lib/services/form-prefill";
import { runImport } from "@/lib/services/imports";
import { getInboxStatus, pollInboxNow, reviewInboxAlert } from "@/lib/services/inbox-monitor";
import { normalizeNearbyMetros } from "@/lib/services/location-eligibility";
import { runRulesExtraction } from "@/lib/services/openai-extraction";
import { getRoiReport } from "@/lib/services/roi-report";
import {
  checkRulesNow,
  getRulesMonitorStatus,
  reviewRulesChangeAlert,
  startRulesChangeMonitoring,
} from "@/lib/services/rules-change-monitor";
import { findSponsorReputationForSweepstake, getSponsorReputationReport } from "@/lib/services/sponsor-reputation";
import {
  DEFAULT_ORGANIZATION_ID,
  assertCanCreateDiscoveryJob,
  assertFeatureAllowed,
  getActiveTenant,
  getSaaSAdminSummary,
} from "@/lib/services/tenancy";
import {
  listDiscoveredUrlReviews,
  listRegisteredSources,
  listSourceScanHistory,
  registerSource,
  reviewDiscoveredUrl,
  runRegisteredSource,
  updateRegisteredSource,
} from "@/lib/scanner/admin";
import { runQueuedDiscoveryEnrichment, undoAdministrativeMerge } from "@/lib/enrichment/admin";
import { requireRequestAuth } from "@/lib/auth/session";
import { parseRadarFilters, SupabaseRadarRepository } from "@/lib/radar";
import { PersonalizationRepository } from "@/lib/personalization";

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

function creditIdempotencyKey(req: Request, operation: CreditOperation, source: string) {
  const supplied = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  const token = (supplied || randomUUID()).replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 160);
  return `action:${requireRequestAuth(req).userId}:${operation}:${source.slice(0, 80)}:${token}`;
}

async function rescoreSweepstakeById(sweepstakeId: string) {
  const store = await getStore();
  const sweepstake = await store.getSweepstake(sweepstakeId);
  if (!sweepstake) {
    throw new Error("Sweepstake not found.");
  }
  const profile = await store.getUserProfile();
  const [allSweepstakes, reputationReport] = await Promise.all([store.listSweepstakes(), getSponsorReputationReport()]);
  const scored = scoreSweepstake(
    sweepstake,
    profile,
    undefined,
    allSweepstakes,
    findSponsorReputationForSweepstake(sweepstake, reputationReport),
  );
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

function safeFilename(value: string) {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return name || "sweepstake";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

router.get("/admin/access", handler(async (req, res) => {
  const admin = await requireAdmin(req);
  ok(res, { authorized: true, admin });
}));

router.get("/admin/sources", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await listRegisteredSources());
}));

router.get("/admin/sources/:id/jobs", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await listSourceScanHistory(String(req.params.id), Number(req.query.limit ?? 50)));
}));

router.get("/admin/discovered-urls", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await listDiscoveredUrlReviews(String(req.query.status ?? "new"), Number(req.query.limit ?? 100)));
}));

router.post("/admin/discovered-urls/:id/enrich", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await runQueuedDiscoveryEnrichment(String(req.params.id)), 202);
}));

router.post("/admin/merges/:id/undo", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await undoAdministrativeMerge(String(req.params.id), requireRequestAuth(req).userId));
}));

router.get("/config", handler(async (_req, res) => {
  ok(res, getAppConfig());
}));

router.get("/dashboard", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.getDashboardData());
}));

router.get("/radar", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new SupabaseRadarRepository().search(auth.userId, parseRadarFilters(req.query)));
}));

router.get("/opportunities/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new SupabaseRadarRepository().detail(auth.userId, String(req.params.id)));
}));

router.put("/opportunities/:id/save", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new SupabaseRadarRepository().setSaved(auth.userId, String(req.params.id), req.body?.saved === true));
}));

router.put("/opportunities/:id/status", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new SupabaseRadarRepository().setStatus(auth.userId, String(req.params.id), String(req.body?.status ?? "")));
}));

router.get("/hangar", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().hangar(auth.userId, req.query));
}));

router.put("/hangar/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().updateSaved(auth.userId, String(req.params.id), req.body ?? {}));
}));

router.post("/hangar/bulk", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().bulk(auth.userId, req.body ?? {}));
}));

router.get("/mission-log", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().missionLog(auth.userId));
}));

router.get("/opportunities/:id/notes", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().notes(auth.userId, String(req.params.id)));
}));

router.post("/opportunities/:id/notes", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().addNote(auth.userId, String(req.params.id), req.body?.note), 201);
}));

router.put("/notes/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().updateNote(auth.userId, String(req.params.id), req.body?.note));
}));

router.delete("/notes/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().deleteNote(auth.userId, String(req.params.id)));
}));

router.get("/search-profiles", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().profiles(auth.userId));
}));

router.post("/search-profiles", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().createProfile(auth.userId, req.body ?? {}), 201);
}));

router.put("/search-profiles/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().updateProfile(auth.userId, String(req.params.id), req.body ?? {}));
}));

router.delete("/search-profiles/:id", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().deleteProfile(auth.userId, String(req.params.id)));
}));

router.get("/search-profile-alerts", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await new PersonalizationRepository().profileAlerts(auth.userId));
}));

router.get("/personal/calendar.ics", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  const calendar = await new PersonalizationRepository().calendar(auth.userId);
  res.type("text/calendar").setHeader("Content-Disposition", 'attachment; filename="play-pack-pilot-missions.ics"');
  res.send(calendar);
}));

router.get("/tenant", handler(async (_req, res) => {
  ok(res, await getActiveTenant());
}));

router.get("/sweepstakes", handler(async (_req, res) => {
  const store = await getStore();
  ok(res, await store.listSweepstakes());
}));

router.get("/sweepstakes/:id", handler(async (req, res) => {
  const store = await getStore();
  const item = await store.getSweepstake(String(req.params.id ?? ""));
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

router.get("/daily-workflow", handler(async (_req, res) => {
  ok(res, await getDailyWorkflowData());
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

router.get("/inbox/status", handler(async (_req, res) => {
  ok(res, await getInboxStatus());
}));

router.get("/inbox/alerts", handler(async (req, res) => {
  const store = await getStore();
  ok(res, await store.listInboxAlerts(Number(req.query.limit ?? 100)));
}));

router.get("/spam-report", handler(async (_req, res) => {
  ok(res, await getSpamSourceReport());
}));

router.get("/reputation", handler(async (_req, res) => {
  ok(res, await getSponsorReputationReport());
}));

router.get("/roi-report", handler(async (_req, res) => {
  await assertFeatureAllowed("advancedReporting");
  ok(res, await getRoiReport());
}));

router.get("/reports/compliance", handler(async (_req, res) => {
  await assertFeatureAllowed("advancedReporting");
  ok(res, await getComplianceReport());
}));

router.get("/reports/compliance.csv", handler(async (_req, res) => {
  await assertFeatureAllowed("advancedReporting");
  const report = await getComplianceReport();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sweepscout-compliance-reports.csv"');
  res.status(200).send(complianceReportToCsv(report));
}));

router.get("/reports/compliance/:id.csv", handler(async (req, res) => {
  await assertFeatureAllowed("advancedReporting");
  const report = await getComplianceSweepstakeReport(String(req.params.id ?? ""));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(report.title)}-compliance.csv"`);
  res.status(200).send(complianceSweepstakeReportToCsv(report));
}));

router.get("/reports/compliance/:id.pdf", handler(async (req, res) => {
  await assertFeatureAllowed("advancedReporting");
  const report = await getComplianceSweepstakeReport(String(req.params.id ?? ""));
  const pdf = complianceSweepstakeReportToPdf(report);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(report.title)}-compliance.pdf"`);
  res.status(200).send(pdf);
}));

router.get("/rules-monitor/status", handler(async (_req, res) => {
  ok(res, await getRulesMonitorStatus());
}));

router.get("/rules-monitor/alerts", handler(async (req, res) => {
  const store = await getStore();
  ok(res, await store.listRulesChangeAlerts(Number(req.query.limit ?? 100)));
}));

router.post("/extension/analyze", handler(async (req, res) => {
  await assertFeatureAllowed("browserExtension");
  ok(res, await analyzeExtensionPage(req.body));
}));

router.get("/billing/summary", handler(async (req, res) => {
  ok(res, await billingSummary(requireRequestAuth(req).userId));
}));

router.get("/admin", handler(async (req, res) => {
  const admin = await getAdminSession(req);
  if (!admin) {
    fail(res, "Admin access required.", 403);
    return;
  }
  const store = await getStore();
  const [discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs, saas, reputation] = await Promise.all([
    store.listDiscoveryJobs(),
    store.listExtractionJobs(),
    store.listSweepstakes(),
    store.listBlockedDomains(),
    store.listEntryLogs(),
    store.listAuditLogs(30),
    getSaaSAdminSummary(),
    getSponsorReputationReport(),
  ]);
  ok(res, { admin, discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs, saas, reputation, config: getAppConfig() });
}));

router.get("/admin/export/entries", handler(async (req, res) => {
  const admin = await getAdminSession(req);
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

router.post("/admin/sources", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await registerSource(req.body ?? {}), 201);
}));

router.put("/admin/sources/:id", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await updateRegisteredSource(String(req.params.id), req.body ?? {}));
}));

router.post("/admin/sources/:id/run", handler(async (req, res) => {
  await requireAdmin(req);
  ok(res, await runRegisteredSource(String(req.params.id)), 202);
}));

router.put("/admin/discovered-urls/:id/review", handler(async (req, res) => {
  await requireAdmin(req);
  const decision = req.body?.decision;
  if (decision !== "queue" && decision !== "reject") return fail(res, "Decision must be queue or reject.");
  ok(res, await reviewDiscoveredUrl(String(req.params.id), decision));
}));

router.post("/discovery/run", handler(async (req, res) => {
  const rate = checkRateLimit(`discovery:${clientKey(req)}`, 6, 60_000);
  if (!rate.allowed) {
    fail(res, "Discovery is rate limited. Try again shortly.", 429);
    return;
  }
  const jobId = String(req.body?.jobId ?? "");
  if (jobId) {
    await assertCanCreateDiscoveryJob();
  }
  const job = jobId ? await runDiscoveryJob(jobId) : await createAndRunDiscovery();
  ok(res, job);
}));

router.post("/discovery/run-local", handler(async (req, res) => {
  const rate = checkRateLimit(`discovery-local:${clientKey(req)}`, 4, 60_000);
  if (!rate.allowed) {
    fail(res, "Local discovery is rate limited. Try again shortly.", 429);
    return;
  }
  const job = await createAndRunLocalDiscovery({
    maxResults: Number(req.body?.maxResults || 15) || undefined,
    provider: String(req.body?.provider ?? "") || undefined,
  });
  ok(res, job);
}));

router.post("/imports/csv", handler(async (req, res) => {
  const rate = checkRateLimit(`imports-csv:${clientKey(req)}`, 8, 60_000);
  if (!rate.allowed) {
    fail(res, "CSV import is rate limited. Try again shortly.", 429);
    return;
  }
  ok(
    res,
    await runImport({
      source: "csv",
      csvText: String(req.body?.csvText ?? ""),
      extractRules: req.body?.extractRules === undefined ? true : bool(req.body.extractRules),
    }),
  );
}));

router.post("/imports/urls", handler(async (req, res) => {
  const rate = checkRateLimit(`imports-urls:${clientKey(req)}`, 8, 60_000);
  if (!rate.allowed) {
    fail(res, "URL import is rate limited. Try again shortly.", 429);
    return;
  }
  ok(
    res,
    await runImport({
      source: "url_list",
      urlsText: String(req.body?.urlsText ?? ""),
      extractRules: req.body?.extractRules === undefined ? true : bool(req.body.extractRules),
    }),
  );
}));

router.post("/imports/bookmarks", handler(async (req, res) => {
  const rate = checkRateLimit(`imports-bookmarks:${clientKey(req)}`, 8, 60_000);
  if (!rate.allowed) {
    fail(res, "Bookmark import is rate limited. Try again shortly.", 429);
    return;
  }
  ok(
    res,
    await runImport({
      source: "bookmarks",
      bookmarkHtml: String(req.body?.bookmarkHtml ?? ""),
      extractRules: req.body?.extractRules === undefined ? true : bool(req.body.extractRules),
    }),
  );
}));

router.post("/imports/manual", handler(async (req, res) => {
  const rate = checkRateLimit(`imports-manual:${clientKey(req)}`, 20, 60_000);
  if (!rate.allowed) {
    fail(res, "Manual import is rate limited. Try again shortly.", 429);
    return;
  }
  ok(
    res,
    await runImport({
      source: "manual",
      manual: {
        url: String(req.body?.url ?? ""),
        title: String(req.body?.title ?? ""),
        sponsor: String(req.body?.sponsor ?? ""),
        rulesUrl: String(req.body?.rulesUrl ?? ""),
        formUrl: String(req.body?.formUrl ?? ""),
        text: String(req.body?.notes ?? ""),
      },
      extractRules: req.body?.extractRules === undefined ? true : bool(req.body.extractRules),
    }),
  );
}));

router.post("/imports/text", handler(async (req, res) => {
  const rate = checkRateLimit(`imports-text:${clientKey(req)}`, 12, 60_000);
  if (!rate.allowed) {
    fail(res, "Text import is rate limited. Try again shortly.", 429);
    return;
  }
  ok(
    res,
    await runImport({
      source: "text",
      text: {
        url: String(req.body?.url ?? ""),
        title: String(req.body?.title ?? ""),
        sponsor: String(req.body?.sponsor ?? ""),
        rulesUrl: String(req.body?.rulesUrl ?? ""),
        formUrl: String(req.body?.formUrl ?? ""),
        text: String(req.body?.manualText ?? req.body?.text ?? ""),
      },
      extractRules: req.body?.extractRules === undefined ? false : bool(req.body.extractRules),
    }),
  );
}));

router.post("/extraction/run", handler(async (req, res) => {
  await assertFeatureAllowed("scoring");
  const auth = requireRequestAuth(req);
  const sweepstakeId = String(req.body?.sweepstakeId ?? "");
  const metered = await withPilotCredits({ userId: auth.userId, operation: "official_rules_extraction", sourceReference: sweepstakeId, idempotencyKey: creditIdempotencyKey(req, "official_rules_extraction", sweepstakeId), execute: () => runRulesExtraction(sweepstakeId) });
  ok(res, { ...metered.value, creditUsage: { cost: metered.cost, balance: metered.balance } });
}));

router.post("/scoring/rescore", handler(async (req, res) => {
  await assertFeatureAllowed("scoring");
  const auth = requireRequestAuth(req);
  const sweepstakeId = String(req.body?.sweepstakeId ?? "");
  const metered = await withPilotCredits({ userId: auth.userId, operation: "personalized_fit", sourceReference: sweepstakeId, idempotencyKey: creditIdempotencyKey(req, "personalized_fit", sweepstakeId), execute: () => rescoreSweepstakeById(sweepstakeId) });
  ok(res, { ...metered.value, creditUsage: { cost: metered.cost, balance: metered.balance } });
}));

router.post("/assistant/ask", handler(async (req, res) => {
  const rate = checkRateLimit(`assistant-ask:${clientKey(req)}`, 20, 60_000);
  if (!rate.allowed) {
    fail(res, "AI assistant is rate limited. Try again shortly.", 429);
    return;
  }
  const auth = requireRequestAuth(req);
  const source = String(req.body?.sweepstakeId ?? req.body?.intent ?? "assistant");
  const metered = await withPilotCredits({ userId: auth.userId, operation: "personalized_report", sourceReference: source, idempotencyKey: creditIdempotencyKey(req, "personalized_report", source), execute: () => answerSweepScoutAssistant(req.body) });
  ok(res, { ...metered.value, creditUsage: { cost: metered.cost, balance: metered.balance } });
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
    timeSpentMinutes: Number(req.body?.timeSpentMinutes || 0) || undefined,
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
    timeSpentMinutes: Number(req.body?.timeSpentMinutes || 0) || undefined,
    notes: String(req.body?.notes ?? ""),
  });
  ok(res, result);
}));

router.post("/forms/prefill", handler(async (req, res) => {
  await assertFeatureAllowed("prefill");
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

router.post("/extension/save", handler(async (req, res) => {
  await assertFeatureAllowed("browserExtension");
  ok(res, await saveExtensionPage(req.body));
}));

router.post("/sweepstakes/:id/block-domain", handler(async (req, res) => {
  const store = await getStore();
  const sweepstake = await store.getSweepstake(String(req.params.id ?? ""));
  if (!sweepstake) {
    fail(res, "Sweepstake not found.", 404);
    return;
  }
  const domain = normalizeDomainInput(sweepstake.url);
  const reason =
    String(req.body?.reason ?? "").trim() ||
    `Blocked from daily workflow after user review of ${sweepstake.title}.`;
  const saved = await store.saveBlockedDomain({
    id: randomUUID(),
    organizationId: sweepstake.organizationId,
    domain,
    reason,
    createdAt: new Date().toISOString(),
  });
  await store.saveSweepstake({
    ...sweepstake,
    status: "rejected",
    riskFlags: [
      ...sweepstake.riskFlags.filter((flag) => flag.code !== "user-blocked-domain"),
      { code: "user-blocked-domain", label: "User blocked sponsor/domain", severity: "high" },
    ],
    complianceNotes: [...new Set([`User blocked ${domain}.`, ...sweepstake.complianceNotes])],
    updatedAt: new Date().toISOString(),
  });
  await writeAuditLog({
    actorId: null,
    action: "sweepstake.domain_blocked",
    entityType: "blocked_domain",
    entityId: saved.domain,
    severity: "block",
    message: `Domain ${saved.domain} was blocked after user review.`,
    metadata: { domain: saved.domain, sweepstakeId: sweepstake.id, sweepstakeTitle: sweepstake.title },
  });
  ok(res, saved);
}));

router.post("/inbox/poll", handler(async (_req, res) => {
  await assertFeatureAllowed("inboxMonitoring");
  ok(res, await pollInboxNow());
}));

router.post("/inbox/alerts/:id/review", handler(async (req, res) => {
  const result = await reviewInboxAlert({
    id: String(req.params.id ?? ""),
    status: String(req.body?.status ?? "reviewed") as "new" | "reviewed" | "dismissed",
    notes: String(req.body?.notes ?? ""),
  });
  ok(res, result);
}));

router.post("/aliases/generate", handler(async (_req, res) => {
  ok(res, await generateMissingSweepstakeAliases());
}));

router.post("/rules-monitor/check", handler(async (req, res) => {
  await assertFeatureAllowed("advancedReporting");
  ok(res, await checkRulesNow({ sweepstakeId: String(req.body?.sweepstakeId ?? "") || undefined, force: true }));
}));

router.post("/billing/checkout", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await createStripeCheckoutSession(auth.userId, { planKey: String(req.body?.planKey ?? "") as any, interval: req.body?.interval === "year" ? "year" : "month" }));
}));

router.post("/billing/portal", handler(async (req, res) => {
  ok(res, await createStripePortalSession(requireRequestAuth(req).userId));
}));

router.post("/billing/subscription/change", handler(async (req, res) => {
  const auth = requireRequestAuth(req);
  ok(res, await changeStripeSubscription(auth.userId, { planKey: String(req.body?.planKey ?? "") as any, interval: req.body?.interval === "year" ? "year" : "month" }));
}));

router.post("/billing/subscription/cancel", handler(async (req, res) => {
  ok(res, await setStripeCancellation(requireRequestAuth(req).userId, true));
}));

router.post("/billing/subscription/resume", handler(async (req, res) => {
  ok(res, await setStripeCancellation(requireRequestAuth(req).userId, false));
}));

router.post("/billing/webhook", handler(async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    fail(res, "Raw webhook body was not captured.", 400);
    return;
  }
  ok(
    res,
    await handleStripeWebhook(rawBody, req.headers["stripe-signature"] as string | undefined),
  );
}));

router.post("/rules-monitor/alerts/:id/review", handler(async (req, res) => {
  const result = await reviewRulesChangeAlert({
    id: String(req.params.id ?? ""),
    status: String(req.body?.status ?? "reviewed") as "new" | "reviewed" | "dismissed",
    notes: String(req.body?.notes ?? ""),
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
      categories: normalizeCategoryPreferences(String(body.categories ?? current.preferences.categories.join(",")).split(",")),
      nearbyMetros: normalizeNearbyMetros(body.nearbyMetros ?? current.preferences.nearbyMetros),
      maxDailyEntries: Number(body.maxDailyEntries ?? 12),
      avoidPurchaseRequired: bool(body.avoidPurchaseRequired),
      allowSocialActions: bool(body.allowSocialActions),
      allowInPersonContests: bool(body.allowInPersonContests),
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
  const currentSettings = await store.getSettings();
  const saved = await store.saveSettings({
    automatedDiscoveryEnabled: bool(body.automatedDiscoveryEnabled),
    formPrefillEnabled: bool(body.formPrefillEnabled),
    discoveryCadence: String(body.discoveryCadence ?? ""),
    minEligibilityScore: Number(body.minEligibilityScore ?? 72),
    maxScamScore: Number(body.maxScamScore ?? 54),
    requireApprovalForEveryEntry: true,
    dailyEntryLimit: Number(body.dailyEntryLimit ?? 12),
    notificationsEmail: String(body.notificationsEmail ?? ""),
    emailAliases: {
      ...currentSettings.emailAliases,
      enabled: bool(body.emailAliasesEnabled),
      baseEmail: String(body.emailAliasBaseEmail ?? currentSettings.emailAliases.baseEmail),
      prefix: String(body.emailAliasPrefix ?? currentSettings.emailAliases.prefix),
      nextSequence: Number(body.emailAliasNextSequence ?? currentSettings.emailAliases.nextSequence),
      excessiveEmailThreshold: Number(
        body.emailAliasExcessiveEmailThreshold ?? currentSettings.emailAliases.excessiveEmailThreshold,
      ),
      spamWindowDays: Number(body.emailAliasSpamWindowDays ?? currentSettings.emailAliases.spamWindowDays),
    },
    roi: {
      ...currentSettings.roi,
      manualEntryMinutes: Number(body.roiManualEntryMinutes ?? currentSettings.roi.manualEntryMinutes),
      prefillReviewMinutes: Number(body.roiPrefillReviewMinutes ?? currentSettings.roi.prefillReviewMinutes),
      prefillSavedMinutes: Number(body.roiPrefillSavedMinutes ?? currentSettings.roi.prefillSavedMinutes),
      defaultWinProbabilityBasisPoints: Number(
        body.roiDefaultWinProbabilityBasisPoints ?? currentSettings.roi.defaultWinProbabilityBasisPoints,
      ),
    },
    rulesMonitor: {
      ...currentSettings.rulesMonitor,
      enabled: bool(body.rulesMonitorEnabled),
      pollIntervalMinutes: Number(body.rulesMonitorPollIntervalMinutes ?? currentSettings.rulesMonitor.pollIntervalMinutes),
      maxChecksPerRun: Number(body.rulesMonitorMaxChecksPerRun ?? currentSettings.rulesMonitor.maxChecksPerRun),
    },
    inbox: {
      ...currentSettings.inbox,
      enabled: bool(body.inboxEnabled),
      provider: body.inboxProvider === "imap" ? "imap" : "gmail",
      email: String(body.inboxEmail ?? ""),
      host: String(body.inboxHost ?? ""),
      port: Number(body.inboxPort ?? currentSettings.inbox.port),
      mailbox: String(body.inboxMailbox ?? currentSettings.inbox.mailbox),
      pollIntervalMinutes: Number(body.inboxPollIntervalMinutes ?? currentSettings.inbox.pollIntervalMinutes),
      maxMessagesPerPoll: Number(body.inboxMaxMessagesPerPoll ?? currentSettings.inbox.maxMessagesPerPoll),
    },
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
  await startRulesChangeMonitoring();
  ok(res, saved);
}));

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

router.post("/admin/retry-extraction", handler(async (req, res) => {
  await requireAdmin(req);
  const job = await runRulesExtraction(String(req.body?.sweepstakeId ?? ""));
  ok(res, job);
}));

router.post("/admin/rescore", handler(async (req, res) => {
  await requireAdmin(req);
  const updated = await rescoreSweepstakeById(String(req.body?.sweepstakeId ?? ""));
  ok(res, updated);
}));

router.post("/admin/block-domain", handler(async (req, res) => {
  await requireAdmin(req);
  const store = await getStore();
  const domain = normalizeDomainInput(String(req.body?.domain ?? ""));
  const saved = await store.saveBlockedDomain({
    id: randomUUID(),
    organizationId: DEFAULT_ORGANIZATION_ID,
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
