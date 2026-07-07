import { FileSearch } from "lucide-react";
import { runExtractionAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { getAppConfig } from "@/lib/env";
import { formatDate, titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function ExtractionPage() {
  const config = getAppConfig();
  const store = await getStore();
  const [sweepstakes, jobs] = await Promise.all([store.listSweepstakes(), store.listExtractionJobs()]);

  return (
    <AppShell>
      <PageHeader title="Rules Extraction Pipeline" kicker={config.openaiConfigured ? config.openaiModel : "OpenAI key missing"} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Extraction Queue</h2>
          <div className="divide-y divide-line">
            {sweepstakes.map((item) => (
              <div key={item.id} className="grid gap-4 py-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{item.title}</h3>
                    <Badge tone={item.rulesExtractedAt ? "ok" : "warn"}>
                      {item.rulesExtractedAt ? "Extracted" : "Pending"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">Rules: {item.rulesUrl ?? "source page"} | {formatDate(item.rulesExtractedAt)}</p>
                </div>
                {config.openaiConfigured ? (
                  <form action={runExtractionAction}>
                    <input type="hidden" name="sweepstakeId" value={item.id} />
                    <SubmitButton>
                      <span className="inline-flex items-center gap-2">
                        <FileSearch size={15} aria-hidden="true" /> Extract
                      </span>
                    </SubmitButton>
                  </form>
                ) : (
                  <button className="h-9 rounded-md border border-line px-3 text-sm text-muted" disabled>
                    Key required
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Recent Jobs</h2>
          <div className="space-y-3">
            {jobs.length ? (
              jobs.map((job) => (
                <div key={job.id} className="rounded-md border border-line bg-panel-strong p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{job.sweepstakeId}</p>
                    <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">{job.summary ?? job.error ?? "Running"}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No extraction jobs yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
