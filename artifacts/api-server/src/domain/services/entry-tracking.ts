import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { ensureSweepstakeEmailAlias } from "@/lib/services/email-aliases";
import { assertNoForbiddenSensitiveText } from "@/lib/profile-safety";
import { assertEntryApproval } from "@/lib/safety";
import { categoryPriority, normalizeCategoryPreferences, normalizePrizeCategory } from "@/lib/services/category-classifier";
import { getStore } from "@/lib/storage/store";
import type { EntryLog, EntryStatus, PrizeCategory, Sweepstake } from "@/lib/types";

export type EntryFrequency = "daily" | "weekly" | "monthly" | "one_time" | "unknown";

export type EntryQueueItem = {
  sweepstake: Sweepstake;
  frequency: EntryFrequency;
  frequencyLabel: string;
  canEnter: boolean;
  nextEntryAt: string | null;
  lastSubmittedAt: string | null;
  blockedReason: string | null;
  categoryPriority: number;
  categoryPreferred: boolean;
};

export type ReminderDay = {
  date: string;
  label: string;
  reminders: EntryQueueItem[];
};

export type EntryTrackingData = {
  eligibleQueue: EntryQueueItem[];
  submittedEntries: EntryLog[];
  expiringSoon: EntryQueueItem[];
  suspiciousRejected: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }>;
  wonNotifications: EntryLog[];
  reminders: ReminderDay[];
};

export type MarkEntryStatusInput = {
  sweepstakeId: string;
  status: Extract<EntryStatus, "submitted" | "skipped" | "suspicious" | "winner_notification" | "expired">;
  userApproved?: boolean;
  reviewConfirmed?: boolean;
  purchaseRequiredAcknowledged?: boolean;
  timeSpentMinutes?: number;
  notes?: string;
};

const SUBMITTED_STATUSES = new Set<EntryStatus>(["submitted"]);
const WINDOW_DECISION_STATUSES = new Set<EntryStatus>(["submitted", "skipped"]);

export async function getEntryTrackingData(): Promise<EntryTrackingData> {
  const store = await getStore();
  const [sweepstakes, entries, profile] = await Promise.all([
    store.listSweepstakes(),
    store.listEntryLogs(),
    store.getUserProfile(),
  ]);
  return buildEntryTrackingData(sweepstakes, entries, new Date(), profile.preferences.categories);
}

export function buildEntryTrackingData(
  sweepstakes: Sweepstake[],
  entries: EntryLog[],
  now = new Date(),
  categoryPreferences: readonly string[] = [],
): EntryTrackingData {
  const preferences = normalizeCategoryPreferences(categoryPreferences);
  const queueItems = sweepstakes
    .map((sweepstake) => buildQueueItem(sweepstake, entries, now, preferences))
    .sort((a, b) => sortQueueItems(a, b, now));
  const eligibleQueue = queueItems.filter((item) => isQueueEligible(item.sweepstake) && item.canEnter);
  const expiringSoon = queueItems.filter((item) => {
    const deadline = parseDate(item.sweepstake.endAt);
    if (!deadline) return false;
    const delta = deadline.getTime() - now.getTime();
    return delta >= 0 && delta <= 7 * 24 * 60 * 60 * 1000;
  });

  const suspiciousRejected = sweepstakes
    .filter((item) => ["suspicious", "ineligible", "expired", "rejected", "needs_review"].includes(item.status))
    .map((sweepstake) => ({
      sweepstake,
      latestEntry: latestEntryFor(sweepstake.id, entries),
      reason: sweepstake.complianceNotes[0] ?? sweepstake.riskFlags[0]?.label ?? "Manual review required.",
    }));

  return {
    eligibleQueue,
    submittedEntries: entries.filter((entry) => entry.status === "submitted").sort(sortEntriesNewest),
    expiringSoon,
    suspiciousRejected,
    wonNotifications: entries.filter((entry) => entry.status === "winner_notification").sort(sortEntriesNewest),
    reminders: buildReminderDays(queueItems, now),
  };
}

export async function markEntryStatus(input: MarkEntryStatusInput) {
  const store = await getStore();
  const [sweepstake, entries, settings] = await Promise.all([
    store.getSweepstake(input.sweepstakeId),
    store.listEntryLogs(),
    store.getSettings(),
  ]);
  if (!sweepstake) {
    throw new Error("Sweepstake not found.");
  }

  if (!input.reviewConfirmed) {
    throw new Error("Confirm that you reviewed this entry before changing its tracking status.");
  }

  const notes = input.notes?.trim() || defaultStatusNote(input.status);
  assertNoForbiddenSensitiveText(notes);

  if (input.status === "submitted") {
    assertEntryApproval({
      userApproved: Boolean(input.userApproved),
      purchaseRequired: sweepstake.purchaseRequired,
      noPurchaseMethodFound: sweepstake.noPurchaseMethodFound,
      reviewConfirmed: Boolean(input.reviewConfirmed),
    });
    const queueItem = buildQueueItem(sweepstake, entries);
    if (!queueItem.canEnter) {
      throw new Error(queueItem.blockedReason ?? "Entry frequency limit prevents another submission right now.");
    }
  }

  const aliasAssignment = await ensureSweepstakeEmailAlias(sweepstake);
  const sweepstakeForEntry = aliasAssignment.sweepstake;
  const now = new Date().toISOString();
  const entry: EntryLog = {
    id: `entry-${randomUUID()}`,
    organizationId: sweepstakeForEntry.organizationId,
    sweepstakeId: sweepstakeForEntry.id,
    sweepstakeTitle: sweepstakeForEntry.title,
    status: input.status,
    attemptedAt: now,
    submittedAt: input.status === "submitted" ? now : null,
    confirmationCode: null,
    notes,
    emailAlias: aliasAssignment.alias,
    timeSpentMinutes: input.timeSpentMinutes ?? estimatedStatusMinutes(input.status, settings.roi.manualEntryMinutes),
    prefillSavedMinutes: 0,
    formUrl: sweepstakeForEntry.formUrl ?? sweepstakeForEntry.extractedRules?.formUrl ?? sweepstakeForEntry.url,
    screenshotPath: null,
    prefillFields: [],
    blockers: [],
    userApproved: input.status === "submitted" ? Boolean(input.userApproved) : false,
    purchaseRequiredAcknowledged: Boolean(input.purchaseRequiredAcknowledged),
  };

  const saved = await store.saveEntryLog(entry);
  await writeAuditLog({
    actorId: null,
    action: `entry.${input.status}`,
    entityType: "entry_attempt",
    entityId: saved.id,
    severity: input.status === "suspicious" ? "warn" : "info",
    message: `Entry marked ${input.status} after per-entry review confirmation.`,
    metadata: {
      sweepstakeId: sweepstake.id,
      sweepstakeTitle: sweepstake.title,
      userApproved: saved.userApproved,
      hasCaptcha: sweepstake.hasCaptcha,
      purchaseRequired: sweepstake.purchaseRequired,
      noPurchaseMethodFound: sweepstake.noPurchaseMethodFound,
      emailAlias: saved.emailAlias,
    },
  });

  if (input.status === "suspicious") {
    await store.saveSweepstake({
      ...sweepstake,
      status: "suspicious",
      complianceNotes: [...new Set(["Marked suspicious from entry tracking.", ...sweepstake.complianceNotes])],
      updatedAt: now,
    });
  }

  if (input.status === "expired") {
    await store.saveSweepstake({ ...sweepstake, status: "expired", updatedAt: now });
  }

  return saved;
}

export function normalizeEntryFrequency(value: string): EntryFrequency {
  const normalized = value.toLowerCase();
  if (normalized.includes("daily") || normalized.includes("per day")) return "daily";
  if (normalized.includes("weekly") || normalized.includes("per week")) return "weekly";
  if (normalized.includes("monthly") || normalized.includes("per month")) return "monthly";
  if (normalized.includes("one") || normalized.includes("single") || normalized.includes("once")) return "one_time";
  return "unknown";
}

export function frequencyLabel(frequency: EntryFrequency) {
  if (frequency === "daily") return "Daily";
  if (frequency === "weekly") return "Weekly";
  if (frequency === "monthly") return "Monthly";
  if (frequency === "one_time") return "One-time";
  return "Unknown";
}

function buildQueueItem(
  sweepstake: Sweepstake,
  entries: EntryLog[],
  now = new Date(),
  categoryPreferences: readonly PrizeCategory[] = normalizeCategoryPreferences([]),
): EntryQueueItem {
  const frequency = normalizeEntryFrequency(sweepstake.entryFrequency);
  const lastSubmittedAt = latestSubmittedAt(sweepstake.id, entries);
  const nextEntryAt = nextAvailableAt(frequency, lastSubmittedAt);
  const deadline = parseDate(sweepstake.endAt);
  const currentWindowDecision = latestCurrentWindowDecision(sweepstake.id, entries, frequency, now);
  const expired = deadline ? deadline.getTime() < now.getTime() : sweepstake.status === "expired";
  const category = normalizePrizeCategory(sweepstake.category);

  let blockedReason: string | null = null;
  if (expired) {
    blockedReason = "Deadline has passed.";
  } else if (!isQueueEligible(sweepstake)) {
    blockedReason = "Sweepstake is not eligible for entry tracking.";
  } else if ((frequency === "one_time" || frequency === "unknown") && lastSubmittedAt) {
    blockedReason =
      frequency === "one_time"
        ? "One-time entry already submitted."
        : "Frequency is unknown and an entry has already been logged.";
  } else if (currentWindowDecision) {
    blockedReason =
      currentWindowDecision.status === "submitted"
        ? `Already submitted for this ${frequencyLabel(frequency).toLowerCase()} window.`
        : `Skipped for this ${frequencyLabel(frequency).toLowerCase()} window.`;
  } else if (nextEntryAt && new Date(nextEntryAt).getTime() > now.getTime()) {
    blockedReason = `Next allowed entry is ${formatShortDate(nextEntryAt)}.`;
  }

  return {
    sweepstake,
    frequency,
    frequencyLabel: frequencyLabel(frequency),
    canEnter: !blockedReason,
    nextEntryAt: blockedReason && nextEntryAt ? nextEntryAt : currentWindowDecision ? nextAvailableAt(frequency, currentWindowDecision.attemptedAt) : nextEntryAt,
    lastSubmittedAt,
    blockedReason,
    categoryPriority: categoryPriority(category, categoryPreferences),
    categoryPreferred: categoryPreferences.includes(category),
  };
}

function isQueueEligible(sweepstake: Sweepstake) {
  return sweepstake.status === "eligible" && !sweepstake.purchaseRequired && !sweepstake.noPurchaseMethodFound;
}

function latestCurrentWindowDecision(sweepstakeId: string, entries: EntryLog[], frequency: EntryFrequency, now: Date) {
  const window = currentWindow(frequency, now);
  return entries
    .filter((entry) => entry.sweepstakeId === sweepstakeId && WINDOW_DECISION_STATUSES.has(entry.status))
    .filter((entry) => {
      const attempted = parseDate(entry.submittedAt ?? entry.attemptedAt);
      return attempted && attempted.getTime() >= window.start.getTime() && attempted.getTime() < window.end.getTime();
    })
    .sort(sortEntriesNewest)[0];
}

function latestSubmittedAt(sweepstakeId: string, entries: EntryLog[]) {
  return entries
    .filter((entry) => entry.sweepstakeId === sweepstakeId && SUBMITTED_STATUSES.has(entry.status))
    .map((entry) => entry.submittedAt ?? entry.attemptedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function latestEntryFor(sweepstakeId: string, entries: EntryLog[]) {
  return entries.filter((entry) => entry.sweepstakeId === sweepstakeId).sort(sortEntriesNewest)[0] ?? null;
}

function nextAvailableAt(frequency: EntryFrequency, lastSubmittedAt: string | null) {
  if (!lastSubmittedAt) return null;
  const last = parseDate(lastSubmittedAt);
  if (!last) return null;
  if (frequency === "one_time" || frequency === "unknown") return null;

  const next = startOfDay(last);
  if (frequency === "daily") next.setDate(next.getDate() + 1);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

function currentWindow(frequency: EntryFrequency, now: Date) {
  if (frequency === "weekly") {
    const start = startOfDay(now);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  if (frequency === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  const start = startOfDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function buildReminderDays(queueItems: EntryQueueItem[], now: Date) {
  const start = startOfDay(now);
  const days: ReminderDay[] = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: date.toISOString(),
      label: new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date),
      reminders: [],
    };
  });

  const repeatItems = queueItems.filter((item) => item.frequency === "daily" || item.frequency === "weekly" || item.frequency === "monthly");
  for (const item of repeatItems) {
    const reminderDate = item.canEnter ? start : item.nextEntryAt ? startOfDay(new Date(item.nextEntryAt)) : null;
    if (!reminderDate) continue;
    const index = Math.round((reminderDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (index >= 0 && index < days.length) {
      days[index]?.reminders.push(item);
    }
  }

  for (const day of days) {
    day.reminders.sort((a, b) => sortQueueItems(a, b, now));
  }

  return days;
}

function sortQueueItems(a: EntryQueueItem, b: EntryQueueItem, now: Date) {
  if (a.canEnter !== b.canEnter) return a.canEnter ? -1 : 1;
  const categoryDelta = a.categoryPriority - b.categoryPriority;
  if (categoryDelta !== 0) return categoryDelta;
  const deadlineDelta = deadlineRank(a.sweepstake.endAt, now) - deadlineRank(b.sweepstake.endAt, now);
  if (deadlineDelta !== 0) return deadlineDelta;
  const valueDelta = (b.sweepstake.prizeRetailValue ?? 0) - (a.sweepstake.prizeRetailValue ?? 0);
  if (valueDelta !== 0) return valueDelta;
  const eligibilityDelta = b.sweepstake.eligibilityScore - a.sweepstake.eligibilityScore;
  if (eligibilityDelta !== 0) return eligibilityDelta;
  const riskDelta = a.sweepstake.scamScore - b.sweepstake.scamScore;
  if (riskDelta !== 0) return riskDelta;
  return a.sweepstake.title.localeCompare(b.sweepstake.title);
}

function deadlineRank(value: string | null, now: Date) {
  const deadline = parseDate(value);
  if (!deadline) return Number.POSITIVE_INFINITY;
  const delta = deadline.getTime() - now.getTime();
  return delta < 0 ? Number.POSITIVE_INFINITY : delta;
}

function defaultStatusNote(status: MarkEntryStatusInput["status"]) {
  if (status === "submitted") return "User marked this entry as submitted manually.";
  if (status === "skipped") return "User skipped this entry window.";
  if (status === "suspicious") return "User marked this sweepstake as suspicious.";
  if (status === "winner_notification") return "Winner notification received; follow up manually.";
  return "User marked this sweepstake as expired.";
}

function estimatedStatusMinutes(status: MarkEntryStatusInput["status"], manualEntryMinutes: number) {
  if (status === "submitted") return manualEntryMinutes;
  if (status === "winner_notification") return 3;
  if (status === "suspicious" || status === "skipped") return 2;
  return 1;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function sortEntriesNewest(a: EntryLog, b: EntryLog) {
  return new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime();
}
