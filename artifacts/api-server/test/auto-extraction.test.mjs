import assert from "node:assert/strict";
import test from "node:test";
import { runAutoExtract, LocalBillingRepository } from "../dist/auto-extraction.mjs";

// ---------------------------------------------------------------------------
// Shared fakes
// ---------------------------------------------------------------------------

function paidRepo(planKey = "ace_pilot") {
  const consumed = [];
  const refunded = [];
  return {
    consumed,
    refunded,
    subscription: async () => ({ planKey, status: "active" }),
    consume: async (userId, input) => consumed.push({ userId, ...input }),
    ledger: async () => ({ balance: 50 }),
    refund: async (_user, charge, refund) => refunded.push({ charge, refund }),
  };
}

function freePlanRepo() {
  return {
    consumed: [],
    subscription: async () => ({ planKey: "free_flight", status: "none" }),
    consume: async () => assert.fail("free plan must not consume credits"),
    ledger: async () => ({ balance: 0 }),
    refund: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("auto-extraction charges the supplied userId, not a hardcoded fallback", async () => {
  const repo = paidRepo();
  let extractedId = null;
  const result = await runAutoExtract(
    [{ sweepstakeId: "sweep-1", title: "Prize Giveaway" }],
    "user-membership-owner",
    {
      runExtraction: async (id) => { extractedId = id; },
      billingRepository: repo,
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].ok, true);
  assert.equal(extractedId, "sweep-1");
  // The credit charge must use the caller-supplied userId, not any hardcoded default.
  assert.equal(repo.consumed.length, 1);
  assert.equal(repo.consumed[0].userId, "user-membership-owner");
  assert.equal(repo.consumed[0].reasonCode, "official_rules_extraction");
});

test("each target uses a stable per-sweepstake idempotency key", async () => {
  const repo = paidRepo();
  await runAutoExtract(
    [
      { sweepstakeId: "sweep-a", title: "Sweepstake A" },
      { sweepstakeId: "sweep-b", title: "Sweepstake B" },
    ],
    "user-1",
    { runExtraction: async () => {}, billingRepository: repo },
  );

  assert.equal(repo.consumed.length, 2);
  assert.equal(repo.consumed[0].idempotencyKey, "auto-extract:sweep-a");
  assert.equal(repo.consumed[1].idempotencyKey, "auto-extract:sweep-b");
});

test("plan-ineligible user is safely skipped — no credit charge, no thrown error", async () => {
  const repo = freePlanRepo();
  const result = await runAutoExtract(
    [{ sweepstakeId: "sweep-2", title: "Paid Feature" }],
    "user-free",
    {
      runExtraction: async () => assert.fail("extraction must not run for ineligible plan"),
      billingRepository: repo,
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].ok, false);
  assert.equal(result[0].skipped, true, "ineligible plan should mark result as skipped, not failed");
  assert.equal(repo.consumed.length, 0);
});

test("extraction failure refunds the credit and marks the result as failed (not skipped)", async () => {
  const repo = paidRepo();
  const result = await runAutoExtract(
    [{ sweepstakeId: "sweep-3", title: "Failing Extraction" }],
    "user-paid",
    {
      runExtraction: async () => { throw new Error("provider timed out"); },
      billingRepository: repo,
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].ok, false);
  assert.equal(result[0].skipped, false, "transient failures are not skipped — they are failed");
  assert.match(result[0].error ?? "", /timed out/);
  // Credit was consumed then refunded on failure.
  assert.equal(repo.consumed.length, 1);
  assert.equal(repo.refunded.length, 1);
});

test("LocalBillingRepository allows official_rules_extraction without Supabase (SQLite mode)", async () => {
  // In a SQLite deployment Supabase is unavailable; LocalBillingRepository
  // must permit official_rules_extraction so the cap (not credits) is the guard.
  const repo = new LocalBillingRepository();
  let extracted = null;

  const result = await runAutoExtract(
    [{ sweepstakeId: "sweep-sqlite-1", title: "SQLite Giveaway" }],
    "user-local-owner",
    {
      runExtraction: async (id) => { extracted = id; },
      billingRepository: repo,
    },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].ok, true, "extraction must succeed through LocalBillingRepository");
  assert.equal(result[0].skipped, undefined);
  assert.equal(extracted, "sweep-sqlite-1", "runExtraction must be called for the target sweepstake");
});

test("results are returned in insertion order and one failure does not stop the rest", async () => {
  const repo = paidRepo();
  const extracted = [];
  const result = await runAutoExtract(
    [
      { sweepstakeId: "sweep-ok-1" },
      { sweepstakeId: "sweep-fail" },
      { sweepstakeId: "sweep-ok-2" },
    ],
    "user-1",
    {
      runExtraction: async (id) => {
        if (id === "sweep-fail") throw new Error("boom");
        extracted.push(id);
      },
      billingRepository: repo,
    },
  );

  assert.deepEqual(
    result.map((r) => r.sweepstakeId),
    ["sweep-ok-1", "sweep-fail", "sweep-ok-2"],
  );
  assert.equal(result[0].ok, true);
  assert.equal(result[1].ok, false);
  assert.equal(result[2].ok, true);
  assert.deepEqual(extracted, ["sweep-ok-1", "sweep-ok-2"]);
});
