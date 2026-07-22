import type {
  NewSource,
  NewSweepstakes,
  NewSweepstakesEligibility,
  NewSweepstakesEntryMethod,
  NewSweepstakesPrize,
} from "../schema";

export const approvedSourceFixture = {
  name: "Official Sponsor Feed",
  baseUrl: "https://promotions.example.test",
  sourceType: "official_sponsor",
  accessMethod: "rss",
  scanEnabled: true,
  robotsPolicyStatus: "approved",
  termsReviewStatus: "approved",
  requiresAttribution: true,
  attributionText: "Example Sponsor official promotions feed",
  scanFrequencyMinutes: 1440,
  rateLimitPerMinute: 6,
  healthStatus: "healthy",
} satisfies NewSource;

export const activeSweepstakesFixture = {
  title: "National Park Adventure Giveaway",
  normalizedTitle: "national park adventure giveaway",
  sponsorName: "Example Outdoor Company",
  summary: "A test fixture for a sponsor-hosted travel promotion.",
  officialUrl: "https://promotions.example.test/national-park-adventure",
  rulesUrl: "https://promotions.example.test/national-park-adventure/rules",
  officialPromotionId: "fixture-national-park-2026",
  startAt: "2026-07-01T00:00:00.000Z",
  endAt: "2026-08-31T23:59:59.000Z",
  timezone: "America/New_York",
  estimatedTotalPrizeValue: "12500.00",
  currency: "USD",
  entryFrequency: "one_time",
  entryEffortScore: 18,
  legitimacyScore: 92,
  sourceConfidenceScore: 98,
  status: "active",
  firstDiscoveredAt: "2026-07-22T12:00:00.000Z",
  lastVerifiedAt: "2026-07-22T12:05:00.000Z",
} satisfies NewSweepstakes;

export function sweepstakesChildFixtures(sweepstakesId: string) {
  const prize = {
    sweepstakesId,
    name: "National park travel package",
    description: "Travel, lodging, and activity package described in the official rules.",
    quantity: 1,
    estimatedValue: "12500.00",
    currency: "USD",
  } satisfies NewSweepstakesPrize;

  const eligibility = {
    sweepstakesId,
    minimumAge: 21,
    eligibleCountries: ["US"],
    eligibleRegions: ["US-DC", "US-NY"],
    excludedRegions: [],
    residencyRequired: true,
    employeeExclusions: "Sponsor employees and members of their immediate households.",
  } satisfies NewSweepstakesEligibility;

  const entryMethod = {
    sweepstakesId,
    methodType: "official_web_form",
    description: "Visit the sponsor's official page and complete its form.",
    entryUrl: activeSweepstakesFixture.officialUrl,
    frequency: "one_time",
    purchaseRequired: false,
    estimatedMinutes: 4,
  } satisfies NewSweepstakesEntryMethod;

  return { prize, eligibility, entryMethod };
}
