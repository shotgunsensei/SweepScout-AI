import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markEntryStatusAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton } from "@/components/ui";
import { formatDate, titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function EntryReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const entries = await store.listEntryLogs();
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    notFound();
  }

  const sweepstake = await store.getSweepstake(entry.sweepstakeId);
  const formUrl = entry.formUrl ?? sweepstake?.formUrl ?? sweepstake?.extractedRules?.formUrl ?? sweepstake?.url ?? null;

  return (
    <AppShell>
      <PageHeader title="Review & Submit Manually" kicker={entry.sweepstakeTitle}>
        {formUrl ? (
          <Link href={formUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]">
            Open Form <ExternalLink size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </PageHeader>

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
          <form action={markEntryStatusAction} className="mt-5 rounded-md border border-line bg-panel-strong p-4">
            <input type="hidden" name="sweepstakeId" value={entry.sweepstakeId} />
            <input type="hidden" name="status" value="submitted" />
            <input type="hidden" name="notes" value={`Submitted manually after reviewing prefill attempt ${entry.id}.`} />
            <div className="grid gap-2">
              <Checkbox name="userApproved" required label="I personally submitted the live form" />
              <Checkbox name="reviewConfirmed" required label="I reviewed official rules, eligibility, terms, and final form" />
            </div>
            <div className="mt-4">
              <SubmitButton>
                <span className="inline-flex items-center gap-2">Mark Submitted Manually</span>
              </SubmitButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-3 text-lg font-semibold">Prefill Screenshot</h2>
          {entry.screenshotPath ? (
            <Image
              src={entry.screenshotPath}
              alt={`Prefill screenshot for ${entry.sweepstakeTitle}`}
              width={1365}
              height={900}
              sizes="(min-width: 1280px) 40vw, 100vw"
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
    </AppShell>
  );
}
