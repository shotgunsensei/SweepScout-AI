import { ExternalLink } from "lucide-react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { formatDate, titleCase } from "@/lib/format";
import type { EntryLog, Sweepstake } from "@/lib/types";

type EntryReviewResponse = { entry: EntryLog; sweepstake: Sweepstake | null; formUrl: string | null };

export default function EntryReviewPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["entry-review", params.id],
    queryFn: () => apiGet<EntryReviewResponse>(`/entries/${params.id}/review`),
  });

  return (
    <AppShell>
      <PageHeader title="Review & Submit Manually" kicker={data?.entry.sweepstakeTitle ?? "Entry review"}>
        {data?.formUrl ? (
          <a href={data.formUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]">
            Open Form <ExternalLink size={15} aria-hidden="true" />
          </a>
        ) : null}
      </PageHeader>
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load entry" body="The entry could not be found or the API request failed." /> : null}
      {data ? <EntryReviewBody entry={data.entry} /> : null}
    </AppShell>
  );
}

function EntryReviewBody({ entry }: { entry: EntryLog }) {
  const markStatus = useApiMutation("/entries/status");
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={entry.status === "prefilled" ? "ok" : "warn"}>{titleCase(entry.status)}</Badge>
            <Badge>{formatDate(entry.attemptedAt)}</Badge>
          </div>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-muted">
            <p>Review the prefilled fields in the controlled browser output before doing anything on the live form.</p>
            <p>Complete CAPTCHA, terms, eligibility confirmations, and final submit manually. SweepScout AI does not solve CAPTCHA or submit entries.</p>
            <p>{entry.notes}</p>
          </div>
          {entry.blockers?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {entry.blockers.map((blocker) => (
                <Badge key={blocker} tone="warn">
                  {blocker}
                </Badge>
              ))}
            </div>
          ) : null}
          <form
            className="mt-5 rounded-md border border-line bg-panel-strong p-4"
            onSubmit={(event) => {
              event.preventDefault();
              markStatus.mutate(formToObject(event.currentTarget));
            }}
          >
            <input type="hidden" name="sweepstakeId" value={entry.sweepstakeId} />
            <input type="hidden" name="status" value="submitted" />
            <input type="hidden" name="notes" value={`Submitted manually after reviewing prefill attempt ${entry.id}.`} />
            <div className="grid gap-2">
              <Checkbox name="userApproved" required label="I personally submitted the live form" />
              <Checkbox name="reviewConfirmed" required label="I reviewed official rules, eligibility, terms, and final form" />
            </div>
            <div className="mt-4">
              <SubmitButton disabled={markStatus.isPending}>
                <span className="inline-flex items-center gap-2">Mark Submitted Manually</span>
              </SubmitButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-3 text-lg font-semibold">Prefill Screenshot</h2>
          {entry.screenshotPath ? (
            <img
              src={entry.screenshotPath}
              alt={`Prefill screenshot for ${entry.sweepstakeTitle}`}
              className="max-h-[620px] w-full rounded-md border border-line object-contain"
            />
          ) : (
            <p className="text-sm text-muted">No screenshot was captured for this attempt.</p>
          )}
        </Panel>
      </div>

      <Panel className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Field Mapping</h2>
        {entry.prefillFields?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-line">
                  <th className="py-3 pr-4">Field</th>
                  <th className="py-3 pr-4">Mapped Profile Field</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entry.prefillFields.map((field) => (
                  <tr key={field.fieldId}>
                    <td className="py-3 pr-4 font-medium">{field.label}</td>
                    <td className="py-3 pr-4 text-muted">{field.profileField ?? "None"}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={field.status === "filled" ? "ok" : field.status === "blocked" ? "danger" : "warn"}>{titleCase(field.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{field.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Field-level mapping details are not available for this attempt.</p>
        )}
      </Panel>
    </>
  );
}
