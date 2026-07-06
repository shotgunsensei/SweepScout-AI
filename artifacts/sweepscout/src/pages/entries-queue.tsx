import { ExternalLink, Wand2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { titleCase } from "@/lib/format";
import type { AssistantTask, Sweepstake } from "@/lib/types";

type PrefillQueueResponse = { tasks: AssistantTask[]; sweepstakes: Sweepstake[] };

export default function EntryPrefillQueuePage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["prefill-queue"], queryFn: () => apiGet<PrefillQueueResponse>("/prefill-queue") });

  const tasks = data?.tasks ?? [];
  const sweepstakes = data?.sweepstakes ?? [];
  const taskSweepstakeIds = new Set(tasks.map((task) => task.sweepstakeId));
  const directSweepstakes = sweepstakes.filter((item) => {
    const formUrl = item.formUrl ?? item.extractedRules?.formUrl;
    return formUrl && !taskSweepstakeIds.has(item.id) && item.status !== "expired" && item.status !== "ineligible" && item.status !== "suspicious";
  });

  return (
    <AppShell>
      <PageHeader title="Assisted Prefill Queue" kicker="User-approved, manual-submit only" />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load prefill queue" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <Panel key={task.id}>
              <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{task.sweepstakeTitle}</h2>
                    <Badge tone={task.status === "blocked" ? "danger" : task.status === "approved" ? "ok" : "warn"}>{titleCase(task.status)}</Badge>
                    <Badge>Assistant task</Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-muted">{task.formUrl}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {task.blockers.map((blocker) => (
                      <Badge key={blocker} tone="warn">
                        {blocker}
                      </Badge>
                    ))}
                  </div>
                </div>
                <PrefillForm sweepstakeId={task.sweepstakeId} formUrl={task.formUrl} />
              </div>
            </Panel>
          ))}

          {directSweepstakes.map((item) => {
            const formUrl = item.formUrl ?? item.extractedRules?.formUrl ?? "";
            return (
              <Panel key={item.id}>
                <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{item.title}</h2>
                      <Badge tone={item.status === "eligible" ? "ok" : "default"}>{titleCase(item.status)}</Badge>
                      <Badge>Form URL ready</Badge>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted">{formUrl}</p>
                    <a href={formUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-accent">
                      Inspect form <ExternalLink size={15} aria-hidden="true" />
                    </a>
                  </div>
                  <PrefillForm sweepstakeId={item.id} formUrl={formUrl} />
                </div>
              </Panel>
            );
          })}

          {!tasks.length && !directSweepstakes.length ? (
            <Panel>
              <p className="text-sm text-muted">No form URLs are ready for assisted prefill.</p>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function PrefillForm(props: { sweepstakeId: string; formUrl: string }) {
  const [, navigate] = useLocation();
  const prefill = useApiMutation<{ reviewUrl: string }>("/forms/prefill", {
    onSuccess: (result) => {
      if (result?.reviewUrl) {
        navigate(toInternalPath(result.reviewUrl));
      }
    },
  });
  return (
    <form
      className="w-full rounded-md border border-line bg-panel-strong p-3 xl:w-80"
      onSubmit={(event) => {
        event.preventDefault();
        prefill.mutate(formToObject(event.currentTarget));
      }}
    >
      <input type="hidden" name="sweepstakeId" value={props.sweepstakeId} />
      <input type="hidden" name="formUrl" value={props.formUrl} />
      <div className="grid gap-3">
        <Checkbox name="prefillApproved" required label="Approve profile prefill" />
        <Checkbox name="useAiFallback" defaultChecked label="AI label fallback" />
        <SubmitButton disabled={prefill.isPending}>
          <span className="inline-flex items-center gap-2">
            <Wand2 size={15} aria-hidden="true" /> Prefill
          </span>
        </SubmitButton>
      </div>
    </form>
  );
}

function toInternalPath(reviewUrl: string) {
  try {
    return new URL(reviewUrl, window.location.origin).pathname;
  } catch {
    return reviewUrl;
  }
}
