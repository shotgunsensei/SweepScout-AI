import { getSpamSourceReport } from "@/lib/services/email-aliases";
import { normalizePrizeCategory } from "@/lib/services/category-classifier";
import { getStore } from "@/lib/storage/store";
import type {
  AppSettings,
  EntryLog,
  RoiCategorySummary,
  RoiReport,
  RoiSweepstakeSummary,
  RoiVolumePoint,
  SpamSourceReport,
  Sweepstake,
} from "@/lib/types";

const SUBMITTED_STATUSES = new Set<EntryLog["status"]>(["submitted"]);
const WIN_STATUSES = new Set<EntryLog["status"]>(["winner_notification"]);
const SUSPICIOUS_REJECTED_ENTRY_STATUSES = new Set<EntryLog["status"]>([
  "suspicious",
  "rejected",
  "failed",
  "blocked",
]);
const SUSPICIOUS_REJECTED_SWEEPSTAKE_STATUSES = new Set<Sweepstake["status"]>([
  "suspicious",
  "rejected",
  "ineligible",
]);

export async function getRoiReport(): Promise<RoiReport> {
  const store = await getStore();
  const [sweepstakes, entries, settings, spamReport] = await Promise.all([
    store.listSweepstakes(),
    store.listEntryLogs(),
    store.getSettings(),
    getSpamSourceReport(),
  ]);
  return buildRoiReport({ sweepstakes, entries, settings, spamReport });
}

export function buildRoiReport(input: {
  sweepstakes: Sweepstake[];
  entries: EntryLog[];
  settings: AppSettings;
  spamReport: SpamSourceReport;
}): RoiReport {
  const now = new Date();
  const sweepstakesById = new Map(input.sweepstakes.map((sweepstake) => [sweepstake.id, sweepstake]));
  const submittedEntries = input.entries.filter((entry) => SUBMITTED_STATUSES.has(entry.status));
  const winEntries = input.entries.filter((entry) => WIN_STATUSES.has(entry.status));
  const estimatedPrizeValue = submittedEntries.reduce(
    (sum, entry) => sum + (sweepstakesById.get(entry.sweepstakeId)?.prizeRetailValue ?? 0),
    0,
  );
  const timeSpentMinutes = input.entries.reduce(
    (sum, entry) => sum + (entry.timeSpentMinutes ?? estimateEntryMinutes(entry, input.settings)),
    0,
  );
  const hoursSpent = round(timeSpentMinutes / 60, 1);
  const hoursSavedByPrefill = round(
    input.entries.reduce((sum, entry) => sum + (entry.prefillSavedMinutes ?? 0), 0) / 60,
    1,
  );
  const winRate = submittedEntries.length ? (winEntries.length / submittedEntries.length) * 100 : 0;
  const baselineWinRate = input.settings.roi.defaultWinProbabilityBasisPoints / 100;
  const effectiveWinRate = Math.max(winRate, baselineWinRate);
  const expectedValueEstimate = estimatedPrizeValue * (effectiveWinRate / 100);
  const suspiciousRejectedCount =
    input.entries.filter((entry) => SUSPICIOUS_REJECTED_ENTRY_STATUSES.has(entry.status)).length +
    input.sweepstakes.filter((sweepstake) => SUSPICIOUS_REJECTED_SWEEPSTAKE_STATUSES.has(sweepstake.status)).length;

  return {
    generatedAt: now.toISOString(),
    settings: input.settings.roi,
    stats: {
      entriesSubmitted: submittedEntries.length,
      estimatedPrizeValue,
      timeSpentMinutes,
      hoursSpent,
      hoursSavedByPrefill,
      winRate: round(winRate, 2),
      winsTracked: winEntries.length,
      suspiciousRejectedCount,
      expectedValueEstimate,
      expectedValuePerHour: hoursSpent > 0 ? expectedValueEstimate / hoursSpent : expectedValueEstimate,
      activeSweepstakes: input.sweepstakes.filter((sweepstake) => sweepstake.status !== "expired" && sweepstake.status !== "rejected").length,
    },
    volume: {
      daily: buildDailyVolume(submittedEntries, now),
      weekly: buildWeeklyVolume(submittedEntries, now),
      monthly: buildMonthlyVolume(submittedEntries, now),
    },
    highestValueSweepstakes: input.sweepstakes
      .slice()
      .sort((a, b) => (b.prizeRetailValue ?? 0) - (a.prizeRetailValue ?? 0))
      .slice(0, 8)
      .map((sweepstake) => summarizeSweepstake(sweepstake, submittedEntries)),
    soonestDeadlines: input.sweepstakes
      .filter((sweepstake) => {
        const deadline = parseDate(sweepstake.endAt);
        return deadline && deadline.getTime() >= now.getTime() && sweepstake.status !== "expired" && sweepstake.status !== "rejected";
      })
      .sort((a, b) => new Date(a.endAt ?? 0).getTime() - new Date(b.endAt ?? 0).getTime())
      .slice(0, 8)
      .map((sweepstake) => summarizeSweepstake(sweepstake, submittedEntries)),
    bestCategories: buildCategorySummaries({
      sweepstakes: input.sweepstakes,
      submittedEntries,
      winEntries,
      spamReport: input.spamReport,
      baselineWinRate,
    }),
    worstSpamSources: input.spamReport.domains.slice(0, 8).map((source) => ({
      domain: source.domain,
      sponsor: source.sponsor,
      emailCount: source.emailCount,
      spamCount: source.spamCount,
      phishingCount: source.phishingCount,
      excessiveVolume: source.excessiveVolume,
      riskLevel: source.riskLevel,
    })),
  };
}

function buildCategorySummaries(input: {
  sweepstakes: Sweepstake[];
  submittedEntries: EntryLog[];
  winEntries: EntryLog[];
  spamReport: SpamSourceReport;
  baselineWinRate: number;
}): RoiCategorySummary[] {
  const sweepstakesById = new Map(input.sweepstakes.map((sweepstake) => [sweepstake.id, sweepstake]));
  const spamBySweepstake = new Map(input.spamReport.aliases.map((alias) => [alias.sweepstakeId, alias.spamCount]));
  const rows = new Map<
    string,
    {
      category: string;
      entriesSubmitted: number;
      estimatedPrizeValue: number;
      wins: number;
      spamAlerts: number;
      eligibilityScoreTotal: number;
      eligibilityScoreCount: number;
    }
  >();

  for (const entry of input.submittedEntries) {
    const sweepstake = sweepstakesById.get(entry.sweepstakeId);
    if (!sweepstake) continue;
    const category = normalizePrizeCategory(sweepstake.category);
    const row =
      rows.get(category) ??
      {
        category,
        entriesSubmitted: 0,
        estimatedPrizeValue: 0,
        wins: 0,
        spamAlerts: 0,
        eligibilityScoreTotal: 0,
        eligibilityScoreCount: 0,
      };
    row.entriesSubmitted += 1;
    row.estimatedPrizeValue += sweepstake.prizeRetailValue ?? 0;
    row.eligibilityScoreTotal += sweepstake.eligibilityScore;
    row.eligibilityScoreCount += 1;
    rows.set(category, row);
  }

  for (const win of input.winEntries) {
    const sweepstake = sweepstakesById.get(win.sweepstakeId);
    if (!sweepstake) continue;
    const row = rows.get(normalizePrizeCategory(sweepstake.category));
    if (row) row.wins += 1;
  }

  for (const sweepstake of input.sweepstakes) {
    const row = rows.get(normalizePrizeCategory(sweepstake.category));
    if (row) row.spamAlerts += spamBySweepstake.get(sweepstake.id) ?? 0;
  }

  return [...rows.values()]
    .map((row) => {
      const winRate = row.entriesSubmitted ? (row.wins / row.entriesSubmitted) * 100 : 0;
      const effectiveWinRate = Math.max(winRate, input.baselineWinRate);
      return {
        category: row.category,
        entriesSubmitted: row.entriesSubmitted,
        estimatedPrizeValue: row.estimatedPrizeValue,
        expectedValue: row.estimatedPrizeValue * (effectiveWinRate / 100),
        winRate: round(winRate, 2),
        spamAlerts: row.spamAlerts,
        averageEligibilityScore: row.eligibilityScoreCount ? Math.round(row.eligibilityScoreTotal / row.eligibilityScoreCount) : 0,
      };
    })
    .sort(
      (a, b) =>
        b.expectedValue - a.expectedValue ||
        b.averageEligibilityScore - a.averageEligibilityScore ||
        a.spamAlerts - b.spamAlerts,
    )
    .slice(0, 8);
}

function summarizeSweepstake(sweepstake: Sweepstake, submittedEntries: EntryLog[]): RoiSweepstakeSummary {
  return {
    sweepstakeId: sweepstake.id,
    title: sweepstake.title,
    sponsor: sweepstake.sponsor,
    category: normalizePrizeCategory(sweepstake.category),
    prizeRetailValue: sweepstake.prizeRetailValue,
    deadline: sweepstake.endAt,
    eligibilityScore: sweepstake.eligibilityScore,
    scamScore: sweepstake.scamScore,
    entryCount: submittedEntries.filter((entry) => entry.sweepstakeId === sweepstake.id).length,
  };
}

function buildDailyVolume(entries: EntryLog[], now: Date): RoiVolumePoint[] {
  const start = startOfDay(now);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (13 - index));
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    return {
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      count: countEntriesBetween(entries, date, next),
    };
  });
}

function buildWeeklyVolume(entries: EntryLog[], now: Date): RoiVolumePoint[] {
  const start = startOfWeek(now);
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (7 * (7 - index)));
    const next = new Date(date);
    next.setDate(date.getDate() + 7);
    return {
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      count: countEntriesBetween(entries, date, next),
    };
  });
}

function buildMonthlyVolume(entries: EntryLog[], now: Date): RoiVolumePoint[] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() - (11 - index), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return {
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date),
      count: countEntriesBetween(entries, date, next),
    };
  });
}

function countEntriesBetween(entries: EntryLog[], start: Date, end: Date) {
  return entries.filter((entry) => {
    const date = parseDate(entry.submittedAt ?? entry.attemptedAt);
    return date && date.getTime() >= start.getTime() && date.getTime() < end.getTime();
  }).length;
}

function estimateEntryMinutes(entry: EntryLog, settings: AppSettings) {
  if (entry.status === "prefilled") return settings.roi.prefillReviewMinutes;
  if (entry.status === "submitted") return settings.roi.manualEntryMinutes;
  if (entry.status === "winner_notification") return 3;
  if (entry.status === "suspicious" || entry.status === "skipped" || entry.status === "rejected") return 2;
  return 1;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value: Date) {
  const start = startOfDay(value);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function round(value: number, places: number) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}
