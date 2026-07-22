import type { EnrichmentInput, EnrichmentScores, SweepstakesExtraction } from "./types";

export type ScoringConfig = { officialDomainBonus: number; rulesBonus: number; conflictPenalty: number; missingDisclosurePenalty: number };
export const DEFAULT_SCORING_CONFIG: ScoringConfig = { officialDomainBonus: 15, rulesBonus: 15, conflictPenalty: 25, missingDisclosurePenalty: 8 };

export function calculateScores(extraction: SweepstakesExtraction, source: EnrichmentInput, config = DEFAULT_SCORING_CONFIG): EnrichmentScores {
  const conflicts = hasConflictingDates(extraction);
  const officialDomain = sameHost(extraction.officialPromotionUrl.value, extraction.officialRulesUrl.value);
  const clearDates = Boolean(extraction.startDate.value && extraction.endDate.value && !conflicts);
  const clearEligibility = Boolean(extraction.eligibleLocations.value?.length && extraction.minimumAge.value !== null);
  const prizeClarity = Boolean(extraction.prizes.value?.length && extraction.prizes.value.every((p) => p.quantity > 0));
  let legitimacy = 30 + (officialDomain ? config.officialDomainBonus : 0) + (source.rulesText ? config.rulesBonus : 0) + (clearDates ? 12 : 0) + (clearEligibility ? 10 : 0) + (prizeClarity ? 10 : 0) + Math.round((source.sponsorReputation ?? .5) * 8);
  if (conflicts) legitimacy -= config.conflictPenalty;
  if (extraction.voidWhereProhibited.value === null || extraction.taxDisclosures.value === null) legitimacy -= config.missingDisclosurePenalty;
  const methods = extraction.entryMethods.value ?? [];
  let effort = 5 + methods.length * 8 + methods.reduce((sum, method) => sum + (method.estimatedMinutes ?? 2), 0);
  effort += (extraction.socialMediaRequirements.value?.length ?? 0) * 6;
  if (methods.some((method) => method.purchaseRequired)) effort += 20;
  if (methods.some((method) => /referr/i.test(method.description))) effort += 12;
  if (extraction.entryFrequency.value === "daily") effort += 10;
  const avgConfidence = averageConfidence(extraction);
  let sourceConfidence = Math.round(avgConfidence * 55 + (source.sourceReputation ?? .5) * 20 + (source.rulesText ? 15 : 0) + (source.fetchedAt ? 10 : 0));
  return { legitimacy: clamp(legitimacy), entryEffort: clamp(effort), sourceConfidence: clamp(sourceConfidence) };
}
export function hasConflictingDates(extraction: SweepstakesExtraction) { return Boolean(extraction.startDate.value && extraction.endDate.value && Date.parse(extraction.startDate.value) > Date.parse(extraction.endDate.value)); }
export function averageConfidence(extraction: SweepstakesExtraction) { const fields = Object.values(extraction); return fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length; }
function sameHost(a: string | null, b: string | null) { try { return Boolean(a && b && new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "")); } catch { return false; } }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
