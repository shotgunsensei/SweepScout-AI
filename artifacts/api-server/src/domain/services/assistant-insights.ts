import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { AppConfigError, getAppConfig, requireOpenAIAccess, type OpenAIAccess } from "@/lib/env";
import { getEntryTrackingData, type EntryQueueItem } from "@/lib/services/entry-tracking";
import { getStore } from "@/lib/storage/store";
import type { EntryLog, Sweepstake, UserProfile } from "@/lib/types";

export type AssistantIntent =
  | "risk_explanation"
  | "rules_summary"
  | "compare"
  | "can_i_enter"
  | "manual_checklist"
  | "missing_information"
  | "recommend_today"
  | "general";

export type AssistantSourceRef = {
  id: string;
  sweepstakeId: string | null;
  title: string;
  field: string;
  snippet: string;
};

export type AssistantAnswer = {
  intent: AssistantIntent;
  answer: string;
  bullets: string[];
  warnings: string[];
  missingInformation: string[];
  recommendedSweepstakeIds: string[];
  sources: AssistantSourceRef[];
  grounded: true;
  usedOpenAI: boolean;
  model: string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

const assistantRequestSchema = z
  .object({
    intent: z
      .enum([
        "risk_explanation",
        "rules_summary",
        "compare",
        "can_i_enter",
        "manual_checklist",
        "missing_information",
        "recommend_today",
        "general",
      ])
      .default("general"),
    sweepstakeId: z.string().trim().optional(),
    compareSweepstakeId: z.string().trim().optional(),
    question: z.string().trim().max(800).optional(),
  })
  .strict();

const modelAnswerSchema = z
  .object({
    answer: z.string().trim().min(1),
    bullets: z.array(z.string().trim().min(1)).max(8),
    warnings: z.array(z.string().trim().min(1)).max(6),
    missingInformation: z.array(z.string().trim().min(1)).max(10),
    recommendedSweepstakeIds: z.array(z.string().trim().min(1)).max(8),
  })
  .strict();

const modelAnswerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "bullets", "warnings", "missingInformation", "recommendedSweepstakeIds"],
  properties: {
    answer: { type: "string" },
    bullets: { type: "array", maxItems: 8, items: { type: "string" } },
    warnings: { type: "array", maxItems: 6, items: { type: "string" } },
    missingInformation: { type: "array", maxItems: 10, items: { type: "string" } },
    recommendedSweepstakeIds: { type: "array", maxItems: 8, items: { type: "string" } },
  },
};

type AssistantContext = {
  profile: UserProfile;
  sweepstakes: Sweepstake[];
  entries: EntryLog[];
  primary: Sweepstake | null;
  secondary: Sweepstake | null;
  recommendations: EntryQueueItem[];
  sources: AssistantSourceRef[];
};

export async function answerSweepScoutAssistant(rawInput: unknown): Promise<AssistantAnswer> {
  const input = assistantRequestSchema.parse(rawInput);
  const context = await buildAssistantContext(input);
  const deterministic = buildDeterministicAnswer(input, context);
  const config = getAppConfig();

  let answer = deterministic;
  let usedOpenAI = false;
  if (config.openaiConfigured && context.sources.length) {
    try {
      answer = {
        ...deterministic,
        ...(await answerWithOpenAI(input, context, deterministic, requireOpenAIAccess())),
      };
      usedOpenAI = true;
    } catch (error) {
      answer.warnings = [
        ...answer.warnings,
        error instanceof AppConfigError
          ? error.message
          : `OpenAI assistant fallback used: ${error instanceof Error ? error.message : "model request failed"}.`,
      ];
    }
  }

  const finalAnswer: AssistantAnswer = {
    ...answer,
    intent: input.intent,
    sources: context.sources,
    grounded: true,
    usedOpenAI,
    model: usedOpenAI ? config.openaiModel : "deterministic-grounded-fallback",
  };

  await writeAuditLog({
    actorId: null,
    action: "assistant.answer_generated",
    entityType: "assistant",
    entityId: input.sweepstakeId ?? input.intent,
    severity: "info",
    message: `AI assistant generated a grounded ${input.intent} answer.`,
    metadata: {
      intent: input.intent,
      sweepstakeId: input.sweepstakeId ?? null,
      compareSweepstakeId: input.compareSweepstakeId ?? null,
      usedOpenAI,
      sourceCount: context.sources.length,
    },
  });

  return finalAnswer;
}

async function buildAssistantContext(input: z.infer<typeof assistantRequestSchema>): Promise<AssistantContext> {
  const store = await getStore();
  const [sweepstakes, entries, profile, tracking] = await Promise.all([
    store.listSweepstakes(),
    store.listEntryLogs(),
    store.getUserProfile(),
    getEntryTrackingData(),
  ]);
  const primary = input.sweepstakeId ? sweepstakes.find((item) => item.id === input.sweepstakeId) ?? null : null;
  const secondary = input.compareSweepstakeId
    ? sweepstakes.find((item) => item.id === input.compareSweepstakeId) ?? null
    : null;
  const recommendations = tracking.eligibleQueue
    .slice()
    .sort((a, b) => {
      const prizeDelta = (b.sweepstake.prizeRetailValue ?? 0) - (a.sweepstake.prizeRetailValue ?? 0);
      return prizeDelta || b.sweepstake.eligibilityScore - a.sweepstake.eligibilityScore || a.sweepstake.scamScore - b.sweepstake.scamScore;
    })
    .slice(0, 6);

  return {
    profile,
    sweepstakes,
    entries,
    primary,
    secondary,
    recommendations,
    sources: buildSources({ sweepstakes, entries, primary, secondary, recommendations }),
  };
}

function buildDeterministicAnswer(input: z.infer<typeof assistantRequestSchema>, context: AssistantContext) {
  if (input.intent === "recommend_today") return recommendTodayAnswer(context);
  if (!context.primary) {
    return {
      answer: "Select a stored sweepstakes record so SweepScout can answer using saved rules and scoring data.",
      bullets: ["No sweepstakes record was selected for this assistant request."],
      warnings: ["The assistant does not answer from general web knowledge."],
      missingInformation: ["Selected sweepstakes record"],
      recommendedSweepstakeIds: context.recommendations.map((item) => item.sweepstake.id),
    };
  }

  if (input.intent === "risk_explanation") return riskAnswer(context.primary);
  if (input.intent === "rules_summary") return rulesSummaryAnswer(context.primary);
  if (input.intent === "compare") return compareAnswer(context.primary, context.secondary);
  if (input.intent === "can_i_enter") return eligibilityAnswer(context.primary, context.profile);
  if (input.intent === "manual_checklist") return checklistAnswer(context.primary);
  if (input.intent === "missing_information") return missingInfoAnswer(context.primary);
  return generalAnswer(context.primary, input.question);
}

function riskAnswer(sweepstake: Sweepstake) {
  const riskSignals = [
    ...sweepstake.riskFlags.map((flag) => `${flag.label} (${flag.severity})`),
    ...sweepstake.complianceNotes.filter((note) => /review|risk|purchase|captcha|missing|rejected|blocked/i.test(note)),
  ];
  return {
    answer: `${sweepstake.title} has a stored risk score of ${sweepstake.scamScore}/100 and status ${sweepstake.status}.`,
    bullets: dedupe([
      `Eligibility score: ${sweepstake.eligibilityScore}/100.`,
      `Prize value: ${money(sweepstake.prizeRetailValue)}.`,
      `Entry frequency: ${sweepstake.entryFrequency || "Unknown"}.`,
      ...riskSignals,
    ]).slice(0, 8),
    warnings: safetyWarnings(sweepstake),
    missingInformation: missingFields(sweepstake),
    recommendedSweepstakeIds: [],
  };
}

function rulesSummaryAnswer(sweepstake: Sweepstake) {
  const rules = sweepstake.extractedRules;
  return {
    answer: `Stored rules summary for ${sweepstake.title}.`,
    bullets: [
      `Sponsor: ${sweepstake.sponsor}.`,
      `Prize: ${rules?.prizeSummary ?? money(sweepstake.prizeRetailValue)}.`,
      `Deadline: ${rules?.deadline ?? sweepstake.endAt ?? "Not captured"}.`,
      `Eligibility: ${(rules?.eligibility ?? sweepstake.eligibilitySummary) || "Not captured"}.`,
      `Entry frequency: ${(rules?.entryFrequency ?? sweepstake.entryFrequency) || "Unknown"}.`,
      `No-purchase method: ${rules?.noPurchaseMethod ?? (sweepstake.noPurchaseMethodFound ? "Not found" : "Not captured")}.`,
    ],
    warnings: safetyWarnings(sweepstake),
    missingInformation: missingFields(sweepstake),
    recommendedSweepstakeIds: [],
  };
}

function compareAnswer(primary: Sweepstake, secondary: Sweepstake | null) {
  if (!secondary) {
    return {
      answer: "Select a second sweepstakes record to compare.",
      bullets: [`Primary selection: ${primary.title}.`],
      warnings: [],
      missingInformation: ["Second sweepstakes record"],
      recommendedSweepstakeIds: [],
    };
  }
  const betterRisk = primary.scamScore <= secondary.scamScore ? primary : secondary;
  const betterPrize = (primary.prizeRetailValue ?? 0) >= (secondary.prizeRetailValue ?? 0) ? primary : secondary;
  const betterEligibility = primary.eligibilityScore >= secondary.eligibilityScore ? primary : secondary;
  return {
    answer: `${betterEligibility.title} has the stronger eligibility score; ${betterRisk.title} has the lower stored risk score.`,
    bullets: [
      `${primary.title}: risk ${primary.scamScore}, eligibility ${primary.eligibilityScore}, prize ${money(primary.prizeRetailValue)}, deadline ${primary.endAt ?? "not captured"}.`,
      `${secondary.title}: risk ${secondary.scamScore}, eligibility ${secondary.eligibilityScore}, prize ${money(secondary.prizeRetailValue)}, deadline ${secondary.endAt ?? "not captured"}.`,
      `Best prize value: ${betterPrize.title}.`,
      `Lower risk: ${betterRisk.title}.`,
      `Higher eligibility: ${betterEligibility.title}.`,
    ],
    warnings: [...safetyWarnings(primary), ...safetyWarnings(secondary)].slice(0, 6),
    missingInformation: [...missingFields(primary), ...missingFields(secondary)].slice(0, 10),
    recommendedSweepstakeIds: [betterEligibility.id],
  };
}

function eligibilityAnswer(sweepstake: Sweepstake, profile: UserProfile) {
  const hardNo = ["ineligible", "expired", "rejected"].includes(sweepstake.status);
  const needsReview =
    sweepstake.status === "suspicious" ||
    sweepstake.status === "needs_review" ||
    sweepstake.purchaseRequired ||
    sweepstake.noPurchaseMethodFound ||
    missingFields(sweepstake).length > 0;
  const answer = hardNo
    ? "Based on stored data, do not enter this sweepstakes right now."
    : needsReview
      ? "Maybe, but only after manual review resolves the stored risk and missing-rule items."
      : "Based on stored data, you appear eligible to enter manually after reviewing the official rules.";
  return {
    answer,
    bullets: [
      `Stored status: ${sweepstake.status}.`,
      `Profile location: ${profile.city || "city not set"}, ${profile.state || "state not set"}, ${profile.country || "country not set"}.`,
      `Eligibility score: ${sweepstake.eligibilityScore}/100.`,
      `Eligible states captured: ${sweepstake.stateEligibility.length ? sweepstake.stateEligibility.join(", ") : "not captured"}.`,
      `Minimum age captured: ${sweepstake.ageRequirement ?? "not captured"}.`,
      `Deadline: ${sweepstake.endAt ?? "not captured"}.`,
    ],
    warnings: safetyWarnings(sweepstake),
    missingInformation: missingFields(sweepstake),
    recommendedSweepstakeIds: hardNo ? [] : [sweepstake.id],
  };
}

function checklistAnswer(sweepstake: Sweepstake) {
  return {
    answer: `Safe manual-entry checklist for ${sweepstake.title}.`,
    bullets: [
      `Open and review the stored official rules URL: ${sweepstake.rulesUrl ?? "not captured"}.`,
      `Confirm eligibility: ${sweepstake.eligibilitySummary || "not captured"}.`,
      `Confirm deadline and frequency: ${sweepstake.endAt ?? "deadline not captured"}; ${sweepstake.entryFrequency || "frequency not captured"}.`,
      "Confirm no purchase, payment, SSN, banking, or unsupported sensitive data is requested before winner verification.",
      "Complete CAPTCHA, account login, terms, and final submit manually.",
      "Record the submission timestamp and confirmation code in SweepScout after submission.",
    ],
    warnings: safetyWarnings(sweepstake),
    missingInformation: missingFields(sweepstake),
    recommendedSweepstakeIds: [sweepstake.id],
  };
}

function missingInfoAnswer(sweepstake: Sweepstake) {
  const missing = missingFields(sweepstake);
  return {
    answer: missing.length
      ? `${sweepstake.title} is missing ${missing.length} important field${missing.length === 1 ? "" : "s"} before confident entry.`
      : `${sweepstake.title} has the core rules fields captured in SweepScout.`,
    bullets: missing.length ? missing : ["Official rules URL, deadline, eligibility, prize, and entry frequency are present."],
    warnings: safetyWarnings(sweepstake),
    missingInformation: missing,
    recommendedSweepstakeIds: missing.length ? [] : [sweepstake.id],
  };
}

function recommendTodayAnswer(context: AssistantContext) {
  const recommendations = context.recommendations;
  return {
    answer: recommendations.length
      ? "Highest-value eligible entries today are ranked by prize value, eligibility score, and lower risk."
      : "No eligible repeatable entries are currently ready in the stored daily queue.",
    bullets: recommendations.map(
      (item, index) =>
        `${index + 1}. ${item.sweepstake.title}: ${money(item.sweepstake.prizeRetailValue)}, eligibility ${item.sweepstake.eligibilityScore}, risk ${item.sweepstake.scamScore}, ${item.frequencyLabel}.`,
    ),
    warnings: ["Manual approval remains required. SweepScout does not submit entries or bypass CAPTCHA."],
    missingInformation: [],
    recommendedSweepstakeIds: recommendations.map((item) => item.sweepstake.id),
  };
}

function generalAnswer(sweepstake: Sweepstake, question?: string) {
  const risk = riskAnswer(sweepstake);
  return {
    answer: question
      ? `Using the stored record for ${sweepstake.title}, SweepScout can answer this from the captured risk, eligibility, and rules data.`
      : risk.answer,
    bullets: risk.bullets,
    warnings: risk.warnings,
    missingInformation: risk.missingInformation,
    recommendedSweepstakeIds: risk.recommendedSweepstakeIds,
  };
}

async function answerWithOpenAI(
  input: z.infer<typeof assistantRequestSchema>,
  context: AssistantContext,
  deterministic: Omit<AssistantAnswer, "intent" | "sources" | "grounded" | "usedOpenAI" | "model">,
  access: OpenAIAccess,
) {
  const config = getAppConfig();
  const response = await fetch(`${access.baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${access.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      instructions:
        "You are the SweepScout AI assistant. Answer only from SOURCE CONTEXT. If the context does not contain a fact, say it is missing. Never advise auto-submit, CAPTCHA bypass, purchases, payment entry, SSN storage, or opening claim links without user review. Return JSON only.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Capability: ${input.intent}`,
                `User question: ${input.question ?? "not provided"}`,
                "",
                "Deterministic app answer to refine without adding outside facts:",
                JSON.stringify(deterministic),
                "",
                "SOURCE CONTEXT:",
                context.sources.map((source) => `[${source.id}] ${source.title} | ${source.field}: ${source.snippet}`).join("\n\n"),
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sweepscout_grounded_assistant_answer",
          strict: true,
          schema: modelAnswerJsonSchema,
        },
      },
    }),
  });
  const json = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `OpenAI assistant failed with HTTP ${response.status}.`);
  }
  const text = getOpenAIOutputText(json);
  if (!text) throw new Error("OpenAI assistant did not return text.");
  return modelAnswerSchema.parse(JSON.parse(text));
}

function buildSources(input: {
  sweepstakes: Sweepstake[];
  entries: EntryLog[];
  primary: Sweepstake | null;
  secondary: Sweepstake | null;
  recommendations: EntryQueueItem[];
}) {
  const selected = new Map<string, Sweepstake>();
  for (const item of [input.primary, input.secondary]) {
    if (item) selected.set(item.id, item);
  }
  for (const item of input.recommendations) {
    selected.set(item.sweepstake.id, item.sweepstake);
  }
  if (!selected.size) {
    for (const item of input.sweepstakes.slice(0, 6)) selected.set(item.id, item);
  }

  const sources: AssistantSourceRef[] = [];
  for (const sweepstake of selected.values()) {
    addSource(sources, sweepstake, "record", [
      `Status ${sweepstake.status}`,
      `Risk ${sweepstake.scamScore}`,
      `Eligibility ${sweepstake.eligibilityScore}`,
      `Prize ${money(sweepstake.prizeRetailValue)}`,
      `Deadline ${sweepstake.endAt ?? "not captured"}`,
      `Frequency ${sweepstake.entryFrequency || "unknown"}`,
    ].join("; "));
    if (sweepstake.extractedRules) addSource(sources, sweepstake, "extracted_rules", JSON.stringify(sweepstake.extractedRules));
    if (sweepstake.rulesText) addSource(sources, sweepstake, "official_rules_text", sweepstake.rulesText);
    if (sweepstake.complianceNotes.length) addSource(sources, sweepstake, "compliance_notes", sweepstake.complianceNotes.join(" "));
    const relatedEntries = input.entries.filter((entry) => entry.sweepstakeId === sweepstake.id).slice(0, 5);
    if (relatedEntries.length) {
      addSource(
        sources,
        sweepstake,
        "entry_history",
        relatedEntries.map((entry) => `${entry.status} at ${entry.attemptedAt}: ${entry.notes}`).join(" "),
      );
    }
  }
  return sources.slice(0, 18);
}

function addSource(sources: AssistantSourceRef[], sweepstake: Sweepstake, field: string, value: string) {
  const snippet = value.replace(/\s+/g, " ").trim().slice(0, 900);
  if (!snippet) return;
  sources.push({
    id: `S${sources.length + 1}`,
    sweepstakeId: sweepstake.id,
    title: sweepstake.title,
    field,
    snippet,
  });
}

function safetyWarnings(sweepstake: Sweepstake) {
  const warnings = ["Manual approval required. No auto-submit, CAPTCHA bypass, payment, SSN, or banking storage."];
  if (sweepstake.purchaseRequired) warnings.push("Purchase or payment language is captured.");
  if (sweepstake.noPurchaseMethodFound) warnings.push("No no-purchase entry method is captured.");
  if (sweepstake.hasCaptcha) warnings.push("CAPTCHA or bot protection may be present and must remain manual.");
  if (sweepstake.extractedRules?.ssnRequested) warnings.push("SSN appears in the extracted rules or form text.");
  if (sweepstake.extractedRules?.bankingInfoRequested) warnings.push("Banking information appears in the extracted rules or form text.");
  return dedupe(warnings).slice(0, 6);
}

function missingFields(sweepstake: Sweepstake) {
  const missing: string[] = [];
  if (!sweepstake.rulesUrl) missing.push("Official rules URL");
  if (!sweepstake.rulesText && !sweepstake.extractedRules) missing.push("Stored official rules text");
  if (!sweepstake.endAt) missing.push("Deadline");
  if (!sweepstake.entryFrequency || sweepstake.entryFrequency === "Unknown") missing.push("Entry frequency");
  if (sweepstake.prizeRetailValue === null) missing.push("Prize retail value");
  if (!sweepstake.eligibilitySummary) missing.push("Eligibility summary");
  if (sweepstake.noPurchaseMethodFound) missing.push("No-purchase entry method");
  return missing;
}

function getOpenAIOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  return null;
}

function money(value: number | null) {
  if (value === null) return "unknown value";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
