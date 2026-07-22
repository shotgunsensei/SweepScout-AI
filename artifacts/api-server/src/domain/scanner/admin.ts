import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/auth/session";
import { safePublicUrl } from "@/lib/scanner/fetcher";
import { SourceScanner } from "@/lib/scanner/pipeline";
import { SupabaseScannerRepository } from "@/lib/scanner/repository";
import type { PolicyReviewStatus, SourceAccessMethod } from "@/lib/scanner/types";

const accessMethods = new Set<SourceAccessMethod>(["rss", "atom", "json_api", "structured_html", "admin_url", "admin_import"]);
const policyStatuses = new Set<PolicyReviewStatus>(["pending", "approved", "restricted", "prohibited"]);

export async function listRegisteredSources() {
  const result = await getSupabaseServiceClient().from("sources").select("*").order("name");
  if (result.error) throw new Error("Unable to list registered sources.");
  return result.data;
}

export async function registerSource(input: Record<string, unknown>) {
  const baseUrl = safePublicUrl(requiredText(input.baseUrl, "Base URL")).toString();
  const accessMethod = parseAccessMethod(input.accessMethod);
  const now = new Date().toISOString();
  const payload = {
    id: randomUUID(), name: requiredText(input.name, "Source name").slice(0, 160), base_url: baseUrl,
    source_type: optionalText(input.sourceType, 80) || "publisher", access_method: accessMethod, scan_enabled: false,
    scan_frequency_minutes: boundedInteger(input.scanFrequencyMinutes, 5, 43_200, 1440), robots_policy_status: "pending",
    terms_review_status: "pending", requires_attribution: input.requiresAttribution !== false,
    attribution_text: optionalText(input.attributionText, 500) || null,
    rate_limit_per_minute: boundedInteger(input.rateLimitPerMinute, 1, 600, 6), health_status: "unknown",
    configuration: safeConfiguration(input.configuration), created_at: now, updated_at: now,
  };
  const result = await getSupabaseServiceClient().from("sources").insert(payload).select("*").single();
  if (result.error) throw new Error("Unable to register the source. Confirm it is not already registered.");
  return result.data;
}

export async function updateRegisteredSource(sourceId: string, input: Record<string, unknown>) {
  const current = await getSupabaseServiceClient().from("sources").select("*").eq("id", sourceId).maybeSingle();
  if (current.error || !current.data) throw new Error("Registered source was not found.");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) update.name = requiredText(input.name, "Source name").slice(0, 160);
  if (input.baseUrl !== undefined) update.base_url = safePublicUrl(requiredText(input.baseUrl, "Base URL")).toString();
  if (input.accessMethod !== undefined) update.access_method = parseAccessMethod(input.accessMethod);
  if (input.scanFrequencyMinutes !== undefined) update.scan_frequency_minutes = boundedInteger(input.scanFrequencyMinutes, 5, 43_200, 1440);
  if (input.rateLimitPerMinute !== undefined) update.rate_limit_per_minute = boundedInteger(input.rateLimitPerMinute, 1, 600, 6);
  if (input.robotsPolicyStatus !== undefined) update.robots_policy_status = parsePolicyStatus(input.robotsPolicyStatus);
  if (input.termsReviewStatus !== undefined) update.terms_review_status = parsePolicyStatus(input.termsReviewStatus);
  if (input.requiresAttribution !== undefined) update.requires_attribution = input.requiresAttribution === true;
  if (input.attributionText !== undefined) update.attribution_text = optionalText(input.attributionText, 500) || null;
  if (input.configuration !== undefined) update.configuration = safeConfiguration(input.configuration);
  if (input.markUnderReview === true) {
    Object.assign(update, { scan_enabled: false, robots_policy_status: "pending", terms_review_status: "pending", health_status: "paused" });
  } else if (input.scanEnabled !== undefined) {
    const robots = update.robots_policy_status ?? current.data.robots_policy_status;
    const terms = update.terms_review_status ?? current.data.terms_review_status;
    if (input.scanEnabled === true && (robots !== "approved" || terms !== "approved")) throw new Error("Both policy reviews must be approved before enabling a source.");
    update.scan_enabled = input.scanEnabled === true;
    if (input.scanEnabled === false) update.health_status = "paused";
  }
  const result = await getSupabaseServiceClient().from("sources").update(update).eq("id", sourceId).select("*").single();
  if (result.error) throw new Error("Unable to update the registered source.");
  return result.data;
}

export async function runRegisteredSource(sourceId: string) { return new SourceScanner(new SupabaseScannerRepository()).runSource(sourceId); }

export async function listSourceScanHistory(sourceId: string, limit = 50) {
  const result = await getSupabaseServiceClient().from("source_scan_jobs").select("*").eq("source_id", sourceId).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 200)));
  if (result.error) throw new Error("Unable to load source scan history.");
  return result.data;
}

export async function listDiscoveredUrlReviews(status = "new", limit = 100) {
  const allowed = new Set(["new", "queued", "fetched", "changed", "unchanged", "rejected", "failed"]);
  if (!allowed.has(status)) throw new Error("Invalid discovered URL status.");
  const result = await getSupabaseServiceClient().from("discovered_urls").select("*").eq("status", status).order("last_seen_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 500)));
  if (result.error) throw new Error("Unable to load discovered URL reviews.");
  return result.data;
}

export async function reviewDiscoveredUrl(id: string, decision: "queue" | "reject") {
  const status = decision === "queue" ? "queued" : "rejected";
  const result = await getSupabaseServiceClient().from("discovered_urls").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (result.error) throw new Error("Unable to update the discovered URL review.");
  return result.data;
}

function safeConfiguration(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Source configuration must be an object.");
  const serialized = JSON.stringify(value);
  if (serialized.length > 20_000) throw new Error("Source configuration is too large.");
  if (/password|secret|api[_-]?key|authorization|bearer/i.test(serialized)) throw new Error("Secrets are not allowed in source configuration.");
  return value;
}
function parseAccessMethod(value: unknown) { if (!accessMethods.has(value as SourceAccessMethod)) throw new Error("Invalid source access method."); return value as SourceAccessMethod; }
function parsePolicyStatus(value: unknown) { if (!policyStatuses.has(value as PolicyReviewStatus)) throw new Error("Invalid policy review status."); return value as PolicyReviewStatus; }
function requiredText(value: unknown, label: string) { const text = typeof value === "string" ? value.trim() : ""; if (!text) throw new Error(`${label} is required.`); return text; }
function optionalText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) { const parsed = value === undefined ? fallback : Number(value); if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Value must be an integer from ${minimum} to ${maximum}.`); return parsed; }
