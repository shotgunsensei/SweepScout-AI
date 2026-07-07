import { AlertTriangle, Ban, CheckCircle2, Clock3, MailWarning, ShieldCheck, SkipForward, Wand2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, MetricCard, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import type { DailyWorkflowData, EntryQueueItem, InboxAlert, Sweepstake } from "@/lib/types";

export default function DailyWorkflowPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["daily-workflow"],
    queryFn: () => apiGet<DailyWorkflowData>("/daily-workflow"),
  });

  return (
    <AppShell>
      <PageHeader title="Daily Sweepstakes Workflow" kicker="Manual approval execution cockpit">
        <Badge tone="ok">No auto-submit</Badge>
        <Badge tone="warn">Review links before opening</Badge>
      </PageHeader>

      {isLoading ? <LoadingState title="Loading daily workflow" /> : null}
      {isError ? <ErrorNotice title="Unable to load daily workflow" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <WorkflowBody data={data} /> : null}
    </AppShell>
  );
}

function WorkflowBody({ data }: { data: DailyWorkflowData }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Repeatable Today" value={data.stats.todaysRepeatableCount} sublabel="daily, weekly, monthly" />
        <MetricCard label="New Eligible" value={data.stats.newEligibleCount} sublabel="no entry logged yet" />
        <MetricCard label="48h Deadlines" value={data.stats.expiringSoonCount} sublabel="review urgency" />
        <MetricCard label="Winner Email Review" value={data.stats.winnerVerificationCount} sublabel="claim links held" />
        <MetricCard label="Decisions Needed" value={data.stats.suspiciousDecisionCount} sublabel="risk and spam flags" />
      </div>

      <PrefillNextPanel item={data.prefillNext} />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.85fr]">
        <Panel>
          <SectionHeader title="Today's Repeatable Entries" eyebrow="Allowed again in the current window" />
          <div className="grid gap-3">
            {data.todaysRepeatableEntries.length ? (
              data.todaysRepeatableEntries.map((item) => <QueueCard key={item.sweepstake.id} item={item} />)
            ) : (
              <EmptyState title="No repeatable entries ready" body="Daily, weekly, and monthly entries appear here only when their entry window is open." />
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Expiring in 48 Hours" eyebrow="Deadline pressure" />
          <div className="grid gap-3">
            {data.expiringSoon.length ? (
              data.expiringSoon.map((item) => <QueueCard key={item.sweepstake.id} item={item} compact />)
            ) : (
              <EmptyState title="No urgent deadlines" body="Eligible sweepstakes with deadlines inside the next 48 hours will appear here." />
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeader title="New Eligible Sweepstakes" eyebrow="Fresh candidates with no logged entry" />
        <div className="grid gap-3 lg:grid-cols-2">
          {data.newEligibleSweepstakes.length ? (
            data.newEligibleSweepstakes.map((item) => <SweepstakeDecisionCard key={item.id} sweepstake={item} />)
          ) : (
            <div className="lg:col-span-2">
              <EmptyState title="No new eligible items" body="Eligible sweepstakes move here after scoring once they have no submitted or skipped history." />
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <SectionHeader title="Winner and Verification Emails" eyebrow="User review required before opening links" />
          <div className="grid gap-3">
            {data.winnerVerificationEmails.length ? (
              data.winnerVerificationEmails.map((alert) => <InboxAlertCard key={alert.id} alert={alert} />)
            ) : (
              <EmptyState title="No winner or verification email alerts" body="Winner notifications, verification emails, and confirmation links from inbox monitoring will collect here." />
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Suspicious Items Needing Decision" eyebrow="Risk, phishing, and rejected items" />
          <div className="grid gap-3">
            {data.suspiciousItems.map((item) => (
              <SuspiciousSweepstakeCard key={item.sweepstake.id} item={item} />
            ))}
            {data.suspiciousInboxAlerts.map((alert) => (
              <InboxAlertCard key={alert.id} alert={alert} suspicious />
            ))}
            {!data.suspiciousItems.length && !data.suspiciousInboxAlerts.length ? (
              <EmptyState title="No suspicious decisions pending" body="Phishing risks, suspicious sweepstakes, and unsubscribe-heavy spam will appear here for user disposition." />
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PrefillNextPanel({ item }: { item: DailyWorkflowData["prefillNext"] }) {
  const [, navigate] = useLocation();
  const prefill = useApiMutation<{ reviewUrl: string }>("/forms/prefill", {
    onSuccess: (result) => {
      if (result.reviewUrl) {
        navigate(toInternalPath(result.reviewUrl));
      }
    },
  });

  return (
    <Panel className="bg-[linear-gradient(135deg,rgba(63,236,179,0.12),rgba(19,24,25,0.94)_42%)]">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">Prefill next</Badge>
            <Badge>Manual submit only</Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-foreground">{item?.sweepstake.title ?? "No prefill-ready entry"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Assisted prefill requires vault consent, per-entry approval, and a final review screen. SweepScout does not submit forms, bypass CAPTCHA, or open claim links automatically.
          </p>
        </div>
        {item ? (
          <form
            className="rounded-md border border-line bg-panel/90 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              prefill.mutate(formToObject(event.currentTarget));
            }}
          >
            <input type="hidden" name="sweepstakeId" value={item.sweepstake.id} />
            <input type="hidden" name="formUrl" value={item.formUrl} />
            <div className="grid gap-3">
              <Checkbox name="prefillApproved" required label="Approve profile prefill" />
              <Checkbox name="useAiFallback" defaultChecked label="AI label fallback" />
              <SubmitButton disabled={prefill.isPending}>
                <span className="inline-flex items-center gap-2">
                  <Wand2 size={15} aria-hidden="true" /> Prefill Next
                </span>
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </div>
    </Panel>
  );
}

function QueueCard({ item, compact = false }: { item: EntryQueueItem; compact?: boolean }) {
  return (
    <SweepstakeDecisionCard
      sweepstake={item.sweepstake}
      compact={compact}
      meta={
        <>
          <Badge tone="ok">{item.frequencyLabel}</Badge>
          {item.categoryPreferred ? <Badge tone="ok">Preferred category</Badge> : null}
          {item.lastSubmittedAt ? <Badge>Last {formatDate(item.lastSubmittedAt)}</Badge> : null}
        </>
      }
    />
  );
}

function SweepstakeDecisionCard({
  sweepstake,
  compact = false,
  meta,
}: {
  sweepstake: Sweepstake;
  compact?: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-base font-semibold text-foreground">{sweepstake.title}</h3>
            <Badge tone={sweepstake.scamScore >= 60 ? "danger" : sweepstake.scamScore >= 40 ? "warn" : "ok"}>
              Risk {sweepstake.scamScore}
            </Badge>
            <Badge tone={sweepstake.eligibilityScore >= 75 ? "ok" : sweepstake.eligibilityScore >= 50 ? "warn" : "danger"}>
              Eligibility {sweepstake.eligibilityScore}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {sweepstake.sponsor} | {categoryLabel(sweepstake.category)} | {formatCurrency(sweepstake.prizeRetailValue)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {meta}
            <Badge tone={deadlineTone(sweepstake.endAt)}>{deadlineLabel(sweepstake.endAt)}</Badge>
            {sweepstake.localRegion ? <Badge>Local: {sweepstake.localRegion}</Badge> : null}
            {sweepstake.requiresInPersonAppearance ? <Badge tone="warn">In-person review</Badge> : null}
          </div>
          {!compact ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted">
              {sweepstake.complianceNotes[0] ?? sweepstake.eligibilitySummary}
            </p>
          ) : null}
        </div>
        <DecisionActions sweepstake={sweepstake} />
      </div>
    </div>
  );
}

function DecisionActions({ sweepstake, allowSubmit = true }: { sweepstake: Sweepstake; allowSubmit?: boolean }) {
  const status = useApiMutation("/entries/status");
  const block = useApiMutation(`/sweepstakes/${sweepstake.id}/block-domain`);
  return (
    <div className="grid gap-2 lg:w-72">
      {allowSubmit ? (
        <form
          className="grid gap-2 rounded-md border border-line bg-panel p-3"
          onSubmit={(event) => {
            event.preventDefault();
            status.mutate(formToObject(event.currentTarget));
          }}
        >
          <input type="hidden" name="sweepstakeId" value={sweepstake.id} />
          <input type="hidden" name="status" value="submitted" />
          <input type="hidden" name="userApproved" value="on" />
          <input type="hidden" name="notes" value="Marked submitted from the daily workflow after manual user review." />
          <Checkbox name="reviewConfirmed" required label="Reviewed and submitted manually" />
          <SubmitButton disabled={status.isPending}>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} aria-hidden="true" /> Mark Submitted
            </span>
          </SubmitButton>
        </form>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            status.mutate(formToObject(event.currentTarget));
          }}
        >
          <input type="hidden" name="sweepstakeId" value={sweepstake.id} />
          <input type="hidden" name="status" value="skipped" />
          <input type="hidden" name="reviewConfirmed" value="on" />
          <input type="hidden" name="notes" value="Skipped for today from the daily workflow." />
          <SubmitButton tone="secondary" disabled={status.isPending}>
            <span className="inline-flex items-center gap-2">
              <SkipForward size={15} aria-hidden="true" /> Skip Today
            </span>
          </SubmitButton>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            block.mutate(formToObject(event.currentTarget));
          }}
        >
          <input type="hidden" name="reason" value={`Blocked from daily workflow after reviewing ${sweepstake.title}.`} />
          <SubmitButton tone="danger" disabled={block.isPending}>
            <span className="inline-flex items-center gap-2">
              <Ban size={15} aria-hidden="true" /> Block Domain
            </span>
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

function SuspiciousSweepstakeCard({
  item,
}: {
  item: { sweepstake: Sweepstake; latestEntry: DailyWorkflowData["suspiciousItems"][number]["latestEntry"]; reason: string };
}) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="text-warning" size={17} aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">{item.sweepstake.title}</h3>
        <Badge tone="warn">{titleCase(item.sweepstake.status)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{item.reason}</p>
      {item.latestEntry ? <p className="mt-2 text-xs text-muted">Latest decision: {titleCase(item.latestEntry.status)} on {formatDate(item.latestEntry.attemptedAt)}</p> : null}
      <div className="mt-3">
        <DecisionActions sweepstake={item.sweepstake} allowSubmit={false} />
      </div>
    </div>
  );
}

function InboxAlertCard({ alert, suspicious = false }: { alert: InboxAlert; suspicious?: boolean }) {
  const tone = alert.severity === "danger" ? "danger" : alert.severity === "warn" ? "warn" : "default";
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center gap-2">
        {suspicious ? <AlertTriangle className="text-warning" size={17} aria-hidden="true" /> : <MailWarning className="text-accent" size={17} aria-hidden="true" />}
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">{alert.subject}</h3>
        <Badge tone={tone}>{titleCase(alert.severity)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {alert.fromEmail ?? "Unknown sender"} | {formatDate(alert.receivedAt)}
      </p>
      {alert.matchedSweepstakeTitle ? <p className="mt-2 text-xs text-accent">Matched: {alert.matchedSweepstakeTitle}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {alert.categories.map((category) => (
          <Badge key={category} tone={category === "phishing_risk" ? "danger" : category === "winner_notification" ? "warn" : "default"}>
            {titleCase(category)}
          </Badge>
        ))}
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{alert.snippet}</p>
      <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs leading-5 text-warning">
        <span className="inline-flex items-center gap-2 font-semibold">
          <ShieldCheck size={14} aria-hidden="true" /> User review required
        </span>
        <p className="mt-1">Do not open verification, confirmation, or claim links until you inspect the sender and domain.</p>
      </div>
      {alert.links.length ? (
        <div className="mt-3 grid gap-1 text-xs text-muted">
          {alert.links.slice(0, 3).map((link) => (
            <p key={link.url} className="truncate">
              {titleCase(link.kind)} link held: {link.domain ?? "unknown domain"}
            </p>
          ))}
        </div>
      ) : null}
      {alert.riskFlags.length ? <p className="mt-3 text-xs text-danger">{alert.riskFlags[0]}</p> : null}
      <ReviewInboxForm alert={alert} />
    </div>
  );
}

function ReviewInboxForm({ alert }: { alert: InboxAlert }) {
  const review = useApiMutation(`/inbox/alerts/${alert.id}/review`);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          review.mutate(formToObject(event.currentTarget));
        }}
      >
        <input type="hidden" name="status" value="reviewed" />
        <input type="hidden" name="notes" value="Reviewed from the daily workflow. No links were opened by SweepScout." />
        <SubmitButton disabled={review.isPending}>Mark Reviewed</SubmitButton>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          review.mutate(formToObject(event.currentTarget));
        }}
      >
        <input type="hidden" name="status" value="dismissed" />
        <input type="hidden" name="notes" value="Dismissed from the daily workflow after user review." />
        <SubmitButton tone="secondary" disabled={review.isPending}>Dismiss</SubmitButton>
      </form>
    </div>
  );
}

function deadlineLabel(value: string | null) {
  if (!value) return "No deadline";
  const deadline = new Date(value);
  const delta = deadline.getTime() - Date.now();
  if (!Number.isFinite(delta)) return "No deadline";
  if (delta <= 0) return "Expired";
  const hours = Math.ceil(delta / (60 * 60 * 1000));
  if (hours <= 48) return `${hours}h left`;
  return `Ends ${formatDate(value)}`;
}

function deadlineTone(value: string | null) {
  if (!value) return "default";
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta) || delta < 0) return "danger";
  if (delta <= 48 * 60 * 60 * 1000) return "danger";
  if (delta <= 7 * 24 * 60 * 60 * 1000) return "warn";
  return "default";
}

function toInternalPath(reviewUrl: string) {
  try {
    return new URL(reviewUrl, window.location.origin).pathname;
  } catch {
    return reviewUrl;
  }
}
