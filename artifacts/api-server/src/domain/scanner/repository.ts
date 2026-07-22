import { getSupabaseServiceClient } from "@/lib/auth/session";
import type { ApprovedSource, DiscoveryUpsert, ScannerRepository, ScanJobUpdate } from "@/lib/scanner/types";

export class SupabaseScannerRepository implements ScannerRepository {
  private readonly client = getSupabaseServiceClient();

  async getSource(sourceId: string) {
    const result = await this.client.from("sources").select("*").eq("id", sourceId).maybeSingle();
    if (result.error) throw new Error("Unable to load the source registry.");
    return result.data ? mapSource(result.data) : null;
  }

  async listDueSources(now: string) {
    const result = await this.client.from("sources").select("*").eq("scan_enabled", true).or(`next_scan_at.is.null,next_scan_at.lte.${now}`).order("next_scan_at", { ascending: true, nullsFirst: true }).limit(25);
    if (result.error) throw new Error("Unable to load due sources.");
    return (result.data ?? []).map(mapSource);
  }

  async createJob(sourceId: string, correlationId: string) {
    const result = await this.client.from("source_scan_jobs").insert({ source_id: sourceId, correlation_id: correlationId, status: "queued" }).select("id").single();
    if (result.error) throw new Error("Unable to create the durable scan job.");
    return { id: String(result.data.id) };
  }

  async updateJob(jobId: string, update: ScanJobUpdate) {
    const payload: Record<string, unknown> = { status: update.status };
    for (const [key, column] of Object.entries({ startedAt: "started_at", completedAt: "completed_at", pagesRequested: "pages_requested", pagesSuccessful: "pages_successful", pagesFailed: "pages_failed", itemsDiscovered: "items_discovered", attemptCount: "attempt_count", errorSummary: "error_summary" })) {
      const value = update[key as keyof ScanJobUpdate];
      if (value !== undefined) payload[column] = value;
    }
    const result = await this.client.from("source_scan_jobs").update(payload).eq("id", jobId);
    if (result.error) throw new Error("Unable to update the durable scan job.");
  }

  async upsertDiscoveredUrl(input: DiscoveryUpsert) {
    const existing = await this.client.from("discovered_urls").select("id, content_hash").eq("source_id", input.sourceId).eq("canonical_url", input.canonicalUrl).maybeSingle();
    if (existing.error) throw new Error("Unable to check the discovery registry.");
    const now = new Date().toISOString();
    const outcome = !existing.data ? "new" : existing.data.content_hash === input.contentHash ? "unchanged" : "changed";
    const payload = {
      source_id: input.sourceId,
      scan_job_id: input.scanJobId,
      url: input.url,
      canonical_url: input.canonicalUrl,
      content_hash: input.contentHash,
      last_seen_at: now,
      status: outcome,
      updated_at: now,
    };
    const result = await this.client.from("discovered_urls").upsert(payload, { onConflict: "source_id,canonical_url" });
    if (result.error) throw new Error("Unable to persist the discovered URL.");
    return outcome;
  }

  async updateSourceSchedule(sourceId: string, update: { lastScanAt: string; nextScanAt: string; healthStatus: "healthy" | "degraded" | "failed" }) {
    const result = await this.client.from("sources").update({ last_scan_at: update.lastScanAt, next_scan_at: update.nextScanAt, health_status: update.healthStatus, updated_at: new Date().toISOString() }).eq("id", sourceId);
    if (result.error) throw new Error("Unable to update the source schedule.");
  }
}

function mapSource(row: Record<string, any>): ApprovedSource {
  return {
    id: String(row.id),
    name: String(row.name),
    baseUrl: String(row.base_url),
    accessMethod: row.access_method,
    scanEnabled: Boolean(row.scan_enabled),
    scanFrequencyMinutes: Number(row.scan_frequency_minutes),
    robotsPolicyStatus: row.robots_policy_status,
    termsReviewStatus: row.terms_review_status,
    requiresAttribution: Boolean(row.requires_attribution),
    attributionText: typeof row.attribution_text === "string" ? row.attribution_text : null,
    rateLimitPerMinute: Number(row.rate_limit_per_minute),
    configuration: row.configuration && typeof row.configuration === "object" ? row.configuration : {},
  };
}
