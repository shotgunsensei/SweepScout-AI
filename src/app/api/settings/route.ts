import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { jsonError, jsonOk, jsonRateLimitError, readJson } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  automatedDiscoveryEnabled: z.boolean().default(false),
  formPrefillEnabled: z.boolean().default(false),
  discoveryCadence: z.string().min(1),
  minEligibilityScore: z.coerce.number().int().min(0).max(100),
  maxScamScore: z.coerce.number().int().min(0).max(100),
  requireApprovalForEveryEntry: z.boolean().optional().default(true),
  dailyEntryLimit: z.coerce.number().int().min(1).max(100),
  notificationsEmail: z.string().email(),
}).strict();

export async function PUT(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "settings", 20, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Settings update rate limit exceeded. Try again later.", limit.resetAt);
    }
    const settings = settingsSchema.parse(await readJson(request));
    const store = await getStore();
    const saved = await store.saveSettings({ ...settings, requireApprovalForEveryEntry: true });
    await writeAuditLog({
      actorId: null,
      action: "settings.updated",
      entityType: "settings",
      entityId: "default",
      severity: saved.formPrefillEnabled || saved.automatedDiscoveryEnabled ? "warn" : "info",
      message: "Safety settings updated. Manual approval remains locked on.",
      metadata: {
        automatedDiscoveryEnabled: saved.automatedDiscoveryEnabled,
        formPrefillEnabled: saved.formPrefillEnabled,
        requireApprovalForEveryEntry: saved.requireApprovalForEveryEntry,
      },
    });
    return jsonOk(saved);
  } catch (error) {
    return jsonError(error, 400);
  }
}
