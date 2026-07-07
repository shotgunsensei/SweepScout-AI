import { Download, FileText, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet, apiUrl } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { ComplianceReport, ComplianceSweepstakeReport } from "@/lib/types";

export default function ReportsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["compliance-report"],
    queryFn: () => apiGet<ComplianceReport>("/reports/compliance"),
  });

  return (
    <AppShell>
      <PageHeader title="Compliance Reports" kicker="Official rules, risk notes, and entry decisions">
        <a
          href={apiUrl("/reports/compliance.csv")}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]"
        >
          <Download size={16} aria-hidden="true" /> Export All CSV
        </a>
      </PageHeader>

      {isLoading ? <LoadingState title="Loading compliance reports" /> : null}
      {isError ? <ErrorNotice title="Unable to load compliance reports" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <ReportsBody report={data} /> : null}
    </AppShell>
  );
}

function ReportsBody({ report }: { report: ComplianceReport }) {
  const withRules = report.reports.filter((item) => item.officialRulesUrl).length;
  const withSubmissions = report.reports.filter((item) => item.submissionTimestamps.length > 0).length;
  const withRiskNotes = report.reports.filter((item) => item.extractedRiskNotes.length > 0).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Reports" value={report.reports.length} sublabel="tracked sweepstakes" />
        <MetricCard label="Rules Captured" value={withRules} sublabel="official URL present" />
        <MetricCard label="Submitted" value={withSubmissions} sublabel="with submission timestamps" />
        <MetricCard label="Risk Notes" value={withRiskNotes} sublabel={`generated ${formatDate(report.generatedAt)}`} />
      </div>

      <Panel className="mt-6">
        <SectionHeader title="Per-Sweepstake Compliance Files" eyebrow="CSV and PDF exports" />
        <div className="grid gap-3">
          {report.reports.length ? (
            report.reports.map((item) => <ComplianceReportCard key={item.sweepstakeId} report={item} />)
          ) : (
            <EmptyState title="No reports available" body="Add or discover sweepstakes to generate compliance report exports." />
          )}
        </div>
      </Panel>
    </>
  );
}

function ComplianceReportCard({ report }: { report: ComplianceSweepstakeReport }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{report.title}</h2>
            <Badge tone={statusTone(report.status)}>{titleCase(report.status)}</Badge>
            <Badge>{report.entryFrequency}</Badge>
            {report.officialRulesUrl ? <Badge tone="ok">Rules URL</Badge> : <Badge tone="warn">Rules missing</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted">
            {report.sponsor} | Deadline {formatDate(report.deadline)} | Submissions {report.submissionTimestamps.length}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-muted lg:grid-cols-2">
            <ReportField label="No-purchase method" value={report.noPurchaseMethod} />
            <ReportField label="Eligibility" value={report.eligibility} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.extractedRiskNotes.slice(0, 5).map((note) => (
              <Badge key={note} tone={riskTone(note)}>
                {note}
              </Badge>
            ))}
            {report.extractedRiskNotes.length > 5 ? <Badge>{report.extractedRiskNotes.length - 5} more notes</Badge> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={14} aria-hidden="true" /> Decisions {report.userDecisionHistory.length}
            </span>
            <span>Generated {formatDate(report.generatedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2 xl:justify-end">
          <a
            href={apiUrl(`/reports/compliance/${report.sweepstakeId}.csv`)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            <Download size={15} aria-hidden="true" /> CSV
          </a>
          <a
            href={apiUrl(`/reports/compliance/${report.sweepstakeId}.pdf`)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]"
          >
            <FileText size={15} aria-hidden="true" /> PDF
          </a>
        </div>
      </div>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground">{value || "Not captured"}</p>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "eligible" || status === "entered") return "ok";
  if (status === "suspicious" || status === "needs_review" || status === "watching") return "warn";
  if (status === "ineligible" || status === "expired" || status === "rejected") return "danger";
  return "default";
}

function riskTone(note: string) {
  if (/HIGH|purchase|ssn|bank|payment|blocked|Rejected/i.test(note)) return "danger";
  if (/MEDIUM|review|missing|unknown|captcha/i.test(note)) return "warn";
  return "default";
}
