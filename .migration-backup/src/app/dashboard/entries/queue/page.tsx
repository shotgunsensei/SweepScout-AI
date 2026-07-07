import { ExternalLink, Wand2 } from "lucide-react";
import Link from "next/link";
import { prefillFormAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function EntryPrefillQueuePage() {
  const store = await getStore();
  const [tasks, sweepstakes] = await Promise.all([store.listAssistantTasks(), store.listSweepstakes()]);
  const taskSweepstakeIds = new Set(tasks.map((task) => task.sweepstakeId));
  const directSweepstakes = sweepstakes.filter((item) => {
    const formUrl = item.formUrl ?? item.extractedRules?.formUrl;
    return formUrl && !taskSweepstakeIds.has(item.id) && item.status !== "expired" && item.status !== "ineligible" && item.status !== "suspicious";
  });

  return (
    <AppShell>
      <PageHeader title="Assisted Prefill Queue" kicker="User-approved, manual-submit only" />
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
                  <Link href={formUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-accent">
                    Inspect form <ExternalLink size={15} aria-hidden="true" />
                  </Link>
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
    </AppShell>
  );
}

function PrefillForm(props: { sweepstakeId: string; formUrl: string }) {
  return (
    <form action={prefillFormAction} className="w-full rounded-md border border-line bg-panel-strong p-3 xl:w-80">
      <input type="hidden" name="sweepstakeId" value={props.sweepstakeId} />
      <input type="hidden" name="formUrl" value={props.formUrl} />
      <div className="grid gap-3">
        <Checkbox name="prefillApproved" required label="Approve profile prefill" />
        <Checkbox name="useAiFallback" defaultChecked label="AI label fallback" />
        <SubmitButton>
          <span className="inline-flex items-center gap-2">
            <Wand2 size={15} aria-hidden="true" /> Prefill
          </span>
        </SubmitButton>
      </div>
    </form>
  );
}
