import { BillingRepository } from "@/lib/billing/repository";
import { withPilotCredits } from "@/lib/billing/credits";
import { AppConfigError } from "@/lib/env";

export type AutoExtractTarget = { sweepstakeId: string; title?: string };
export type AutoExtractResult = { sweepstakeId: string; ok: boolean; error?: string; skipped?: boolean };

export type AutoExtractOptions = {
  /**
   * Runs the actual rules extraction for one sweepstake.
   * Injected so it can be replaced in tests without calling OpenAI or the DB.
   */
  runExtraction: (sweepstakeId: string) => Promise<unknown>;
  /** Optional billing repo override — used in tests or SQLite mode to avoid Supabase. */
  billingRepository?: BillingRepository;
};

/**
 * A no-op billing repository for single-tenant SQLite deployments where
 * Supabase is unavailable.  The env-var cap (`SWEEPSCOUT_AUTO_EXTRACT_CAP`)
 * is the sole cost-control mechanism in that mode, so the plan is treated as
 * fully paid and credits are unlimited (consume/refund are no-ops).
 *
 * Extends BillingRepository so it is type-compatible everywhere the real repo
 * is accepted.  It passes an empty client to the parent constructor; the
 * client is never reached because all relevant methods are overridden.
 */
export class LocalBillingRepository extends BillingRepository {
  constructor() {
    // Pass a no-op client — the parent stores it but never calls it because
    // every method withPilotCredits uses is overridden below.
    super({} as any);
  }

  override async subscription(userId: string) {
    // Treat the local operator as Ace Pilot so official_rules_extraction is allowed.
    const now = new Date().toISOString();
    return {
      userId,
      providerSubscriptionId: null,
      providerPriceId: null,
      planKey: "ace_pilot" as const,
      status: "active",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  override async accessPlanOverride(_userId: string) {
    return null;
  }

  override async consume(_userId: string, _input: unknown): Promise<undefined> {
    // No Supabase — cost is governed only by the autoExtractCap env var.
    return undefined;
  }

  override async ledger(_userId: string) {
    return { balance: Number.MAX_SAFE_INTEGER, entries: [] };
  }

  override async refund(_userId: string, _chargeKey: string, _refundKey: string, _metadata?: unknown): Promise<undefined> {
    // No-op: no ledger to adjust.
    return undefined;
  }
}

/**
 * Runs rules extraction for each target sweepstake under the given user's
 * plan entitlement and credit balance.  Errors from plan-ineligibility or
 * insufficient credits are caught and recorded as a skipped/failed result so
 * they never propagate to the caller.
 *
 * Returns one result per target in insertion order.
 */
export async function runAutoExtract(
  targets: AutoExtractTarget[],
  userId: string,
  options: AutoExtractOptions,
): Promise<AutoExtractResult[]> {
  const results: AutoExtractResult[] = [];

  for (const target of targets) {
    try {
      await withPilotCredits({
        userId,
        operation: "official_rules_extraction",
        sourceReference: target.sweepstakeId,
        idempotencyKey: `auto-extract:${target.sweepstakeId}`,
        metadata: { trigger: "auto_discovery" },
        execute: () => options.runExtraction(target.sweepstakeId),
        repository: options.billingRepository,
      });
      results.push({ sweepstakeId: target.sweepstakeId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      // Plan-ineligibility and insufficient credits are expected conditions,
      // not failures — mark them as skipped so the caller can stop early.
      const skipped = error instanceof AppConfigError || message.includes("Insufficient Pilot Credits");
      results.push({ sweepstakeId: target.sweepstakeId, ok: false, skipped, error: message });
    }
  }

  return results;
}
