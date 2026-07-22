import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/auth/session";
import { canonicalUrl, fingerprint, normalizeTitle } from "./dedupe";
import type { DedupeRecord, EnrichmentInput, EnrichmentProvider, EnrichmentRepository, ProviderUsage } from "./types";

export class SupabaseEnrichmentRepository implements EnrichmentRepository {
  private readonly client = getSupabaseServiceClient();

  async beginRun(input: EnrichmentInput, provider: EnrichmentProvider) {
    const id = randomUUID();
    const result = await this.client.from("ai_enrichment_runs").insert({ id, discovered_url_id: input.discoveredUrlId, source_id: input.sourceId, provider: provider.name, model: provider.model, prompt_version: provider.promptVersion, status: "running" });
    if (result.error) throw new Error("Unable to create the durable enrichment run.");
    return id;
  }

  async listDedupeCandidates(_candidate: DedupeRecord) {
    const result = await this.client.from("sweepstakes").select("id, official_url, sponsor_name, normalized_title, start_at, end_at, rules_url, official_promotion_id, summary, sweepstakes_prizes(name,quantity,estimated_value)").order("updated_at", { ascending: false }).limit(500);
    if (result.error) throw new Error("Unable to load duplicate candidates.");
    return (result.data ?? []).map((row: any): DedupeRecord => ({
      id: String(row.id), canonicalUrl: canonicalUrl(String(row.official_url)), sponsor: normalizeTitle(String(row.sponsor_name)), normalizedTitle: String(row.normalized_title),
      startDate: row.start_at, endDate: row.end_at, rulesUrl: row.rules_url ? canonicalUrl(String(row.rules_url)) : null, officialPromotionId: row.official_promotion_id,
      prizeFingerprint: fingerprint((row.sweepstakes_prizes ?? []).map((p: any) => [normalizeTitle(String(p.name)), Number(p.quantity), p.estimated_value === null ? null : Number(p.estimated_value)])),
      contentFingerprint: fingerprint(String(row.summary ?? "").toLowerCase()),
    }));
  }

  async saveRulesVersion(input: { sweepstakesId: string; rulesUrl: string; rawText: string; contentHash: string; extractedAt: string }) {
    const result = await this.client.from("sweepstakes_rules_versions").upsert({ sweepstakes_id: input.sweepstakesId, rules_url: input.rulesUrl, raw_text: input.rawText, content_hash: input.contentHash, extracted_at: input.extractedAt }, { onConflict: "sweepstakes_id,content_hash", ignoreDuplicates: true });
    if (result.error) throw new Error("Unable to preserve the rules version.");
  }

  async persist(input: Parameters<EnrichmentRepository["persist"]>[0]) {
    const fields = input.authoritativeFields as Record<string, any>;
    const current = input.targetSweepstakesId ? await this.loadSweepstakes(input.targetSweepstakesId) : null;
    const now = new Date().toISOString();
    const payload = {
      title: fields.title ?? input.extraction.title.value ?? "Unverified promotion",
      normalized_title: normalizeTitle(fields.title ?? input.extraction.title.value ?? "Unverified promotion"),
      sponsor_name: fields.sponsor ?? input.extraction.sponsor.value ?? "Unknown sponsor",
      summary: input.source.cleanedText.slice(0, 2_000), official_url: fields.officialPromotionUrl ?? input.source.pageUrl,
      rules_url: fields.officialRulesUrl ?? input.source.rulesUrl ?? null, official_promotion_id: fields.officialPromotionId ?? null,
      start_at: fields.startDate ?? null, end_at: fields.endDate ?? null, timezone: fields.timezone ?? "UTC",
      estimated_total_prize_value: totalPrizeValue(fields.prizes), entry_frequency: fields.entryFrequency ?? "unknown",
      entry_effort_score: input.scores.entryEffort, legitimacy_score: input.scores.legitimacy, source_confidence_score: input.scores.sourceConfidence,
      status: lifecycle(fields.startDate, fields.endDate, input.reviewReasons.length > 0), last_verified_at: now, updated_at: now,
    };
    let sweepstakesId = input.targetSweepstakesId;
    if (sweepstakesId) {
      const result = await this.client.from("sweepstakes").update(payload).eq("id", sweepstakesId);
      if (result.error) throw new Error("Unable to update the normalized sweepstakes record.");
    } else {
      sweepstakesId = randomUUID();
      const result = await this.client.from("sweepstakes").insert({ id: sweepstakesId, ...payload });
      if (result.error) throw new Error("Unable to create the normalized sweepstakes record.");
    }
    await this.persistEvidence(sweepstakesId, input);
    await this.persistSourceLink(sweepstakesId, input.source);
    if (!current) await this.persistNormalizedChildren(sweepstakesId, fields);
    if (input.reviewReasons.length) await this.persistReviewFlags(sweepstakesId, input);
    if (input.dedupe.action === "automatic_merge" && current) await this.persistMergeEvent(sweepstakesId, current, payload, input);
    return { sweepstakesId };
  }

  async completeRun(runId: string, input: { status: "completed" | "needs_review" | "failed"; usage?: ProviderUsage; errorCode?: string }) {
    const result = await this.client.from("ai_enrichment_runs").update({ status: input.status, input_tokens: input.usage?.inputTokens ?? 0, output_tokens: input.usage?.outputTokens ?? 0, estimated_cost_usd: input.usage?.estimatedCostUsd ?? 0, error_code: input.errorCode ?? null, completed_at: new Date().toISOString() }).eq("id", runId);
    if (result.error) throw new Error("Unable to finalize the enrichment run.");
  }

  private async loadSweepstakes(id: string) { const result = await this.client.from("sweepstakes").select("*").eq("id", id).single(); if (result.error) throw new Error("Unable to load the merge target."); return result.data as Record<string, unknown>; }
  private async persistEvidence(sweepstakesId: string, input: Parameters<EnrichmentRepository["persist"]>[0]) {
    const rows = Object.entries(input.extraction).map(([name, field]) => ({ id: randomUUID(), sweepstakes_id: sweepstakesId, enrichment_run_id: input.runId, field_name: name, field_value: field.value, confidence: field.confidence, source_reference: field.sourceReference, evidence_text: field.evidence, evidence_location: field.location, authoritative: Object.hasOwn(input.authoritativeFields, name), extracted_at: field.extractedAt }));
    const result = await this.client.from("sweepstakes_field_evidence").insert(rows); if (result.error) throw new Error("Unable to preserve field evidence.");
  }
  private async persistSourceLink(sweepstakesId: string, source: EnrichmentInput) { const result = await this.client.from("sweepstakes_sources").upsert({ sweepstakes_id: sweepstakesId, source_id: source.sourceId, discovered_url_id: source.discoveredUrlId, source_listing_text: source.cleanedText.slice(0, 2_000), last_seen_at: source.fetchedAt }, { onConflict: "sweepstakes_id,source_id,discovered_url_id" }); if (result.error) throw new Error("Unable to preserve source attribution."); }
  private async persistNormalizedChildren(sweepstakesId: string, fields: Record<string, any>) {
    if (Array.isArray(fields.prizes) && fields.prizes.length) { const result = await this.client.from("sweepstakes_prizes").insert(fields.prizes.map((p: any) => ({ sweepstakes_id: sweepstakesId, name: p.name, quantity: p.quantity, estimated_value: p.estimatedValue, currency: p.currency }))); if (result.error) throw new Error("Unable to persist normalized prizes."); }
    const eligibility = { sweepstakes_id: sweepstakesId, minimum_age: fields.minimumAge ?? null, maximum_age: fields.maximumAge ?? null, eligible_countries: fields.eligibleLocations ?? [], employee_exclusions: fields.employeeExclusions ?? null, other_restrictions: [fields.purchaseRequirements, fields.voidWhereProhibited === true ? "Void where prohibited." : null, fields.taxDisclosures, fields.winnerNotification].filter(Boolean).join(" ") || null };
    const eligibilityResult = await this.client.from("sweepstakes_eligibility").upsert(eligibility); if (eligibilityResult.error) throw new Error("Unable to persist normalized eligibility.");
    const methods = Array.isArray(fields.entryMethods) ? fields.entryMethods.filter((method: any) => method.entryUrl) : [];
    if (methods.length) { const result = await this.client.from("sweepstakes_entry_methods").insert(methods.map((m: any) => ({ sweepstakes_id: sweepstakesId, method_type: m.methodType, description: m.description, entry_url: m.entryUrl, frequency: m.frequency, purchase_required: m.purchaseRequired, social_platform: m.socialPlatform, estimated_minutes: m.estimatedMinutes }))); if (result.error) throw new Error("Unable to persist normalized entry methods."); }
  }
  private async persistReviewFlags(sweepstakesId: string, input: Parameters<EnrichmentRepository["persist"]>[0]) { const result = await this.client.from("listing_quality_flags").insert(input.reviewReasons.map((reason) => ({ sweepstakes_id: sweepstakesId, flag_type: reason, severity: reason === "conflicting_dates" ? "high" : "medium", details: { runId: input.runId, dedupeScore: input.dedupe.score }, status: "open" }))); if (result.error) throw new Error("Unable to route the record for human review."); }
  private async persistMergeEvent(sweepstakesId: string, targetBefore: Record<string, unknown>, candidateAfter: Record<string, unknown>, input: Parameters<EnrichmentRepository["persist"]>[0]) { const result = await this.client.from("sweepstakes_merge_events").insert({ target_sweepstakes_id: sweepstakesId, enrichment_run_id: input.runId, match_score: input.dedupe.score, matched_signals: input.dedupe.signals, source_snapshot: { targetBefore, candidateAfter, source: { discoveredUrlId: input.source.discoveredUrlId, sourceId: input.source.sourceId } }, status: "applied" }); if (result.error) throw new Error("Unable to preserve the merge audit event."); }
}

function totalPrizeValue(prizes: any) { return Array.isArray(prizes) ? prizes.reduce((sum, prize) => sum + (Number(prize.estimatedValue) || 0) * (Number(prize.quantity) || 1), 0) : null; }
function lifecycle(start: string | undefined, end: string | undefined, review: boolean) { if (review) return "unverifiable"; const now = Date.now(); if (end && Date.parse(end) < now) return "expired"; if (start && Date.parse(start) > now) return "upcoming"; return "active"; }

export async function undoAdministrativeMerge(mergeEventId: string, actorId: string) {
  const client = getSupabaseServiceClient();
  const event = await client.from("sweepstakes_merge_events").select("*").eq("id", mergeEventId).single();
  if (event.error || !event.data || event.data.status !== "applied") throw new Error("Applied merge event was not found.");
  const before = (event.data.source_snapshot as any)?.targetBefore;
  if (!before || typeof before !== "object") throw new Error("Merge event does not contain a restorable target snapshot.");
  const restored = { ...before, updated_at: new Date().toISOString() }; delete restored.id; delete restored.created_at;
  const undoneAt = new Date().toISOString();
  const audit = await client.from("sweepstakes_merge_events").update({ status: "undone", undone_by: actorId, undone_at: undoneAt }).eq("id", mergeEventId).eq("status", "applied").select("id").single();
  if (audit.error) throw new Error("Merge was already undone or could not be claimed for reversal.");
  const update = await client.from("sweepstakes").update(restored).eq("id", event.data.target_sweepstakes_id);
  if (update.error) {
    await client.from("sweepstakes_merge_events").update({ status: "applied", undone_by: null, undone_at: null }).eq("id", mergeEventId).eq("undone_at", undoneAt);
    throw new Error("Unable to restore the pre-merge record.");
  }
  return { mergeEventId, sweepstakesId: event.data.target_sweepstakes_id, status: "undone" as const };
}
