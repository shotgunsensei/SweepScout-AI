export type RadarFilterState = {
  q: string; category: string; minPrize: string; deadlineBefore: string; startAfter: string; frequency: string; maxEffort: string;
  country: string; region: string; age: string; sponsor: string; purchaseRequired: string; socialRequired: string;
  minLegitimacy: string; minSourceConfidence: string; saved: string; entered: string; sort: string; page: string;
};
export const defaultRadarFilters: RadarFilterState = { q: "", category: "", minPrize: "", deadlineBefore: "", startAfter: "", frequency: "", maxEffort: "", country: "", region: "", age: "", sponsor: "", purchaseRequired: "", socialRequired: "", minLegitimacy: "", minSourceConfidence: "", saved: "", entered: "", sort: "recommended", page: "1" };
export function parseRadarSearch(search: string): RadarFilterState { const params = new URLSearchParams(search); return Object.fromEntries(Object.keys(defaultRadarFilters).map((key) => [key, params.get(key) ?? defaultRadarFilters[key as keyof RadarFilterState]])) as RadarFilterState; }
export function radarSearch(filters: RadarFilterState) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value && value !== defaultRadarFilters[key as keyof RadarFilterState]) params.set(key, value); const query = params.toString(); return query ? `?${query}` : ""; }
export function radarApiPath(filters: RadarFilterState) { const params = new URLSearchParams(radarSearch(filters)); params.set("pageSize", "24"); return `/radar?${params.toString()}`; }
export function timeRemaining(endAt: string | null) { if (!endAt) return "Deadline not confirmed"; const difference = Date.parse(endAt) - Date.now(); if (difference <= 0) return "Expired"; const days = Math.ceil(difference / 86_400_000); return days === 1 ? "1 day left" : `${days} days left`; }
