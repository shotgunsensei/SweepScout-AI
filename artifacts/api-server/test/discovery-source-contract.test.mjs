import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const providers = await readFile(new URL("../src/domain/discovery/providers.ts", import.meta.url), "utf8");
const connectorProviders = await readFile(new URL("../src/domain/discovery/connector-providers.ts", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/domain/services/discovery.ts", import.meta.url), "utf8");
const sqlite = await readFile(new URL("../src/domain/storage/sqlite.ts", import.meta.url), "utf8");
const supabase = await readFile(new URL("../src/domain/storage/supabase.ts", import.meta.url), "utf8");
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
