import { getRegistrableDomain, normalizeDiscoveryUrl } from "@/lib/discovery/url";
import { getStore } from "@/lib/storage/store";
import type {
  BlockedDomain,
  InboxAlert,
  SponsorDomainReputation,
  SponsorReputationMetrics,
  SponsorReputationReport,
  Sweepstake,
} from "@/lib/types";

type MutableReputation = {
  domain: string;
  sponsor: string | null;
  metrics: SponsorReputationMetrics;
  reasons: Set<string>;
  lastSeenAt: string | null;
};

const EMPTY_METRICS: SponsorReputationMetrics = {
  sweepstakesCount: 0,
  inboxAlertCount: 0,
  spamComplaints: 0,
  suspiciousFields: 0,
  phishingFlags: 0,
  excessiveEmailVolume: 0,
  misleadingPrizeLanguage: 0,
  duplicateSweepstakes: 0,
  missingOfficialRules: 0,
  userBlockedSponsor: 0,
};

export async function getSponsorReputationReport(): Promise<SponsorReputationReport> {
  const store = await getStore();
  const [settings, sweepstakes, alerts, blockedDomains] = await Promise.all([
    store.getSettings(),
    store.listSweepstakes(),
    store.listInboxAlerts(500),
    store.listBlockedDomains(),
  ]);
  return buildSponsorReputationReport({
    sweepstakes,
    alerts,
    blockedDomains,
    excessiveEmailThreshold: Math.max(1, settings.emailAliases.excessiveEmailThreshold),
  });
}

export function buildSponsorReputationReport(input: {
  sweepstakes: Sweepstake[];
  alerts: InboxAlert[];
  blockedDomains: BlockedDomain[];
  excessiveEmailThreshold: number;
}): SponsorReputationReport {
  const rows = new Map<string, MutableReputation>();
  const sweepstakesById = new Map(input.sweepstakes.map((item) => [item.id, item]));
  const titleCountsByDomain = new Map<string, Map<string, number>>();
  const urlCounts = new Map<string, number>();

  for (const sweepstake of input.sweepstakes) {
    const domain = domainForSweepstake(sweepstake);
    const row = ensureRow(rows, domain, sweepstake.sponsor);
    row.metrics.sweepstakesCount += 1;
    updateLastSeen(row, sweepstake.updatedAt ?? sweepstake.createdAt);

    if (!sweepstake.rulesUrl && !sweepstake.rulesText && !sweepstake.extractedRules) {
      row.metrics.missingOfficialRules += 1;
      row.reasons.add("Missing official rules on saved sweepstakes.");
    }
    if (hasSuspiciousFields(sweepstake)) {
      row.metrics.suspiciousFields += 1;
      row.reasons.add("Sensitive or suspicious form fields were detected.");
    }
    if (hasMisleadingPrizeLanguage(sweepstake)) {
      row.metrics.misleadingPrizeLanguage += 1;
      row.reasons.add("Prize language appears inflated, unclear, or misleading.");
    }
    if (sweepstake.riskFlags.some((flag) => flag.code === "user-blocked-domain")) {
      row.metrics.userBlockedSponsor += 1;
      row.reasons.add("User previously blocked this sponsor or domain.");
    }

    const titleKey = normalizeTitle(sweepstake.title);
    const byTitle = titleCountsByDomain.get(domain) ?? new Map<string, number>();
    byTitle.set(titleKey, (byTitle.get(titleKey) ?? 0) + 1);
    titleCountsByDomain.set(domain, byTitle);

    const normalizedUrl = safeNormalizeUrl(sweepstake.url);
    if (normalizedUrl) {
      urlCounts.set(normalizedUrl, (urlCounts.get(normalizedUrl) ?? 0) + 1);
    }
  }

  for (const [domain, counts] of titleCountsByDomain.entries()) {
    const duplicateTitles = [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
    if (duplicateTitles > 0) {
      const row = ensureRow(rows, domain, null);
      row.metrics.duplicateSweepstakes += duplicateTitles;
      row.reasons.add("Repeated duplicate sweepstakes titles detected for this sponsor/domain.");
    }
  }

  for (const sweepstake of input.sweepstakes) {
    const normalizedUrl = safeNormalizeUrl(sweepstake.url);
    if (normalizedUrl && (urlCounts.get(normalizedUrl) ?? 0) > 1) {
      const row = ensureRow(rows, domainForSweepstake(sweepstake), sweepstake.sponsor);
      row.metrics.duplicateSweepstakes += 1;
      row.reasons.add("Repeated duplicate sweepstakes URLs detected.");
    }
  }

  for (const alert of input.alerts) {
    const domain = domainForAlert(alert, sweepstakesById);
    const matched = alert.matchedSweepstakeId ? sweepstakesById.get(alert.matchedSweepstakeId) : null;
    const row = ensureRow(rows, domain, matched?.sponsor ?? null);
    row.metrics.inboxAlertCount += 1;
    updateLastSeen(row, alert.receivedAt);

    if (alert.categories.includes("unsubscribe_spam")) {
      row.metrics.spamComplaints += 1;
      row.reasons.add("Unsubscribe-heavy spam pattern detected.");
    }
    if (alert.categories.includes("phishing_risk")) {
      row.metrics.phishingFlags += 1;
      row.reasons.add("Phishing-risk inbox alert detected.");
    }
    if (alert.riskFlags.length > 0) {
      row.metrics.phishingFlags += alert.riskFlags.some((flag) => /payment|sensitive|shortener|not https|domain differs/i.test(flag)) ? 1 : 0;
    }
  }

  for (const row of rows.values()) {
    if (row.metrics.inboxAlertCount >= input.excessiveEmailThreshold) {
      row.metrics.excessiveEmailVolume += 1;
      row.reasons.add(`Excessive email volume met threshold (${row.metrics.inboxAlertCount}/${input.excessiveEmailThreshold}).`);
    }
  }

  for (const blocked of input.blockedDomains) {
    const domain = blocked.domain.toLowerCase().replace(/^www\./, "");
    const row = ensureRow(rows, domain, null);
    row.metrics.userBlockedSponsor += 1;
    row.reasons.add(blocked.reason || "User blocked this sponsor/domain.");
    updateLastSeen(row, blocked.createdAt);
  }

  const records = [...rows.values()]
    .map(finalizeReputation)
    .sort((a, b) => b.riskScore - a.riskScore || a.domain.localeCompare(b.domain));

  return {
    generatedAt: new Date().toISOString(),
    records,
    totals: {
      domainsTracked: records.length,
      downrankedDomains: records.filter((record) => record.recommendation === "downrank").length,
      blockedDomains: records.filter((record) => record.recommendation === "block").length,
      criticalDomains: records.filter((record) => record.riskLevel === "critical").length,
    },
  };
}

export function findSponsorReputationForSweepstake(
  sweepstake: Pick<Sweepstake, "url" | "sponsor">,
  report: SponsorReputationReport,
) {
  return findSponsorReputationForCandidate({ url: sweepstake.url, sponsor: sweepstake.sponsor }, report);
}

export function findSponsorReputationForCandidate(
  candidate: { url: string; sponsor?: string | null },
  report: SponsorReputationReport,
) {
  const domain = safeDomain(candidate.url);
  const sponsor = normalizeSponsor(candidate.sponsor);
  return (
    report.records.find((record) => record.domain === domain) ??
    report.records.find((record) => normalizeSponsor(record.sponsor) === sponsor && sponsor.length > 0) ??
    null
  );
}

export function applyReputationToSweepstake(
  sweepstake: Sweepstake,
  reputation: SponsorDomainReputation | null | undefined,
): Sweepstake {
  if (!reputation || reputation.recommendation === "allow") {
    return sweepstake;
  }

  const severity = reputation.recommendation === "block" || reputation.riskScore >= 80 ? "high" : "medium";
  const scamPenalty = reputation.recommendation === "block" ? 35 : reputation.riskScore >= 70 ? 22 : 12;
  const eligibilityPenalty = reputation.recommendation === "block" ? 30 : reputation.riskScore >= 70 ? 18 : 8;
  const alreadyApplied = sweepstake.riskFlags.some((flag) => flag.code === "sponsor-reputation");
  const riskFlag = {
    code: "sponsor-reputation",
    label: `Sponsor/domain reputation ${reputation.riskScore}/100`,
    severity,
  } satisfies Sweepstake["riskFlags"][number];

  return {
    ...sweepstake,
    status:
      sweepstake.status === "eligible" || sweepstake.status === "discovered" || sweepstake.status === "watching"
        ? "suspicious"
        : sweepstake.status,
    scamScore: alreadyApplied ? sweepstake.scamScore : clamp(sweepstake.scamScore + scamPenalty, 0, 100),
    eligibilityScore: alreadyApplied ? sweepstake.eligibilityScore : clamp(sweepstake.eligibilityScore - eligibilityPenalty, 0, 100),
    riskFlags: [
      ...sweepstake.riskFlags.filter((flag) => flag.code !== riskFlag.code),
      riskFlag,
    ],
    complianceNotes: [
      ...new Set([
        `Needs review: sponsor/domain reputation is ${reputation.riskLevel} (${reputation.riskScore}/100).`,
        ...reputation.reasons.slice(0, 3).map((reason) => `Reputation signal: ${reason}`),
        ...sweepstake.complianceNotes,
      ]),
    ],
  };
}

export function shouldBlockForReputation(reputation: SponsorDomainReputation | null | undefined) {
  return reputation?.recommendation === "block";
}

function ensureRow(rows: Map<string, MutableReputation>, domain: string, sponsor: string | null) {
  const key = domain || normalizeSponsor(sponsor) || "unknown";
  const existing = rows.get(key);
  if (existing) {
    existing.sponsor ??= sponsor;
    return existing;
  }
  const row: MutableReputation = {
    domain: key,
    sponsor,
    metrics: { ...EMPTY_METRICS },
    reasons: new Set<string>(),
    lastSeenAt: null,
  };
  rows.set(key, row);
  return row;
}

function finalizeReputation(row: MutableReputation): SponsorDomainReputation {
  const riskScore = clamp(
    row.metrics.userBlockedSponsor * 35 +
      row.metrics.phishingFlags * 18 +
      row.metrics.suspiciousFields * 16 +
      row.metrics.excessiveEmailVolume * 14 +
      row.metrics.spamComplaints * 10 +
      row.metrics.misleadingPrizeLanguage * 10 +
      row.metrics.duplicateSweepstakes * 8 +
      row.metrics.missingOfficialRules * 6,
    0,
    100,
  );
  const riskLevel = riskScore >= 90 ? "critical" : riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";
  const recommendation =
    riskScore >= 90 || row.metrics.userBlockedSponsor > 0 || row.metrics.phishingFlags >= 2
      ? "block"
      : riskScore >= 45
        ? "downrank"
        : "allow";

  return {
    domain: row.domain,
    sponsor: row.sponsor,
    riskScore,
    riskLevel,
    recommendation,
    reasons: [...row.reasons].slice(0, 8),
    metrics: row.metrics,
    lastSeenAt: row.lastSeenAt,
    updatedAt: new Date().toISOString(),
  };
}

function domainForSweepstake(sweepstake: Pick<Sweepstake, "url" | "sponsor">) {
  return safeDomain(sweepstake.url) || normalizeSponsor(sweepstake.sponsor) || "unknown";
}

function domainForAlert(alert: InboxAlert, sweepstakesById: Map<string, Sweepstake>) {
  if (alert.matchedSweepstakeId) {
    const sweepstake = sweepstakesById.get(alert.matchedSweepstakeId);
    if (sweepstake) return domainForSweepstake(sweepstake);
  }
  const senderDomain = alert.fromEmail?.split("@")[1]?.toLowerCase().replace(/^www\./, "") ?? null;
  return senderDomain || alert.links.find((link) => link.domain)?.domain || "unknown";
}

function safeDomain(value: string | null | undefined) {
  if (!value) return "";
  try {
    return getRegistrableDomain(value).toLowerCase().replace(/^www\./, "");
  } catch {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  }
}

function safeNormalizeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    return normalizeDiscoveryUrl(value);
  } catch {
    return null;
  }
}

function hasSuspiciousFields(sweepstake: Sweepstake) {
  return Boolean(
    sweepstake.extractedRules?.ssnRequested ||
      sweepstake.extractedRules?.bankingInfoRequested ||
      sweepstake.extractedRules?.purchaseOrPaymentRequested ||
      sweepstake.riskFlags.some((flag) => ["ssn-before-winning", "bank-info", "purchase-required"].includes(flag.code)),
  );
}

function hasMisleadingPrizeLanguage(sweepstake: Sweepstake) {
  const text = `${sweepstake.title} ${sweepstake.eligibilitySummary} ${sweepstake.extractedRules?.prizeSummary ?? ""}`.toLowerCase();
  return (
    /\b(guaranteed winner|you'?re selected|luxury voucher|too good to miss|exclusive reward|claim now)\b/.test(text) ||
    (Number(sweepstake.prizeRetailValue ?? 0) >= 10_000 && (!sweepstake.rulesUrl || sweepstake.noPurchaseMethodFound)) ||
    sweepstake.riskFlags.some((flag) => flag.code === "high-prize")
  );
}

function updateLastSeen(row: MutableReputation, value: string | null | undefined) {
  if (!value) return;
  if (!row.lastSeenAt || new Date(value).getTime() > new Date(row.lastSeenAt).getTime()) {
    row.lastSeenAt = value;
  }
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeSponsor(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9. -]+/g, "").trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
