import { ArrowRight, CheckCircle2, Clock3, MailWarning, ScrollText, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { SweepstakeCard } from "@/components/sweepstakes-card";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { DashboardData, InboxAlert, InboxAlertKind, RulesChangeAlert, RulesChangeField } from "@/lib/types";

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardData>("/dashboard") });

  return (
    <AppShell>
      <PageHeader title="Trust Dashboard" kicker="Sweepstakes compliance command center">
        <Link href="/dashboard/queue" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]">
          Review Queue <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </PageHeader>

      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load dashboard" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <DashboardBody data={data} /> : null}
    </AppShell>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const priority = data.sweepstakes
    .slice()
    .sort((a, b) => b.scamScore - a.scamScore || new Date(a.endAt ?? 0).getTime() - new Date(b.endAt ?? 0).getTime())
    .slice(0, 4);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <MetricCard label="Active" value={data.stats.activeSweepstakes} sublabel="tracked sweepstakes" />
        <MetricCard label="Ending Soon" value={data.stats.endingSoon} sublabel="within 7 days" />
        <MetricCard label="Queue" value={data.stats.queuedAssistantTasks} sublabel="awaiting review" />
        <MetricCard label="Entries" value={data.stats.entriesThisWeek} sublabel="this week" />
        <MetricCard label="Inbox" value={data.stats.inboxNewAlerts} sublabel={`${data.stats.inboxWinnerAlerts} winner flags`} />
        <MetricCard label="Rules" value={data.stats.rulesNewAlerts} sublabel={`${data.stats.rulesDeadlineAlerts} deadline flags`} />
        <MetricCard label="Avg Eligibility" value={`${data.stats.averageEligibilityScore}%`} />
        <MetricCard label="High Risk" value={data.stats.highRiskCount} sublabel="above threshold" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel>
          <SectionHeader
            title="Priority Sweepstakes"
            eyebrow="Highest attention first"
            action={<Link href="/dashboard/sweepstakes" className="text-sm text-accent">View all</Link>}
          />
          <div className="grid gap-3">
            {priority.length ? (
              priority.map((item) => <SweepstakeCard key={item.id} item={item} compact />)
            ) : (
              <EmptyState title="No sweepstakes yet" body="Run discovery or add candidates to start compliance review." />
            )}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel>
            <SectionHeader title="Compliance Locks" eyebrow="Always-on guardrails" />
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-2 text-ok">
                <CheckCircle2 size={17} aria-hidden="true" /> Explicit approval required
              </div>
              <div className="flex items-center gap-2 text-warning">
                <ShieldAlert size={17} aria-hidden="true" /> CAPTCHA/manual blocks preserved
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Clock3 size={17} aria-hidden="true" /> Daily limit {data.settings.dailyEntryLimit}
              </div>
              <div className="flex items-center gap-2 text-muted">
                <MailWarning size={17} aria-hidden="true" /> Inbox links stay review-only
              </div>
              <div className="flex items-center gap-2 text-muted">
                <ScrollText size={17} aria-hidden="true" /> Official rules changes require review
              </div>
            </div>
          </Panel>

          <RulesAlertsPanel alerts={data.rulesChangeAlerts} />

          <InboxAlertsPanel alerts={data.inboxAlerts} />

          <Panel>
            <SectionHeader title="Assistant Queue" eyebrow="Manual review" />
            <div className="space-y-3">
              {data.assistantTasks.slice(0, 3).length ? (
                data.assistantTasks.slice(0, 3).map((task) => (
                  <Link key={task.id} href="/dashboard/queue" className="block rounded-md border border-line bg-panel-strong p-3 transition hover:border-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{task.sweepstakeTitle}</p>
                      <Badge tone={task.status === "ready_for_review" ? "warn" : "default"}>{titleCase(task.status)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted">Priority {task.priority} | Created {formatDate(task.createdAt)}</p>
                  </Link>
                ))
              ) : (
                <EmptyState title="Queue is clear" body="Eligible sweepstakes will appear here when the assistant can stage a reviewed action." />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function RulesAlertsPanel({ alerts }: { alerts: RulesChangeAlert[] }) {
  const queryClient = useQueryClient();
  const reviewAlert = useMutation({
    mutationFn: (input: { id: string; status: "reviewed" | "dismissed" }) =>
      apiSend<RulesChangeAlert>(`/rules-monitor/alerts/${input.id}/review`, "POST", { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const activeAlerts = alerts.filter((alert) => alert.status === "new").slice(0, 4);
  return (
    <Panel>
      <SectionHeader
        title="Rules Change Alerts"
        eyebrow="Deadline, eligibility, prize, and frequency watch"
        action={<Link href="/dashboard/settings" className="text-sm text-accent">Configure</Link>}
      />
      <div className="space-y-3">
        {activeAlerts.length ? (
          activeAlerts.map((alert) => (
            <RulesAlertCard
              key={alert.id}
              alert={alert}
              busy={reviewAlert.isPending}
              onReview={(status) => reviewAlert.mutate({ id: alert.id, status })}
            />
          ))
        ) : (
          <EmptyState title="No rules changes" body="Enable official rules monitoring to detect meaningful deadline, eligibility, prize, and entry frequency changes." />
        )}
      </div>
    </Panel>
  );
}

function RulesAlertCard({
  alert,
  busy,
  onReview,
}: {
  alert: RulesChangeAlert;
  busy: boolean;
  onReview: (status: "reviewed" | "dismissed") => void;
}) {
  const tone = alert.severity === "danger" ? "danger" : alert.severity === "warn" ? "warn" : "default";
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{alert.sweepstakeTitle}</p>
        <Badge tone={tone}>{titleCase(alert.severity)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {alert.sponsor} | {formatDate(alert.detectedAt)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.changedFields.map((field) => (
          <Badge key={field} tone={field === "deadline" || field === "eligibility" ? "danger" : "warn"}>
            {rulesFieldLabel(field)}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{alert.summary}</p>
      <div className="mt-3 grid gap-2 text-xs text-muted">
        {alert.changes.slice(0, 3).map((change) => (
          <div key={change.field} className="rounded-md border border-line bg-panel p-2">
            <p className="font-semibold text-foreground">{rulesFieldLabel(change.field)}</p>
            <p className="mt-1 line-clamp-2">Previous: {formatRuleValue(change.previousValue)}</p>
            <p className="mt-1 line-clamp-2">Current: {formatRuleValue(change.currentValue)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted">
        <p>Previous snapshot: {formatDate(alert.previousSnapshot.capturedAt)}</p>
        <p>Current snapshot: {formatDate(alert.currentSnapshot.capturedAt)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-[#07100d] disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() => onReview("reviewed")}
        >
          Mark Reviewed
        </button>
        <button
          className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium text-muted hover:text-foreground disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() => onReview("dismissed")}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function InboxAlertsPanel({ alerts }: { alerts: InboxAlert[] }) {
  const queryClient = useQueryClient();
  const reviewAlert = useMutation({
    mutationFn: (input: { id: string; status: "reviewed" | "dismissed" }) =>
      apiSend<InboxAlert>(`/inbox/alerts/${input.id}/review`, "POST", { status: input.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const activeAlerts = alerts.filter((alert) => alert.status === "new").slice(0, 4);
  return (
    <Panel>
      <SectionHeader
        title="Inbox Alerts"
        eyebrow="Winner, verification, and phishing watch"
        action={<Link href="/dashboard/settings" className="text-sm text-accent">Configure</Link>}
      />
      <div className="space-y-3">
        {activeAlerts.length ? (
          activeAlerts.map((alert) => (
            <InboxAlertCard
              key={alert.id}
              alert={alert}
              busy={reviewAlert.isPending}
              onReview={(status) => reviewAlert.mutate({ id: alert.id, status })}
            />
          ))
        ) : (
          <EmptyState title="No inbox alerts" body="Connect a dedicated sweepstakes inbox to flag winner, verification, reminder, and phishing emails." />
        )}
      </div>
    </Panel>
  );
}

function InboxAlertCard({
  alert,
  busy,
  onReview,
}: {
  alert: InboxAlert;
  busy: boolean;
  onReview: (status: "reviewed" | "dismissed") => void;
}) {
  const tone = alert.severity === "danger" ? "danger" : alert.severity === "warn" ? "warn" : "default";
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{alert.subject}</p>
        <Badge tone={tone}>{titleCase(alert.severity)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {alert.fromEmail ?? "Unknown sender"} | {formatDate(alert.receivedAt)}
      </p>
      {alert.matchedSweepstakeTitle ? (
        <p className="mt-2 text-xs text-accent">Matched: {alert.matchedSweepstakeTitle}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.categories.map((category) => (
          <Badge key={category} tone={category === "phishing_risk" ? "danger" : category === "winner_notification" ? "warn" : "default"}>
            {categoryLabel(category)}
          </Badge>
        ))}
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{alert.snippet}</p>
      {alert.reviewRequired ? (
        <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs leading-5 text-warning">
          User review required before opening any claim, verification, or confirmation link.
        </p>
      ) : null}
      {alert.links.length ? (
        <div className="mt-3 grid gap-1 text-xs text-muted">
          {alert.links.slice(0, 3).map((link) => (
            <p key={link.url} className="truncate">
              {titleCase(link.kind)} link: {link.domain ?? link.url}
            </p>
          ))}
        </div>
      ) : null}
      {alert.riskFlags.length ? <p className="mt-3 text-xs text-danger">{alert.riskFlags[0]}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-[#07100d] disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() => onReview("reviewed")}
        >
          Mark Reviewed
        </button>
        <button
          className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium text-muted hover:text-foreground disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={() => onReview("dismissed")}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function categoryLabel(category: InboxAlertKind) {
  const labels: Record<InboxAlertKind, string> = {
    winner_notification: "Winner",
    verification_email: "Verification",
    confirmation_link: "Confirmation",
    daily_entry_reminder: "Daily reminder",
    phishing_risk: "Phishing risk",
    unsubscribe_spam: "Unsubscribe-heavy",
    general: "General",
  };
  return labels[category];
}

function rulesFieldLabel(field: RulesChangeField) {
  const labels: Record<RulesChangeField, string> = {
    deadline: "Deadline",
    eligibility: "Eligibility",
    prize: "Prize",
    entry_frequency: "Entry frequency",
  };
  return labels[field];
}

function formatRuleValue(value: string | number | null) {
  if (value === null || value === "") return "Not detected";
  if (typeof value === "number") return `$${value.toLocaleString()}`;
  return value;
}
