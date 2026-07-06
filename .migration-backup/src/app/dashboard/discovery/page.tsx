import { Play, Radar } from "lucide-react";
import Link from "next/link";
import { runDiscoveryAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { EmptyState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { formatDate, titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function DashboardDiscoveryPage() {
  const store = await getStore();
  const jobs = await store.listDiscoveryJobs();

  return (
    <AppShell>
      <PageHeader title="Discovery Jobs" kicker="Search-result discovery, no form submission">
        <Link href="/api/health" className="rounded-md border border-line bg-panel-strong px-3 py-2 text-sm text-foreground">
          Health
        </Link>
      </PageHeader>
      <SectionHeader title="Job Status" eyebrow="Polite discovery runs" />
      <div className="grid gap-4 lg:grid-cols-2">
        {jobs.length ? (
          jobs.map((job) => {
            const notes = parseDiscoveryNotes(job.notes);
            return (
              <Panel key={job.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{job.label}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{job.query}</p>
                  </div>
                  <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="ok">Found {job.discoveredCount}</Badge>
                  <Badge>Last {formatDate(job.lastRunAt)}</Badge>
                  {notes.counters ? <Badge>Skipped {notes.counters.skipped}</Badge> : null}
                  {notes.counters ? <Badge tone={notes.counters.errors ? "danger" : "default"}>Errors {notes.counters.errors}</Badge> : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">{notes.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {job.seeds.map((seed) => (
                    <Badge key={seed}>{seed}</Badge>
                  ))}
                </div>
                <form action={runDiscoveryAction} className="mt-5">
                  <input type="hidden" name="jobId" value={job.id} />
                  <SubmitButton>
                    <span className="inline-flex items-center gap-2">
                      <Play size={15} aria-hidden="true" /> Run
                    </span>
                  </SubmitButton>
                </form>
              </Panel>
            );
          })
        ) : (
          <div className="lg:col-span-2">
            <EmptyState title="No discovery jobs" body="Create or seed discovery jobs to begin collecting safe candidate URLs." action={<Radar size={18} className="text-accent" aria-hidden />} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function parseDiscoveryNotes(notes: string) {
  try {
    const parsed = JSON.parse(notes) as { saved?: number; skipped?: number; errors?: number; guardrails?: string[] };
    return {
      summary: parsed.guardrails?.[0] ?? "Discovery run complete.",
      counters: {
        saved: parsed.saved ?? 0,
        skipped: parsed.skipped ?? 0,
        errors: parsed.errors ?? 0,
      },
    };
  } catch {
    return { summary: notes, counters: null };
  }
}
