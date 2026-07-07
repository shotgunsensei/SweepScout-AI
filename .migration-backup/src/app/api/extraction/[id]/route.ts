import { jsonError, jsonOk, jsonRateLimitError } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { runRulesExtraction } from "@/lib/services/openai-extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const limit = checkRequestRateLimit(request, "rules-extraction", 10, 60 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Rules extraction rate limit exceeded. Try again later.", limit.resetAt);
    }
    const { id } = await context.params;
    const result = await runRulesExtraction(id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, error instanceof Error && error.name === "AppConfigError" ? 409 : 500);
  }
}
