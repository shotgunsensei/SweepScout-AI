export type EvidenceLocation = {
  pageUrl: string;
  section?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
};

export type EvidenceField<T> = {
  value: T | null;
  confidence: number;
  sourceReference: string;
  evidence: string;
  location: EvidenceLocation;
  extractedAt: string;
};

export type ExtractedPrize = { name: string; quantity: number; estimatedValue: number | null; currency: string };
export type ExtractedEntryMethod = {
  methodType: string;
  description: string;
  entryUrl: string | null;
  frequency: "one_time" | "daily" | "weekly" | "monthly" | "unlimited" | "unknown";
  purchaseRequired: boolean;
  socialPlatform: string | null;
  estimatedMinutes: number | null;
};

export type SweepstakesExtraction = {
  title: EvidenceField<string>;
  sponsor: EvidenceField<string>;
  officialPromotionUrl: EvidenceField<string>;
  officialRulesUrl: EvidenceField<string>;
  officialPromotionId: EvidenceField<string>;
  startDate: EvidenceField<string>;
  endDate: EvidenceField<string>;
  timezone: EvidenceField<string>;
  prizes: EvidenceField<ExtractedPrize[]>;
  eligibleLocations: EvidenceField<string[]>;
  minimumAge: EvidenceField<number>;
  maximumAge: EvidenceField<number>;
  entryMethods: EvidenceField<ExtractedEntryMethod[]>;
  entryFrequency: EvidenceField<ExtractedEntryMethod["frequency"]>;
  purchaseRequirements: EvidenceField<string>;
  socialMediaRequirements: EvidenceField<string[]>;
  employeeExclusions: EvidenceField<string>;
  maximumEntries: EvidenceField<number>;
  sponsorContact: EvidenceField<string>;
  voidWhereProhibited: EvidenceField<boolean>;
  taxDisclosures: EvidenceField<string>;
  winnerNotification: EvidenceField<string>;
  categories: EvidenceField<string[]>;
};

export type EnrichmentInput = {
  discoveredUrlId: string;
  sourceId: string;
  sourceReference: string;
  pageUrl: string;
  cleanedText: string;
  rulesUrl?: string | null;
  rulesText?: string | null;
  sourceReputation?: number;
  sponsorReputation?: number;
  fetchedAt: string;
};

export type ProviderUsage = { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
export type ProviderResult = { extraction: SweepstakesExtraction; usage: ProviderUsage; rawResponseId?: string };
export type EnrichmentProvider = {
  name: string;
  model: string;
  promptVersion: string;
  extract(input: EnrichmentInput, signal: AbortSignal): Promise<ProviderResult>;
};

export type DedupeRecord = {
  id: string;
  canonicalUrl: string;
  sponsor: string;
  normalizedTitle: string;
  startDate: string | null;
  endDate: string | null;
  rulesUrl: string | null;
  officialPromotionId: string | null;
  prizeFingerprint: string;
  contentFingerprint: string;
};

export type DedupeDecision = {
  action: "automatic_merge" | "human_review" | "separate";
  score: number;
  matchedRecordId: string | null;
  signals: Record<string, number>;
};

export type EnrichmentScores = { legitimacy: number; entryEffort: number; sourceConfidence: number };
export type ReviewReason = "low_confidence" | "conflicting_dates" | "duplicate_uncertain" | "provider_failure";

export type EnrichmentRepository = {
  beginRun(input: EnrichmentInput, provider: EnrichmentProvider): Promise<string>;
  listDedupeCandidates(candidate: DedupeRecord): Promise<DedupeRecord[]>;
  saveRulesVersion(input: { sweepstakesId: string; rulesUrl: string; rawText: string; contentHash: string; extractedAt: string }): Promise<void>;
  persist(input: {
    runId: string;
    source: EnrichmentInput;
    extraction: SweepstakesExtraction;
    authoritativeFields: Record<string, unknown>;
    scores: EnrichmentScores;
    dedupe: DedupeDecision;
    reviewReasons: ReviewReason[];
    targetSweepstakesId: string | null;
    rulesContentHash: string | null;
  }): Promise<{ sweepstakesId: string }>;
  completeRun(runId: string, input: { status: "completed" | "needs_review" | "failed"; usage?: ProviderUsage; errorCode?: string }): Promise<void>;
};
