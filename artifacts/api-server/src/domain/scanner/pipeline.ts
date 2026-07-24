import { createHash, randomUUID } from "node:crypto";
import { normalizeDiscoveryUrl } from "@/lib/discovery/url";
import { scannerAdapters } from "@/lib/scanner/adapters";
import { CompliantSourceFetcher } from "@/lib/scanner/fetcher";
import type { ApprovedSource, ScannerAdapter, ScannerRepository, SourceFetcher } from "@/lib/scanner/types";
import { SourcePolicyError } from "@/lib/scanner/types";
import { SourceResponseError } from "@/lib/scanner/types";

export type ScanSummary = {
  jobId: string;
  sourceId: string;
  status: "partial" | "completed";
  discovered: number;
  changed: number;
  unchanged: number;
  rejected: number;
  warnings: string[];
};

export class SourceScanner {
  private readonly adapters: Map<string, ScannerAdapter>;

  constructor(
    private readonly repository: ScannerRepository,
    private readonly fetcher: SourceFetcher = new CompliantSourceFetcher(),
    adapters: ScannerAdapter[] = scannerAdapters,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.accessMethod, adapter]));
  }

  async runSource(sourceId: string): Promise<ScanSummary> {
    const source = await this.repository.getSource(sourceId);
    if (!source) throw new SourcePolicyError("Source is not registered.");
    assertSourceApproved(source);
    const adapter = this.adapters.get(source.accessMethod);
    if (!adapter) throw new SourcePolicyError(`No scanner adapter is registered for ${source.accessMethod}.`);

    const correlationId = `scan_${randomUUID()}`;
    const job = await this.repository.createJob(source.id, correlationId);
    const startedAt = this.now().toISOString();
    await this.repository.updateJob(job.id, { status: "running", startedAt, attemptCount: 1 });

    try {
      const result = await adapter.scan(source, this.fetcher);
      let discovered = 0;
      let changed = 0;
      let unchanged = 0;
      let rejected = 0;
      const warnings = [...result.warnings];
      for (const candidate of result.candidates) {
        try {
          const bounded = {
            ...candidate,
            url: candidate.url.slice(0, 2_048),
            title: candidate.title.slice(0, 500),
            summary: candidate.summary.slice(0, 5_000),
          };
          const canonicalUrl = normalizeDiscoveryUrl(bounded.url);
          const contentHash = discoveryHash(bounded, canonicalUrl);
          const outcome = await this.repository.upsertDiscoveredUrl({
            ...bounded,
            sourceId: source.id,
            scanJobId: job.id,
            canonicalUrl,
            contentHash,
          });
          if (outcome === "new") discovered += 1;
          else if (outcome === "changed") changed += 1;
          else unchanged += 1;
        } catch (error) {
          rejected += 1;
          warnings.push(error instanceof Error ? error.message : "Candidate URL was rejected.");
        }
      }

      const status = rejected || result.pagesFailed || warnings.length ? "partial" : "completed";
      const completedAt = this.now().toISOString();
      await this.repository.updateJob(job.id, {
        status,
        completedAt,
        pagesRequested: result.pagesRequested,
        pagesSuccessful: result.pagesSuccessful,
        pagesFailed: result.pagesFailed,
        itemsDiscovered: discovered + changed,
        errorSummary: warnings.length ? redactError(warnings.join("; ")) : null,
      });
      await this.repository.updateSourceSchedule(source.id, {
        lastScanAt: completedAt,
        nextScanAt: new Date(this.now().getTime() + source.scanFrequencyMinutes * 60_000).toISOString(),
        healthStatus: status === "completed" ? "healthy" : "degraded",
      });
      return { jobId: job.id, sourceId: source.id, status, discovered, changed, unchanged, rejected, warnings };
    } catch (error) {
      const completedAt = this.now().toISOString();
      const message = redactError(error instanceof Error ? error.message : "Source scan failed.");
      const previousAttempts = error instanceof SourceResponseError ? error.attempts : 1;
      await this.repository.updateJob(job.id, {
        status: previousAttempts >= 3 ? "dead_letter" : "failed",
        completedAt,
        pagesFailed: 1,
        attemptCount: previousAttempts,
        errorSummary: message,
      });
      await this.repository.updateSourceSchedule(source.id, {
        lastScanAt: completedAt,
        nextScanAt: new Date(this.now().getTime() + backoffMinutes(previousAttempts) * 60_000).toISOString(),
        healthStatus: "failed",
      });
      throw error;
    }
  }

  async runDueSources() {
    const sources = await this.repository.listDueSources(this.now().toISOString());
    const results: Array<{ sourceId: string; status: "fulfilled" | "rejected" }> = [];
    for (const source of sources) {
      try {
        await this.runSource(source.id);
        results.push({ sourceId: source.id, status: "fulfilled" });
      } catch {
        results.push({ sourceId: source.id, status: "rejected" });
      }
    }
    return results;
  }
}

export function assertSourceApproved(source: ApprovedSource) {
  if (!source.scanEnabled) throw new SourcePolicyError("Disabled sources cannot be scanned.");
  if (source.robotsPolicyStatus !== "approved") throw new SourcePolicyError("Source robots policy is not approved.");
  if (source.termsReviewStatus !== "approved") throw new SourcePolicyError("Source terms are not approved.");
  if (source.rateLimitPerMinute < 1 || source.rateLimitPerMinute > 600) throw new SourcePolicyError("Source rate limit is invalid.");
  if (source.scanFrequencyMinutes < 5) throw new SourcePolicyError("Source scan cadence is invalid.");
  if (source.requiresAttribution && !source.attributionText?.trim()) throw new SourcePolicyError("Required source attribution text is missing.");
}

function discoveryHash(candidate: { title: string; summary: string; publishedAt: string | null }, canonicalUrl: string) {
  return createHash("sha256").update(JSON.stringify({ canonicalUrl, title: candidate.title.trim(), summary: candidate.summary.trim(), publishedAt: candidate.publishedAt })).digest("hex");
}

function backoffMinutes(attempt: number) { return Math.min(24 * 60, 5 * 2 ** Math.max(0, attempt - 1)); }

function redactError(message: string) {
  return message
    .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s;]+/gi, "$1=[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 1000);
}
