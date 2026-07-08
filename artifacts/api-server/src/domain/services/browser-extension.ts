import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getRegistrableDomain, normalizeDiscoveryUrl } from "@/lib/discovery/url";
import { scoreSweepstake } from "@/lib/scoring";
import { classifySweepstakeCategory } from "@/lib/services/category-classifier";
import { ensureSweepstakeEmailAlias } from "@/lib/services/email-aliases";
import {
  applyReputationToSweepstake,
  findSponsorReputationForSweepstake,
  getSponsorReputationReport,
} from "@/lib/services/sponsor-reputation";
import { DEFAULT_ORGANIZATION_ID, assertCanSaveNewSweepstake } from "@/lib/services/tenancy";
import { getStore } from "@/lib/storage/store";
import type { RiskFlag, RulesExtractionData, Sweepstake } from "@/lib/types";

const MAX_TEXT_CHARS = 35_000;
const MAX_FIELD_COUNT = 120;

const extensionFieldSchema = z
  .object({
    id: z.string().optional(),
    label: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    autocomplete: z.string().optional(),
    suspiciousKind: z.enum(["ssn", "banking", "payment", "password", "unknown"]).nullable().optional(),
  })
  .strict();

const extensionPageSchema = z
  .object({
    url: z.string().url(),
    title: z.string().trim().max(300).optional(),
    sponsor: z.string().trim().max(200).optional(),
    text: z.string().max(MAX_TEXT_CHARS).optional(),
    rulesUrl: z.string().url().nullable().optional(),
    formUrl: z.string().url().nullable().optional(),
    source: z.string().trim().max(80).optional(),
    detected: z.boolean().optional(),
    signals: z.array(z.string().trim().max(160)).max(40).optional(),
    suspiciousFields: z.array(extensionFieldSchema).max(MAX_FIELD_COUNT).optional(),
  })
  .strict();

export type ExtensionPageInput = z.infer<typeof extensionPageSchema>;

export async function analyzeExtensionPage(rawInput: unknown) {
  const input = extensionPageSchema.parse(rawInput);
  const store = await getStore();
  const [profile, sweepstakes, reputationReport] = await Promise.all([
    store.getUserProfile(),
    store.listSweepstakes(),
    getSponsorReputationReport(),
  ]);
  const draft = buildSweepstakeFromExtensionPage(input);
  const reputation = findSponsorReputationForSweepstake(draft, reputationReport);
  const scored = scoreSweepstake(draft, profile, undefined, sweepstakes, reputation);
  const sweepstake: Sweepstake = {
    ...draft,
    ...scored,
    status: scored.status,
    riskFlags: scored.riskFlags,
    complianceNotes: scored.complianceNotes,
    updatedAt: new Date().toISOString(),
  };
  const reputationAdjusted = applyReputationToSweepstake(sweepstake, reputation);
  const existing = findExistingSweepstake(sweepstakes, sweepstake.url, sweepstake.formUrl);

  return {
    detected: Boolean(input.detected) || inferDetected(input),
    existingSweepstakeId: existing?.id ?? null,
    sweepstake: reputationAdjusted,
    score: {
      status: reputationAdjusted.status,
      scamScore: reputationAdjusted.scamScore,
      eligibilityScore: reputationAdjusted.eligibilityScore,
      riskFlags: reputationAdjusted.riskFlags,
      complianceNotes: reputationAdjusted.complianceNotes,
    },
    reputation,
  };
}

export async function saveExtensionPage(rawInput: unknown) {
  const store = await getStore();
  const analysis = await analyzeExtensionPage(rawInput);
  const now = new Date().toISOString();

  if (analysis.existingSweepstakeId) {
    const existing = await store.getSweepstake(analysis.existingSweepstakeId);
    if (!existing) {
      throw new Error("Matched sweepstake no longer exists.");
    }
    const savedExisting = await store.saveSweepstake({
      ...existing,
      rulesUrl: existing.rulesUrl ?? analysis.sweepstake.rulesUrl,
      formUrl: existing.formUrl ?? analysis.sweepstake.formUrl,
      rulesText: existing.rulesText ?? analysis.sweepstake.rulesText,
      extractedRules: existing.extractedRules ?? analysis.sweepstake.extractedRules,
      updatedAt: now,
    });
    const aliasAssignment = await ensureSweepstakeEmailAlias(savedExisting);
    return {
      created: false,
      sweepstake: aliasAssignment.sweepstake,
      score: analysis.score,
      message: "Sweepstake was already saved; existing record updated with any newly captured URL details.",
    };
  }

  await assertCanSaveNewSweepstake();
  const saved = await store.saveSweepstake({
    ...analysis.sweepstake,
    id: extensionSweepstakeId(analysis.sweepstake.url),
    createdAt: now,
    updatedAt: now,
  });
  const aliasAssignment = await ensureSweepstakeEmailAlias(saved);

  await writeAuditLog({
    actorId: null,
    action: "extension.sweepstake_saved",
    entityType: "sweepstake",
    entityId: aliasAssignment.sweepstake.id,
    severity: aliasAssignment.sweepstake.status === "suspicious" ? "warn" : "info",
    message: "Sweepstake page saved from the Chrome extension.",
    metadata: {
      url: aliasAssignment.sweepstake.url,
      status: aliasAssignment.sweepstake.status,
      scamScore: aliasAssignment.sweepstake.scamScore,
      eligibilityScore: aliasAssignment.sweepstake.eligibilityScore,
    },
  });

  return {
    created: true,
    sweepstake: aliasAssignment.sweepstake,
    score: analysis.score,
    message: "Sweepstake saved to SweepScout.",
  };
}

function buildSweepstakeFromExtensionPage(input: ExtensionPageInput): Sweepstake {
  const now = new Date().toISOString();
  const normalizedUrl = normalizeDiscoveryUrl(input.url);
  const text = (input.text ?? "").slice(0, MAX_TEXT_CHARS);
  const title = cleanTitle(input.title) ?? inferTitleFromUrl(normalizedUrl);
  const domain = getRegistrableDomain(normalizedUrl);
  const extractedRules = buildExtractedRules(input, title, domain, text);
  const riskFlags = extensionRiskFlags(input, text);
  const prizeValue = extractedRules.approximateRetailValue;
  const sponsor = cleanSponsor(input.sponsor) ?? inferSponsor(domain, text);
  const noPurchaseMethodFound = !/\bno\s+purchase\s+necessary\b/i.test(text);

  return {
    id: extensionSweepstakeId(normalizedUrl),
    organizationId: DEFAULT_ORGANIZATION_ID,
    title,
    sponsor,
    url: normalizedUrl,
    source: input.source || "chrome-extension",
    status: "needs_review",
    category: classifySweepstakeCategory({
      title,
      sponsor,
      url: normalizedUrl,
      rulesText: text,
      extractedRules,
      riskFlags,
      prizeRetailValue: prizeValue,
      purchaseRequired: extractedRules.purchaseOrPaymentRequested,
      noPurchaseMethodFound,
    }),
    prizeRetailValue: prizeValue,
    country: "US",
    stateEligibility: inferStates(text),
    ageRequirement: inferAgeRequirement(text),
    startAt: null,
    endAt: extractedRules.deadline,
    entryFrequency: extractedRules.entryFrequency ?? inferEntryFrequency(text),
    purchaseRequired: extractedRules.purchaseOrPaymentRequested,
    noPurchaseMethodFound,
    hasCaptcha: /\b(captcha|recaptcha|hcaptcha|cf-turnstile)\b/i.test(text),
    requiresAccount: /\b(create an account|sign in|log in|login required|account required)\b/i.test(text),
    eligibilitySummary: extractedRules.eligibility ?? "Captured from browser extension; review official rules before entering.",
    rulesUrl: input.rulesUrl ?? extractedRules.officialRulesUrl,
    rulesText: text || null,
    rulesExtractedAt: text ? now : null,
    formUrl: input.formUrl ?? input.url,
    emailAlias: null,
    localRegion: null,
    locationEligibilityScore: 50,
    locationEligibilityNotes: ["Location eligibility is unclear until official rules are extracted."],
    requiresInPersonAppearance: false,
    extractedRules,
    scamScore: 0,
    eligibilityScore: 0,
    riskFlags,
    complianceNotes: ["Needs review: captured from browser extension; verify official rules before entry."],
    createdAt: now,
    updatedAt: now,
  };
}

function buildExtractedRules(
  input: ExtensionPageInput,
  title: string,
  domain: string,
  text: string,
): RulesExtractionData {
  const suspiciousKinds = new Set((input.suspiciousFields ?? []).map((field) => field.suspiciousKind).filter(Boolean));
  return {
    title,
    sponsor: inferSponsor(domain, text),
    prizeSummary: inferPrizeSummary(text),
    approximateRetailValue: inferPrizeValue(text),
    deadline: inferDeadline(text),
    eligibility: inferEligibility(text),
    allowedStates: inferStates(text),
    allowedCountries: ["US"],
    minimumAge: inferAgeRequirement(text),
    entryFrequency: inferEntryFrequency(text),
    noPurchaseMethod: /\bno\s+purchase\s+necessary\b/i.test(text) ? "No purchase necessary language detected." : null,
    formUrl: input.formUrl ?? input.url,
    redFlags: extensionRedFlags(input, text),
    captchaPresent: /\b(captcha|recaptcha|hcaptcha|cf-turnstile)\b/i.test(text),
    purchaseOrPaymentRequested: hasPaymentLanguage(input, text),
    ssnRequested: suspiciousKinds.has("ssn") || /\b(ssn|social security number)\b/i.test(text),
    bankingInfoRequested: suspiciousKinds.has("banking") || /\b(routing number|bank account|wire transfer|ach)\b/i.test(text),
    officialRulesUrl: input.rulesUrl ?? null,
    sourceConfidence: inferDetected(input) ? 0.72 : 0.42,
  };
}

function extensionRiskFlags(input: ExtensionPageInput, text: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const suspiciousKinds = new Set((input.suspiciousFields ?? []).map((field) => field.suspiciousKind).filter(Boolean));
  if (suspiciousKinds.has("ssn") || /\b(ssn|social security number)\b/i.test(text)) {
    flags.push({ code: "ssn-before-winning", label: "SSN field detected before winner verification", severity: "high" });
  }
  if (suspiciousKinds.has("banking") || /\b(routing number|bank account|wire transfer|ach)\b/i.test(text)) {
    flags.push({ code: "bank-info", label: "Banking field detected", severity: "high" });
  }
  if (hasPaymentLanguage(input, text)) {
    flags.push({ code: "purchase-required", label: "Payment or purchase language detected", severity: "high" });
  }
  if (!input.rulesUrl && !/\bofficial\s+rules\b/i.test(text)) {
    flags.push({ code: "missing-rules", label: "Official rules link not detected", severity: "medium" });
  }
  if (/\b(captcha|recaptcha|hcaptcha|cf-turnstile)\b/i.test(text)) {
    flags.push({ code: "captcha", label: "CAPTCHA or bot protection likely", severity: "low" });
  }
  return flags;
}

function extensionRedFlags(input: ExtensionPageInput, text: string) {
  const flags = extensionRiskFlags(input, text).map((flag) => flag.label);
  return [...new Set(flags)];
}

function findExistingSweepstake(sweepstakes: Sweepstake[], url: string, formUrl: string | null) {
  const normalized = new Set([safeNormalize(url), safeNormalize(formUrl)].filter((value): value is string => Boolean(value)));
  return sweepstakes.find((item) => normalized.has(safeNormalize(item.url) ?? "") || normalized.has(safeNormalize(item.formUrl) ?? ""));
}

function safeNormalize(value: string | null | undefined) {
  if (!value) return null;
  try {
    return normalizeDiscoveryUrl(value);
  } catch {
    return null;
  }
}

function extensionSweepstakeId(url: string) {
  return `swp-ext-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function inferDetected(input: ExtensionPageInput) {
  const haystack = `${input.url}\n${input.title ?? ""}\n${input.text ?? ""}\n${input.signals?.join("\n") ?? ""}`.toLowerCase();
  return /\b(sweepstakes?|giveaway|contest|official rules|no purchase necessary|enter to win|instant win)\b/.test(haystack);
}

function cleanTitle(value: string | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 140);
}

function cleanSponsor(value: string | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

function inferTitleFromUrl(value: string) {
  const url = new URL(value);
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/[-_]+/g, " ")
    .trim();
  return titleCase(path || url.hostname.replace(/^www\./, ""));
}

function inferSponsor(domain: string, text: string) {
  const sponsorMatch = text.match(/\bSponsor(?:ed by)?\s*:?\s*([A-Z][A-Za-z0-9&.,' -]{2,90})/);
  return sponsorMatch?.[1]?.trim() || titleCase(domain.split(".")[0] ?? domain);
}

function inferPrizeSummary(text: string) {
  const sentence = firstSentence(text, /\b(grand prize|prize|winner will receive|arv|retail value)\b/i);
  return sentence?.slice(0, 320) ?? null;
}

function inferPrizeValue(text: string) {
  const values = [...text.matchAll(/\$\s?([0-9][0-9,]*(?:\.\d{2})?)/g)]
    .map((match) => Number((match[1] ?? "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

function inferDeadline(text: string) {
  const sentence = firstSentence(text, /\b(deadline|ends?|closes?|entry period|by 11:59|through)\b/i) ?? text;
  const patterns = [
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}\b/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (!match?.[0]) continue;
    const parsed = new Date(match[0].replace(/\b(st|nd|rd|th)\b/gi, ""));
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : match[0];
  }
  return null;
}

function inferEligibility(text: string) {
  return firstSentence(
    text,
    /\b(open to|eligible|legal residents?|void where prohibited|residents of|years of age|older at time|age of majority)\b/i,
  )?.slice(0, 360) ?? null;
}

function inferStates(text: string) {
  if (/\b(50\s+united\s+states|all\s+u\.?s\.?\s+states|united states and d\.?c\.?)\b/i.test(text)) return ["ALL"];
  const stateMatches = [...text.matchAll(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
  return stateMatches.length ? [...new Set(stateMatches)].slice(0, 20) : ["ALL"];
}

function inferAgeRequirement(text: string) {
  const match = text.match(/\b(?:age|ages)?\s*(18|19|21)\s*(?:\+|years of age|or older)\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function inferEntryFrequency(text: string) {
  const lower = text.toLowerCase();
  if (/\bdaily|per day|once a day|one entry per day\b/.test(lower)) return "Daily";
  if (/\bweekly|per week|once a week|one entry per week\b/.test(lower)) return "Weekly";
  if (/\bmonthly|per month|once a month|one entry per month\b/.test(lower)) return "Monthly";
  if (/\bone entry|one-time|single entry|one time|per person\b/.test(lower)) return "One-time";
  return "Unknown";
}

function hasPaymentLanguage(input: ExtensionPageInput, text: string) {
  const hasPaymentField = (input.suspiciousFields ?? []).some((field) => field.suspiciousKind === "payment");
  return (
    hasPaymentField ||
    /\b(payment|credit card|debit card|checkout|shipping fee|processing fee|buy now|required purchase)\b/i.test(text) ||
    (/\bpurchase required\b/i.test(text) && !/\bno purchase required\b/i.test(text))
  );
}

function firstSentence(text: string, pattern: RegExp) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length > 8 && pattern.test(sentence)) ?? null;
}

function titleCase(value: string) {
  return value
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
