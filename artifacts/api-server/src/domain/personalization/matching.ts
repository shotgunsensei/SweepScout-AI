import type { MatchFactor, MatchInput } from "./types";

export function calculatePersonalMatch(input: MatchInput) {
  const factors: MatchFactor[] = [];
  let score = Math.round((input.legitimacyScore + input.sourceConfidenceScore + (100 - input.entryEffortScore)) / 3);
  add(factors, "quality", "Quality signals", input.legitimacyScore >= 70 && input.sourceConfidenceScore >= 70 ? 8 : -6, input.legitimacyScore >= 70 && input.sourceConfidenceScore >= 70 ? "Legitimacy and source-confidence signals are strong." : "Quality or source-confidence signals need review.");
  if (input.eligibilityStatus === "eligible") add(factors, "eligibility", "Profile eligibility", 10, "Stored age and location fields appear compatible with the listing.");
  else if (input.eligibilityStatus === "ineligible") add(factors, "eligibility", "Profile eligibility", -40, "A stored age or location rule conflicts with the profile.");
  else add(factors, "eligibility", "Profile eligibility", 0, "Eligibility evidence is incomplete; verify the sponsor rules.");
  const categoryMatch = input.preferredCategories.some((category) => input.categories.includes(category));
  if (categoryMatch) add(factors, "category", "Preferred category", 10, "The opportunity matches a preferred prize category.");
  if (input.prizeValue >= input.minimumPrize) add(factors, "prize", "Prize preference", 5, "Estimated prize value meets the saved preference.");
  else if (input.minimumPrize > 0) add(factors, "prize", "Prize preference", -5, "Estimated prize value is below the saved preference.");
  if (input.entryEffortScore <= 35) add(factors, "effort", "Entry effort", 6, "The estimated entry effort is low.");
  else if (input.entryEffortScore > 70) add(factors, "effort", "Entry effort", -12, "The estimated entry effort is high.");
  if (input.entryEffortScore > input.maximumEffort) add(factors, "effort_preference", "Effort preference", -15, "Estimated entry effort exceeds the saved maximum.");
  if (input.preferredFrequencies.includes(input.entryFrequency)) add(factors, "frequency", "Preferred frequency", 8, "Entry frequency matches a saved preference.");
  if (input.hasSocialRequirement && !input.allowSocial) add(factors, "social", "Social action preference", -12, "This opportunity requires a social action the profile excludes.");
  if (input.hasPurchaseRequirement && !input.allowPurchase) add(factors, "purchase", "Purchase preference", -25, "This opportunity has a purchase-related method the profile excludes.");
  if (input.userStatus === "entered" || input.userStatus === "enter_again") add(factors, "history", "Entry history", 4, "The user has previously reported entering this opportunity.");
  if (input.userStatus === "won") add(factors, "history", "Entry history", 8, "The user marked this opportunity won.");
  score += factors.reduce((total, factor) => total + factor.points, 0);
  return { score: Math.max(0, Math.min(100, score)), factors: factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 6) };
}
function add(factors: MatchFactor[], key: string, label: string, points: number, explanation: string) { factors.push({ key, label, points, explanation, impact: points > 0 ? "positive" : points < 0 ? "negative" : "neutral" }); }
