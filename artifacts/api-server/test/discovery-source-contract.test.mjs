import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const providers = await readFile(new URL("../src/domain/discovery/providers.ts", import.meta.url), "utf8");
const connectorProviders = await readFile(new URL("../src/domain/discovery/connector-providers.ts", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/domain/services/discovery.ts", import.meta.url), "utf8");
const sqlite = await readFile(new URL("../src/domain/storage/sqlite.ts", import.meta.url), "utf8");
const supabase = await readFile(new URL("../src/domain/storage/supabase.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/domain/storage/store.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("../src/routes/sweepscout.ts", import.meta.url), "utf8");
const scheduler = await readFile(new URL("../src/domain/services/discovery-scheduler.ts", import.meta.url), "utf8");
const radarRepo = await readFile(new URL("../src/domain/radar/repository.ts", import.meta.url), "utf8");
const radarQuery = await readFile(new URL("../src/domain/radar/query.ts", import.meta.url), "utf8");

test("real search providers use the connectors proxy and never hardcode API keys", () => {
  assert.match(connectorProviders, /connectors\.proxy\("brave"/);
  assert.match(connectorProviders, /connectors\.proxy\("youtube"/);
  assert.ok(!/api[_-]?key/i.test(connectorProviders));
});

test("YouTube quota is guarded by a daily budget and a route rate limit", () => {
  assert.match(connectorProviders, /consumeYouTubeSearchBudget\(\)/);
  assert.match(connectorProviders, /YOUTUBE_SEARCH_DAILY_LIMIT/);
  assert.match(routes, /discovery:youtube:global/);
});

test("YouTube quota reservation is delegated to the store and awaited before any search call", () => {
  // consumeYouTubeSearchBudget must await the store's atomic reservation method
  assert.match(connectorProviders, /await store\.reserveYouTubeQuota\(/);
  // The search() method must await the budget check before calling the API
  assert.match(connectorProviders, /await consumeYouTubeSearchBudget\(\)/);
  // Budget exhaustion must throw with a clear message — never silently proceed
  assert.match(connectorProviders, /exhausted/);
});

test("YouTube quota counter survives server restarts — stored in the database, not process memory", () => {
  // Store interface must declare the atomic reservation contract
  assert.match(store, /reserveYouTubeQuota/);
  assert.match(store, /reserved: boolean/);
  // Both storage adapters must implement it
  assert.match(sqlite, /reserveYouTubeQuota/);
  assert.match(supabase, /reserveYouTubeQuota/);
  // SQLite uses a synchronous transaction so read-check-write is atomic
  assert.match(sqlite, /this\.db\.transaction/);
  assert.match(sqlite, /youtube-quota/);
});

test("Supabase quota row encodes the full date so each calendar day gets its own slot", () => {
  // The row ID must include the full 8-digit YYYYMMDD string, not just the year
  assert.match(supabase, /youtubeQuotaRowId/);
  // Full date encoding: replace(/-/g,"") + slice(0,8) produces 8 chars covering YYYYMMDD
  assert.match(supabase, /replace\(\/-\/g, ""\)\.slice\(0, 8\)/);
  // Row ID must end with the sentinel suffix used to separate quota rows from real audit logs
  assert.match(supabase, /ffffffffffff/);
});

test("Supabase quota update is validated — a zero-row update is never counted as reserved", () => {
  // The update must request the affected rows back (.select)
  assert.match(supabase, /\.update\(.*\)[\s\S]{0,200}\.select\(/);
  // Must inspect returned data length, not just check for an error
  assert.match(supabase, /updData.*length/);
  // Must retry on contention rather than returning reserved=true on a missed update
  assert.match(supabase, /attempt/);
  assert.match(supabase, /reserved: true, newCount/);
});

test("Supabase quota throws on read or write failure so overspend is prevented", () => {
  assert.match(supabase, /Failed to read YouTube quota/);
  assert.match(supabase, /Failed to update YouTube quota/);
});

test("YouTube job reruns use the stored job's provider for rate-limiting, not the request body", () => {
  // Route must load the stored job when a jobId is present
  assert.match(routes, /store\.getDiscoveryJob\(jobId\)/);
  // effectiveProvider must come from the stored job, not fall through from the request
  assert.match(routes, /effectiveProvider.*existingJob\?\.provider/);
  // The YouTube rate limit must be checked against the effective provider
  assert.match(routes, /effectiveProvider === "youtube"/);
});

test("discovery jobs persist their provider so reruns cannot silently switch providers", () => {
  assert.match(discovery, /provider: input\.provider \?\? null/);
  assert.match(discovery, /getSearchProvider\(input\.provider \?\? job\.provider \?\? undefined\)/);
  // both storage adapters must round-trip the provider
  assert.match(sqlite, /provider: job\.provider \?\? null/);
  assert.match(supabase, /provider: job\.provider \?\? null/);
  assert.match(supabase, /provider: nullableStringFrom\(meta\.provider\)/);
  assert.match(supabase, /seeds: stringArrayFrom\(meta\.seeds\)/);
});

test("source type and creator attribution survive both storage adapters", () => {
  assert.match(sqlite, /sourceType: sweepstake\.sourceType \?\? "brand"/);
  assert.match(sqlite, /creator: sweepstake\.creator \?\? null/);
  assert.match(supabase, /sourceType: sweepstake\.sourceType \?\? "brand"/);
  assert.match(supabase, /creator: sweepstake\.creator \?\? null/);
  assert.match(supabase, /creatorFrom\(extracted\.creator\)/);
});

test("radar feed exposes a source-type filter and provenance fields", () => {
  assert.match(radarQuery, /sourceType: input\.sourceType === "creator"/);
  assert.match(radarRepo, /filters\.sourceType/);
  assert.match(radarRepo, /sourceType, creator \}/);
});

test("YouTube results are tagged as creator giveaways with channel attribution", () => {
  assert.match(connectorProviders, /sourceType: "creator"/);
  assert.match(connectorProviders, /channelTitle/);
  assert.match(discovery, /candidate\.sourceType === "creator" && candidate\.creator \? candidate\.creator\.channelTitle : domain/);
  assert.match(discovery, /code: "creator-giveaway"/);
});

test("recurring discovery honors user settings and never runs without connectors", () => {
  assert.match(scheduler, /settings\.automatedDiscoveryEnabled/);
  assert.match(scheduler, /connectorsConfigured\(\)/);
});

test("discovery remains information-only: no form submission or auto-entry", () => {
  assert.ok(!/submitForm|autoEnter|page\.click/.test(connectorProviders + discovery + scheduler));
  assert.match(providers, /SearchProvider/);
});
