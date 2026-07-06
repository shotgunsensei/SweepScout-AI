import { RefreshCw } from "lucide-react";
import { rescoreSweepstakeAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, Panel, RiskList, ScorePill, SubmitButton } from "@/components/ui";
import { titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";
import type { Sweepstake } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ScoringPage() {
  const store = await getStore();
  const [sweepstakes, settings] = await Promise.all([store.listSweepstakes(), store.getSettings()]);

  return (
    <AppShell>
      <PageHeader title="Scam & Eligibility Scoring" kicker={`Risk cap ${settings.maxScamScore} | eligibility floor ${settings.minEligibilityScore}`} />
      <div className="grid gap-4">
        {sweepstakes
          .sort((a, b) => b.scamScore - a.scamScore)
          .map((item) => (
            <Panel key={item.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{item.title}</h2>
                    <Badge tone={statusTone(item)}>{titleCase(item.status)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted">
                    {decisionNotes(item).map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                  <div className="mt-4">
                    <RiskList flags={item.riskFlags} />
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ScorePill label="Eligible" value={item.eligibilityScore} />
                  <ScorePill label="Risk" value={item.scamScore} invert />
                  <form action={rescoreSweepstakeAction}>
                    <input type="hidden" name="sweepstakeId" value={item.id} />
                    <SubmitButton tone="secondary">
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw size={15} aria-hidden="true" /> Rescore
                      </span>
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </Panel>
          ))}
      </div>
    </AppShell>
  );
}

function statusTone(item: Sweepstake) {
  if (item.status === "eligible") return "ok";
  if (item.status === "ineligible" || item.status === "expired") return "danger";
  if (item.status === "suspicious" || item.status === "needs_review") return "warn";
  return "default";
}

function decisionNotes(item: Sweepstake) {
  if (item.complianceNotes.length) {
    return item.complianceNotes;
  }
  if (item.riskFlags.length) {
    return item.riskFlags.map((flag) => flag.label);
  }
  return ["No blocking compliance notes are active."];
}
