import { z } from "zod";
import { jsonError, jsonOk, jsonRateLimitError, readJson } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { recordEntryAttempt } from "@/lib/services/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entrySchema = z.object({
  sweepstakeId: z.string().min(1),
  userApproved: z.boolean(),
  reviewConfirmed: z.boolean(),
  purchaseRequiredAcknowledged: z.boolean().default(false),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "entries", 20, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Entry logging rate limit exceeded. Try again later.", limit.resetAt);
    }
    const body = entrySchema.parse(await readJson(request));
    return jsonOk(await recordEntryAttempt(body), { status: 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
