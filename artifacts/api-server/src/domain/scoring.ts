import { normalizeDiscoveryUrl } from "@/lib/discovery/url";
import type { RiskFlag, SponsorDomainReputation, Sweepstake, SweepstakeStatus, SweepstakesRules, UserProfile } from "@/lib/types";

type ScoreStatus = Extract<SweepstakeStatus, "eligible" | "ineligible" | "suspicious" | "expired">;

export type SweepstakesScore = {
  status: ScoreStatus;
  scamScore: number;
  eligibilityScore: number;
  riskFlags: RiskFlag[];
  complianceNotes: string[];
  noPurchaseMethodFound: boolean;
};

const MANAGED_FLAG_CODES = new Set([
  "account",
  "age",
  "bank-info",
  "captcha",
  "country",
  "duplicate-url",
  "expired",
  "high-prize",
  "in-person-required",
  "location-fit",
  "missing-deadline",
  "missing-rules",
  "no-purchase-method",
  "purchase-required",
  "sponsor-reputation",
  "ssn-before-winning",
  "state",
]);

export function scoreSweepstake(
  sweepstake: Sweepstake,
  profile: UserProfile,
  extractedRules?: Partial<SweepstakesRules>,
  allSweepstakes: Sweepstake[] = [],
  reputation?: SponsorDomainReputation | null,
): SweepstakesScore {
  const facts = getScoringFacts(sweepstake, extractedRules);
  const flags: RiskFlag[] = sweepstake.riskFlags.filter((flag) => !MANAGED_FLAG_CODES.has(flag.code));
  const notes: string[] = [];
  let scamScore = 8;
  let eligibilityScore = 100;

  const duplicate = findDuplicateSweepstake(sweepstake, facts.formUrl, allSweepstakes);
  const expired = isExpired(facts.deadline);
  const userAge = getAge(profile.dob);
  const ageBlocked = typeof facts.minimumAge === "number" && userAge !== null && facts.minimumAge > userAge;
  const stateBlocked = !isAllowed(profile.state, facts.eligibleStates);
  const countryBlocked = !isAllowed(profile.country, facts.eligibleCountries);
  const inPersonBlocked = facts.requiresInPersonAppearance && !profile.preferences.allowInPersonContests;
  const noPurchaseMethodFound = Boolean(
    sweepstake.noPurchaseMethodFound ||
      (sweepstake.extractedRules && !sweepstake.extractedRules.noPurchaseMethod) ||
      (facts.purchaseRequired && !sweepstake.extractedRules?.noPurchaseMethod),
  );

  if (expired) {
    eligibilityScore = 0;
    flags.push({ code: "expired", label: "Entry deadline has passed", severity: "high" });
    notes.push(`Rejected: entry deadline passed${facts.deadline ? ` on ${formatIsoDate(facts.deadline)}` : ""}.`);
  }

  if (ageBlocked) {
    eligibilityScore -= 70;
    flags.push({ code: "age", label: `Minimum age is ${facts.minimumAge}`, severity: "high" });
    notes.push(`Rejected: profile age does not meet the ${facts.minimumAge}+ minimum.`);
  }

  if (stateBlocked) {
    eligibilityScore -= 50;
    flags.push({ code: "state", label: "User state is not eligible", severity: "high" });
    notes.push(`Rejected: ${profile.state || "profile state"} is not listed as eligible.`);
  }

  if (countryBlocked) {
    eligibilityScore -= 50;
    flags.push({ code: "country", label: "User country is not eligible", severity: "high" });
    notes.push(`Rejected: ${profile.country || "profile country"} is not listed as eligible.`);
  }

  if (inPersonBlocked) {
    scamScore += 8;
    eligibilityScore -= 45;
    flags.push({ code: "in-person-required", label: "In-person appearance required", severity: "high" });
    notes.push("Rejected: profile is set to avoid contests requiring in-person appearance or pickup.");
  } else if (facts.requiresInPersonAppearance) {
    eligibilityScore -= 6;
    flags.push({ code: "in-person-required", label: "In-person appearance may be required", severity: "medium" });
    notes.push("Manual review: in-person appearance or pickup may be required.");
  }

  if (facts.locationEligibilityScore < 50) {
    eligibilityScore -= 15;
    flags.push({ code: "location-fit", label: "Low local eligibility confidence", severity: "medium" });
    notes.push("Needs review: location eligibility score is low.");
  }

  if (facts.purchaseRequired) {
    scamScore += 35;
    eligibilityScore -= 25;
    flags.push({ code: "purchase-required", label: "Purchase or payment required", severity: "high" });
    notes.push("Needs review: purchase or payment is requested.");
  }

  if (noPurchaseMethodFound) {
    scamScore += 22;
    eligibilityScore -= 18;
    flags.push({ code: "no-purchase-method", label: "No no-purchase method found", severity: "high" });
    notes.push("Needs review: no clear no-purchase entry method was found.");
  }

  if (duplicate) {
    scamScore += 24;
    eligibilityScore -= 15;
    flags.push({ code: "duplicate-url", label: `Duplicate of ${duplicate.title}`, severity: "medium" });
    notes.push(`Needs review: duplicate source or form URL matches ${duplicate.title}.`);
  }

  if (facts.captchaLikely) {
    flags.push({ code: "captcha", label: "CAPTCHA or bot protection likely", severity: "low" });
    notes.push("Manual-only: CAPTCHA may be present; do not automate or bypass it.");
  }

  if (facts.accountRequired) {
    eligibilityScore -= 8;
    flags.push({ code: "account", label: "Requires account or login", severity: "low" });
    notes.push("Manual review: account creation or login may be required.");
  }

  if (facts.prizeValue >= 100_000) {
    scamScore += 24;
    flags.push({ code: "high-prize", label: "Very high advertised prize value", severity: "medium" });
    notes.push("Review prize claim: advertised value is unusually high.");
  } else if (facts.prizeValue >= 5_000) {
    scamScore += 12;
    flags.push({ code: "high-prize", label: "High advertised prize value", severity: "medium" });
  }

  if (!facts.deadline) {
    scamScore += 8;
    eligibilityScore -= 8;
    flags.push({ code: "missing-deadline", label: "No clear deadline captured", severity: "medium" });
    notes.push("Needs review: no clear deadline is available.");
  }

  if (!sweepstake.rulesUrl && !sweepstake.rulesText && !sweepstake.extractedRules && !extractedRules) {
    scamScore += 14;
    eligibilityScore -= 10;
    flags.push({ code: "missing-rules", label: "Official rules not captured yet", severity: "medium" });
    notes.push("Needs review: official rules have not been extracted yet.");
  }

  if (reputation && reputation.recommendation !== "allow") {
    const reputationBlocked = reputation.recommendation === "block";
    scamScore += reputationBlocked ? 35 : reputation.riskScore >= 70 ? 22 : 12;
    eligibilityScore -= reputationBlocked ? 30 : reputation.riskScore >= 70 ? 18 : 8;
    flags.push({
      code: "sponsor-reputation",
      label: `Sponsor/domain reputation ${reputation.riskScore}/100`,
      severity: reputationBlocked || reputation.riskScore >= 80 ? "high" : "medium",
    });
    notes.push(`Needs review: sponsor/domain reputation is ${reputation.riskLevel} (${reputation.riskScore}/100).`);
    for (const reason of reputation.reasons.slice(0, 3)) {
      notes.push(`Reputation signal: ${reason}`);
    }
  }

  if (sweepstake.extractedRules?.ssnRequested) {
    scamScore += 50;
    flags.push({ code: "ssn-before-winning", label: "Requests SSN before winning", severity: "high" });
    notes.push("Needs review: SSN appears to be requested before winner verification.");
  }

  if (sweepstake.extractedRules?.bankingInfoRequested) {
    scamScore += 45;
    flags.push({ code: "bank-info", label: "Requests banking information", severity: "high" });
    notes.push("Needs review: banking information appears to be requested.");
  }

  scamScore += severityScore(sweepstake.riskFlags.filter((flag) => !MANAGED_FLAG_CODES.has(flag.code)));

  const hardIneligible = expired || ageBlocked || stateBlocked || countryBlocked || inPersonBlocked;
  const reputationRisk = Boolean(reputation && reputation.recommendation !== "allow" && reputation.riskScore >= 45);
  const suspicious = facts.purchaseRequired || noPurchaseMethodFound || Boolean(duplicate) || reputationRisk || scamScore >= 60;
  const status: ScoreStatus = expired ? "expired" : hardIneligible ? "ineligible" : suspicious ? "suspicious" : "eligible";

  if (status === "eligible") {
    notes.unshift("Accepted: known eligibility rules match the profile.");
  } else if (status === "suspicious") {
    notes.unshift("Needs review: compliance or risk signals require manual review before entry.");
  }

  notes.push(buildEntryFrequencyNote(facts.entryFrequency));

  return {
    status,
    scamScore: clamp(scamScore, 0, 100),
    eligibilityScore: status === "expired" ? 0 : clamp(eligibilityScore, 0, 100),
    riskFlags: dedupeFlags(flags),
    complianceNotes: dedupeNotes(notes),
    noPurchaseMethodFound,
  };
}

function getScoringFacts(sweepstake: Sweepstake, extractedRules?: Partial<SweepstakesRules>) {
  return {
    accountRequired: extractedRules?.accountRequired ?? sweepstake.requiresAccount,
    captchaLikely: extractedRules?.captchaLikely ?? sweepstake.hasCaptcha,
    deadline: extractedRules?.endAt ?? sweepstake.endAt,
    eligibleCountries: normalizeList(extractedRules?.eligibleCountries?.length ? extractedRules.eligibleCountries : [sweepstake.country]),
    eligibleStates: normalizeList(extractedRules?.eligibleStates?.length ? extractedRules.eligibleStates : sweepstake.stateEligibility),
    entryFrequency: extractedRules?.entryFrequency ?? sweepstake.entryFrequency,
    formUrl: sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null,
    minimumAge: extractedRules?.minAge ?? sweepstake.ageRequirement,
    prizeValue: extractedRules?.prizeRetailValue ?? sweepstake.prizeRetailValue ?? 0,
    purchaseRequired: extractedRules?.purchaseRequired ?? sweepstake.purchaseRequired,
    requiresInPersonAppearance: sweepstake.requiresInPersonAppearance,
    locationEligibilityScore: sweepstake.locationEligibilityScore ?? 50,
  };
}

function findDuplicateSweepstake(current: Sweepstake, formUrl: string | null, allSweepstakes: Sweepstake[]) {
  const currentUrls = new Set([safeNormalize(current.url), safeNormalize(formUrl)].filter((value): value is string => Boolean(value)));
  if (!currentUrls.size) return null;

  return (
    allSweepstakes.find((candidate) => {
      if (candidate.id === current.id) return false;
      const candidateUrls = [
        safeNormalize(candidate.url),
        safeNormalize(candidate.formUrl ?? candidate.extractedRules?.formUrl ?? null),
      ].filter((value): value is string => Boolean(value));
      return candidateUrls.some((url) => currentUrls.has(url));
    }) ?? null
  );
}

function safeNormalize(value: string | null | undefined) {
  if (!value) return null;
  try {
    return normalizeDiscoveryUrl(value);
  } catch {
    return null;
  }
}

function isExpired(value: string | null) {
  if (!value) return false;
  const deadline = new Date(value).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

function isAllowed(profileValue: string, allowedValues: string[]) {
  if (!allowedValues.length) return true;
  const normalizedProfile = normalizeEligibilityValue(profileValue);
  return allowedValues.some((value) => {
    const normalized = normalizeEligibilityValue(value);
    return normalized === "ALL" || normalized === "ANY" || normalized === normalizedProfile;
  });
}

function normalizeList(values: string[]) {
  return values.map(normalizeEligibilityValue).filter(Boolean);
}

function normalizeEligibilityValue(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\./g, "");
  if (normalized === "USA" || normalized === "UNITED STATES" || normalized === "UNITED STATES OF AMERICA") {
    return "US";
  }
  return normalized;
}

function buildEntryFrequencyNote(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("daily")) {
    return "Reminder cadence: daily entry allowed; log at most one user-approved attempt per day.";
  }
  if (normalized.includes("weekly")) {
    return "Reminder cadence: weekly entry allowed; log at most one user-approved attempt per week.";
  }
  if (normalized.includes("monthly")) {
    return "Reminder cadence: monthly entry allowed; log at most one user-approved attempt per month.";
  }
  if (normalized.includes("one") || normalized.includes("single")) {
    return "Reminder cadence: one-time entry; suppress repeat reminders after a logged attempt.";
  }
  return "Reminder cadence: unknown frequency; require manual rules review before scheduling reminders.";
}

function severityScore(flags: RiskFlag[]) {
  return flags.reduce((score, flag) => {
    if (flag.severity === "high") return score + 16;
    if (flag.severity === "medium") return score + 8;
    return score + 3;
  }, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getAge(dob: string) {
  const born = new Date(dob);
  if (!Number.isFinite(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

function formatIsoDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function dedupeFlags(flags: RiskFlag[]) {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    if (seen.has(flag.code)) {
      return false;
    }
    seen.add(flag.code);
    return true;
  });
}

function dedupeNotes(notes: string[]) {
  return [...new Set(notes.filter(Boolean))];
}
