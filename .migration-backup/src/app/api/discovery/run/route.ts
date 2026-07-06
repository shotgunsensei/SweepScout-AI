import { z } from "zod";
import { jsonError, jsonOk, jsonRateLimitError, readJson } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { createAndRunDiscovery, runDiscoveryJob } from "@/lib/services/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const discoveryRunSchema = z.object({
  jobId: z.string().optional(),
  queries: z.array(z.string().min(1)).max(10).optional(),
  maxResults: z.coerce.number().int().min(1).max(50).optional(),
  domainBlacklist: z.array(z.string().min(1)).max(100).optional(),
  provider: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "discovery", 5, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Discovery rate limit exceeded. Try again later.", limit.resetAt);
    }

    const body = discoveryRunSchema.parse(await readJson(request));
    const result = body.jobId ? await runDiscoveryJob(body.jobId, body) : await createAndRunDiscovery(body);

    return jsonOk({
      rateLimit: {
        remaining: limit.remaining,
        resetAt: new Date(limit.resetAt).toISOString(),
      },
      result,
    });
  } catch (error) {
    return jsonError(error, error instanceof z.ZodError ? 400 : 500);
  }
}
