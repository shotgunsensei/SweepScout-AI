export type SourceAccessMethod = "rss" | "atom" | "json_api" | "structured_html" | "admin_url" | "admin_import";
export type PolicyReviewStatus = "pending" | "approved" | "restricted" | "prohibited";
export type ScanJobStatus = "queued" | "running" | "partial" | "completed" | "failed" | "canceled" | "dead_letter";

export type ApprovedSource = {
  id: string;
  name: string;
  baseUrl: string;
  accessMethod: SourceAccessMethod;
  scanEnabled: boolean;
  scanFrequencyMinutes: number;
  robotsPolicyStatus: PolicyReviewStatus;
  termsReviewStatus: PolicyReviewStatus;
  requiresAttribution: boolean;
  attributionText: string | null;
  rateLimitPerMinute: number;
  configuration: Record<string, unknown>;
};

export type DiscoveryCandidate = {
  url: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  evidence: Record<string, unknown>;
};

export type AdapterResult = {
  candidates: DiscoveryCandidate[];
  pagesRequested: number;
  pagesSuccessful: number;
  pagesFailed: number;
  warnings: string[];
};

export type FetchResponse = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
};

export type SourceFetcher = {
  fetch(source: ApprovedSource, url: string): Promise<FetchResponse>;
};

export type ScannerAdapter = {
  accessMethod: SourceAccessMethod;
  scan(source: ApprovedSource, fetcher: SourceFetcher): Promise<AdapterResult>;
};

export type ScanJobUpdate = {
  status: ScanJobStatus;
  startedAt?: string;
  completedAt?: string;
  pagesRequested?: number;
  pagesSuccessful?: number;
  pagesFailed?: number;
  itemsDiscovered?: number;
  attemptCount?: number;
  errorSummary?: string | null;
};

export type DiscoveryUpsert = DiscoveryCandidate & {
  sourceId: string;
  scanJobId: string;
  canonicalUrl: string;
  contentHash: string;
};

export type ScannerRepository = {
  getSource(sourceId: string): Promise<ApprovedSource | null>;
  listDueSources(now: string): Promise<ApprovedSource[]>;
  createJob(sourceId: string, correlationId: string): Promise<{ id: string }>;
  updateJob(jobId: string, update: ScanJobUpdate): Promise<void>;
  upsertDiscoveredUrl(input: DiscoveryUpsert): Promise<"new" | "changed" | "unchanged">;
  updateSourceSchedule(sourceId: string, update: { lastScanAt: string; nextScanAt: string; healthStatus: "healthy" | "degraded" | "failed" }): Promise<void>;
};

export class SourcePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcePolicyError";
  }
}

export class SourceResponseError extends Error {
  constructor(message: string, readonly retryable = false, readonly attempts = 1) {
    super(message);
    this.name = "SourceResponseError";
  }
}
