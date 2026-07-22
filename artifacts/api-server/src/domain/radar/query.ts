import type { RadarFilters, RadarSort } from "./types";

const sorts = new Set<RadarSort>(["recommended", "ending_soon", "highest_prize", "lowest_effort", "newest", "recently_verified", "popular"]);
const frequencies = new Set(["one_time", "daily", "weekly", "monthly", "unlimited", "unknown"]);
export function parseRadarFilters(input: Record<string, unknown>): RadarFilters {
  const sort = text(input.sort, 40) as RadarSort | null;
  const frequency = text(input.frequency, 40);
  return {
    query: text(input.q, 200), category: slug(input.category), minPrize: number(input.minPrize, 0, 1_000_000_000),
    deadlineBefore: date(input.deadlineBefore), startAfter: date(input.startAfter), frequency: frequency && frequencies.has(frequency) ? frequency : null,
    maxEffort: integer(input.maxEffort, 0, 100), country: code(input.country, 2), region: text(input.region, 100), userAge: integer(input.age, 0, 130),
    sponsor: text(input.sponsor, 200), purchaseRequired: bool(input.purchaseRequired), socialRequired: bool(input.socialRequired),
    minLegitimacy: integer(input.minLegitimacy, 0, 100), minSourceConfidence: integer(input.minSourceConfidence, 0, 100),
    saved: bool(input.saved), entered: bool(input.entered), sort: sort && sorts.has(sort) ? sort : "recommended",
    page: integer(input.page, 1, 10_000) ?? 1, pageSize: integer(input.pageSize, 1, 100) ?? 24,
  };
}
export function filtersToRpc(filters: RadarFilters, userId: string) { return {
  p_user_id: userId, p_query: filters.query, p_category: filters.category, p_min_prize: filters.minPrize,
  p_deadline_before: filters.deadlineBefore, p_start_after: filters.startAfter, p_frequency: filters.frequency, p_max_effort: filters.maxEffort,
  p_country: filters.country, p_region: filters.region, p_user_age: filters.userAge, p_sponsor: filters.sponsor,
  p_purchase_required: filters.purchaseRequired, p_social_required: filters.socialRequired, p_min_legitimacy: filters.minLegitimacy,
  p_min_source_confidence: filters.minSourceConfidence, p_saved: filters.saved, p_entered: filters.entered, p_sort: filters.sort,
  p_limit: filters.pageSize, p_offset: (filters.page - 1) * filters.pageSize,
}; }
function first(value: unknown) { return Array.isArray(value) ? value[0] : value; }
function text(value: unknown, max: number) { const parsed = typeof first(value) === "string" ? String(first(value)).trim() : ""; return parsed ? parsed.slice(0, max) : null; }
function slug(value: unknown) { const parsed = text(value, 100); return parsed && /^[a-z0-9-]+$/.test(parsed) ? parsed : null; }
function code(value: unknown, length: number) { const parsed = text(value, 20)?.toUpperCase() ?? null; return parsed?.length === length ? parsed : null; }
function number(value: unknown, min: number, max: number) { const parsed = Number(first(value)); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null; }
function integer(value: unknown, min: number, max: number) { const parsed = number(value, min, max); return parsed !== null && Number.isInteger(parsed) ? parsed : null; }
function bool(value: unknown) { const parsed = first(value); if (parsed === true || parsed === "true" || parsed === "1") return true; if (parsed === false || parsed === "false" || parsed === "0") return false; return null; }
function date(value: unknown) { const parsed = text(value, 50); if (!parsed) return null; const timestamp = Date.parse(parsed); return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null; }
