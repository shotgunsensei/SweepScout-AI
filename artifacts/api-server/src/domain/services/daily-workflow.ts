import { getEntryTrackingData, type EntryQueueItem } from "@/lib/services/entry-tracking";
import { getStore } from "@/lib/storage/store";
import type { EntryLog, InboxAlert, Sweepstake } from "@/lib/types";

export type DailyWorkflowData = {
  generatedAt: string;
  todaysRepeatableEntries: EntryQueueItem[];
  newEligibleSweepstakes: Sweepstake[];
  expiringSoon: EntryQueueItem[];
  winnerVerificationEmails: InboxAlert[];
  suspiciousItems: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }>;
  suspiciousInboxAlerts: InboxAlert[];
  prefillNext: { sweepstake: Sweepstake; formUrl: string } | null;
  stats: {
    todaysRepeatableCount: number;
    newEligibleCount: number;
    expiringSoonCount: number;
    winnerVerificationCount: number;
    suspiciousDecisionCount: number;
  };
};

const WINNER_REVIEW_KINDS = new Set(["winner_notification", "verification_email", "confirmation_link"]);
const SUSPICIOUS_INBOX_KINDS = new Set(["phishing_risk", "unsubscribe_spam"]);
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export async function getDailyWorkflowData(): Promise<DailyWorkflowData> {
  const store = await getStore();
  const [tracking, sweepstakes, entries, inboxAlerts] = await Promise.all([
    getEntryTrackingData(),
    store.listSweepstakes(),
    store.listEntryLogs(),
    store.listInboxAlerts(150),
  ]);
  const now = new Date();
  const enteredSweepstakeIds = new Set(entries.map((entry) => entry.sweepstakeId));

  const todaysRepeatableEntries = tracking.eligibleQueue
    .filter((item) => item.frequency === "daily" || item.frequency === "weekly" || item.frequency === "monthly")
    .slice(0, 20);
  const repeatableIds = new Set(todaysRepeatableEntries.map((item) => item.sweepstake.id));
  const newEligibleSweepstakes = sweepstakes
    .filter((item) => item.status === "eligible")
    .filter((item) => !enteredSweepstakeIds.has(item.id))
    .filter((item) => !repeatableIds.has(item.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
  const expiringSoon = tracking.expiringSoon
    .filter((item) => isWithin48Hours(item.sweepstake.endAt, now))
    .slice(0, 20);
  const winnerVerificationEmails = inboxAlerts
    .filter((alert) => alert.status === "new")
    .filter((alert) => alert.categories.some((category) => WINNER_REVIEW_KINDS.has(category)))
    .slice(0, 20);
  const suspiciousInboxAlerts = inboxAlerts
    .filter((alert) => alert.status === "new")
    .filter(
      (alert) =>
        alert.severity === "danger" ||
        alert.categories.some((category) => SUSPICIOUS_INBOX_KINDS.has(category)) ||
        alert.riskFlags.length > 0,
    )
    .slice(0, 20);
  const suspiciousItems = tracking.suspiciousRejected.slice(0, 20);
  const prefillNext = firstPrefillCandidate(todaysRepeatableEntries, newEligibleSweepstakes);

  return {
    generatedAt: now.toISOString(),
    todaysRepeatableEntries,
    newEligibleSweepstakes,
    expiringSoon,
    winnerVerificationEmails,
    suspiciousItems,
    suspiciousInboxAlerts,
    prefillNext,
    stats: {
      todaysRepeatableCount: todaysRepeatableEntries.length,
      newEligibleCount: newEligibleSweepstakes.length,
      expiringSoonCount: expiringSoon.length,
      winnerVerificationCount: winnerVerificationEmails.length,
      suspiciousDecisionCount: suspiciousItems.length + suspiciousInboxAlerts.length,
    },
  };
}

function firstPrefillCandidate(repeatableEntries: EntryQueueItem[], newEligibleSweepstakes: Sweepstake[]) {
  const repeatable = repeatableEntries.map((item) => item.sweepstake);
  for (const sweepstake of [...repeatable, ...newEligibleSweepstakes]) {
    const formUrl = sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null;
    if (formUrl) {
      return { sweepstake, formUrl };
    }
  }
  return null;
}

function isWithin48Hours(value: string | null, now: Date) {
  if (!value) return false;
  const deadline = new Date(value).getTime();
  if (!Number.isFinite(deadline)) return false;
  const delta = deadline - now.getTime();
  return delta >= 0 && delta <= FORTY_EIGHT_HOURS_MS;
}
