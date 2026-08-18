import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseRadarRepository, collectAllRadarMatches, parseRadarFilters, sourceTypeOf, RADAR_SCAN_PAGE_SIZE, RADAR_SCAN_MAX_MATCHES } from "../dist/radar.mjs";

// --- fixture: 1250 matching records; creators live ONLY beyond the first RPC page (rank >= 1100) ---
const TOTAL = 1250;
const isCreator = (index) => index >= 1100;
const allMatches = Array.from({ length: TOTAL }, (_, index) => ({ sweepstakes_id: `sw-${String(index).padStart(4, "0")}`, popular_saves: 0, total_count: TOTAL }));
const recordsById = new Map(allMatches.map((match, index) => [match.sweepstakes_id, {
  id: match.sweepstakes_id, title: `Promo ${index}`, sponsor_name: isCreator(index) ? `Channel ${index}` : `Brand ${index}`, summary: "", official_url: "https://example.com", rules_url: null,
  start_at: null, end_at: null, timezone: "UTC", estimated_total_prize_value: 100, currency: "USD", entry_frequency: "one_time", entry_effort_score: 10, legitimacy_score: 80,
  source_confidence_score: 70, status: "active", last_verified_at: null, first_discovered_at: "2026-08-01T00:00:00Z",
  extracted_json: isCreator(index) ? { sourceType: "creator", creator: { platform: "youtube", channelTitle: `Channel ${index}`, channelUrl: "https://youtube.com/@c", videoUrl: "https://youtube.com/watch?v=x" } } : { sourceType: "brand" },
  sweepstakes_prizes: [], sweepstakes_eligibility: null, sweepstakes_entry_methods: [], sweepstakes_category_links: [], listing_quality_flags: [], sweepstakes_sources: [],
}]));

let rpcCalls = [];
const fakeClient = {
  rpc: async (_name, args) => {
    rpcCalls.push(args);
    const offset = Number(args.p_offset ?? 0); const limit = Number(args.p_limit ?? 24);
    return { data: allMatches.slice(offset, offset + limit), error: null };
  },
  from(table) {
    const state = { table, ids: null, single: false, maybe: false };
    const builder = {
      select() { return builder; },
      in(_column, ids) { state.ids = ids; return builder; },
      eq() { return builder; },
      single() { state.single = true; return resolve(); },
      maybeSingle() { state.maybe = true; return resolve(); },
      then(onFulfilled, onRejected) { return resolve().then(onFulfilled, onRejected); },
    };
    function resolve() {
      if (state.table === "profiles") return Promise.resolve({ data: { country_code: "US", state_or_region: null, birth_date: null }, error: null });
      if (state.table === "user_preferences") return Promise.resolve({ data: null, error: null });
      if (state.table === "sweepstakes") return Promise.resolve({ data: (state.ids ?? []).map((id) => recordsById.get(id)).filter(Boolean), error: null });
      return Promise.resolve({ data: [], error: null });
    }
    return builder;
  },
};

const filters = (extra) => parseRadarFilters({ pageSize: "24", ...extra });

test("source-type filter sees creator records ranked beyond the first 500 RPC matches", async () => {
  rpcCalls = [];
  const repository = new SupabaseRadarRepository(fakeClient);
  const page1 = await repository.search("user-1", filters({ sourceType: "creator", page: "1" }));
  assert.equal(page1.total, 150); // 1250 - 1100 creators, all ranked past position 500
  assert.equal(page1.items.length, 24);
  assert.equal(page1.items[0].id, "sw-1100");
  assert.equal(page1.items[0].sourceType, "creator");
  assert.equal(page1.items[0].creator.channelTitle, "Channel 1100");
  assert.equal(page1.hasMore, true);
  // scanned the whole population: 3 RPC pages of 500
  assert.equal(rpcCalls.length, Math.ceil(TOTAL / RADAR_SCAN_PAGE_SIZE));
});

test("filtered pagination stays consistent through the final page", async () => {
  const repository = new SupabaseRadarRepository(fakeClient);
  const lastPage = await repository.search("user-1", filters({ sourceType: "creator", page: "7" }));
  assert.equal(lastPage.total, 150);
  assert.equal(lastPage.items.length, 150 - 6 * 24); // 6 remaining on page 7
  assert.equal(lastPage.hasMore, false);
  const beyond = await repository.search("user-1", filters({ sourceType: "creator", page: "8" }));
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.total, 150);
  assert.equal(beyond.hasMore, false);
});

test("brand filter excludes creators and reports the complementary total", async () => {
  const repository = new SupabaseRadarRepository(fakeClient);
  const page = await repository.search("user-1", filters({ sourceType: "brand", page: "1" }));
  assert.equal(page.total, 1100);
  assert.ok(page.items.every((item) => item.sourceType === "brand" && item.creator === null));
  assert.equal(page.hasMore, true);
});

test("unfiltered search keeps single-page RPC behavior", async () => {
  rpcCalls = [];
  const repository = new SupabaseRadarRepository(fakeClient);
  const page = await repository.search("user-1", filters({ page: "1" }));
  assert.equal(rpcCalls.length, 1);
  assert.equal(Number(rpcCalls[0].p_limit), 24);
  assert.equal(page.total, TOTAL);
  assert.equal(page.items.length, 24);
});

test("population scan pages the RPC until the reported total is collected", async () => {
  const pages = [];
  const rpc = async (args) => { pages.push(args.p_offset); const offset = Number(args.p_offset); return { data: allMatches.slice(offset, offset + RADAR_SCAN_PAGE_SIZE), error: null }; };
  const rows = await collectAllRadarMatches(rpc, filters({}), "user-1");
  assert.equal(rows.length, TOTAL);
  assert.deepEqual(pages, [0, 500, 1000]);
});

test("population scan continues past 50k-page heuristics until the reported total is reached", async () => {
  const bigTotal = RADAR_SCAN_PAGE_SIZE * 3; // exercised above; also verify no premature stop when totals align exactly
  const rpc = async (args) => { const offset = Number(args.p_offset); return { data: Array.from({ length: Math.max(0, Math.min(RADAR_SCAN_PAGE_SIZE, bigTotal - offset)) }, (_, i) => ({ sweepstakes_id: `x-${offset + i}`, total_count: bigTotal })), error: null }; };
  const rows = await collectAllRadarMatches(rpc, filters({}), "user-1");
  assert.equal(rows.length, bigTotal);
});

test("a population above the scan ceiling fails loudly instead of silently truncating", async () => {
  const overCap = RADAR_SCAN_MAX_MATCHES + 1;
  const rpc = async (args) => { const offset = Number(args.p_offset); return { data: Array.from({ length: RADAR_SCAN_PAGE_SIZE }, (_, i) => ({ sweepstakes_id: `y-${offset + i}`, total_count: overCap })), error: null }; };
  await assert.rejects(() => collectAllRadarMatches(rpc, filters({}), "user-1"), /cannot be applied to this many matches/);
  // and through the repository path with a sourceType filter
  const hugeClient = { ...fakeClient, rpc: async (_name, args) => rpc(args) };
  const repository = new SupabaseRadarRepository(hugeClient);
  await assert.rejects(() => repository.search("user-1", filters({ sourceType: "creator", page: "1" })), /cannot be applied to this many matches/);
});

test("sourceTypeOf defaults legacy rows to brand", () => {
  assert.equal(sourceTypeOf(null), "brand");
  assert.equal(sourceTypeOf({}), "brand");
  assert.equal(sourceTypeOf({ sourceType: "creator" }), "creator");
});
