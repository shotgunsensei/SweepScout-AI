import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { Badge, PageHeader, Panel, RiskList, ScorePill, SubmitButton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { titleCase } from "@/lib/format";
import type { AppSettings, Sweepstake } from "@/lib/types";

type ScoringResponse = { sweepstakes: Sweepstake[]; settings: AppSettings };

export default function ScoringPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["scoring"], queryFn: () => apiGet<ScoringResponse>("/scoring") });

  return (
    <AppShell>
      <PageHeader
        title="Scam & Eligibility Scoring"
        kicker={data ? `Risk cap ${data.settings.maxScamScore} | eligibility floor ${data.settings.minEligibilityScore}` : "Loading scoring rules"}
      />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load scoring" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? (
        <div className="grid gap-4">
          {data.sweepstakes
            .slice()
            .sort((a, b) => b.scamScore - a.scamScore)
            .map((item) => (
              <ScoringCard key={item.id} item={item} />
            ))}
        </div>
      ) : null}
    </AppShell>
  );
}

function ScoringCard({ item }: { item: Sweepstake }) {
  const rescore = useApiMutation("/scoring/rescore");
  return (
    <Panel>
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              rescore.mutate(formToObject(event.currentTarget));
            }}
          >
            <input type="hidden" name="sweepstakeId" value={item.id} />
            <SubmitButton tone="secondary" disabled={rescore.isPending}>
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={15} aria-hidden="true" /> Rescore
              </span>
            </SubmitButton>
          </form>
        </div>
      </div>
    </Panel>
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
