import { Bell, CheckCircle2, Clock3, Flag, SkipForward, Trophy } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, MetricCard, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { formatDate, titleCase } from "@/lib/format";
import type { EntryLog, EntryQueueItem, EntryTrackingData, ReminderDay, Sweepstake } from "@/lib/types";

export default function EntriesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["entries-tracking"], queryFn: () => apiGet<EntryTrackingData>("/entries/tracking") });

  return (
    <AppShell>
      <PageHeader title="Entry Tracking" kicker="Frequency-aware manual entry log" />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load entry tracking" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <EntriesBody data={data} /> : null}
    </AppShell>
  );
}

function EntriesBody({ data }: { data: EntryTrackingData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Eligible" value={data.eligibleQueue.length} sublabel="ready now" />
        <MetricCard label="Submitted" value={data.submittedEntries.length} sublabel="manual entries" />
        <MetricCard label="Expiring" value={data.expiringSoon.length} sublabel="within 7 days" />
        <MetricCard label="Review" value={data.suspiciousRejected.length} sublabel="suspicious/rejected" />
        <MetricCard label="Won" value={data.wonNotifications.length} sublabel="notifications" />
      </div>

      <div className="mt-6 grid gap-4">
        <Panel>
          <SectionHeader title="Eligible Queue" eyebrow="Allowed entry windows" action={<Badge tone="ok">{data.eligibleQueue.length} ready</Badge>} />
          <div className="grid gap-3">
            {data.eligibleQueue.length ? (
              data.eligibleQueue.map((item) => <QueueItem key={item.sweepstake.id} item={item} />)
            ) : (
              <EmptyState title="No eligible entries ready" body="Sweepstakes will appear here when rules, frequency, and compliance checks allow another manual entry." />
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Repeat Entry Reminders" eyebrow="Daily, weekly, and monthly cadence" />
          <ReminderCalendar days={data.reminders} />
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <EntryListPanel title="Submitted Entries" entries={data.submittedEntries} empty="No manual submissions recorded yet." />
          <ExpiringSoonPanel items={data.expiringSoon} />
          <ReviewPanel items={data.suspiciousRejected} />
          <EntryListPanel title="Won / Notification Tracking" entries={data.wonNotifications} empty="No winner notifications recorded yet." />
        </div>
      </div>
    </>
  );
}

function QueueItem({ item }: { item: EntryQueueItem }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{item.sweepstake.title}</h3>
            <Badge tone="ok">{item.frequencyLabel}</Badge>
            <Badge>{item.sweepstake.hasCaptcha ? "Manual CAPTCHA" : "No CAPTCHA flag"}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">
            Ends {formatDate(item.sweepstake.endAt)} | Last submitted {formatDate(item.lastSubmittedAt)} | Form {item.sweepstake.formUrl ? "ready" : "not captured"}
          </p>
          <p className="mt-2 text-sm text-muted">{item.sweepstake.complianceNotes[0] ?? "Eligible for manual entry tracking."}</p>
        </div>
        <EntryActions sweepstake={item.sweepstake} submitted />
      </div>
    </div>
  );
}

function EntryActions({ sweepstake, submitted = false }: { sweepstake: Sweepstake; submitted?: boolean }) {
  const markStatus = useApiMutation("/entries/status");
  return (
    <div className="flex flex-wrap items-start gap-2 xl:justify-end">
      {submitted ? (
        <form
          className="rounded-md border border-line bg-panel p-3"
          onSubmit={(event) => {
            event.preventDefault();
            markStatus.mutate(formToObject(event.currentTarget));
          }}
        >
          <input type="hidden" name="sweepstakeId" value={sweepstake.id} />
          <input type="hidden" name="status" value="submitted" />
          <input type="hidden" name="notes" value="Submitted manually from eligible queue." />
          <div className="mb-3 grid gap-2">
            <Checkbox name="userApproved" required label="I submitted manually" />
            <Checkbox name="reviewConfirmed" required label="Rules and form reviewed" />
          </div>
          <SubmitButton disabled={markStatus.isPending}>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} aria-hidden="true" /> Submitted
            </span>
          </SubmitButton>
        </form>
      ) : null}

      <StatusButton sweepstakeId={sweepstake.id} status="skipped" label="Skipped" icon="skip" />
      <StatusButton sweepstakeId={sweepstake.id} status="suspicious" label="Suspicious" icon="flag" />
      <StatusButton sweepstakeId={sweepstake.id} status="winner_notification" label="Winner Notice" icon="trophy" />
      <StatusButton sweepstakeId={sweepstake.id} status="expired" label="Expired" icon="clock" />
    </div>
  );
}

function StatusButton(props: {
  sweepstakeId: string;
  status: "skipped" | "suspicious" | "winner_notification" | "expired";
  label: string;
  icon: "skip" | "flag" | "trophy" | "clock";
}) {
  const markStatus = useApiMutation("/entries/status");
  const Icon = props.icon === "skip" ? SkipForward : props.icon === "flag" ? Flag : props.icon === "trophy" ? Trophy : Clock3;
  return (
    <form
      className="rounded-md border border-line bg-panel p-3"
      onSubmit={(event) => {
        event.preventDefault();
        markStatus.mutate(formToObject(event.currentTarget));
      }}
    >
      <input type="hidden" name="sweepstakeId" value={props.sweepstakeId} />
      <input type="hidden" name="status" value={props.status} />
      <input type="hidden" name="notes" value={`${props.label} from entry tracking.`} />
      <div className="mb-2">
        <Checkbox name="reviewConfirmed" required label="Reviewed" />
      </div>
      <SubmitButton tone={props.status === "suspicious" || props.status === "expired" ? "danger" : "secondary"} disabled={markStatus.isPending}>
        <span className="inline-flex items-center gap-2">
          <Icon size={15} aria-hidden="true" /> {props.label}
        </span>
      </SubmitButton>
    </form>
  );
}

function ReminderCalendar({ days }: { days: ReminderDay[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((day) => (
        <div key={day.date} className="min-h-28 rounded-md border border-line bg-panel-strong p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-muted">{day.label}</p>
            {day.reminders.length ? <Bell size={14} className="text-accent" aria-hidden="true" /> : null}
          </div>
          <div className="grid gap-2">
            {day.reminders.slice(0, 3).map((item) => (
              <div key={item.sweepstake.id} className="rounded border border-line bg-panel px-2 py-1">
                <p className="truncate text-xs font-medium">{item.sweepstake.title}</p>
                <p className="text-[11px] text-muted">{item.frequencyLabel}</p>
              </div>
            ))}
            {day.reminders.length > 3 ? <p className="text-xs text-muted">+{day.reminders.length - 3} more</p> : null}
            {!day.reminders.length ? <p className="text-xs text-muted">No reminders</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntryListPanel(props: { title: string; entries: EntryLog[]; empty: string }) {
  return (
    <Panel>
      <SectionHeader title={props.title} />
      <div className="grid gap-3">
        {props.entries.length ? (
          props.entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-line bg-panel-strong p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{entry.sweepstakeTitle}</p>
                <Badge tone={entryTone(entry.status)}>{titleCase(entry.status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{formatDate(entry.submittedAt ?? entry.attemptedAt)}</p>
              <p className="mt-1 text-sm text-muted">{entry.notes}</p>
              {entry.status === "submitted" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusButton sweepstakeId={entry.sweepstakeId} status="winner_notification" label="Winner Notice" icon="trophy" />
                  <StatusButton sweepstakeId={entry.sweepstakeId} status="suspicious" label="Suspicious" icon="flag" />
                </div>
              ) : null}
              {entry.status === "prefilled" ? (
                <Link href={`/dashboard/entries/${entry.id}/review`} className="mt-2 inline-flex text-sm text-accent">
                  Review prefill
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState title="Nothing here yet" body={props.empty} />
        )}
      </div>
    </Panel>
  );
}

function ExpiringSoonPanel({ items }: { items: EntryQueueItem[] }) {
  return (
    <Panel>
      <SectionHeader title="Expiring Soon" />
      <div className="grid gap-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.sweepstake.id} className="rounded-md border border-line bg-panel-strong p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.sweepstake.title}</p>
                <Badge tone={item.canEnter ? "warn" : "default"}>{item.frequencyLabel}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">Ends {formatDate(item.sweepstake.endAt)}</p>
              <p className="mt-1 text-sm text-muted">{item.blockedReason ?? "Ready for manual entry."}</p>
              {item.canEnter ? (
                <div className="mt-3">
                  <EntryActions sweepstake={item.sweepstake} submitted />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState title="No urgent deadlines" body="No tracked sweepstakes expire within the next week." />
        )}
      </div>
    </Panel>
  );
}

function ReviewPanel({
  items,
}: {
  items: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }>;
}) {
  return (
    <Panel>
      <SectionHeader title="Suspicious / Rejected" />
      <div className="grid gap-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.sweepstake.id} className="rounded-md border border-line bg-panel-strong p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.sweepstake.title}</p>
                <Badge tone={item.sweepstake.status === "expired" || item.sweepstake.status === "ineligible" ? "danger" : "warn"}>
                  {titleCase(item.sweepstake.status)}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{item.reason}</p>
              {item.latestEntry ? <p className="mt-1 text-xs text-muted">Last marked {formatDate(item.latestEntry.attemptedAt)}</p> : null}
            </div>
          ))
        ) : (
          <EmptyState title="No rejected items" body="No suspicious or rejected entries are active." />
        )}
      </div>
    </Panel>
  );
}

function entryTone(status: EntryLog["status"]) {
  if (status === "submitted" || status === "winner_notification" || status === "prefilled") return "ok";
  if (status === "suspicious" || status === "expired" || status === "failed" || status === "blocked") return "danger";
  if (status === "skipped" || status === "rejected") return "warn";
  return "default";
}
