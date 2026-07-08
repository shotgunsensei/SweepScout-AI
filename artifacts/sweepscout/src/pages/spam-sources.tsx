import { AtSign, MailWarning, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { useApiMutation } from "@/lib/forms";
import { formatDate } from "@/lib/format";
import type { SpamSourceReport } from "@/lib/types";

type GenerateAliasesResponse = { generated: number };

export default function SpamSourcesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["spam-report"],
    queryFn: () => apiGet<SpamSourceReport>("/spam-report"),
  });
  const generateAliases = useApiMutation<GenerateAliasesResponse>("/aliases/generate");

  return (
    <AppShell>
      <PageHeader title="Spam Source Report" kicker="Alias attribution and email-volume risk">
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={generateAliases.isPending}
          onClick={() => generateAliases.mutate({})}
        >
          <AtSign size={16} aria-hidden="true" /> {generateAliases.isPending ? "Generating..." : "Generate Missing Aliases"}
        </button>
      </PageHeader>

      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load spam report" body="The API request failed. Confirm the API server is running." /> : null}
      {generateAliases.error ? (
        <ErrorNotice title="Unable to generate aliases" body={generateAliases.error.message} />
      ) : null}
      {generateAliases.data ? (
        <Panel className="mb-4 border-ok/30 bg-ok/10 text-sm text-ok">
          Generated {generateAliases.data.generated} missing alias{generateAliases.data.generated === 1 ? "" : "es"}.
        </Panel>
      ) : null}
      {data ? <SpamReportBody report={data} /> : null}
    </AppShell>
  );
}

function SpamReportBody({ report }: { report: SpamSourceReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Aliases" value={report.totals.aliasesAssigned} sublabel={`${report.totals.aliasesMissing} missing`} />
        <MetricCard label="Inbox Alerts" value={report.totals.inboxAlerts} sublabel={`${report.windowDays} day window`} />
        <MetricCard label="Spam Flags" value={report.totals.spamAlerts} sublabel="phishing/unsubscribe" />
        <MetricCard label="Excess Domains" value={report.totals.excessiveDomains} sublabel={`threshold ${report.threshold}`} />
        <MetricCard label="Excess Sweeps" value={report.totals.excessiveSweepstakes} sublabel="by alias volume" />
        <MetricCard label="Generated" value={formatDate(report.generatedAt)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <SectionHeader title="Sponsor / Sweepstake Sources" eyebrow="Alias-attributed volume" />
          <div className="grid gap-3">
            {report.sweepstakes.length ? (
              report.sweepstakes.slice(0, 12).map((item) => (
                <div key={item.sweepstakeId} className="rounded-md border border-line bg-panel-strong p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.sweepstakeTitle}</p>
                      <p className="mt-1 text-sm text-muted">{item.sponsor}</p>
                      <p className="mt-2 break-all text-xs text-accent">{item.emailAlias ?? "No alias assigned"}</p>
                    </div>
                    <Badge tone={toneFor(item.riskLevel)}>{item.riskLevel}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-4">
                    <Stat label="Emails" value={item.emailCount} />
                    <Stat label="Spam" value={item.spamCount} />
                    <Stat label="Phishing" value={item.phishingCount} />
                    <Stat label="Unsub" value={item.unsubscribeCount} />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Domains: {item.sourceDomains.length ? item.sourceDomains.join(", ") : "none captured"} | Latest {formatDate(item.latestReceivedAt)}
                  </p>
                  {item.excessiveVolume ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-warning">
                      <MailWarning size={15} aria-hidden="true" /> Excessive email volume for this alias.
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="No spam sources yet" body="Inbox alerts matched by aliases will appear here after scans run." />
            )}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel>
            <SectionHeader title="Sender Domains" eyebrow="Domains producing volume" />
            <div className="grid gap-3">
              {report.domains.length ? (
                report.domains.slice(0, 12).map((domain) => (
                  <div key={domain.domain} className="rounded-md border border-line bg-panel-strong p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{domain.domain}</p>
                      <Badge tone={toneFor(domain.riskLevel)}>{domain.riskLevel}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{domain.sponsor ?? "Unknown sponsor"}</p>
                    <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-3">
                      <Stat label="Emails" value={domain.emailCount} />
                      <Stat label="Spam" value={domain.spamCount} />
                      <Stat label="Sweeps" value={domain.matchedSweepstakeCount} />
                    </div>
                    {domain.excessiveVolume ? (
                      <p className="mt-3 flex items-center gap-2 text-sm text-warning">
                        <ShieldAlert size={15} aria-hidden="true" /> Volume exceeds configured threshold.
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <EmptyState title="No sender domains" body="Run an inbox scan to populate sender-domain reporting." />
              )}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Alias Inventory" eyebrow="Coverage by sweepstake" />
            <div className="grid gap-2">
              {report.aliases.slice(0, 16).map((alias) => (
                <div key={alias.sweepstakeId} className="rounded-md border border-line bg-panel-strong p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">{alias.sweepstakeTitle}</p>
                    <Badge tone={alias.emailAlias ? "ok" : "warn"}>{alias.emailAlias ? "Assigned" : "Missing"}</Badge>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted">{alias.emailAlias ?? "Generate an alias before the next entry."}</p>
                  <p className="mt-2 text-xs text-muted">
                    Entries {alias.entryCount} | Alerts {alias.inboxAlertCount} | Spam {alias.spamCount}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <p className="rounded border border-line bg-panel px-2 py-1">
      <span className="text-muted">{props.label}</span> <span className="font-semibold text-foreground">{props.value}</span>
    </p>
  );
}

function toneFor(riskLevel: "low" | "medium" | "high") {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
  return "ok";
}
