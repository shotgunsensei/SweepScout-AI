import type {
  AppSettings,
  AssistantTask,
  DashboardData,
  DiscoveryJob,
  EntryLog,
  InboxAlert,
  RulesChangeAlert,
  Sweepstake,
} from "@/lib/types";

export function buildDashboardData(input: {
  sweepstakes: Sweepstake[];
  discoveryJobs: DiscoveryJob[];
  assistantTasks: AssistantTask[];
  entryLogs: EntryLog[];
  inboxAlerts: InboxAlert[];
  rulesChangeAlerts: RulesChangeAlert[];
  settings: AppSettings;
}): DashboardData {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const active = input.sweepstakes.filter((item) => item.status !== "expired" && item.status !== "rejected");
  const endingSoon = active.filter((item) => {
    if (!item.endAt) {
      return false;
    }
    const end = new Date(item.endAt).getTime();
    return end >= now && end <= now + sevenDays;
  });
  const entriesThisWeek = input.entryLogs.filter(
    (entry) => new Date(entry.attemptedAt).getTime() >= now - sevenDays,
  );
  const averageEligibilityScore =
    active.length === 0
      ? 0
      : Math.round(active.reduce((sum, item) => sum + item.eligibilityScore, 0) / active.length);

  return {
    stats: {
      activeSweepstakes: active.length,
      endingSoon: endingSoon.length,
      queuedAssistantTasks: input.assistantTasks.filter((task) =>
        ["queued", "ready_for_review", "blocked"].includes(task.status),
      ).length,
      entriesThisWeek: entriesThisWeek.length,
      averageEligibilityScore,
      highRiskCount: input.sweepstakes.filter((item) => item.scamScore >= input.settings.maxScamScore).length,
      inboxNewAlerts: input.inboxAlerts.filter((alert) => alert.status === "new").length,
      inboxWinnerAlerts: input.inboxAlerts.filter(
        (alert) => alert.status === "new" && alert.categories.includes("winner_notification"),
      ).length,
      inboxPhishingAlerts: input.inboxAlerts.filter(
        (alert) => alert.status === "new" && alert.categories.includes("phishing_risk"),
      ).length,
      rulesNewAlerts: input.rulesChangeAlerts.filter((alert) => alert.status === "new").length,
      rulesDeadlineAlerts: input.rulesChangeAlerts.filter(
        (alert) => alert.status === "new" && alert.changedFields.includes("deadline"),
      ).length,
      rulesEligibilityAlerts: input.rulesChangeAlerts.filter(
        (alert) => alert.status === "new" && alert.changedFields.includes("eligibility"),
      ).length,
    },
    ...input,
  };
}
