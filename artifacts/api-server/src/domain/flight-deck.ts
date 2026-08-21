import type { AuthContext } from "@/lib/auth/session";
import { AlertsRepository } from "@/lib/alerts";
import { PersonalizationRepository } from "@/lib/personalization";
import { parseRadarFilters, SupabaseRadarRepository, type RadarOpportunity, type RadarPage } from "@/lib/radar";
import { getStore } from "@/lib/storage/store";
import type { DashboardData, Sweepstake } from "@/lib/types";

type FlightDeckDependencies = {
  radar: Pick<SupabaseRadarRepository, "search">;
  personalization: Pick<PersonalizationRepository, "hangar" | "missionLog">;
  alerts: Pick<AlertsRepository, "summary">;
};

type FlightDeckNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  sweepstakes_id: string | null;
  source_reference: string;
  priority: number;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FlightDeckData = {
  generatedAt: string;
  opportunities: RadarOpportunity[];
  notifications: FlightDeckNotification[];
  stats: {
    opportunityMatches: number;
    eligibleMatches: number;
    endingSoon: number;
    riskFlags: number;
    saved: number;
    entriesToday: number;
    dueEntries: number;
    unreadAlerts: number;
  };
};

export async function getFlightDeckData(
  auth: Pick<AuthContext, "mode" | "userId">,
  dependencies?: FlightDeckDependencies,
): Promise<FlightDeckData> {
  if (auth.mode === "local") {
    const store = await getStore();
    return localFlightDeck(await store.getDashboardData());
  }

  const resolved = dependencies ?? {
    radar: new SupabaseRadarRepository(),
    personalization: new PersonalizationRepository(),
    alerts: new AlertsRepository(),
  };
  const [radar, hangar, missionLog, alerts] = await Promise.all([
    resolved.radar.search(auth.userId, parseRadarFilters({ sort: "recommended", page: 1, pageSize: 8 })),
    resolved.personalization.hangar(auth.userId, { sort: "saved_desc" }),
    resolved.personalization.missionLog(auth.userId),
    resolved.alerts.summary(auth.userId),
  ]);
  return buildCloudFlightDeck({ radar, hangar, missionLog, alerts });
}

export function buildCloudFlightDeck(input: {
  radar: RadarPage;
  hangar: { total: number };
  missionLog: { enteredToday: unknown[]; dailyDue: unknown[] };
  alerts: { notifications: FlightDeckNotification[]; unreadCount: number };
}): FlightDeckData {
  const now = Date.now();
  const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const endingSoon = input.radar.items.filter((item) => {
    const deadline = item.endAt ? Date.parse(item.endAt) : Number.NaN;
    return Number.isFinite(deadline) && deadline >= now && deadline <= sevenDays;
  }).length;
  const riskFlags = input.radar.items.filter((item) =>
    item.legitimacyScore < 40 || item.qualityWarnings.some((warning) => ["high", "critical"].includes(warning.severity)),
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    opportunities: input.radar.items,
    notifications: input.alerts.notifications.slice(0, 6),
    stats: {
      opportunityMatches: input.radar.total,
      eligibleMatches: input.radar.items.filter((item) => item.eligibilityStatus === "eligible").length,
      endingSoon,
      riskFlags,
      saved: input.hangar.total,
      entriesToday: input.missionLog.enteredToday.length,
      dueEntries: input.missionLog.dailyDue.length,
      unreadAlerts: input.alerts.unreadCount,
    },
  };
}

function localFlightDeck(data: DashboardData): FlightDeckData {
  const notifications: FlightDeckNotification[] = data.inboxAlerts
    .filter((alert) => alert.status === "new")
    .map((alert) => ({
      id: alert.id,
      type: alert.categories[0] ?? "general",
      title: alert.subject,
      body: alert.snippet,
      sweepstakes_id: alert.matchedSweepstakeId,
      source_reference: alert.messageId,
      priority: alert.severity === "danger" ? 90 : alert.severity === "warn" ? 70 : 40,
      read_at: null,
      metadata: { reviewRequired: alert.reviewRequired },
      created_at: alert.receivedAt,
    }));
  const today = new Date().toISOString().slice(0, 10);
  return {
    generatedAt: new Date().toISOString(),
    opportunities: data.sweepstakes.slice(0, 8).map(localOpportunity),
    notifications: notifications.slice(0, 6),
    stats: {
      opportunityMatches: data.stats.activeSweepstakes,
      eligibleMatches: data.sweepstakes.filter((item) => item.status === "eligible").length,
      endingSoon: data.stats.endingSoon,
      riskFlags: data.stats.highRiskCount,
      saved: 0,
      entriesToday: data.entryLogs.filter((entry) => entry.attemptedAt.slice(0, 10) === today).length,
      dueEntries: 0,
      unreadAlerts: notifications.length,
    },
  };
}

function localOpportunity(item: Sweepstake): RadarOpportunity {
  const purchaseRequired = item.purchaseRequired;
  return {
    id: item.id,
    title: item.title,
    sponsor: item.sponsor,
    summary: item.eligibilitySummary,
    officialUrl: item.url,
    rulesUrl: item.rulesUrl,
    startAt: item.startAt,
    endAt: item.endAt,
    timezone: "UTC",
    estimatedPrizeValue: item.prizeRetailValue,
    currency: "USD",
    entryFrequency: item.entryFrequency,
    entryEffortScore: Math.max(0, Math.min(100, 100 - item.eligibilityScore)),
    legitimacyScore: Math.max(0, Math.min(100, 100 - item.scamScore)),
    sourceConfidenceScore: Math.max(0, Math.min(100, 100 - item.scamScore)),
    status: item.status,
    lastVerifiedAt: item.rulesExtractedAt,
    firstDiscoveredAt: item.createdAt,
    primaryPrize: item.extractedRules?.prizeSummary ?? item.category,
    prizes: [],
    eligibility: {
      minimumAge: item.ageRequirement,
      maximumAge: null,
      countries: item.country ? [item.country] : [],
      regions: item.stateEligibility,
      excludedRegions: [],
      employeeExclusions: null,
      otherRestrictions: item.eligibilitySummary,
    },
    entryMethods: item.formUrl ? [{ methodType: "web", description: "Sponsor-controlled entry page", entryUrl: item.formUrl, frequency: item.entryFrequency, purchaseRequired, socialPlatform: null, estimatedMinutes: null }] : [],
    categories: [item.category],
    qualityWarnings: item.riskFlags.map((flag) => ({ type: flag.code, severity: flag.severity, details: { label: flag.label } })),
    sources: [{ name: item.source, attribution: item.source, lastSeenAt: item.updatedAt }],
    saved: false,
    userStatus: null,
    popularity: 0,
    matchScore: item.eligibilityScore,
    matchFactors: [],
    eligibilityStatus: item.status === "eligible" ? "eligible" : item.status === "ineligible" ? "ineligible" : "review",
    sourceType: item.sourceType ?? "brand",
    creator: item.creator ?? null,
  };
}
