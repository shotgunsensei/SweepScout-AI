import assert from "node:assert/strict";
import test from "node:test";
import {
  EnrichmentProviderError, SweepstakesEnrichmentPipeline, calculateScores, extractWithResilience,
  extractionToDedupeRecord, parseSweepstakesExtraction, resolveDuplicate, selectAuthoritativeFields,
} from "../dist/enrichment.mjs";

test("valid extraction preserves evidence and promotes supported fields", () => {
  const extraction = validExtraction();
  assert.equal(parseSweepstakesExtraction(extraction).title.value, "Summer Flight Giveaway");
  assert.equal(selectAuthoritativeFields(extraction).sponsor, "Example Air");
  assert.equal(selectAuthoritativeFields(extraction).taxDisclosures, undefined);
});

test("missing fields remain explicit nulls instead of AI guesses", () => {
  const extraction = validExtraction({ sponsorContact: evidence(null, .9, "No sponsor contact appears in the supplied rules.") });
  assert.equal(parseSweepstakesExtraction(extraction).sponsorContact.value, null);
  assert.equal(selectAuthoritativeFields(extraction).sponsorContact, undefined);
});

test("conflicting dates route the normalized update to review", async () => {
  const repository = new MemoryRepository();
  const provider = fixtureProvider(validExtraction({ startDate: evidence("2026-09-01T00:00:00Z", .9), endDate: evidence("2026-08-01T00:00:00Z", .9) }));
  const result = await new SweepstakesEnrichmentPipeline(repository, provider).run(enrichmentInput());
  assert.equal(result.status, "needs_review");
  assert.ok(result.reviewReasons.includes("conflicting_dates"));
  assert.ok(result.scores.legitimacy < 70);
});

test("duplicate detection uses multiple identity signals", () => {
  const candidate = extractionToDedupeRecord(validExtraction());
  const match = { ...candidate, id: "existing-1" };
  const decision = resolveDuplicate(candidate, [match]);
  assert.equal(decision.action, "automatic_merge");
  assert.equal(decision.matchedRecordId, "existing-1");
});

test("similar titles alone never cause a false merge", () => {
  const candidate = extractionToDedupeRecord(validExtraction());
  const other = { ...candidate, id: "other", canonicalUrl: "https://different.example/entry", rulesUrl: "https://different.example/rules", officialPromotionId: "OTHER", sponsor: "different sponsor", startDate: null, endDate: null, prizeFingerprint: "different", contentFingerprint: "different" };
  assert.equal(resolveDuplicate(candidate, [other]).action, "separate");
});

test("malformed provider output fails structured validation", async () => {
  const provider = fixtureProvider({ title: "not-an-evidence-field" });
  await assert.rejects(() => extractWithResilience(provider, enrichmentInput(), { maxAttempts: 1 }), (error) => error.code === "malformed_output");
});

test("low-confidence extraction is stored as evidence and routed to review", async () => {
  const repository = new MemoryRepository();
  const low = Object.fromEntries(Object.entries(validExtraction()).map(([key, field]) => [key, { ...field, confidence: .4 }]));
  const result = await new SweepstakesEnrichmentPipeline(repository, fixtureProvider(low)).run(enrichmentInput());
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.authoritativeFields, {});
  assert.ok(result.reviewReasons.includes("low_confidence"));
});

test("rules content creates a content-addressed rules version", async () => {
  const repository = new MemoryRepository();
  const result = await new SweepstakesEnrichmentPipeline(repository, fixtureProvider(validExtraction())).run(enrichmentInput());
  assert.equal(result.status, "completed");
  assert.equal(repository.rulesVersions.length, 1);
  assert.match(repository.rulesVersions[0].contentHash, /^[a-f0-9]{64}$/);
});

test("score calculation accounts for entry work and source quality", () => {
  const baseline = calculateScores(validExtraction(), enrichmentInput());
  const hard = validExtraction({ socialMediaRequirements: evidence(["Follow", "Share", "Tag friends"], .9), entryMethods: evidence([{ methodType: "social", description: "Refer friends", entryUrl: "https://example.com/entry", frequency: "daily", purchaseRequired: true, socialPlatform: "Instagram", estimatedMinutes: 20 }], .9), entryFrequency: evidence("daily", .9) });
  assert.ok(calculateScores(hard, enrichmentInput()).entryEffort > baseline.entryEffort);
  assert.ok(baseline.sourceConfidence >= 70);
});

test("provider timeout is bounded and classified", async () => {
  const provider = { ...fixtureProvider(validExtraction()), extract: () => new Promise(() => {}) };
  await assert.rejects(() => extractWithResilience(provider, enrichmentInput(), { timeoutMs: 5, maxAttempts: 1 }), (error) => error.code === "timeout");
});

test("transient provider failures retry before succeeding", async () => {
  let attempts = 0;
  const provider = { ...fixtureProvider(validExtraction()), async extract() { attempts += 1; if (attempts < 3) throw new EnrichmentProviderError("temporary", "provider_error", true); return { extraction: validExtraction(), usage: { inputTokens: 5, outputTokens: 5, estimatedCostUsd: .001 } }; } };
  await extractWithResilience(provider, enrichmentInput(), { maxAttempts: 3, retryDelayMs: 1 });
  assert.equal(attempts, 3);
});

function evidence(value, confidence = .9, text = "Supported by the official rules.") { return { value, confidence, sourceReference: "official-rules", evidence: text, location: { pageUrl: "https://example.com/rules", section: "Official Rules" }, extractedAt: "2026-07-22T16:00:00Z" }; }
function validExtraction(overrides = {}) { return {
  title: evidence("Summer Flight Giveaway"), sponsor: evidence("Example Air"), officialPromotionUrl: evidence("https://example.com/entry"), officialRulesUrl: evidence("https://example.com/rules"), officialPromotionId: evidence("SUMMER-2026"),
  startDate: evidence("2026-07-01T00:00:00Z"), endDate: evidence("2026-08-01T00:00:00Z"), timezone: evidence("America/New_York"),
  prizes: evidence([{ name: "Flight credit", quantity: 1, estimatedValue: 2500, currency: "USD" }]), eligibleLocations: evidence(["US"], .9), minimumAge: evidence(18), maximumAge: evidence(null),
  entryMethods: evidence([{ methodType: "web_form", description: "Submit the form", entryUrl: "https://example.com/entry", frequency: "one_time", purchaseRequired: false, socialPlatform: null, estimatedMinutes: 3 }]), entryFrequency: evidence("one_time"), purchaseRequirements: evidence("No purchase necessary"), socialMediaRequirements: evidence([]),
  employeeExclusions: evidence("Sponsor employees and household members are excluded"), maximumEntries: evidence(1), sponsorContact: evidence("legal@example.com"), voidWhereProhibited: evidence(true), taxDisclosures: evidence(null, .4, "No tax disclosure found."), winnerNotification: evidence("Winner notified by email"), categories: evidence(["travel"]), ...overrides,
}; }
function enrichmentInput() { return { discoveredUrlId: "discovery-1", sourceId: "source-1", sourceReference: "approved-fixture", pageUrl: "https://example.com/entry", cleanedText: "Summer Flight Giveaway by Example Air", rulesUrl: "https://example.com/rules", rulesText: "OFFICIAL RULES. No purchase necessary.", sourceReputation: .9, sponsorReputation: .9, fetchedAt: "2026-07-22T15:55:00Z" }; }
function fixtureProvider(extraction) { return { name: "fixture", model: "deterministic-test", promptVersion: "test-v1", async extract() { return { extraction, usage: { inputTokens: 10, outputTokens: 20, estimatedCostUsd: .002 } }; } }; }
class MemoryRepository {
  rulesVersions = []; runs = []; candidates = [];
  async beginRun(input, provider) { const id = `run-${this.runs.length + 1}`; this.runs.push({ id, input, provider, status: "running" }); return id; }
  async listDedupeCandidates() { return this.candidates; }
  async saveRulesVersion(input) { this.rulesVersions.push(input); }
  async persist(input) { this.persisted = input; return { sweepstakesId: input.targetSweepstakesId ?? "new-sweepstakes" }; }
  async completeRun(id, update) { Object.assign(this.runs.find((run) => run.id === id), update); }
}
