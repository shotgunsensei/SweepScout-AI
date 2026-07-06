import { jsonError, jsonOk, jsonRateLimitError } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { runDiscoveryJob } from "@/lib/services/discovery";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "jobs-discovery", 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Discovery job trigger rate limit exceeded. Try again later.", limit.resetAt);
    }
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (token !== expected) {
        return jsonError(new Error("Unauthorized job trigger."), 401);
      }
    }

    const store = await getStore();
    const settings = await store.getSettings();
    if (!settings.automatedDiscoveryEnabled) {
      return jsonOk({ ran: 0, skipped: "Automated discovery is disabled in settings." });
    }

    const queued = (await store.listDiscoveryJobs()).filter((job) => job.status === "queued");
    const results = [];
    for (const job of queued) {
      results.push(await runDiscoveryJob(job.id));
    }

    return jsonOk({ ran: results.length, results });
  } catch (error) {
    return jsonError(error);
  }
}
