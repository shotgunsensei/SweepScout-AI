import assert from "node:assert/strict";
import test from "node:test";
import { buildCloudFlightDeck, getFlightDeckData } from "../dist/flight-deck.mjs";

const opportunity = {
  id: "opportunity-1",
  title: "Summer Travel Giveaway",
  sponsor: "Example Sponsor",
  summary: "A reviewed travel opportunity.",
  officialUrl: "https://sponsor.example/giveaway",
  rulesUrl: "https://sponsor.example/rules",
  startAt: new Date(Date.now() - 86_400_000).toISOString(),
  endAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  timezone: "UTC",
  estimatedPrizeValue: 5_000,
  currency: "USD",
  entryFrequency: "daily",
  entryEffortScore: 20,
  legitimacyScore: 85,
  sourceConfidenceScore: 90,
  status: "active",
  lastVerifiedAt: new Date().toISOString(),
  firstDiscoveredAt: new Date().toISOString(),
  primaryPrize: "Travel package",
  prizes: [],
  eligibility: null,
  entryMethods: [],
  categories: ["travel"],
  qualityWarnings: [],
  sources: [{ name: "Sponsor", attribution: "Official sponsor site", lastSeenAt: new Date().toISOString() }],
  saved: true,
  userStatus: "saved",
  popularity: 1,
  matchScore: 91,
  matchFactors: [],
  eligibilityStatus: "eligible",
  sourceType: "brand",
  creator: null,
};

const notification = {
  id: "alert-1",
  type: "ending_soon",
  title: "Opportunity ending soon",
  body: "Review the official rules before visiting the sponsor.",
  sweepstakes_id: "opportunity-1",
  source_reference: "opportunity-1",
  priority: 70,
  read_at: null,
  metadata: {},
  created_at: new Date().toISOString(),
};

test("Flight Deck aggregates normalized, user-scoped product data", async () => {
  const calls = [];
  const result = await getFlightDeckData({ mode: "supabase", userId: "pilot-1" }, {
    radar: { search: async (userId, filters) => { calls.push(["radar", userId, filters.pageSize]); return { items: [opportunity], total: 12, page: 1, pageSize: 8, hasMore: true, sort: "recommended" }; } },
    personalization: {
      hangar: async (userId) => { calls.push(["hangar", userId]); return { items: [], total: 3 }; },
      missionLog: async (userId) => { calls.push(["mission", userId]); return { enteredToday: [{}], dailyDue: [{}, {}] }; },
    },
    alerts: { summary: async (userId) => { calls.push(["alerts", userId]); return { notifications: [notification], unreadCount: 1 }; } },
  });

  assert.deepEqual(calls.map((call) => call[1]), ["pilot-1", "pilot-1", "pilot-1", "pilot-1"]);
  assert.equal(result.stats.opportunityMatches, 12);
  assert.equal(result.stats.saved, 3);
  assert.equal(result.stats.entriesToday, 1);
  assert.equal(result.stats.dueEntries, 2);
  assert.equal(result.stats.endingSoon, 1);
  assert.equal(result.opportunities[0].officialUrl, opportunity.officialUrl);
});

test("Flight Deck limits alert previews and counts high-risk opportunities", () => {
  const risky = { ...opportunity, id: "opportunity-2", legitimacyScore: 30, eligibilityStatus: "review" };
  const notifications = Array.from({ length: 8 }, (_, index) => ({ ...notification, id: `alert-${index}` }));
  const result = buildCloudFlightDeck({
    radar: { items: [opportunity, risky], total: 2, page: 1, pageSize: 8, hasMore: false, sort: "recommended" },
    hangar: { total: 0 },
    missionLog: { enteredToday: [], dailyDue: [] },
    alerts: { notifications, unreadCount: 8 },
  });
  assert.equal(result.stats.riskFlags, 1);
  assert.equal(result.stats.eligibleMatches, 1);
  assert.equal(result.notifications.length, 6);
});
