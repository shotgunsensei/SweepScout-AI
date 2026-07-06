import { writeAuditLog } from "@/lib/audit";
import { jsonError, jsonOk, jsonRateLimitError } from "@/lib/http";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { scoreSweepstake } from "@/lib/scoring";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const limit = checkRequestRateLimit(request, "scoring", 30, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Scoring rate limit exceeded. Try again later.", limit.resetAt);
    }
    const { id } = await context.params;
    const store = await getStore();
    const sweepstake = await store.getSweepstake(id);
    if (!sweepstake) {
      return jsonError(new Error("Sweepstake not found."), 404);
    }
    const profile = await store.getUserProfile();
    const scored = scoreSweepstake(sweepstake, profile, undefined, await store.listSweepstakes());
    const updated = await store.saveSweepstake({
      ...sweepstake,
      ...scored,
      updatedAt: new Date().toISOString(),
    });
    await writeAuditLog({
      actorId: null,
      action: "sweepstake.scored",
      entityType: "sweepstake",
      entityId: updated.id,
      severity: updated.status === "eligible" ? "info" : "warn",
      message: `Sweepstake scored as ${updated.status}.`,
      metadata: { scamScore: updated.scamScore, eligibilityScore: updated.eligibilityScore },
    });
    return jsonOk({
      status: updated.status,
      scam_score: updated.scamScore,
      compliance_notes: updated.complianceNotes,
      sweepstake: updated,
    });
  } catch (error) {
    return jsonError(error);
  }
}
