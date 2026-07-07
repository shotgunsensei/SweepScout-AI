import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getRegistrableDomain, isBlockedDomain } from "@/lib/discovery/url";
import { AppConfigError, getAppConfig, requireOpenAIAccess, type OpenAIAccess } from "@/lib/env";
import { scoreSweepstake } from "@/lib/scoring";
import { detectProtectionSignals } from "@/lib/safety";
import { classifySweepstakeCategory } from "@/lib/services/category-classifier";
import { findSponsorReputationForSweepstake, getSponsorReputationReport } from "@/lib/services/sponsor-reputation";
import { getStore } from "@/lib/storage/store";
import type { RiskFlag, RulesExtractionData, Sweepstake, SweepstakesRules } from "@/lib/types";

const MAX_PAGE_BYTES = 900_000;
const MAX_MODEL_TEXT_CHARS = 35_000;
const FETCH_TIMEOUT_MS = 12_000;
const ROBOTS_TIMEOUT_MS = 3_500;
const USER_AGENT = "SweepScoutAI/0.1 read-only compliance research (+https://localhost)";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

type LoadedHtml = {
  finalUrl: string;
  html: string;
  visibleText: string;
};

type ExtractionSource = {
  sourceUrl: string;
  pageUrl: string;
  officialRulesUrl: string | null;
  formUrl: string | null;
  combinedText: string;
  pageText: string;
  rulesText: string | null;
  captchaPresent: boolean;
  purchaseOrPaymentRequested: boolean;
  ssnRequested: boolean;
  bankingInfoRequested: boolean;
  gamblingOrLotteryLanguage: boolean;
  hasOfficialRulesContent: boolean;
};

export const rulesExtractionSchema = z
  .object({
    title: z.string().trim().min(1).nullable(),
    sponsor: z.string().trim().min(1).nullable(),
    prizeSummary: z.string().trim().min(1).nullable(),
    approximateRetailValue: z.number().nonnegative().nullable(),
    deadline: z.string().trim().min(1).nullable(),
    eligibility: z.string().trim().min(1).nullable(),
    allowedStates: z.array(z.string().trim().min(1)),
    allowedCountries: z.array(z.string().trim().min(1)),
    minimumAge: z.number().int().positive().nullable(),
    entryFrequency: z.string().trim().min(1).nullable(),
    noPurchaseMethod: z.string().trim().min(1).nullable(),
    formUrl: z.string().url().nullable(),
    redFlags: z.array(z.string().trim().min(1)),
    captchaPresent: z.boolean(),
    purchaseOrPaymentRequested: z.boolean(),
    ssnRequested: z.boolean(),
    bankingInfoRequested: z.boolean(),
    officialRulesUrl: z.string().url().nullable(),
    sourceConfidence: z.number().min(0).max(1),
  })
  .strict();

export async function runRulesExtraction(sweepstakeId: string) {
  const store = await getStore();
  const sweepstake = await store.getSweepstake(sweepstakeId);
  if (!sweepstake) {
    throw new Error("Sweepstake not found.");
  }

  const startedAt = new Date().toISOString();
  const extractionJob = await store.saveExtractionJob({
    id: `ext-${sweepstake.id}-${Date.now()}`,
    organizationId: sweepstake.organizationId,
    sweepstakeId: sweepstake.id,
    status: "running",
    summary: null,
    model: getAppConfig().openaiModel,
    startedAt,
    finishedAt: null,
    error: null,
  });

  try {
    const access = requireOpenAIAccess();
    console.info(`[extraction] Starting read-only extraction for ${sweepstake.id}`);
    const blockedDomainNames = (await store.listBlockedDomains()).map((domain) => domain.domain);
    if (isBlockedDomain(sweepstake.url, blockedDomainNames)) {
      throw new Error("This sweepstake domain is blocked by the owner blocklist.");
    }
    await writeAuditLog({
      actorId: null,
      action: "extraction.started",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: "info",
      message: "Read-only rules extraction started.",
      metadata: { url: sweepstake.url, model: getAppConfig().openaiModel },
    });

    const source = await loadExtractionSource(sweepstake, blockedDomainNames);
    const extracted = await extractRulesWithOpenAI({ access, sweepstake, source });
    const mergedExtraction = mergeObservedSignals(extracted, source);
    const riskAssessment = assessSuspiciousSignals(sweepstake, mergedExtraction, source);
    const profile = await store.getUserProfile();
    const [allSweepstakes, reputationReport] = await Promise.all([store.listSweepstakes(), getSponsorReputationReport()]);
    const scoreSubject: Sweepstake = {
      ...sweepstake,
      prizeRetailValue: mergedExtraction.approximateRetailValue ?? sweepstake.prizeRetailValue,
      country: mergedExtraction.allowedCountries[0] ?? sweepstake.country,
      stateEligibility: mergedExtraction.allowedStates.length ? mergedExtraction.allowedStates : sweepstake.stateEligibility,
      ageRequirement: mergedExtraction.minimumAge ?? sweepstake.ageRequirement,
      endAt: mergedExtraction.deadline ?? sweepstake.endAt,
      entryFrequency: mergedExtraction.entryFrequency ?? sweepstake.entryFrequency,
      purchaseRequired: mergedExtraction.purchaseOrPaymentRequested,
      noPurchaseMethodFound: !mergedExtraction.noPurchaseMethod,
      hasCaptcha: mergedExtraction.captchaPresent,
      formUrl: mergedExtraction.formUrl ?? sweepstake.formUrl,
      extractedRules: mergedExtraction,
    };
    const scored = scoreSweepstake(
      scoreSubject,
      profile,
      toLegacyRules(mergedExtraction),
      allSweepstakes,
      findSponsorReputationForSweepstake(scoreSubject, reputationReport),
    );
    const now = new Date().toISOString();
    const riskFlags = dedupeRiskFlags([...scored.riskFlags, ...riskAssessment.flags]);
    const scamScore = riskAssessment.suspicious ? Math.max(scored.scamScore, 72) : scored.scamScore;
    const eligibilityScore = riskAssessment.suspicious ? Math.min(scored.eligibilityScore, 45) : scored.eligibilityScore;
    const complianceNotes = dedupeNotes([
      ...scored.complianceNotes,
      ...riskAssessment.reasons.map((reason) => `Needs review: ${reason}.`),
    ]);
    const category = classifySweepstakeCategory({
      ...sweepstake,
      title: mergedExtraction.title ?? sweepstake.title,
      sponsor: mergedExtraction.sponsor ?? sweepstake.sponsor,
      prizeSummary: mergedExtraction.prizeSummary,
      prizeRetailValue: mergedExtraction.approximateRetailValue ?? sweepstake.prizeRetailValue,
      eligibilitySummary: mergedExtraction.eligibility ?? sweepstake.eligibilitySummary,
      rulesText: source.combinedText,
      extractedRules: mergedExtraction,
      riskFlags,
      scamScore,
      purchaseRequired: mergedExtraction.purchaseOrPaymentRequested,
      noPurchaseMethodFound: !mergedExtraction.noPurchaseMethod,
    });

    const updated: Sweepstake = {
      ...sweepstake,
      title: mergedExtraction.title ?? sweepstake.title,
      sponsor: mergedExtraction.sponsor ?? sweepstake.sponsor,
      category,
      prizeRetailValue: mergedExtraction.approximateRetailValue ?? sweepstake.prizeRetailValue,
      country: mergedExtraction.allowedCountries[0] ?? sweepstake.country,
      stateEligibility: mergedExtraction.allowedStates.length ? mergedExtraction.allowedStates : sweepstake.stateEligibility,
      ageRequirement: mergedExtraction.minimumAge ?? sweepstake.ageRequirement,
      endAt: mergedExtraction.deadline ?? sweepstake.endAt,
      entryFrequency: mergedExtraction.entryFrequency ?? sweepstake.entryFrequency,
      purchaseRequired: mergedExtraction.purchaseOrPaymentRequested,
      noPurchaseMethodFound: !mergedExtraction.noPurchaseMethod,
      hasCaptcha: mergedExtraction.captchaPresent,
      eligibilitySummary:
        mergedExtraction.eligibility ??
        mergedExtraction.prizeSummary ??
        sweepstake.eligibilitySummary ??
        "Extraction completed; review official rules before entering.",
      rulesUrl: mergedExtraction.officialRulesUrl ?? sweepstake.rulesUrl,
      rulesText: source.combinedText.slice(0, MAX_MODEL_TEXT_CHARS),
      rulesExtractedAt: now,
      formUrl: mergedExtraction.formUrl ?? sweepstake.formUrl,
      extractedRules: mergedExtraction,
      scamScore,
      eligibilityScore,
      riskFlags,
      complianceNotes,
      status:
        scored.status === "expired" || scored.status === "ineligible"
          ? scored.status
          : riskAssessment.suspicious
            ? "suspicious"
            : scored.status,
      updatedAt: now,
    };

    await store.saveSweepstake(updated);
    await store.saveExtractionJob({
      ...extractionJob,
      status: "completed",
      summary: buildExtractionSummary(mergedExtraction, riskAssessment.reasons),
      finishedAt: now,
    });
    await writeAuditLog({
      actorId: null,
      action: "extraction.completed",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: riskAssessment.suspicious ? "warn" : "info",
      message: `Rules extraction completed with status ${updated.status}.`,
      metadata: {
        status: updated.status,
        suspicious: riskAssessment.suspicious,
        reasons: riskAssessment.reasons,
        officialRulesUrl: source.officialRulesUrl,
        formUrl: source.formUrl,
        captchaPresent: source.captchaPresent,
      },
    });

    console.info(
      `[extraction] Completed ${sweepstake.id}: suspicious=${riskAssessment.suspicious}, reasons=${riskAssessment.reasons.length}`,
    );
    return {
      sweepstake: updated,
      extraction: mergedExtraction,
      suspicious: riskAssessment.suspicious,
      reasons: riskAssessment.reasons,
      source: {
        pageUrl: source.pageUrl,
        officialRulesUrl: source.officialRulesUrl,
        formUrl: source.formUrl,
        textLength: source.combinedText.length,
        captchaPresent: source.captchaPresent,
      },
    };
  } catch (error) {
    await store.saveExtractionJob({
      ...extractionJob,
      status: error instanceof AppConfigError ? "needs_review" : "failed",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown extraction error.",
    });
    await writeAuditLog({
      actorId: null,
      action: "extraction.failed",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: "warn",
      message: error instanceof Error ? error.message : "Rules extraction failed.",
      metadata: { url: sweepstake.url },
    });
    throw error;
  }
}

async function loadExtractionSource(sweepstake: Sweepstake, blockedDomains: string[]): Promise<ExtractionSource> {
  const page = await fetchVisiblePage(sweepstake.url);
  const discoveredRulesUrl = sweepstake.rulesUrl ?? findOfficialRulesLink(page.html, page.finalUrl);
  const pageText = page.visibleText;

  let rulesPage: LoadedHtml | null = null;
  if (discoveredRulesUrl && normalizeUrl(discoveredRulesUrl) !== normalizeUrl(page.finalUrl)) {
    if (isBlockedDomain(discoveredRulesUrl, blockedDomains)) {
      throw new Error("Official rules URL is on the owner blocklist; extraction stopped.");
    }
    console.info(`[extraction] Found official rules link for ${sweepstake.id}: ${discoveredRulesUrl}`);
    rulesPage = await fetchVisiblePage(discoveredRulesUrl);
  }

  const rulesText = rulesPage?.visibleText ?? null;
  const combinedText = truncateForModel(
    [
      `SOURCE URL: ${sweepstake.url}`,
      `LOADED PAGE URL: ${page.finalUrl}`,
      discoveredRulesUrl ? `OFFICIAL RULES URL: ${discoveredRulesUrl}` : "OFFICIAL RULES URL: not found",
      "PAGE TEXT:",
      pageText,
      rulesText ? "OFFICIAL RULES TEXT:" : "",
      rulesText ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  const formUrl = findFormUrl(page.html, page.finalUrl) ?? (rulesPage ? findFormUrl(rulesPage.html, rulesPage.finalUrl) : null);
  if (formUrl && isBlockedDomain(formUrl, blockedDomains)) {
    throw new Error("Discovered form URL is on the owner blocklist; extraction stopped.");
  }
  const textForSignals = `${page.html}\n${rulesPage?.html ?? ""}\n${combinedText}`;
  const protectionSignals = detectProtectionSignals({ url: sweepstake.url, text: textForSignals });
  const captchaPresent = protectionSignals.some((signal) => signal.kind === "captcha") || hasCaptchaMarkup(textForSignals);
  const purchaseOrPaymentRequested = hasPaymentLanguage(textForSignals);
  const ssnRequested = hasSsnLanguage(textForSignals);
  const bankingInfoRequested = hasBankingLanguage(textForSignals);
  const gamblingOrLotteryLanguage = hasGamblingOrLotteryLanguage(textForSignals);

  return {
    sourceUrl: sweepstake.url,
    pageUrl: page.finalUrl,
    officialRulesUrl: discoveredRulesUrl,
    formUrl,
    combinedText,
    pageText,
    rulesText,
    captchaPresent,
    purchaseOrPaymentRequested,
    ssnRequested,
    bankingInfoRequested,
    gamblingOrLotteryLanguage,
    hasOfficialRulesContent: /\bofficial\s+rules\b/i.test(combinedText) || /\bno\s+purchase\s+necessary\b/i.test(combinedText),
  };
}

async function fetchVisiblePage(url: string): Promise<LoadedHtml> {
  assertHttpUrl(url);
  await assertRobotsAllowed(url);

  const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, {
    headers: {
      accept: "text/html,text/plain;q=0.8,*/*;q=0.3",
      "user-agent": USER_AGENT,
    },
    redirect: "follow",
  });

  if (response.status === 429) {
    throw new Error(`Rate limit encountered while loading ${url}; extraction stopped.`);
  }
  if (response.status === 403) {
    throw new Error(`Access denied while loading ${url}; extraction stopped rather than bypassing protection.`);
  }
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`Unsupported rules content type for ${url}: ${contentType}.`);
  }

  const html = await readLimitedText(response, MAX_PAGE_BYTES);
  const blockingSignals = detectProtectionSignals({ status: response.status, url: response.url || url, text: html }).filter(
    (signal) => signal.kind === "bot_protection" || signal.kind === "rate_limit",
  );
  if (blockingSignals.length) {
    throw new Error(blockingSignals.map((signal) => signal.message).join(" "));
  }

  return {
    finalUrl: response.url || url,
    html,
    visibleText: extractVisibleText(html),
  };
}

async function extractRulesWithOpenAI(input: {
  access: OpenAIAccess;
  sweepstake: Sweepstake;
  source: ExtractionSource;
}): Promise<RulesExtractionData> {
  const config = getAppConfig();
  const response = await fetch(`${input.access.baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.access.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      instructions:
        "Extract sweepstakes rules for personal compliance review. Do not infer permission to bypass CAPTCHA, bot protection, rate limits, purchases, payments, or terms. Return only JSON that matches the schema.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Sweepstake database title: ${input.sweepstake.title}`,
                `Source URL: ${input.source.sourceUrl}`,
                `Loaded page URL: ${input.source.pageUrl}`,
                `Observed official rules URL: ${input.source.officialRulesUrl ?? "not found"}`,
                `Observed form URL: ${input.source.formUrl ?? "not found"}`,
                `Observed CAPTCHA markup: ${input.source.captchaPresent}`,
                "",
                "Extract these fields from the page text. Use null when the field is not present. Keep redFlags factual and concise.",
                input.source.combinedText,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sweepstakes_rules_extraction",
          strict: true,
          schema: openAiRulesExtractionJsonSchema,
        },
      },
    }),
  });

  const json = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `OpenAI extraction failed with HTTP ${response.status}.`);
  }

  const text = getOpenAIOutputText(json);
  if (!text) {
    throw new Error("OpenAI extraction did not return JSON text.");
  }

  try {
    return rulesExtractionSchema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`OpenAI extraction failed schema validation: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function mergeObservedSignals(extracted: RulesExtractionData, source: ExtractionSource): RulesExtractionData {
  return {
    ...extracted,
    officialRulesUrl: extracted.officialRulesUrl ?? source.officialRulesUrl,
    formUrl: extracted.formUrl ?? source.formUrl,
    captchaPresent: extracted.captchaPresent || source.captchaPresent,
    purchaseOrPaymentRequested: extracted.purchaseOrPaymentRequested || source.purchaseOrPaymentRequested,
    ssnRequested: extracted.ssnRequested || source.ssnRequested,
    bankingInfoRequested: extracted.bankingInfoRequested || source.bankingInfoRequested,
  };
}

function assessSuspiciousSignals(sweepstake: Sweepstake, extracted: RulesExtractionData, source: ExtractionSource) {
  const reasons: string[] = [];
  const flags: RiskFlag[] = [];

  addSuspicious(reasons, flags, extracted.ssnRequested, "ssn-before-winning", "Requests SSN before winner verification");
  addSuspicious(reasons, flags, extracted.bankingInfoRequested, "bank-info", "Requests bank or routing information");
  addSuspicious(reasons, flags, extracted.purchaseOrPaymentRequested, "payment-requested", "Requests payment or purchase");
  addSuspicious(
    reasons,
    flags,
    source.gamblingOrLotteryLanguage,
    "gambling-lottery",
    "Gambling, lottery, betting, or wagering language found",
  );
  addSuspicious(
    reasons,
    flags,
    !source.officialRulesUrl && !source.hasOfficialRulesContent,
    "hidden-rules",
    "Official rules were not found on the page",
  );
  addSuspicious(reasons, flags, !extracted.sponsor, "missing-sponsor", "No clear sponsor found");
  addSuspicious(reasons, flags, !extracted.deadline, "missing-deadline", "No clear deadline found");
  addSuspicious(
    reasons,
    flags,
    hasImpossiblePrizeClaim(extracted),
    "impossible-prize",
    "Prize claim appears unrealistic or unverifiable",
  );
  addSuspicious(
    reasons,
    flags,
    hasSponsorFormDomainMismatch(sweepstake, extracted),
    "domain-mismatch",
    "Sponsor and form domains do not appear to match",
  );

  return {
    suspicious: reasons.length > 0,
    reasons,
    flags,
  };
}

function addSuspicious(reasons: string[], flags: RiskFlag[], condition: boolean, code: string, label: string) {
  if (!condition) return;
  reasons.push(label);
  flags.push({ code, label, severity: "high" });
}

function hasImpossiblePrizeClaim(extracted: RulesExtractionData) {
  const text = `${extracted.prizeSummary ?? ""}\n${extracted.redFlags.join("\n")}`.toLowerCase();
  if (/\b(impossible|too good to be true|guaranteed winner|everyone wins|claim now|unlimited cash)\b/.test(text)) {
    return true;
  }
  return (extracted.approximateRetailValue ?? 0) >= 10_000_000 && !extracted.sponsor;
}

function hasSponsorFormDomainMismatch(sweepstake: Sweepstake, extracted: RulesExtractionData) {
  if (!extracted.formUrl || !extracted.sponsor) return false;

  const formDomain = safeRegistrableDomain(extracted.formUrl);
  const pageDomain = safeRegistrableDomain(sweepstake.url);
  if (!formDomain || formDomain === pageDomain) return false;

  const sponsorDomain = extractDomainFromText(extracted.sponsor);
  if (sponsorDomain) {
    return sponsorDomain !== formDomain;
  }

  const sponsorTokens = extracted.sponsor
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["sweepstakes", "giveaway", "company", "corporation", "limited"].includes(token));

  return sponsorTokens.length > 0 && !sponsorTokens.some((token) => formDomain.replace(/[^a-z0-9]/g, "").includes(token));
}

function toLegacyRules(extracted: RulesExtractionData): SweepstakesRules {
  return {
    prizeDescription: extracted.prizeSummary ?? "Prize summary not found.",
    prizeRetailValue: extracted.approximateRetailValue,
    startAt: null,
    endAt: extracted.deadline,
    eligibleCountries: extracted.allowedCountries,
    eligibleStates: extracted.allowedStates,
    minAge: extracted.minimumAge,
    entryFrequency: extracted.entryFrequency ?? "Unknown",
    purchaseRequired: extracted.purchaseOrPaymentRequested,
    accountRequired: false,
    captchaLikely: extracted.captchaPresent,
    socialFollowRequired: false,
    judgingCriteria: null,
    disqualifiers: extracted.redFlags,
    plainEnglishSummary: extracted.eligibility ?? extracted.prizeSummary ?? "Rules extracted; review details before entering.",
    sourceConfidence: extracted.sourceConfidence,
  };
}

function buildExtractionSummary(extracted: RulesExtractionData, reasons: string[]) {
  const summary = extracted.prizeSummary ?? extracted.eligibility ?? "Rules extracted for review.";
  if (!reasons.length) {
    return summary;
  }
  return `${summary} Suspicious signals: ${reasons.join("; ")}.`;
}

function getOpenAIOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }

  return null;
}

async function assertRobotsAllowed(targetUrl: string) {
  const target = new URL(targetUrl);
  const robotsUrl = `${target.origin}/robots.txt`;

  try {
    const response = await fetchWithTimeout(robotsUrl, ROBOTS_TIMEOUT_MS, {
      headers: {
        accept: "text/plain,*/*;q=0.3",
        "user-agent": USER_AGENT,
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return;
    }
    const robotsText = await readLimitedText(response, 120_000);
    if (isRobotsDisallowed(robotsText, `${target.pathname}${target.search}`)) {
      throw new Error(`Robots.txt disallows automated reads for ${targetUrl}; extraction stopped.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Robots.txt disallows")) {
      throw error;
    }
    console.warn(`[extraction] Could not read robots.txt for ${target.origin}; continuing with one polite read.`);
  }
}

function isRobotsDisallowed(robotsText: string, pathAndSearch: string) {
  type Group = { agents: string[]; rules: Array<{ type: "allow" | "disallow"; path: string }> };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      current = null;
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ type: key, path: value });
    }
  }

  const applicableRules = groups
    .filter((group) => group.agents.some((agent) => agent === "*" || USER_AGENT.toLowerCase().includes(agent)))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path.length > 0 && robotsPathMatches(rule.path, pathAndSearch))
    .sort((a, b) => b.path.length - a.path.length);

  return applicableRules[0]?.type === "disallow";
}

function robotsPathMatches(rulePath: string, targetPath: string) {
  const normalizedRule = rulePath.split("*")[0] ?? "";
  if (!normalizedRule) return false;
  return targetPath.startsWith(normalizedRule);
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out while loading ${url}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`Response too large to inspect safely (${contentLength} bytes).`);
  }

  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded safe inspection limit (${maxBytes} bytes).`);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(concatChunks(chunks, received));
}

function concatChunks(chunks: Uint8Array[], length: number) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function extractVisibleText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|section|article|li|tr|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    const named: Record<string, string> = {
      amp: "&",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
      apos: "'",
    };
    const lower = token.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return entity;
  });
}

function findOfficialRulesLink(html: string, baseUrl: string) {
  return findAnchorUrl(html, baseUrl, (label, href) => {
    const haystack = `${label} ${href}`.toLowerCase();
    return /\bofficial\s+rules\b|\brules\s+and\s+regulations\b|\bterms\s+and\s+conditions\b/.test(haystack);
  });
}

function findFormUrl(html: string, baseUrl: string) {
  const formAction = findFormAction(html, baseUrl);
  if (formAction) return formAction;

  return findAnchorUrl(html, baseUrl, (label, href) => {
    const haystack = `${label} ${href}`.toLowerCase();
    return /\b(enter|entry|submit|start|play)\b/.test(haystack) && /\b(sweepstakes|giveaway|contest|win|entry|enter)\b/.test(haystack);
  });
}

function findAnchorUrl(html: string, baseUrl: string, predicate: (label: string, href: string) => boolean) {
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);
  for (const anchor of anchors) {
    const href = readHtmlAttribute(anchor[1] ?? "", "href");
    if (!href || isNonHttpHref(href)) continue;
    const label = extractVisibleText(anchor[2] ?? "");
    if (!predicate(label, href)) continue;
    const resolved = resolveHttpUrl(href, baseUrl);
    if (resolved) return resolved;
  }
  return null;
}

function findFormAction(html: string, baseUrl: string) {
  const forms = html.matchAll(/<form\b([^>]*)>/gi);
  for (const form of forms) {
    const action = readHtmlAttribute(form[1] ?? "", "action");
    if (!action || isNonHttpHref(action)) continue;
    const resolved = resolveHttpUrl(action, baseUrl);
    if (resolved) return resolved;
  }
  return null;
}

function readHtmlAttribute(source: string, name: string) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = source.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function resolveHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(decodeHtmlEntities(value), baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isNonHttpHref(value: string) {
  return /^(mailto|tel|javascript|data):/i.test(value) || value.trim() === "#";
}

function hasCaptchaMarkup(text: string) {
  return /\b(recaptcha|hcaptcha|g-recaptcha|cf-turnstile|captcha)\b/i.test(text);
}

function hasPaymentLanguage(text: string) {
  const lower = text.toLowerCase();
  return (
    /\b(payment|credit card|debit card|checkout|shipping fee|processing fee|buy now|required purchase)\b/i.test(lower) ||
    (/\bpurchase required\b/i.test(lower) && !/\bno purchase required\b/i.test(lower))
  );
}

function hasSsnLanguage(text: string) {
  return /\b(ssn|social security number|social security)\b/i.test(text);
}

function hasBankingLanguage(text: string) {
  return /\b(bank account|routing number|wire transfer|ach|iban|swift code)\b/i.test(text);
}

function hasGamblingOrLotteryLanguage(text: string) {
  return /\b(casino|sportsbook|betting|wager|wagering|gambling|lottery ticket|paid lottery|scratch[- ]?off|deposit to enter)\b/i.test(
    text,
  );
}

function truncateForModel(value: string) {
  if (value.length <= MAX_MODEL_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_MODEL_TEXT_CHARS)}\n\n[Truncated for model input]`;
}

function assertHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs can be inspected.");
  }
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/$/, "");
  }
  return url.toString();
}

function safeRegistrableDomain(value: string) {
  try {
    return getRegistrableDomain(value);
  } catch {
    return null;
  }
}

function extractDomainFromText(value: string) {
  const match = value.toLowerCase().match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/);
  if (!match?.[1]) return null;
  return safeRegistrableDomain(`https://${match[1]}`);
}

function dedupeRiskFlags(flags: RiskFlag[]) {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    if (seen.has(flag.code)) return false;
    seen.add(flag.code);
    return true;
  });
}

function dedupeNotes(notes: string[]) {
  return [...new Set(notes.filter(Boolean))];
}

const nullableStringJsonSchema = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumberJsonSchema = { anyOf: [{ type: "number" }, { type: "null" }] };
const stringArrayJsonSchema = { type: "array", items: { type: "string" } };

const openAiRulesExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "sponsor",
    "prizeSummary",
    "approximateRetailValue",
    "deadline",
    "eligibility",
    "allowedStates",
    "allowedCountries",
    "minimumAge",
    "entryFrequency",
    "noPurchaseMethod",
    "formUrl",
    "redFlags",
    "captchaPresent",
    "purchaseOrPaymentRequested",
    "ssnRequested",
    "bankingInfoRequested",
    "officialRulesUrl",
    "sourceConfidence",
  ],
  properties: {
    title: nullableStringJsonSchema,
    sponsor: nullableStringJsonSchema,
    prizeSummary: nullableStringJsonSchema,
    approximateRetailValue: nullableNumberJsonSchema,
    deadline: nullableStringJsonSchema,
    eligibility: nullableStringJsonSchema,
    allowedStates: stringArrayJsonSchema,
    allowedCountries: stringArrayJsonSchema,
    minimumAge: nullableNumberJsonSchema,
    entryFrequency: nullableStringJsonSchema,
    noPurchaseMethod: nullableStringJsonSchema,
    formUrl: nullableStringJsonSchema,
    redFlags: stringArrayJsonSchema,
    captchaPresent: { type: "boolean" },
    purchaseOrPaymentRequested: { type: "boolean" },
    ssnRequested: { type: "boolean" },
    bankingInfoRequested: { type: "boolean" },
    officialRulesUrl: nullableStringJsonSchema,
    sourceConfidence: { type: "number", minimum: 0, maximum: 1 },
  },
};
