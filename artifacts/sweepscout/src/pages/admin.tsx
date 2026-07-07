import { Ban, Download, FileJson, FileSearch, ListChecks, RefreshCw, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge, MetricCard, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { LoadingState } from "@/components/dashboard-kit";
import { apiGet, apiUrl } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import { formatDate, titleCase } from "@/lib/format";
import type { AdminSession, AppConfig, AuditLog, BlockedDomain, DiscoveryJob, EntryLog, ExtractionJob, Sweepstake } from "@/lib/types";

type AdminResponse = {
  admin: AdminSession;
  discoveryJobs: DiscoveryJob[];
  extractionJobs: ExtractionJob[];
  sweepstakes: Sweepstake[];
  blockedDomains: BlockedDomain[];
  entries: EntryLog[];
  auditLogs: AuditLog[];
  config: AppConfig;
};

export default function AdminPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["admin"], queryFn: () => apiGet<AdminResponse>("/admin"), retry: false });

  if (isLoading) {
    return (
      <AppShell>
        <PageHeader title="Admin Debug" kicker="Protected route" />
        <LoadingState />
      </AppShell>
    );
  }

  if (isError || !data) {
    return <AccessDenied message={(error as Error)?.message} />;
  }

  return <AdminBody data={data} />;
}

function AdminBody({ data }: { data: AdminResponse }) {
  const { admin, discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs, config } = data;
  const byId = new Map(sweepstakes.map((item) => [item.id, item]));
  const failedUrls = extractionJobs
    .filter((job) => job.status === "failed" || job.status === "needs_review")
    .map((job) => ({ job, sweepstake: byId.get(job.sweepstakeId) }))
    .filter((row): row is { job: ExtractionJob; sweepstake: Sweepstake } => Boolean(row.sweepstake));
  const extractedItems = sweepstakes.filter((item) => item.extractedRules).slice(0, 8);

  return (
    <AppShell>
      <PageHeader title="Admin Debug" kicker={`${admin.role} access | ${admin.label}`}>
        <a href={apiUrl("/admin/export/entries")} className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#07100d]">
          <Download size={15} aria-hidden />
          Export Entries CSV
        </a>
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
          <BlockDomainForm />
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
            {discoveryJobs.length ? discoveryJobs.map((job) => <DiscoveryLogCard key={job.id} job={job} />) : <p className="text-sm text-muted">No discovery jobs yet.</p>}
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
              <p className="text-sm text-muted">No extraction jobs have been recorded.</p>
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
            <p className="text-sm text-muted">No AI extraction JSON has been stored yet.</p>
          )}
        </div>
      </Panel>

      <Panel className="mt-4">
        <SectionTitle icon={<ListChecks size={18} aria-hidden />} title="Audit Log" />
        <div className="mt-4 grid gap-3">
          {auditLogs.length ? auditLogs.map((log) => <AuditLogCard key={log.id} log={log} />) : <p className="text-sm text-muted">No audit events have been recorded yet.</p>}
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

function AccessDenied({ message }: { message?: string }) {
  return (
    <AppShell>
      <PageHeader title="Admin Debug" kicker="Protected route" />
      <Panel>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 text-warning" size={20} aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-foreground">{message ?? "Admin access required."}</h2>
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

function BlockDomainForm() {
  const blockDomain = useApiMutation("/admin/block-domain");
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        blockDomain.mutate(formToObject(form), { onSuccess: () => form.reset() });
      }}
    >
      <TextInput name="domain" placeholder="example.com or https://example.com/path" required />
      <TextInput name="reason" placeholder="Reason for blocking" />
      <div>
        <SubmitButton tone="secondary" disabled={blockDomain.isPending}>Mark Domain Blocked</SubmitButton>
      </div>
    </form>
  );
}

function RetryExtractionForm(props: { sweepstake: Sweepstake; disabled: boolean }) {
  const retry = useApiMutation("/admin/retry-extraction");
  if (props.disabled) {
    return (
      <button className="h-9 rounded-md border border-line px-3 text-sm text-muted" disabled>
        OpenAI key required
      </button>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        retry.mutate(formToObject(event.currentTarget));
      }}
    >
      <input type="hidden" name="sweepstakeId" value={props.sweepstake.id} />
      <SubmitButton tone="secondary" disabled={retry.isPending}>
        <span className="inline-flex items-center gap-2">
          <FileSearch size={15} aria-hidden /> Retry Extraction
        </span>
      </SubmitButton>
    </form>
  );
}

function RescoreForm({ sweepstake }: { sweepstake: Sweepstake }) {
  const rescore = useApiMutation("/admin/rescore");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        rescore.mutate(formToObject(event.currentTarget));
      }}
    >
      <input type="hidden" name="sweepstakeId" value={sweepstake.id} />
      <SubmitButton tone="secondary" disabled={rescore.isPending}>
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
