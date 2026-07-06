import { ArrowRight, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { SweepstakeCard } from "@/components/sweepstakes-card";
import { formatDate, titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const store = await getStore();
  const data = await store.getDashboardData();
  const priority = data.sweepstakes
    .slice()
    .sort((a, b) => b.scamScore - a.scamScore || (new Date(a.endAt ?? 0).getTime() - new Date(b.endAt ?? 0).getTime()))
    .slice(0, 4);

  return (
    <AppShell>
      <PageHeader title="Trust Dashboard" kicker="Sweepstakes compliance command center">
        <Link href="/dashboard/queue" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]">
          Review Queue <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Active" value={data.stats.activeSweepstakes} sublabel="tracked sweepstakes" />
        <MetricCard label="Ending Soon" value={data.stats.endingSoon} sublabel="within 7 days" />
        <MetricCard label="Queue" value={data.stats.queuedAssistantTasks} sublabel="awaiting review" />
        <MetricCard label="Entries" value={data.stats.entriesThisWeek} sublabel="this week" />
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
            </div>
          </Panel>

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
    </AppShell>
  );
}
