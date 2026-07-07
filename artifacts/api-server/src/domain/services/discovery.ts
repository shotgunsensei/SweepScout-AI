import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { getSearchProvider, type SearchProvider, type SearchResult } from "@/lib/discovery/providers";
import { getRegistrableDomain, isBlockedDomain, normalizeDiscoveryUrl } from "@/lib/discovery/url";
import { classifySweepstakeCategory } from "@/lib/services/category-classifier";
import {
  assessLocationEligibility,
  buildLocalDiscoveryQueries,
  type LocationEligibilityAssessment,
} from "@/lib/services/location-eligibility";
import {
  applyReputationToSweepstake,
  findSponsorReputationForCandidate,
  getSponsorReputationReport,
  shouldBlockForReputation,
} from "@/lib/services/sponsor-reputation";
import { DEFAULT_ORGANIZATION_ID, assertCanCreateDiscoveryJob, assertCanSaveNewSweepstake } from "@/lib/services/tenancy";
import { getStore } from "@/lib/storage/store";
import type { DiscoveryJob, SponsorReputationReport, Sweepstake, UserProfile } from "@/lib/types";

export const DEFAULT_DISCOVERY_QUERIES = [
  "no purchase necessary sweepstakes enter online",
  "2026 sweepstakes no purchase necessary",
  "instant win game no purchase necessary",
  "sweepstakes official rules no purchase necessary",
  "enter sweepstakes online no purchase necessary",
];

export type DiscoveryRunInput = {
  queries?: string[];
  maxResults?: number;
  domainBlacklist?: string[];
  provider?: string;
  local?: boolean;
};

type DiscoveryCandidate = {
  title: string;
  normalizedUrl: string;
  sourceUrl: string;
  query: string;
  snippet: string;
  provider: string;
};

type DiscoveryLog = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
};

const DEFAULT_MAX_RESULTS = 15;
const MAX_RESULTS_LIMIT = 50;
const POLITE_DELAY_MS = 1250;

export async function createAndRunDiscovery(input: DiscoveryRunInput = {}) {
  await assertCanCreateDiscoveryJob();
  const store = await getStore();
  const queries = normalizeQueries(input.queries);
  const now = new Date().toISOString();
  const job: DiscoveryJob = {
    id: randomUUID(),
    organizationId: DEFAULT_ORGANIZATION_ID,
    label: "Sweepstakes search discovery",
    query: queries.join(" | "),
    seeds: queries,
    status: "queued",
    discoveredCount: 0,
    lastRunAt: null,
    createdAt: now,
    notes: "Queued discovery run.",
    scope: "general",
  };

  await store.saveDiscoveryJob(job);
  return runDiscoveryJob(job.id, input);
}

export async function createAndRunLocalDiscovery(input: DiscoveryRunInput = {}) {
  await assertCanCreateDiscoveryJob();
  const store = await getStore();
  const profile = await store.getUserProfile();
  const queries = normalizeQueries(input.queries?.length ? input.queries : buildLocalDiscoveryQueries(profile));
  const now = new Date().toISOString();
  const job: DiscoveryJob = {
    id: randomUUID(),
    organizationId: DEFAULT_ORGANIZATION_ID,
    label: "Local/regional sweepstakes discovery",
    query: queries.join(" | "),
    seeds: queries,
    status: "queued",
    discoveredCount: 0,
    lastRunAt: null,
    createdAt: now,
    notes: "Queued local discovery run.",
    scope: "local",
  };

  await store.saveDiscoveryJob(job);
  return runDiscoveryJob(job.id, { ...input, local: true });
}

export async function runDiscoveryJob(jobId: string, input: DiscoveryRunInput = {}) {
  const store = await getStore();
  const job = await store.getDiscoveryJob(jobId);
  if (!job) {
    throw new Error("Discovery job not found.");
  }

  const logs: DiscoveryLog[] = [];
  const startedAt = new Date().toISOString();
  const running: DiscoveryJob = {
    ...job,
    status: "running",
    lastRunAt: startedAt,
    notes: "Discovery run started.",
  };
  await store.saveDiscoveryJob(running);
  logDiscovery(logs, "info", "Discovery run started.", { jobId: job.id });

  try {
    const provider = getSearchProvider(input.provider);
    const localDiscovery = input.local ?? running.scope === "local";
    const profile = localDiscovery ? await store.getUserProfile() : null;
    const reputationReport = await getSponsorReputationReport();
    const candidates = await discoverCandidates({
      job: running,
      provider,
      maxResults: clampMaxResults(input.maxResults),
      requestedBlacklist: input.domainBlacklist ?? [],
      reputationReport,
      logs,
    });

    const saved = [];
    for (const candidate of candidates) {
      const location = profile
        ? assessLocationEligibility(
            {
              title: candidate.title,
              url: candidate.normalizedUrl,
              query: candidate.query,
              snippet: candidate.snippet,
            },
            profile,
          )
        : null;
      if (location?.requiresInPersonAppearance && !profile?.preferences.allowInPersonContests) {
        logDiscovery(logs, "warn", "Skipped in-person local contest by profile preference.", {
          title: candidate.title,
          url: candidate.normalizedUrl,
          score: location.score,
        });
        continue;
      }
      try {
        await assertCanSaveNewSweepstake();
        saved.push(await saveCandidate(candidate, { location, profile, localDiscovery, reputationReport }));
      } catch (error) {
        logDiscovery(logs, "warn", "Skipped because plan saved sweepstakes limit is reached.", {
          title: candidate.title,
          url: candidate.normalizedUrl,
          error: error instanceof Error ? error.message : "Plan limit reached.",
        });
        break;
      }
    }

    const completed: DiscoveryJob = {
      ...running,
      status: "completed",
      discoveredCount: saved.length,
      lastRunAt: new Date().toISOString(),
      notes: summarizeLogs(logs, saved.length),
    };
    await store.saveDiscoveryJob(completed);
    logDiscovery(logs, "info", "Discovery run completed.", { saved: saved.length });
    await writeAuditLog({
      actorId: null,
      action: "discovery.completed",
      entityType: "discovery_job",
      entityId: completed.id,
      severity: "info",
      message: `Discovery completed with ${saved.length} candidate${saved.length === 1 ? "" : "s"} saved.`,
      metadata: {
        saved: saved.length,
        skipped: logs.filter((log) => log.message.startsWith("Skipped")).length,
        provider: provider.name,
        localDiscovery,
      },
    });

    return { job: completed, sweepstakes: saved, logs };
  } catch (error) {
    logDiscovery(logs, "error", "Discovery run failed.", {
      error: error instanceof Error ? error.message : "Unknown discovery error.",
    });
    const failed: DiscoveryJob = {
      ...running,
      status: "failed",
      lastRunAt: new Date().toISOString(),
      notes: summarizeLogs(logs, 0),
    };
    await store.saveDiscoveryJob(failed);
    await writeAuditLog({
      actorId: null,
      action: "discovery.failed",
      entityType: "discovery_job",
      entityId: failed.id,
      severity: "warn",
      message: error instanceof Error ? error.message : "Discovery run failed.",
      metadata: { query: failed.query },
    });
    throw error;
  }
}

async function discoverCandidates(input: {
  job: DiscoveryJob;
  provider: SearchProvider;
  maxResults: number;
  requestedBlacklist: string[];
  reputationReport: SponsorReputationReport;
  logs: DiscoveryLog[];
}) {
  const store = await getStore();
  const existingUrls = new Set((await store.listSweepstakes()).map((item) => safeNormalize(item.url)).filter(Boolean));
  const blockedDomains = new Set([
    ...(await store.listBlockedDomains()).map((item) => item.domain),
    ...input.requestedBlacklist,
  ]);
  const queries = normalizeQueries(input.job.seeds.length ? input.job.seeds : [input.job.query]);
  const candidates = new Map<string, DiscoveryCandidate>();

  logDiscovery(input.logs, "info", "Using search provider.", { provider: input.provider.name });

  for (const [index, query] of queries.entries()) {
    if (candidates.size >= input.maxResults) {
      break;
    }
    if (index > 0) {
      await delay(POLITE_DELAY_MS);
    }

    logDiscovery(input.logs, "info", "Fetching search results.", { query });
    const results = await input.provider.search({
      query,
      maxResults: Math.min(input.maxResults, 10),
    });

    for (const result of results) {
      if (candidates.size >= input.maxResults) {
        break;
      }
      const candidate = normalizeResult(result, query, input.provider.name, input.logs);
      if (!candidate) {
        continue;
      }
      if (isBlockedDomain(candidate.normalizedUrl, blockedDomains)) {
        logDiscovery(input.logs, "warn", "Skipped blocked domain.", {
          domain: new URL(candidate.normalizedUrl).hostname,
          url: candidate.normalizedUrl,
        });
        continue;
      }
      const reputation = findSponsorReputationForCandidate(
        { url: candidate.normalizedUrl, sponsor: getRegistrableDomain(candidate.normalizedUrl) },
        input.reputationReport,
      );
      if (shouldBlockForReputation(reputation)) {
        logDiscovery(input.logs, "warn", "Skipped blocked reputation domain.", {
          domain: new URL(candidate.normalizedUrl).hostname,
          url: candidate.normalizedUrl,
          riskScore: reputation?.riskScore,
          reasons: reputation?.reasons.slice(0, 3),
        });
        continue;
      }
      if (existingUrls.has(candidate.normalizedUrl) || candidates.has(candidate.normalizedUrl)) {
        logDiscovery(input.logs, "info", "Skipped duplicate URL.", { url: candidate.normalizedUrl });
        continue;
      }
      candidates.set(candidate.normalizedUrl, candidate);
    }
  }

  return [...candidates.values()];
}

function normalizeResult(result: SearchResult, query: string, provider: string, logs: DiscoveryLog[]) {
  try {
    const normalizedUrl = normalizeDiscoveryUrl(result.url);
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== "https:") {
      logDiscovery(logs, "warn", "Skipped non-HTTPS result.", { url: result.url });
      return null;
    }
    return {
      title: result.title.trim() || parsed.hostname,
      normalizedUrl,
      sourceUrl: result.url,
      query,
      snippet: result.snippet,
      provider,
    };
  } catch {
    logDiscovery(logs, "warn", "Skipped invalid URL.", { url: result.url });
    return null;
  }
}

async function saveCandidate(
  candidate: DiscoveryCandidate,
  context: {
    location?: LocationEligibilityAssessment | null;
    profile?: UserProfile | null;
    localDiscovery?: boolean;
    reputationReport?: SponsorReputationReport;
  } = {},
) {
  const store = await getStore();
  const now = new Date().toISOString();
  const domain = getRegistrableDomain(candidate.normalizedUrl);
  const localNotes = context.location?.notes ?? [];
  const riskFlags: Sweepstake["riskFlags"] = [
    {
      code: "needs-rules-review",
      label: "Official rules extraction required",
      severity: "medium",
    },
  ];
  if (context.location?.requiresInPersonAppearance) {
    riskFlags.push({
      code: "in-person-required",
      label: "In-person appearance may be required",
      severity: context.profile?.preferences.allowInPersonContests ? "medium" : "high",
    });
  }
  const sweepstake: Sweepstake = {
    id: randomUUID(),
    organizationId: DEFAULT_ORGANIZATION_ID,
    title: candidate.title.slice(0, 180),
    sponsor: domain,
    url: candidate.normalizedUrl,
    source: candidate.provider,
    status: "discovered",
    category: classifySweepstakeCategory({
      title: candidate.title,
      sponsor: domain,
      url: candidate.normalizedUrl,
      text: candidate.snippet,
      eligibilitySummary: candidate.snippet,
    }),
    prizeRetailValue: null,
    country: "US",
    stateEligibility: ["ALL"],
    ageRequirement: null,
    startAt: null,
    endAt: null,
    entryFrequency: "Unknown",
    purchaseRequired: candidate.snippet.toLowerCase().includes("purchase required"),
    noPurchaseMethodFound: false,
    hasCaptcha: false,
    requiresAccount: false,
    eligibilitySummary: candidate.snippet || "Candidate discovered from search results. Rules review required before entry.",
    rulesUrl: candidate.normalizedUrl.toLowerCase().includes("rules") ? candidate.normalizedUrl : null,
    rulesText: null,
    rulesExtractedAt: null,
    formUrl: null,
    emailAlias: null,
    localRegion: context.location?.localRegion ?? null,
    locationEligibilityScore: context.location?.score ?? 50,
    locationEligibilityNotes: localNotes,
    requiresInPersonAppearance: context.location?.requiresInPersonAppearance ?? false,
    scamScore: 35,
    eligibilityScore: context.localDiscovery ? Math.max(25, context.location?.score ?? 50) : 50,
    riskFlags,
    complianceNotes: [
      "Needs review: official rules have not been extracted yet.",
      ...localNotes,
      "Reminder cadence: unknown frequency; require manual rules review before scheduling reminders.",
    ],
    createdAt: now,
    updatedAt: now,
  };
  const reputation = context.reputationReport
    ? findSponsorReputationForCandidate({ url: sweepstake.url, sponsor: sweepstake.sponsor }, context.reputationReport)
    : null;
  return store.saveSweepstake(applyReputationToSweepstake(sweepstake, reputation));
}

function normalizeQueries(queries: string[] | undefined) {
  const source = queries?.length ? queries : DEFAULT_DISCOVERY_QUERIES;
  return [...new Set(source.map((query) => query.trim()).filter(Boolean))];
}

function clampMaxResults(maxResults: number | undefined) {
  if (!maxResults || !Number.isFinite(maxResults)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.floor(maxResults)));
}

function safeNormalize(url: string) {
  try {
    return normalizeDiscoveryUrl(url);
  } catch {
    return null;
  }
}

function logDiscovery(logs: DiscoveryLog[], level: DiscoveryLog["level"], message: string, meta?: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), level, message, meta };
  logs.push(entry);
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  writer("[discovery]", entry);
}

function summarizeLogs(logs: DiscoveryLog[], saved: number) {
  const skipped = logs.filter((log) => log.message.startsWith("Skipped")).length;
  const errors = logs.filter((log) => log.level === "error").length;
  return JSON.stringify({
    saved,
    skipped,
    errors,
    logs: logs.slice(-25),
    guardrails: [
      "Search-result discovery only; no forms submitted.",
      "No CAPTCHA, bot-protection, robots, or rate-limit bypass attempted.",
      "Local discovery skips in-person-only contests unless the vault preference allows them.",
      `Polite delay: ${POLITE_DELAY_MS}ms between query requests.`,
    ],
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
