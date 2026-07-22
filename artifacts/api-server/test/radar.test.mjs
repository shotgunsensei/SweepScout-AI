import assert from "node:assert/strict";
import test from "node:test";
import { filtersToRpc, parseRadarFilters } from "../dist/radar.mjs";

test("search and shareable filters normalize into bounded RPC parameters", () => {
  const filters = parseRadarFilters({ q: "  summer travel ", category: "travel", minPrize: "500", deadlineBefore: "2026-12-31", frequency: "daily", maxEffort: "35", country: "us", region: "NY", age: "31", sponsor: "Air", purchaseRequired: "false", socialRequired: "true", minLegitimacy: "70", minSourceConfidence: "75", saved: "true", entered: "false" });
  assert.equal(filters.query, "summer travel"); assert.equal(filters.country, "US"); assert.equal(filters.minPrize, 500); assert.equal(filters.purchaseRequired, false); assert.equal(filters.socialRequired, true);
  const rpc = filtersToRpc(filters, "user-1"); assert.equal(rpc.p_user_id, "user-1"); assert.equal(rpc.p_offset, 0);
});

test("sorting modes and pagination remain allowlisted and bounded", () => {
  for (const sort of ["recommended", "ending_soon", "highest_prize", "lowest_effort", "newest", "recently_verified", "popular"]) assert.equal(parseRadarFilters({ sort }).sort, sort);
  assert.equal(parseRadarFilters({ sort: "drop table", pageSize: 500, page: -1 }).sort, "recommended");
  assert.equal(parseRadarFilters({ pageSize: 500 }).pageSize, 24);
  assert.equal(filtersToRpc(parseRadarFilters({ page: "3", pageSize: "10" }), "user-1").p_offset, 20);
});

test("invalid dates, frequencies, scores, and booleans fail closed to no filter", () => {
  const filters = parseRadarFilters({ deadlineBefore: "tomorrowish", frequency: "hourly", maxEffort: "101", saved: "maybe", country: "USA" });
  assert.equal(filters.deadlineBefore, null); assert.equal(filters.frequency, null); assert.equal(filters.maxEffort, null); assert.equal(filters.saved, null); assert.equal(filters.country, null);
});
