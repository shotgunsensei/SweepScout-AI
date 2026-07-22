import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendar, calculatePersonalMatch, isDue, nextEntryDue, shouldTransitionToExpired } from "../dist/personalization.mjs";

test("personal match explains major positive and negative factors", () => {
  const result = calculatePersonalMatch({ legitimacyScore: 92, sourceConfidenceScore: 88, entryEffortScore: 20, maximumEffort: 40, eligibilityStatus: "eligible", categories: ["travel"], preferredCategories: ["travel"], prizeValue: 5000, minimumPrize: 500, entryFrequency: "daily", preferredFrequencies: ["daily"], hasSocialRequirement: false, allowSocial: false, hasPurchaseRequirement: false, allowPurchase: false, userStatus: null });
  assert.ok(result.score >= 80); assert.ok(result.factors.length >= 5); assert.ok(result.factors.some((factor) => factor.key === "eligibility" && factor.impact === "positive"));
  const blocked = calculatePersonalMatch({ legitimacyScore: 92, sourceConfidenceScore: 88, entryEffortScore: 80, maximumEffort: 40, eligibilityStatus: "ineligible", categories: [], preferredCategories: [], prizeValue: 0, minimumPrize: 500, entryFrequency: "daily", preferredFrequencies: [], hasSocialRequirement: true, allowSocial: false, hasPurchaseRequirement: true, allowPurchase: false, userStatus: "skipped" });
  assert.ok(blocked.score < result.score); assert.ok(blocked.factors.some((factor) => factor.impact === "negative"));
});

test("daily schedules preserve local wall clock and stop after deadline", () => {
  const next = nextEntryDue({ frequency: "daily", enteredAt: "2026-03-07T14:00:00.000Z", timezone: "America/New_York", endAt: "2026-03-10T23:59:00.000Z" });
  assert.equal(next, "2026-03-08T13:00:00.000Z"); assert.equal(isDue(next, new Date("2026-03-08T13:01:00.000Z")), true);
  assert.equal(shouldTransitionToExpired("entered", "2026-03-01T00:00:00.000Z", new Date("2026-03-02T00:00:00.000Z")), true);
  assert.equal(shouldTransitionToExpired("won", "2026-03-01T00:00:00.000Z", new Date("2026-03-02T00:00:00.000Z")), false);
});

test("calendar export is standards-shaped, recurring, escaped, and safety labeled", () => {
  const ics = buildCalendar([{ uid: "abc@example", title: "Cash, Cards", description: "User-reported", startsAt: "2026-08-01T13:00:00.000Z", endsAt: "2026-08-20T03:59:00.000Z", timezone: "America/New_York", recurrence: "daily", recurrenceUntil: "2026-08-20T03:59:00.000Z", url: "https://example.com" }]);
  assert.match(ics, /BEGIN:VCALENDAR\r\n/); assert.match(ics, /RRULE:FREQ=DAILY;UNTIL=20260820T035900Z/); assert.match(ics, /SUMMARY:Cash\\, Cards/); assert.match(ics, /Verify official sponsor rules/);
});
