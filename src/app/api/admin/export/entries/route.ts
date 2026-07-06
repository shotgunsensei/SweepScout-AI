import { AdminAccessError, entriesToCsv, requireAdmin } from "@/lib/admin";
import { jsonError, jsonRateLimitError } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "admin-export", 10, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Admin export rate limit exceeded. Try again later.", limit.resetAt);
    }
    await requireAdmin();
    const store = await getStore();
    const entries = await store.listEntryLogs();
    return new Response(entriesToCsv(entries), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="sweepscout-entries-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error, error instanceof AdminAccessError ? 403 : 500);
  }
}
