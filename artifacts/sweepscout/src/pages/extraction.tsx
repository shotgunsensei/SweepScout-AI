import { FileSearch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { Badge, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { formatDate, titleCase } from "@/lib/format";
import type { AppConfig, ExtractionJob, Sweepstake } from "@/lib/types";

type ExtractionResponse = { sweepstakes: Sweepstake[]; jobs: ExtractionJob[]; config: AppConfig };

export default function ExtractionPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["extraction"], queryFn: () => apiGet<ExtractionResponse>("/extraction") });

  return (
    <AppShell>
      <PageHeader title="Rules Extraction Pipeline" kicker={data ? (data.config.openaiConfigured ? data.config.openaiModel : "OpenAI key missing") : "Loading pipeline"} />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load extraction pipeline" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Extraction Queue</h2>
            <div className="divide-y divide-line">
              {data.sweepstakes.map((item) => (
                <ExtractionRow key={item.id} item={item} enabled={data.config.openaiConfigured} />
              ))}
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Recent Jobs</h2>
            <div className="space-y-3">
              {data.jobs.length ? (
                data.jobs.map((job) => (
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
      ) : null}
    </AppShell>
  );
}

function ExtractionRow({ item, enabled }: { item: Sweepstake; enabled: boolean }) {
  const runExtraction = useApiMutation("/extraction/run");
  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{item.title}</h3>
          <Badge tone={item.rulesExtractedAt ? "ok" : "warn"}>{item.rulesExtractedAt ? "Extracted" : "Pending"}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">Rules: {item.rulesUrl ?? "source page"} | {formatDate(item.rulesExtractedAt)}</p>
      </div>
      {enabled ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runExtraction.mutate(formToObject(event.currentTarget));
          }}
        >
          <input type="hidden" name="sweepstakeId" value={item.id} />
          <SubmitButton disabled={runExtraction.isPending}>
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
  );
}
