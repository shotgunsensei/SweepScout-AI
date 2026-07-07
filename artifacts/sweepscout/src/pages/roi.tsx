import { Clock3, DollarSign, Target, TimerReset } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import type { RoiCategorySummary, RoiReport, RoiSweepstakeSummary, RoiVolumePoint } from "@/lib/types";

export default function RoiPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["roi-report"],
    queryFn: () => apiGet<RoiReport>("/roi-report"),
  });

  return (
    <AppShell>
      <PageHeader title="Prize ROI Dashboard" kicker="Value, time, and sweepstakes return tracking" />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load ROI dashboard" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <RoiBody report={data} /> : null}
    </AppShell>
  );
}

function RoiBody({ report }: { report: RoiReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Entries" value={report.stats.entriesSubmitted} sublabel="submitted" />
        <MetricCard label="Prize Value" value={formatCurrency(report.stats.estimatedPrizeValue)} sublabel="submitted exposure" />
        <MetricCard label="Expected Value" value={formatCurrency(report.stats.expectedValueEstimate)} sublabel="baseline-adjusted" />
        <MetricCard label="Time Spent" value={`${report.stats.hoursSpent}h`} sublabel={`${report.stats.timeSpentMinutes} minutes`} />
        <MetricCard label="Saved" value={`${report.stats.hoursSavedByPrefill}h`} sublabel="prefill estimate" />
        <MetricCard label="Win Rate" value={`${report.stats.winRate}%`} sublabel={`${report.stats.winsTracked} wins tracked`} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="flex items-center gap-3">
          <DollarSign className="text-accent" size={20} aria-hidden />
          <div>
            <p className="text-sm text-muted">Expected value per hour</p>
            <p className="text-xl font-semibold text-foreground">{formatCurrency(report.stats.expectedValuePerHour)}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3">
          <Target className="text-warning" size={20} aria-hidden />
          <div>
            <p className="text-sm text-muted">Suspicious / rejected</p>
            <p className="text-xl font-semibold text-foreground">{report.stats.suspiciousRejectedCount}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3">
          <TimerReset className="text-accent-strong" size={20} aria-hidden />
          <div>
            <p className="text-sm text-muted">Baseline win estimate</p>
            <p className="text-xl font-semibold text-foreground">{report.settings.defaultWinProbabilityBasisPoints / 100}%</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3">
          <Clock3 className="text-muted" size={20} aria-hidden />
          <div>
            <p className="text-sm text-muted">Generated</p>
            <p className="text-xl font-semibold text-foreground">{formatDate(report.generatedAt)}</p>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Panel>
          <SectionHeader title="Entry Volume" eyebrow="Daily, weekly, and monthly submitted entries" />
          <div className="grid gap-4 lg:grid-cols-3">
            <VolumeBlock title="Daily" points={report.volume.daily} />
            <VolumeBlock title="Weekly" points={report.volume.weekly} />
            <VolumeBlock title="Monthly" points={report.volume.monthly} />
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Best Entry Categories" eyebrow="Expected value adjusted by wins and spam" />
          <div className="grid gap-3">
            {report.bestCategories.length ? (
              report.bestCategories.map((category) => <CategoryRow key={category.category} category={category} />)
            ) : (
              <EmptyState title="No category ROI yet" body="Submit entries to build category-level expected value and win-rate trends." />
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel>
          <SectionHeader title="Highest-Value Sweepstakes" eyebrow="Largest tracked prizes" />
          <SweepstakeList items={report.highestValueSweepstakes} empty="No prize values captured yet." />
        </Panel>
        <Panel>
          <SectionHeader title="Soonest Deadlines" eyebrow="Closest active deadlines" />
          <SweepstakeList items={report.soonestDeadlines} empty="No upcoming deadlines captured." showDeadline />
        </Panel>
        <Panel>
          <SectionHeader title="Worst Spam Sources" eyebrow="Domains reducing ROI" />
          <div className="grid gap-3">
            {report.worstSpamSources.length ? (
              report.worstSpamSources.map((source) => (
                <div key={source.domain} className="rounded-md border border-line bg-panel-strong p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{source.domain}</p>
                    <Badge tone={source.riskLevel === "high" ? "danger" : source.riskLevel === "medium" ? "warn" : "default"}>
                      {source.riskLevel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{source.sponsor ?? "Unknown sponsor"}</p>
                  <p className="mt-2 text-xs text-muted">
                    Emails {source.emailCount} | Spam {source.spamCount} | Phishing {source.phishingCount}
                  </p>
                  {source.excessiveVolume ? <p className="mt-2 text-xs text-warning">Excessive volume flagged.</p> : null}
                </div>
              ))
            ) : (
              <EmptyState title="No spam sources" body="Inbox scans and alias attribution will populate this section." />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function VolumeBlock({ title, points }: { title: string; points: RoiVolumePoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-2">
        {points.map((point) => (
          <div key={point.label} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs">
            <span className="truncate text-muted">{point.label}</span>
            <span className="h-2 overflow-hidden rounded bg-panel-strong">
              <span className="block h-full rounded bg-accent" style={{ width: `${Math.max(4, (point.count / max) * 100)}%` }} />
            </span>
            <span className="text-right text-foreground">{point.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: RoiCategorySummary }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{categoryLabel(category.category)}</p>
        <Badge tone={category.spamAlerts > 0 ? "warn" : "ok"}>{formatCurrency(category.expectedValue)}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-4">
        <Stat label="Entries" value={category.entriesSubmitted} />
        <Stat label="Prize" value={formatCurrency(category.estimatedPrizeValue)} />
        <Stat label="Win" value={`${category.winRate}%`} />
        <Stat label="Spam" value={category.spamAlerts} />
      </div>
    </div>
  );
}

function SweepstakeList({ items, empty, showDeadline }: { items: RoiSweepstakeSummary[]; empty: string; showDeadline?: boolean }) {
  return (
    <div className="grid gap-3">
      {items.length ? (
        items.map((item) => (
          <div key={item.sweepstakeId} className="rounded-md border border-line bg-panel-strong p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.sponsor}</p>
              </div>
              <Badge tone={item.scamScore >= 60 ? "danger" : item.eligibilityScore >= 75 ? "ok" : "default"}>
                {formatCurrency(item.prizeRetailValue)}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted">
              {categoryLabel(item.category)} | Entries {item.entryCount}
              {showDeadline ? ` | Deadline ${formatDate(item.deadline)}` : ""}
            </p>
          </div>
        ))
      ) : (
        <EmptyState title="Nothing to show" body={empty} />
      )}
    </div>
  );
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <p className="rounded border border-line bg-panel px-2 py-1">
      <span className="text-muted">{props.label}</span> <span className="font-semibold text-foreground">{props.value}</span>
    </p>
  );
}
