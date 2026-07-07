import { CheckCircle2, ListChecks } from "lucide-react";
import { approveTaskAction, recordEntryAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { EmptyState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function DashboardQueuePage() {
  const store = await getStore();
  const tasks = await store.listAssistantTasks();

  return (
    <AppShell>
      <PageHeader title="Form Assistant Queue" kicker="Human-approved staging, never auto-submit" />
      <SectionHeader title="Ready for Review" eyebrow="Manual approval workflow" />
      <div className="grid gap-4">
        {tasks.length ? (
          tasks.map((task) => (
            <Panel key={task.id}>
              <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{task.sweepstakeTitle}</h2>
                    <Badge tone={task.status === "approved" ? "ok" : task.status === "blocked" ? "danger" : "warn"}>
                      {titleCase(task.status)}
                    </Badge>
                    <Badge>Priority {task.priority}</Badge>
                    <Badge tone="ok">Approval required</Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-muted">{task.formUrl}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(task.fields).length ? (
                      Object.entries(task.fields).map(([key, value]) => (
                        <div key={key} className="rounded-md border border-line bg-panel-strong p-3">
                          <p className="text-xs uppercase text-muted">{key}</p>
                          <p className="mt-1 truncate text-sm">{value}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-line bg-panel-strong p-3 text-sm text-muted sm:col-span-2 lg:col-span-4">
                        No fields have been staged yet.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {task.blockers.length ? (
                      task.blockers.map((blocker) => (
                        <Badge key={blocker} tone="warn">
                          {blocker}
                        </Badge>
                      ))
                    ) : (
                      <Badge tone="ok">No active blockers</Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 xl:min-w-52">
                  <form action={approveTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <SubmitButton>
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 size={15} aria-hidden="true" /> Approve
                      </span>
                    </SubmitButton>
                  </form>
                  <form action={recordEntryAction} className="rounded-md border border-line bg-panel-strong p-3">
                    <input type="hidden" name="sweepstakeId" value={task.sweepstakeId} />
                    <div className="grid gap-2">
                      <Checkbox name="userApproved" required label="I submitted manually" />
                      <Checkbox name="reviewConfirmed" required label="Rules and form reviewed" />
                      <input type="hidden" name="notes" value={`Approved from assistant queue task ${task.id}`} />
                      <SubmitButton tone="secondary">Log Attempt</SubmitButton>
                    </div>
                  </form>
                </div>
              </div>
            </Panel>
          ))
        ) : (
          <EmptyState
            title="Queue is empty"
            body="Eligible sweepstakes that can be staged for manual review will appear here."
            action={<ListChecks size={18} className="text-accent" aria-hidden />}
          />
        )}
      </div>
    </AppShell>
  );
}
