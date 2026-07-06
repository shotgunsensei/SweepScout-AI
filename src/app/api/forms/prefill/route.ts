import { jsonError, jsonOk, jsonRateLimitError, readJson } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { runAssistedFormPrefill, type PrefillFormInput } from "@/lib/services/form-prefill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "forms-prefill", 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Assisted prefill rate limit exceeded. Try again later.", limit.resetAt);
    }
    const input = await readJson<PrefillFormInput>(request);
    const result = await runAssistedFormPrefill(input);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, error instanceof Error && error.message.includes("approval") ? 400 : 500);
  }
}
