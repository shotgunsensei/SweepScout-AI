import { createHash } from "node:crypto";
import { extractionToDedupeRecord, resolveDuplicate } from "./dedupe";
import { extractWithResilience, type EnrichmentProviderError } from "./provider";
import { averageConfidence, calculateScores, hasConflictingDates } from "./scoring";
import type { EnrichmentInput, EnrichmentProvider, EnrichmentRepository, ReviewReason, SweepstakesExtraction } from "./types";

export const ENRICHMENT_STAGES = ["raw_content", "text_cleaning", "rules_detection", "structured_extraction", "date_normalization", "prize_extraction", "eligibility_extraction", "entry_method_extraction", "sponsor_extraction", "category_classification", "duplicate_candidates", "duplicate_resolution", "legitimacy_scoring", "human_review_routing", "normalized_update"] as const;
export const AUTHORITATIVE_CONFIDENCE_THRESHOLD = 0.70;

export class SweepstakesEnrichmentPipeline {
  constructor(private readonly repository: EnrichmentRepository, private readonly provider: EnrichmentProvider) {}
  async run(input: EnrichmentInput) {
    const runId = await this.repository.beginRun(input, this.provider);
    try {
      const result = await extractWithResilience(this.provider, cleanInput(input));
      const candidate = extractionToDedupeRecord(result.extraction);
      const dedupe = resolveDuplicate(candidate, await this.repository.listDedupeCandidates(candidate));
      const scores = calculateScores(result.extraction, input);
      const reviewReasons = getReviewReasons(result.extraction, dedupe.action);
      const targetSweepstakesId = dedupe.action === "automatic_merge" ? dedupe.matchedRecordId : null;
      const rulesContentHash = input.rulesText ? createHash("sha256").update(input.rulesText).digest("hex") : null;
      const authoritativeFields = selectAuthoritativeFields(result.extraction);
      const persisted = await this.repository.persist({ runId, source: input, extraction: result.extraction, authoritativeFields, scores, dedupe, reviewReasons, targetSweepstakesId, rulesContentHash });
      if (input.rulesText && input.rulesUrl && rulesContentHash) await this.repository.saveRulesVersion({ sweepstakesId: persisted.sweepstakesId, rulesUrl: input.rulesUrl, rawText: input.rulesText, contentHash: rulesContentHash, extractedAt: new Date().toISOString() });
      const status = reviewReasons.length ? "needs_review" : "completed";
      await this.repository.completeRun(runId, { status, usage: result.usage });
      return { runId, sweepstakesId: persisted.sweepstakesId, extraction: result.extraction, authoritativeFields, scores, dedupe, reviewReasons, status, stages: ENRICHMENT_STAGES };
    } catch (error) {
      await this.repository.completeRun(runId, { status: "failed", errorCode: (error as EnrichmentProviderError)?.code ?? "pipeline_error" });
      throw error;
    }
  }
}

export function selectAuthoritativeFields(extraction: SweepstakesExtraction) {
  return Object.fromEntries(Object.entries(extraction).filter(([, field]) => field.value !== null && field.confidence >= AUTHORITATIVE_CONFIDENCE_THRESHOLD).map(([name, field]) => [name, field.value]));
}
function getReviewReasons(extraction: SweepstakesExtraction, dedupeAction: string): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (averageConfidence(extraction) < AUTHORITATIVE_CONFIDENCE_THRESHOLD) reasons.push("low_confidence");
  if (hasConflictingDates(extraction)) reasons.push("conflicting_dates");
  if (dedupeAction === "human_review") reasons.push("duplicate_uncertain");
  return reasons;
}
function cleanInput(input: EnrichmentInput): EnrichmentInput { return { ...input, cleanedText: input.cleanedText.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), rulesText: input.rulesText?.replace(/\s+/g, " ").trim() || null }; }
