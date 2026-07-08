import { ExternalLink, ShieldAlert } from "lucide-react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, DeadlineBadge, EligibilityBadge, PageHeader, Panel, PrizeCard, RiskBadge, StatusTimeline } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import type { EntryLog, Sweepstake } from "@/lib/types";

export default function SweepstakesDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const sweepstake = useQuery({
    queryKey: ["sweepstake", id],
    queryFn: () => apiGet<Sweepstake>(`/sweepstakes/${id}`),
    enabled: Boolean(id),
  });
  const entries = useQuery({ queryKey: ["entries"], queryFn: () => apiGet<EntryLog[]>("/entries") });

  return (
    <AppShell>
      {sweepstake.isLoading ? <LoadingState title="Loading sweepstakes detail" /> : null}
      {sweepstake.isError ? <ErrorNotice title="Unable to load sweepstakes" body="The API request failed. Confirm the API server is running." /> : null}
      {sweepstake.data ? <DetailBody item={sweepstake.data} entries={(entries.data ?? []).filter((entry) => entry.sweepstakeId === sweepstake.data.id)} /> : null}
    </AppShell>
  );
}

function DetailBody({ item, entries }: { item: Sweepstake; entries: EntryLog[] }) {
  const timeline = [
    { label: "Discovered", detail: formatDate(item.createdAt), tone: "default" as const },
    { label: titleCase(item.status), detail: item.complianceNotes[0] ?? item.eligibilitySummary, tone: item.status === "eligible" ? "ok" as const : item.status === "suspicious" || item.status === "needs_review" ? "warn" as const : "default" as const },
    ...(entries.length
      ? entries.slice(0, 5).map((entry) => ({
          label: titleCase(entry.status),
          detail: `${formatDate(entry.attemptedAt)}${entry.notes ? ` - ${entry.notes}` : ""}`,
          tone: entry.status === "submitted" ? "ok" as const : entry.status === "suspicious" ? "warn" as const : "default" as const,
        }))
      : []),
  ];

  return (
    <>
      <PageHeader
        title={item.title}
        kicker={item.sponsor}
        description="Premium compliance detail view for prize value, eligibility, official rules, risk notes, and manual entry history."
      >
        <RiskBadge value={item.scamScore} />
        <EligibilityBadge value={item.eligibilityScore} status={item.status} />
        <DeadlineBadge value={item.endAt} />
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid content-start gap-5">
          <PrizeCard item={item} />
          <Panel>
            <SectionHeader title="Entry Facts" eyebrow="Official-record summary" />
            <div className="grid gap-3 text-sm">
              <Fact label="Sponsor" value={item.sponsor} />
              <Fact label="Category" value={categoryLabel(item.category)} />
              <Fact label="Deadline" value={formatDate(item.endAt)} />
              <Fact label="Entry frequency" value={item.entryFrequency || "Unknown"} />
              <Fact label="Eligibility" value={item.eligibilitySummary || "Not captured"} />
              <Fact label="Prize value" value={formatCurrency(item.prizeRetailValue)} />
              <Fact label="Age" value={item.ageRequirement ? `${item.ageRequirement}+` : "Not captured"} />
              <Fact label="States" value={item.stateEligibility.includes("ALL") ? "All eligible states" : item.stateEligibility.join(", ")} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.hasCaptcha ? <Badge tone="warn">CAPTCHA manual-only</Badge> : null}
              {item.purchaseRequired ? <Badge tone="danger">Purchase/payment signal</Badge> : null}
              {item.noPurchaseMethodFound ? <Badge tone="warn">No-purchase method missing</Badge> : <Badge tone="ok">No-purchase method ok</Badge>}
              {item.requiresInPersonAppearance ? <Badge tone="warn">In-person requirement</Badge> : null}
            </div>
          </Panel>
          <Panel>
            <SectionHeader title="Entry Status Timeline" eyebrow="Manual history" />
            <StatusTimeline items={timeline} />
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel className="border-accent/25">
            <SectionHeader title="AI Risk Score" eyebrow={`${item.scamScore}/100 risk | ${item.eligibilityScore}/100 eligibility`} />
            <div className="grid gap-3 sm:grid-cols-2">
              <ScorePanel label="Risk" value={item.scamScore} dangerHigh />
              <ScorePanel label="Eligibility" value={item.eligibilityScore} />
            </div>
            <div className="mt-4 grid gap-2">
              {item.riskFlags.length ? (
                item.riskFlags.map((flag) => (
                  <div key={flag.code} className="flex items-start gap-2 rounded-md border border-line bg-panel-strong p-3 text-sm">
                    <ShieldAlert className={flag.severity === "high" ? "mt-0.5 shrink-0 text-danger" : flag.severity === "medium" ? "mt-0.5 shrink-0 text-warning" : "mt-0.5 shrink-0 text-muted"} size={16} aria-hidden="true" />
                    <span>
                      <span className="block font-medium text-foreground">{flag.label}</span>
                      <span className="text-xs text-muted">{titleCase(flag.severity)} severity</span>
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="No active risk flags" body="Risk flags appear here after rules extraction, scoring, inbox review, or manual decisions." />
              )}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Compliance Notes" eyebrow="Decision basis" />
            <div className="grid gap-2 text-sm leading-6 text-muted">
              {item.complianceNotes.length ? item.complianceNotes.map((note) => <p key={note} className="rounded-md border border-line bg-panel-strong p-3">{note}</p>) : <p>No compliance notes captured.</p>}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Official Rules" eyebrow={item.rulesUrl ? "Captured URL" : "Missing URL"} />
            {item.rulesUrl ? (
              <a href={item.rulesUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-accent">
                Open official rules manually <ExternalLink size={15} aria-hidden="true" />
              </a>
            ) : (
              <p className="text-sm text-warning">Official rules URL is not captured yet.</p>
            )}
            <p className="mt-4 max-h-80 overflow-y-auto rounded-md border border-line bg-panel-strong p-3 text-sm leading-6 text-muted">
              {item.rulesText ?? item.extractedRules?.eligibility ?? item.extractedRules?.prizeSummary ?? "No official rules text has been stored yet."}
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ScorePanel({ label, value, dangerHigh = false }: { label: string; value: number; dangerHigh?: boolean }) {
  const tone = dangerHigh ? (value >= 60 ? "text-danger" : value >= 40 ? "text-warning" : "text-ok") : value >= 75 ? "text-ok" : value >= 50 ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-line bg-panel-strong p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 text-4xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
