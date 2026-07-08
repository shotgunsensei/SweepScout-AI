import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ban, Download, FileSearch, RefreshCw, ShieldAlert } from "lucide-react-native";
import {
  ActionButton,
  Badge,
  Card,
  LabeledInput,
  LoadingState,
  MetricCard,
  PageHeader,
  Screen,
  SectionHeader,
  openExternal,
  styles,
} from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, apiUrl, useApiMutation } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type {
  AdminSession,
  AppConfig,
  AuditLog,
  BlockedDomain,
  DiscoveryJob,
  EntryLog,
  ExtractionJob,
  SaaSAdminSummary,
  SponsorReputationReport,
  Sweepstake,
} from "@/lib/types";

type AdminResponse = {
  admin: AdminSession;
  discoveryJobs: DiscoveryJob[];
  extractionJobs: ExtractionJob[];
  sweepstakes: Sweepstake[];
  blockedDomains: BlockedDomain[];
  entries: EntryLog[];
  auditLogs: AuditLog[];
  saas: SaaSAdminSummary;
  reputation: SponsorReputationReport;
  config: AppConfig;
};

export default function AdminScreen() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["admin"], queryFn: () => apiGet<AdminResponse>("/admin"), retry: false });

  if (isLoading) {
    return (
      <Screen>
        <PageHeader title="Admin Debug" kicker="Protected route" />
        <View style={{ padding: 16 }}>
          <LoadingState />
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return <AccessDenied message={(error as Error)?.message} />;
  }

  return <AdminBody data={data} />;
}

function AdminBody({ data }: { data: AdminResponse }) {
  const { admin, discoveryJobs, extractionJobs, sweepstakes, blockedDomains, entries, auditLogs, saas, reputation, config } = data;
  const byId = new Map(sweepstakes.map((item) => [item.id, item]));
  const failedUrls = extractionJobs
    .filter((job) => job.status === "failed" || job.status === "needs_review")
    .map((job) => ({ job, sweepstake: byId.get(job.sweepstakeId) }))
    .filter((row): row is { job: ExtractionJob; sweepstake: Sweepstake } => Boolean(row.sweepstake));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Admin Debug" kicker={`${admin.role} access | ${admin.label}`}>
          <ActionButton
            label="Export Entries CSV"
            icon={<Download color={colors.black} size={15} />}
            onPress={() => openExternal(apiUrl("/admin/export/entries"))}
          />
        </PageHeader>

        <View style={{ padding: 16, gap: 16 }}>
          <View style={styles.wrap}>
            <MetricCard label="Discovery Jobs" value={discoveryJobs.length} sublabel="stored jobs" />
            <MetricCard label="Extraction Jobs" value={extractionJobs.length} sublabel="recent runs" />
            <MetricCard label="Failed URLs" value={failedUrls.length} />
            <MetricCard label="Blocked Domains" value={blockedDomains.length} />
            <MetricCard label="Audit Logs" value={auditLogs.length} />
          </View>

          <SaaSOperationsCard summary={saas} />

          <SponsorReputationCard report={reputation} />

          <Card>
            <SectionHeader title="Failed URLs" eyebrow="Extraction failures" />
            <View style={{ gap: 10 }}>
              {failedUrls.length ? (
                failedUrls.map(({ job, sweepstake }) => (
                  <Card key={job.id} compact>
                    <View style={styles.wrap}>
                      <Badge tone={job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                      <Text style={styles.cardTitle}>{sweepstake.title}</Text>
                    </View>
                    <Text style={styles.bodyText}>{sweepstake.url}</Text>
                    <Text style={styles.mutedText}>{job.error ?? job.summary ?? "No error detail recorded."}</Text>
                    <RetryExtractionButton sweepstake={sweepstake} disabled={!config.openaiConfigured} />
                  </Card>
                ))
              ) : (
                <Text style={styles.bodyText}>No failed extraction URLs are currently recorded.</Text>
              )}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Blocked Domains" eyebrow="Discovery blacklist" />
            <BlockDomainForm />
            <View style={{ gap: 10 }}>
              {blockedDomains.length ? (
                blockedDomains.map((domain) => (
                  <Card key={domain.id} compact>
                    <Text style={styles.cardTitle}>{domain.domain}</Text>
                    <Text style={styles.bodyText}>{domain.reason || "No reason recorded."}</Text>
                  </Card>
                ))
              ) : (
                <Text style={styles.bodyText}>No domains are blocked yet.</Text>
              )}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Discovery Job Logs" />
            <View style={{ gap: 10 }}>
              {discoveryJobs.length ? discoveryJobs.map((job) => <DiscoveryLogCard key={job.id} job={job} />) : <Text style={styles.bodyText}>No discovery jobs yet.</Text>}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Extraction Logs" />
            <View style={{ gap: 10 }}>
              {extractionJobs.length ? (
                extractionJobs.slice(0, 12).map((job) => {
                  const sweepstake = byId.get(job.sweepstakeId);
                  return (
                    <Card key={job.id} compact>
                      <View style={styles.wrap}>
                        <Text style={styles.cardTitle}>{sweepstake?.title ?? job.sweepstakeId}</Text>
                        <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                      </View>
                      <Text style={styles.mutedText}>
                        {job.model ?? "No model"} | started {formatDate(job.startedAt)} | finished {formatDate(job.finishedAt)}
                      </Text>
                      <Text style={styles.bodyText}>{job.error ?? job.summary ?? "Running or no detail recorded."}</Text>
                      {sweepstake ? (
                        <View style={styles.wrap}>
                          <RetryExtractionButton sweepstake={sweepstake} disabled={!config.openaiConfigured} />
                          <RescoreButton sweepstake={sweepstake} />
                        </View>
                      ) : null}
                    </Card>
                  );
                })
              ) : (
                <Text style={styles.bodyText}>No extraction jobs have been recorded.</Text>
              )}
            </View>
          </Card>

          <Card>
            <SectionHeader title="Audit Log" />
            <View style={{ gap: 10 }}>
              {auditLogs.length ? auditLogs.map((log) => <AuditLogCard key={log.id} log={log} />) : <Text style={styles.bodyText}>No audit events have been recorded yet.</Text>}
            </View>
          </Card>

          <Text style={styles.mutedText}>
            CSV export currently includes {entries.length} entry log record{entries.length === 1 ? "" : "s"} available to this owner store.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SaaSOperationsCard({ summary }: { summary: SaaSAdminSummary }) {
  const features = [
    ["Discovery", summary.usage.limits.discovery],
    ["Scoring", summary.usage.limits.scoring],
    ["Prefill", summary.usage.limits.prefill],
    ["Inbox", summary.usage.limits.inboxMonitoring],
    ["Extension", summary.usage.limits.browserExtension],
    ["Reports", summary.usage.limits.advancedReporting],
  ] as const;
  return (
    <Card>
      <SectionHeader title="Tenant & Billing" eyebrow={summary.organization.slug} />
      <View style={styles.wrap}>
        <MetricCard label="Organization" value={summary.organization.name} />
        <MetricCard label="Plan" value={summary.usage.limits.name} sublabel={`$${summary.usage.limits.monthlyPriceUsd}/mo`} />
        <MetricCard label="Saved" value={`${summary.usage.savedSweepstakes}/${summary.usage.limits.savedSweepstakes}`} />
        <MetricCard label="Discovery" value={`${summary.usage.discoveryJobsThisMonth}/${summary.usage.limits.discoveryJobsPerMonth}`} />
      </View>
      <View style={styles.wrap}>
        <Badge tone={summary.stripe.configured ? "ok" : "warn"}>Stripe {summary.stripe.configured ? "configured" : "missing"}</Badge>
        <Badge tone={summary.stripe.priceIds.pro ? "ok" : "warn"}>Pro price {summary.stripe.priceIds.pro ? "set" : "missing"}</Badge>
        <Badge tone={summary.stripe.priceIds.power ? "ok" : "warn"}>Power price {summary.stripe.priceIds.power ? "set" : "missing"}</Badge>
        <Badge tone={summary.manualApprovalRequired ? "ok" : "danger"}>
          Manual approval {summary.manualApprovalRequired ? "required" : "off"}
        </Badge>
      </View>
      <View style={styles.wrap}>
        {features.map(([label, enabled]) => (
          <Badge key={label} tone={enabled ? "ok" : "default"}>
            {enabled ? "Enabled" : "Locked"}: {label}
          </Badge>
        ))}
      </View>
      <Text style={styles.mutedText}>Subscription status: {titleCase(summary.subscription.status)}</Text>
    </Card>
  );
}

function SponsorReputationCard({ report }: { report: SponsorReputationReport }) {
  const highRisk = report.records.filter((record) => record.recommendation !== "allow").slice(0, 4);
  return (
    <Card>
      <SectionHeader title="Sponsor Reputation" eyebrow="Global risk score" />
      <View style={styles.wrap}>
        <MetricCard label="Tracked" value={report.totals.domainsTracked} />
        <MetricCard label="Downranked" value={report.totals.downrankedDomains} />
        <MetricCard label="Blocked" value={report.totals.blockedDomains} />
        <MetricCard label="Critical" value={report.totals.criticalDomains} />
      </View>
      <View style={{ gap: 10 }}>
        {highRisk.length ? (
          highRisk.map((record) => (
            <Card key={record.domain} compact>
              <View style={styles.wrap}>
                <Text style={styles.cardTitle}>{record.domain}</Text>
                <Badge tone={record.recommendation === "block" ? "danger" : "warn"}>{record.riskScore}/100</Badge>
                <Badge tone={record.recommendation === "block" ? "danger" : "warn"}>{titleCase(record.recommendation)}</Badge>
              </View>
              <Text style={styles.mutedText}>{record.sponsor ?? "Sponsor unknown"}</Text>
              <Text style={styles.bodyText}>{record.reasons.slice(0, 2).join(" ") || "Reputation threshold reached."}</Text>
            </Card>
          ))
        ) : (
          <Text style={styles.bodyText}>No sponsor or domain has crossed the downrank threshold yet.</Text>
        )}
      </View>
    </Card>
  );
}

function AccessDenied({ message }: { message?: string }) {
  return (
    <Screen>
      <PageHeader title="Admin Debug" kicker="Protected route" />
      <View style={{ padding: 16 }}>
        <Card>
          <View style={styles.row}>
            <ShieldAlert color={colors.warning} size={20} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{message ?? "Admin access required."}</Text>
              <Text style={styles.bodyText}>
                Sign in with a Supabase user whose trusted app metadata includes an admin role, or use SQLite local development mode for local-owner access.
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function BlockDomainForm() {
  const blockDomain = useApiMutation("/admin/block-domain");
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Card compact>
      <LabeledInput label="Domain" value={domain} onChangeText={setDomain} placeholder="example.com or https://example.com/path" />
      <LabeledInput label="Reason" value={reason} onChangeText={setReason} placeholder="Reason for blocking" />
      <ActionButton
        label="Mark Domain Blocked"
        tone="secondary"
        disabled={blockDomain.isPending || !domain.trim()}
        icon={<Ban color={colors.text} size={15} />}
        onPress={() => blockDomain.mutate({ domain, reason }, { onSuccess: () => { setDomain(""); setReason(""); } })}
      />
    </Card>
  );
}

function RetryExtractionButton(props: { sweepstake: Sweepstake; disabled: boolean }) {
  const retry = useApiMutation("/admin/retry-extraction");
  return (
    <ActionButton
      label={props.disabled ? "OpenAI key required" : "Retry Extraction"}
      tone="secondary"
      disabled={props.disabled || retry.isPending}
      icon={<FileSearch color={colors.text} size={15} />}
      onPress={() => retry.mutate({ sweepstakeId: props.sweepstake.id })}
    />
  );
}

function RescoreButton({ sweepstake }: { sweepstake: Sweepstake }) {
  const rescore = useApiMutation("/admin/rescore");
  return (
    <ActionButton
      label="Re-score"
      tone="secondary"
      disabled={rescore.isPending}
      icon={<RefreshCw color={colors.text} size={15} />}
      onPress={() => rescore.mutate({ sweepstakeId: sweepstake.id })}
    />
  );
}

function DiscoveryLogCard({ job }: { job: DiscoveryJob }) {
  const parsed = parseDiscoveryNotes(job.notes);
  return (
    <Card compact>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{job.label}</Text>
        <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
      </View>
      <Text style={styles.bodyText}>{job.query}</Text>
      <View style={styles.wrap}>
        <Badge>Found {job.discoveredCount}</Badge>
        <Badge>Last {formatDate(job.lastRunAt)}</Badge>
        {parsed.saved !== null ? <Badge tone="ok">Saved {parsed.saved}</Badge> : null}
        {parsed.skipped !== null ? <Badge>Skipped {parsed.skipped}</Badge> : null}
        {parsed.errors !== null ? <Badge tone={parsed.errors ? "danger" : "default"}>Errors {parsed.errors}</Badge> : null}
      </View>
      <Text style={styles.mutedText}>{parsed.preview}</Text>
    </Card>
  );
}

function AuditLogCard({ log }: { log: AuditLog }) {
  return (
    <Card compact>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{log.message}</Text>
        <Badge tone={log.severity === "block" ? "danger" : log.severity === "warn" ? "warn" : "default"}>{titleCase(log.severity)}</Badge>
      </View>
      <Text style={styles.mutedText}>
        {log.action} | {log.entityType}
        {log.entityId ? `:${log.entityId}` : ""} | {formatDate(log.createdAt)}
      </Text>
      {Object.keys(log.metadata).length ? <Text style={styles.mutedText}>{JSON.stringify(log.metadata, null, 2)}</Text> : null}
    </Card>
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
