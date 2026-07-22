export type RadarSort = "recommended" | "ending_soon" | "highest_prize" | "lowest_effort" | "newest" | "recently_verified" | "popular";
export type RadarFilters = {
  query: string | null; category: string | null; minPrize: number | null; deadlineBefore: string | null; startAfter: string | null;
  frequency: string | null; maxEffort: number | null; country: string | null; region: string | null; userAge: number | null;
  sponsor: string | null; purchaseRequired: boolean | null; socialRequired: boolean | null; minLegitimacy: number | null;
  minSourceConfidence: number | null; saved: boolean | null; entered: boolean | null; sort: RadarSort; page: number; pageSize: number;
};
export type RadarPage = { items: RadarOpportunity[]; total: number; page: number; pageSize: number; hasMore: boolean; sort: RadarSort };
export type RadarOpportunity = {
  id: string; title: string; sponsor: string; summary: string; officialUrl: string; rulesUrl: string | null; startAt: string | null; endAt: string | null;
  timezone: string; estimatedPrizeValue: number | null; currency: string; entryFrequency: string; entryEffortScore: number; legitimacyScore: number;
  sourceConfidenceScore: number; status: string; lastVerifiedAt: string | null; firstDiscoveredAt: string; primaryPrize: string | null;
  prizes: Array<{ name: string; description: string | null; quantity: number; estimatedValue: number | null; currency: string }>;
  eligibility: { minimumAge: number | null; maximumAge: number | null; countries: string[]; regions: string[]; excludedRegions: string[]; employeeExclusions: string | null; otherRestrictions: string | null } | null;
  entryMethods: Array<{ methodType: string; description: string; entryUrl: string; frequency: string; purchaseRequired: boolean; socialPlatform: string | null; estimatedMinutes: number | null }>;
  categories: string[]; qualityWarnings: Array<{ type: string; severity: string; details: unknown }>; sources: Array<{ name: string; attribution: string | null; lastSeenAt: string }>;
  saved: boolean; userStatus: string | null; popularity: number; matchScore: number; eligibilityStatus: "eligible" | "ineligible" | "review";
};
export type RadarViewer = { userId: string; country: string | null; region: string | null; age: number | null; minimumPrize: number; maximumEffort: number; preferredCategories: string[]; allowSocial: boolean; allowPurchase: boolean };
