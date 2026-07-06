import { Ban, Download, FileJson, FileSearch, ListChecks, RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { adminBlockDomainAction, adminRescoreSweepstakeAction, adminRetryExtractionAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { AdminAccessError, getAdminSession } from "@/lib/admin";
import { getAppConfig } from "@/lib/env";
import { formatDate, titleCase } from "@/lib/format";
import { getStore } from "@/lib/storage/store";
import type { AuditLog, DiscoveryJob, ExtractionJob, Sweepstake } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminDebugPage() {
  const admin = await getAdminSession();
  if (!admin) {
    return <AccessDenied />;
  }

  const store = await getStore();
  const config = getAppConfig();
  const [discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs] = await Promise.all([
    store.listDiscoveryJobs(),
    store.listExtractionJobs(),
    store.listSweepstakes(),
    store.listBlockedDomains(),
    store.listEntryLogs(),
    store.listAuditLogs(30),
  ]);
  const byId = new Map(sweepstakes.map((item) => [item.id, item]));
  const failedUrls = extractionJobs
    .filter((job) => job.status === "failed" || job.status === "needs_review")
    .map((job) => ({ job, sweepstake: byId.get(job.sweepstakeId) }))
    .filter((row): row is { job: ExtractionJob; sweepstake: Sweepstake } => Boolean(row.sweepstake));
  const extractedItems = sweepstakes.filter((item) => item.extractedRules).slice(0, 8);

  return (
    <AppShell>
      <PageHeader title="Admin Debug" kicker={`${admin.role} access | ${admin.label}`}>
        <Link
          href="/api/admin/export/entries"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]"
        >
          <Download size={15} aria-hidden />
          Export Entries CSV
        </Link>
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <MetricCard label="Discovery Jobs" value={discoveryJobs.length} sublabel="Stored job records" />
        <MetricCard label="Extraction Jobs" value={extractionJobs.length} sublabel="Recent AI/rules runs" />
        <MetricCard label="Failed URLs" value={failedUrls.length} sublabel="Failed or needs review" />
        <MetricCard label="Blocked Domains" value={blockedDomains.length} sublabel="Discovery blacklist" />
        <MetricCard label="Audit Logs" value={auditLogs.length} sublabel="Recent safety events" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <SectionTitle icon={<ShieldAlert size={18} aria-hidden />} title="Failed URLs" />
          <div className="mt-4 divide-y divide-line">
            {failedUrls.length ? (
              failedUrls.map(({ job, sweepstake }) => (
                <div key={job.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                      <span className="text-sm font-medium text-foreground">{sweepstake.title}</span>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted">{sweepstake.url}</p>
                    <p className="mt-2 text-xs text-muted">{job.error ?? job.summary ?? "No error detail recorded."}</p>
                  </div>
                  <RetryExtractionForm sweepstake={sweepstake} disabled={!config.openaiConfigured} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No failed extraction URLs are currently recorded.</p>
            )}
          </div>
        </Panel>

        <Panel id="blocked-domains">
          <SectionTitle icon={<Ban size={18} aria-hidden />} title="Blocked Domains" />
          <form action={adminBlockDomainAction} className="mt-4 grid gap-3">
            <TextInput name="domain" placeholder="example.com or https://example.com/path" required />
            <TextInput name="reason" placeholder="Reason for blocking" />
            <div>
              <SubmitButton tone="secondary">Mark Domain Blocked</SubmitButton>
            </div>
          </form>
          <div className="mt-5 grid gap-2">
            {blockedDomains.length ? (
              blockedDomains.map((domain) => (
                <div key={domain.id} className="rounded-md border border-line bg-panel-strong p-3">
                  <p className="font-mono text-sm text-foreground">{domain.domain}</p>
                  <p className="mt-1 text-xs text-muted">{domain.reason || "No reason recorded."}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No domains are blocked yet.</p>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={<RefreshCw size={18} aria-hidden />} title="Discovery Job Logs" />
          <div className="mt-4 grid gap-3">
            {discoveryJobs.length ? discoveryJobs.map((job) => <DiscoveryLogCard key={job.id} job={job} />) : <EmptyState text="No discovery jobs yet." />}
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={<FileSearch size={18} aria-hidden />} title="Extraction Logs" />
          <div className="mt-4 grid gap-3">
            {extractionJobs.length ? (
              extractionJobs.slice(0, 12).map((job) => {
                const sweepstake = byId.get(job.sweepstakeId);
                return (
                  <div key={job.id} className="rounded-md border border-line bg-panel-strong p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sweepstake?.title ?? job.sweepstakeId}</p>
                        <p className="mt-1 text-xs text-muted">
                          {job.model ?? "No model"} | started {formatDate(job.startedAt)} | finished {formatDate(job.finishedAt)}
                        </p>
                      </div>
                      <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted">{job.error ?? job.summary ?? "Running or no detail recorded."}</p>
                    {sweepstake ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <RetryExtractionForm sweepstake={sweepstake} disabled={!config.openaiConfigured} />
                        <RescoreForm sweepstake={sweepstake} />
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <EmptyState text="No extraction jobs have been recorded." />
            )}
          </div>
        </Panel>
      </div>

      <Panel className="mt-4">
        <SectionTitle icon={<FileJson size={18} aria-hidden />} title="AI Extraction Raw JSON" />
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {extractedItems.length ? (
            extractedItems.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-panel-strong p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted">{item.rulesExtractedAt ? `Extracted ${formatDate(item.rulesExtractedAt)}` : "No timestamp"}</p>
                  </div>
                  <RescoreForm sweepstake={item} />
                </div>
                <pre className="max-h-96 overflow-auto rounded-md border border-line bg-[#0b0f10] p-3 text-xs leading-5 text-muted">
                  {JSON.stringify(item.extractedRules, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <EmptyState text="No AI extraction JSON has been stored yet." />
          )}
        </div>
      </Panel>

      <Panel className="mt-4">
        <SectionTitle icon={<ListChecks size={18} aria-hidden />} title="Audit Log" />
        <div className="mt-4 grid gap-3">
          {auditLogs.length ? auditLogs.map((log) => <AuditLogCard key={log.id} log={log} />) : <EmptyState text="No audit events have been recorded yet." />}
        </div>
      </Panel>

      <p className="mt-4 text-xs text-muted">
        CSV export currently includes {entries.length} entry log record{entries.length === 1 ? "" : "s"} available to this owner store.
      </p>
    </AppShell>
  );
}

function AuditLogCard({ log }: { log: AuditLog }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{log.message}</p>
          <p className="mt-1 text-xs text-muted">
            {log.action} | {log.entityType}
            {log.entityId ? `:${log.entityId}` : ""} | {formatDate(log.createdAt)}
          </p>
        </div>
        <Badge tone={log.severity === "block" ? "danger" : log.severity === "warn" ? "warn" : "default"}>{titleCase(log.severity)}</Badge>
      </div>
      {Object.keys(log.metadata).length ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-line bg-[#0b0f10] p-3 text-xs leading-5 text-muted">
          {JSON.stringify(log.metadata, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function AccessDenied() {
  const error = new AdminAccessError();
  return (
    <AppShell>
      <PageHeader title="Admin Debug" kicker="Protected route" />
      <Panel>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 text-warning" size={20} aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{error.message}</h2>
            <p className="mt-2 text-sm text-muted">
              Sign in with a Supabase user whose trusted app metadata includes an admin role, or use SQLite local development mode for local-owner access.
            </p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}

function DiscoveryLogCard({ job }: { job: DiscoveryJob }) {
  const parsed = parseDiscoveryNotes(job.notes);
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{job.label}</p>
          <p className="mt-1 text-xs text-muted">{job.query}</p>
        </div>
        <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge>Found {job.discoveredCount}</Badge>
        <Badge>Last {formatDate(job.lastRunAt)}</Badge>
        {parsed.saved !== null ? <Badge tone="ok">Saved {parsed.saved}</Badge> : null}
        {parsed.skipped !== null ? <Badge>Skipped {parsed.skipped}</Badge> : null}
        {parsed.errors !== null ? <Badge tone={parsed.errors ? "danger" : "default"}>Errors {parsed.errors}</Badge> : null}
      </div>
      <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-line bg-[#0b0f10] p-3 text-xs leading-5 text-muted">
        {parsed.preview}
      </pre>
    </div>
  );
}

function RetryExtractionForm(props: { sweepstake: Sweepstake; disabled: boolean }) {
  if (props.disabled) {
    return (
      <button className="h-9 rounded-md border border-line px-3 text-sm text-muted" disabled>
        OpenAI key required
      </button>
    );
  }
  return (
    <form action={adminRetryExtractionAction}>
      <input type="hidden" name="sweepstakeId" value={props.sweepstake.id} />
      <SubmitButton tone="secondary">
        <span className="inline-flex items-center gap-2">
          <FileSearch size={15} aria-hidden /> Retry Extraction
        </span>
      </SubmitButton>
    </form>
  );
}

function RescoreForm({ sweepstake }: { sweepstake: Sweepstake }) {
  return (
    <form action={adminRescoreSweepstakeAction}>
      <input type="hidden" name="sweepstakeId" value={sweepstake.id} />
      <SubmitButton tone="secondary">
        <span className="inline-flex items-center gap-2">
          <RefreshCw size={15} aria-hidden /> Re-score
        </span>
      </SubmitButton>
    </form>
  );
}

function SectionTitle(props: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
      {props.icon}
      {props.title}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function parseDiscoveryNotes(notes: string) {
  try {
    const parsed = JSON.parse(notes) as {
      saved?: number;
      skipped?: number;
      errors?: number;
      logs?: unknown[];
      guardrails?: string[];
    };
    return {
      saved: parsed.saved ?? null,
      skipped: parsed.skipped ?? null,
      errors: parsed.errors ?? null,
      preview: JSON.stringify(parsed.logs ?? parsed.guardrails ?? parsed, null, 2),
    };
  } catch {
    return { saved: null, skipped: null, errors: null, preview: notes || "No log detail recorded." };
  }
}
