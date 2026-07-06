import { jsonError, jsonOk, jsonRateLimitError } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { approveAssistantTask } from "@/lib/services/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const limit = checkRequestRateLimit(request, "assistant-approve", 30, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Assistant approval rate limit exceeded. Try again later.", limit.resetAt);
    }
    const { id } = await context.params;
    return jsonOk(await approveAssistantTask(id));
  } catch (error) {
    return jsonError(error);
  }
}
