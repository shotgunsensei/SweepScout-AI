import { getSupabaseServiceClient } from "@/lib/auth/session";
import { filtersToRpc } from "./query";
import type { RadarFilters, RadarOpportunity, RadarPage, RadarViewer } from "./types";

const opportunitySelect = "*, sweepstakes_prizes(*), sweepstakes_eligibility(*), sweepstakes_entry_methods(*), sweepstakes_category_links(sweepstakes_categories(name,slug)), listing_quality_flags(flag_type,severity,details,status), sweepstakes_sources(last_seen_at,sources(name,attribution_text))";

export class SupabaseRadarRepository {
  private readonly client = getSupabaseServiceClient();
  async viewer(userId: string): Promise<RadarViewer> {
    const [profile, preferences] = await Promise.all([
      this.client.from("profiles").select("country_code,state_or_region,birth_date").eq("id", userId).single(),
      this.client.from("user_preferences").select("minimum_prize_value,maximum_entry_effort,preferred_categories,allow_social_entry_methods,allow_purchase_related_promotions").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile.error || preferences.error) throw new Error("Unable to load radar eligibility profile.");
    const pref: any = preferences.data ?? {};
    return { userId, country: profile.data.country_code, region: profile.data.state_or_region, age: age(profile.data.birth_date), minimumPrize: Number(pref.minimum_prize_value ?? 0), maximumEffort: Number(pref.maximum_entry_effort ?? 100), preferredCategories: Array.isArray(pref.preferred_categories) ? pref.preferred_categories : [], allowSocial: pref.allow_social_entry_methods !== false, allowPurchase: pref.allow_purchase_related_promotions === true };
  }
  async search(userId: string, filters: RadarFilters): Promise<RadarPage> {
    const [viewer, matches] = await Promise.all([this.viewer(userId), this.client.rpc("search_sweepstakes_radar", filtersToRpc(filters, userId))]);
    if (matches.error) throw new Error("Unable to search the normalized sweepstakes radar.");
    const matchRows = (matches.data ?? []) as any[]; const ids = matchRows.map((row) => String(row.sweepstakes_id));
    if (!ids.length) return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize, hasMore: false, sort: filters.sort };
    const [records, saves, statuses] = await Promise.all([
      this.client.from("sweepstakes").select(opportunitySelect).in("id", ids),
      this.client.from("user_saved_sweepstakes").select("sweepstakes_id").eq("user_id", userId).in("sweepstakes_id", ids),
      this.client.from("user_sweepstakes_status").select("sweepstakes_id,status").eq("user_id", userId).in("sweepstakes_id", ids),
    ]);
    if (records.error || saves.error || statuses.error) throw new Error("Unable to load radar opportunity details.");
    const recordMap = new Map((records.data ?? []).map((row: any) => [String(row.id), row]));
    const saved = new Set((saves.data ?? []).map((row: any) => String(row.sweepstakes_id))); const state = new Map((statuses.data ?? []).map((row: any) => [String(row.sweepstakes_id), String(row.status)]));
    const items = matchRows.map((match) => mapOpportunity(recordMap.get(String(match.sweepstakes_id)), viewer, saved.has(String(match.sweepstakes_id)), state.get(String(match.sweepstakes_id)) ?? null, Number(match.popular_saves ?? 0))).filter(Boolean) as RadarOpportunity[];
    const total = Number(matchRows[0]?.total_count ?? 0); return { items, total, page: filters.page, pageSize: filters.pageSize, hasMore: filters.page * filters.pageSize < total, sort: filters.sort };
  }
  async detail(userId: string, id: string) {
    const [viewer, record, saved, status, evidence] = await Promise.all([
      this.viewer(userId), this.client.from("sweepstakes").select(opportunitySelect).eq("id", id).single(),
      this.client.from("user_saved_sweepstakes").select("sweepstakes_id").eq("user_id", userId).eq("sweepstakes_id", id).maybeSingle(),
      this.client.from("user_sweepstakes_status").select("status").eq("user_id", userId).eq("sweepstakes_id", id).maybeSingle(),
      this.client.from("sweepstakes_field_evidence").select("field_name,field_value,confidence,source_reference,evidence_text,evidence_location,authoritative,extracted_at").eq("sweepstakes_id", id).order("extracted_at", { ascending: false }).limit(100),
    ]);
    if (record.error || evidence.error) throw new Error("Opportunity was not found.");
    if (saved.error || status.error) throw new Error("Unable to load personal opportunity state.");
    return { ...mapOpportunity(record.data, viewer, Boolean(saved.data), status.data?.status ?? null, await this.popularity(id)), evidence: evidence.data ?? [], safety: safetyMessages };
  }
  async setSaved(userId: string, sweepstakesId: string, value: boolean) { const query = value ? this.client.from("user_saved_sweepstakes").upsert({ user_id: userId, sweepstakes_id: sweepstakesId }, { onConflict: "user_id,sweepstakes_id" }) : this.client.from("user_saved_sweepstakes").delete().eq("user_id", userId).eq("sweepstakes_id", sweepstakesId); const result = await query; if (result.error) throw new Error("Unable to update the saved opportunity."); return { saved: value }; }
  async setStatus(userId: string, sweepstakesId: string, status: string) { const allowed = new Set(["interested", "saved", "entered", "enter_again", "skipped", "hidden", "won", "expired"]); if (!allowed.has(status)) throw new Error("Invalid opportunity status."); const result = await this.client.from("user_sweepstakes_status").upsert({ user_id: userId, sweepstakes_id: sweepstakesId, status, updated_at: new Date().toISOString() }, { onConflict: "user_id,sweepstakes_id" }); if (result.error) throw new Error("Unable to update opportunity status."); return { status }; }
  private async popularity(id: string) { const result = await this.client.from("user_saved_sweepstakes").select("sweepstakes_id", { count: "exact", head: true }).eq("sweepstakes_id", id); return result.count ?? 0; }
}

function mapOpportunity(row: any, viewer: RadarViewer, saved: boolean, userStatus: string | null, popularity: number): RadarOpportunity | null {
  if (!row) return null; const eligibilityRow = Array.isArray(row.sweepstakes_eligibility) ? row.sweepstakes_eligibility[0] : row.sweepstakes_eligibility;
  const categories = (row.sweepstakes_category_links ?? []).map((link: any) => link.sweepstakes_categories?.slug).filter(Boolean);
  const eligibility = eligibilityRow ? { minimumAge: eligibilityRow.minimum_age, maximumAge: eligibilityRow.maximum_age, countries: eligibilityRow.eligible_countries ?? [], regions: eligibilityRow.eligible_regions ?? [], excludedRegions: eligibilityRow.excluded_regions ?? [], employeeExclusions: eligibilityRow.employee_exclusions, otherRestrictions: eligibilityRow.other_restrictions } : null;
  const eligibilityStatus = determineEligibility(viewer, eligibility); const matchScore = calculateMatch(viewer, row, categories, eligibilityStatus);
  const prizes = (row.sweepstakes_prizes ?? []).map((prize: any) => ({ name: prize.name, description: prize.description, quantity: Number(prize.quantity), estimatedValue: prize.estimated_value === null ? null : Number(prize.estimated_value), currency: prize.currency }));
  return { id: String(row.id), title: row.title, sponsor: row.sponsor_name, summary: row.summary, officialUrl: row.official_url, rulesUrl: row.rules_url, startAt: row.start_at, endAt: row.end_at, timezone: row.timezone, estimatedPrizeValue: row.estimated_total_prize_value === null ? null : Number(row.estimated_total_prize_value), currency: row.currency, entryFrequency: row.entry_frequency, entryEffortScore: Number(row.entry_effort_score), legitimacyScore: Number(row.legitimacy_score), sourceConfidenceScore: Number(row.source_confidence_score), status: row.status, lastVerifiedAt: row.last_verified_at, firstDiscoveredAt: row.first_discovered_at, primaryPrize: prizes[0]?.name ?? null, prizes, eligibility,
    entryMethods: (row.sweepstakes_entry_methods ?? []).map((method: any) => ({ methodType: method.method_type, description: method.description, entryUrl: method.entry_url, frequency: method.frequency, purchaseRequired: method.purchase_required, socialPlatform: method.social_platform, estimatedMinutes: method.estimated_minutes })), categories,
    qualityWarnings: (row.listing_quality_flags ?? []).filter((flag: any) => flag.status !== "resolved" && flag.status !== "dismissed").map((flag: any) => ({ type: flag.flag_type, severity: flag.severity, details: flag.details })),
    sources: (row.sweepstakes_sources ?? []).map((link: any) => ({ name: link.sources?.name ?? "Source", attribution: link.sources?.attribution_text ?? null, lastSeenAt: link.last_seen_at })), saved, userStatus, popularity, matchScore, eligibilityStatus };
}
function determineEligibility(viewer: RadarViewer, eligibility: RadarOpportunity["eligibility"]): RadarOpportunity["eligibilityStatus"] { if (!eligibility) return "review"; if (viewer.age !== null && eligibility.minimumAge !== null && viewer.age < eligibility.minimumAge) return "ineligible"; if (viewer.country && eligibility.countries.length && !eligibility.countries.includes(viewer.country)) return "ineligible"; if (viewer.region && eligibility.excludedRegions.includes(viewer.region)) return "ineligible"; return viewer.country || viewer.age !== null ? "eligible" : "review"; }
function calculateMatch(viewer: RadarViewer, row: any, categories: string[], eligibility: RadarOpportunity["eligibilityStatus"]) { let score = (Number(row.legitimacy_score) + Number(row.source_confidence_score) + (100 - Number(row.entry_effort_score))) / 3; if (viewer.preferredCategories.some((category) => categories.includes(category))) score += 10; if (Number(row.estimated_total_prize_value ?? 0) >= viewer.minimumPrize) score += 5; if (Number(row.entry_effort_score) > viewer.maximumEffort) score -= 15; if (eligibility === "ineligible") score -= 40; return Math.max(0, Math.min(100, Math.round(score))); }
function age(birthDate: string | null) { if (!birthDate) return null; const born = new Date(`${birthDate}T00:00:00Z`); if (!Number.isFinite(born.getTime())) return null; const now = new Date(); let years = now.getUTCFullYear() - born.getUTCFullYear(); if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) years -= 1; return years; }
const safetyMessages = ["Play Pack Pilot is not the promotion sponsor.", "Promotion terms are controlled by the sponsor and can change.", "Verify the current official rules before entering.", "AI analysis may contain errors.", "Play Pack Pilot does not guarantee eligibility or winnings."];
