import { getSupabaseServiceClient } from "@/lib/auth/session";
import { getAppConfig, requireOpenAIAccess } from "@/lib/env";
import { CompliantSourceFetcher } from "@/lib/scanner/fetcher";
import type { ApprovedSource } from "@/lib/scanner/types";
import { OpenAIEnrichmentProvider } from "./provider";
import { SweepstakesEnrichmentPipeline } from "./pipeline";
import { SupabaseEnrichmentRepository, undoAdministrativeMerge } from "./repository";

export async function runQueuedDiscoveryEnrichment(discoveredUrlId: string) {
  const client = getSupabaseServiceClient();
  const discovery = await client.from("discovered_urls").select("*, sources(*)").eq("id", discoveredUrlId).single();
  if (discovery.error || !discovery.data) throw new Error("Queued discovered URL was not found.");
  if (discovery.data.status !== "queued") throw new Error("Discovered URL must receive administrator queue approval before enrichment.");
  const source = discovery.data.sources as any;
  if (!source || source.robots_policy_status !== "approved" || source.terms_review_status !== "approved") throw new Error("Source policy approval is required before enrichment.");
  const approvedTarget: ApprovedSource = {
    id: source.id, name: source.name, baseUrl: discovery.data.url, accessMethod: "admin_url", scanEnabled: true,
    scanFrequencyMinutes: source.scan_frequency_minutes, robotsPolicyStatus: "approved", termsReviewStatus: "approved",
    requiresAttribution: source.requires_attribution, attributionText: source.attribution_text, rateLimitPerMinute: source.rate_limit_per_minute,
    configuration: {},
  };
  try {
    const page = await new CompliantSourceFetcher().fetch(approvedTarget, discovery.data.url);
    const rulesUrl = detectRulesUrl(page.body, page.url);
    const access = requireOpenAIAccess();
    const provider = new OpenAIEnrichmentProvider(getAppConfig().openaiModel, access.apiKey, `${access.baseUrl}/responses`);
    const result = await new SweepstakesEnrichmentPipeline(new SupabaseEnrichmentRepository(), provider).run({
      discoveredUrlId, sourceId: source.id, sourceReference: `source:${source.id}`, pageUrl: page.url,
      cleanedText: visibleText(page.body), rulesUrl, rulesText: null, sourceReputation: source.health_status === "healthy" ? .85 : .6,
      fetchedAt: new Date().toISOString(),
    });
    await client.from("discovered_urls").update({ status: "fetched", last_fetched_at: new Date().toISOString(), http_status: page.status, updated_at: new Date().toISOString() }).eq("id", discoveredUrlId);
    return result;
  } catch (error) {
    await client.from("discovered_urls").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", discoveredUrlId);
    throw error;
  }
}

export { undoAdministrativeMerge };

function visibleText(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 70_000); }
function detectRulesUrl(html: string, pageUrl: string) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/official\s+rules|terms\s*(?:and|&)\s*conditions|sweepstakes\s+rules/i.test(match[2].replace(/<[^>]+>/g, " "))) {
      try { const url = new URL(match[1], pageUrl); if (url.protocol === "https:" || url.protocol === "http:") return url.toString(); } catch { /* ignore malformed links */ }
    }
  }
  return null;
}
