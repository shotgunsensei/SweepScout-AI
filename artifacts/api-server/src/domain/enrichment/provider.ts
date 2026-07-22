import { parseSweepstakesExtraction } from "./schema";
import type { EnrichmentInput, EnrichmentProvider, ProviderResult } from "./types";

export const ENRICHMENT_PROMPT_VERSION = "play-pack-pilot-enrichment-v1";
export const PROVIDER_DEFAULTS = { timeoutMs: 20_000, maxAttempts: 3, maxInputCharacters: 80_000, retryDelayMs: 250 } as const;

export class EnrichmentProviderError extends Error {
  constructor(message: string, readonly code: "timeout" | "malformed_output" | "provider_error", readonly retryable = false) { super(message); this.name = "EnrichmentProviderError"; }
}

export async function extractWithResilience(provider: EnrichmentProvider, input: EnrichmentInput, options: Partial<typeof PROVIDER_DEFAULTS> = {}): Promise<ProviderResult> {
  const config = { ...PROVIDER_DEFAULTS, ...options };
  if (input.cleanedText.length + (input.rulesText?.length ?? 0) > config.maxInputCharacters) throw new EnrichmentProviderError("Source content exceeds the configured safety limit.", "provider_error");
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new EnrichmentProviderError("AI provider timed out.", "timeout", true)); }, config.timeoutMs);
    });
    try {
      const result = await Promise.race([provider.extract(input, controller.signal), timeout]);
      return { ...result, extraction: parseSweepstakesExtraction(result.extraction) };
    } catch (error) {
      lastError = error;
      const normalized = normalizeError(error, controller.signal.aborted);
      if (!normalized.retryable || attempt === config.maxAttempts) throw normalized;
      await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs * attempt));
    } finally { clearTimeout(timer!); }
  }
  throw normalizeError(lastError, false);
}

export class OpenAIEnrichmentProvider implements EnrichmentProvider {
  readonly name = "openai";
  readonly promptVersion = ENRICHMENT_PROMPT_VERSION;
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly endpoint = "https://api.openai.com/v1/responses",
    private readonly transport: typeof fetch = fetch,
    private readonly pricing = {
      inputPerMillion: Number(process.env.OPENAI_INPUT_COST_PER_MILLION_USD ?? 0),
      outputPerMillion: Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION_USD ?? 0),
    },
  ) {}

  async extract(input: EnrichmentInput, signal: AbortSignal): Promise<ProviderResult> {
    const response = await this.transport(this.endpoint, {
      method: "POST", signal, headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: [{ role: "system", content: [{ type: "input_text", text: systemPrompt }] }, { role: "user", content: [{ type: "input_text", text: buildPrivacySafeInput(input) }] }],
        text: { format: { type: "json_schema", name: "sweepstakes_extraction", strict: true, schema: toJsonSchemaDescription() } },
      }),
    });
    if (!response.ok) throw new EnrichmentProviderError(`AI provider returned HTTP ${response.status}.`, "provider_error", response.status === 429 || response.status >= 500);
    const payload = await response.json() as any;
    const raw = payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text;
    if (typeof raw !== "string") throw new EnrichmentProviderError("AI provider did not return structured output.", "malformed_output");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new EnrichmentProviderError("AI provider returned malformed JSON.", "malformed_output"); }
    const inputTokens = Number(payload.usage?.input_tokens ?? 0); const outputTokens = Number(payload.usage?.output_tokens ?? 0);
    return {
      extraction: parseSweepstakesExtraction(parsed), rawResponseId: typeof payload.id === "string" ? payload.id : undefined,
      usage: { inputTokens, outputTokens, estimatedCostUsd: Number(((inputTokens * this.pricing.inputPerMillion + outputTokens * this.pricing.outputPerMillion) / 1_000_000).toFixed(6)) },
    };
  }
}

const systemPrompt = `You extract sweepstakes facts from supplied source text. Return only the required schema. Every field needs a confidence, source reference, short verbatim evidence, location, and extraction timestamp. Use null when the source does not support a value. Never infer legal eligibility, dates, prizes, sponsor identity, or disclosures. If sources conflict, retain the best-supported value with reduced confidence and mention the conflict in evidence.`;
function buildPrivacySafeInput(input: EnrichmentInput) { return JSON.stringify({ sourceReference: input.sourceReference, pageUrl: input.pageUrl, fetchedAt: input.fetchedAt, pageText: input.cleanedText, rulesUrl: input.rulesUrl, rulesText: input.rulesText }); }
function evidenceJson(value: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, required: ["value", "confidence", "sourceReference", "evidence", "location", "extractedAt"], properties: {
    value: { anyOf: [value, { type: "null" }] }, confidence: { type: "number", minimum: 0, maximum: 1 }, sourceReference: { type: "string" }, evidence: { type: "string" },
    location: { type: "object", additionalProperties: false, required: ["pageUrl", "section", "startOffset", "endOffset"], properties: { pageUrl: { type: "string" }, section: nullable({ type: "string" }), startOffset: nullable({ type: "integer", minimum: 0 }), endOffset: nullable({ type: "integer", minimum: 0 }) } },
    extractedAt: { type: "string" },
  } };
}
function nullable(value: Record<string, unknown>) { return { anyOf: [value, { type: "null" }] }; }
function toJsonSchemaDescription() {
  const string = { type: "string" }; const number = { type: "number" }; const integer = { type: "integer" }; const boolean = { type: "boolean" };
  const stringArray = { type: "array", items: string }; const frequency = { type: "string", enum: ["one_time", "daily", "weekly", "monthly", "unlimited", "unknown"] };
  const prize = { type: "object", additionalProperties: false, required: ["name", "quantity", "estimatedValue", "currency"], properties: { name: string, quantity: integer, estimatedValue: nullable(number), currency: string } };
  const method = { type: "object", additionalProperties: false, required: ["methodType", "description", "entryUrl", "frequency", "purchaseRequired", "socialPlatform", "estimatedMinutes"], properties: { methodType: string, description: string, entryUrl: nullable(string), frequency, purchaseRequired: boolean, socialPlatform: nullable(string), estimatedMinutes: nullable(integer) } };
  const properties: Record<string, unknown> = {
    title: evidenceJson(string), sponsor: evidenceJson(string), officialPromotionUrl: evidenceJson(string), officialRulesUrl: evidenceJson(string), officialPromotionId: evidenceJson(string),
    startDate: evidenceJson(string), endDate: evidenceJson(string), timezone: evidenceJson(string), prizes: evidenceJson({ type: "array", items: prize }), eligibleLocations: evidenceJson(stringArray),
    minimumAge: evidenceJson(integer), maximumAge: evidenceJson(integer), entryMethods: evidenceJson({ type: "array", items: method }), entryFrequency: evidenceJson(frequency),
    purchaseRequirements: evidenceJson(string), socialMediaRequirements: evidenceJson(stringArray), employeeExclusions: evidenceJson(string), maximumEntries: evidenceJson(integer),
    sponsorContact: evidenceJson(string), voidWhereProhibited: evidenceJson(boolean), taxDisclosures: evidenceJson(string), winnerNotification: evidenceJson(string), categories: evidenceJson(stringArray),
  };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}
function normalizeError(error: unknown, timedOut: boolean) {
  if (timedOut || (error instanceof Error && error.name === "AbortError")) return new EnrichmentProviderError("AI provider timed out.", "timeout", true);
  if (error instanceof EnrichmentProviderError) return error;
  if (error instanceof Error && error.name === "ZodError") return new EnrichmentProviderError("AI provider output failed structured validation.", "malformed_output");
  return new EnrichmentProviderError("AI provider request failed.", "provider_error", true);
}
