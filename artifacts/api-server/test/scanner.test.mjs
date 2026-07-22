import assert from "node:assert/strict";
import test from "node:test";
import { CompliantSourceFetcher, safePublicUrl, SourceScanner } from "../dist/scanner.mjs";
import { rssFixture, jsonFixture, structuredHtmlFixture } from "./fixtures/source-responses.mjs";

test("RSS, JSON API, structured HTML, and administrator adapters return normalized discoveries", async () => {
  for (const [accessMethod, body, configuration, expected] of [
    ["rss", rssFixture, {}, 2],
    ["json_api", jsonFixture, { resultsPath: "promotions", urlField: "official_url", titleField: "name", summaryField: "details" }, 1],
    ["structured_html", structuredHtmlFixture, {}, 1],
    ["admin_url", "", { urls: ["https://sponsor.example/manual"] }, 1],
  ]) {
    const source = approvedSource({ accessMethod, configuration });
    const repository = new MemoryRepository(source);
    const fetcher = { fetch: async () => ({ url: source.baseUrl, status: 200, contentType: "text/plain", body, etag: null, lastModified: null }) };
    const summary = await new SourceScanner(repository, fetcher).runSource(source.id);
    assert.equal(summary.discovered, expected);
    assert.equal(repository.jobs.at(-1).status, "completed");
  }
});

test("canonical URLs deduplicate and content changes are detected", async () => {
  const source = approvedSource({ accessMethod: "admin_url", configuration: { urls: [{ url: "https://www.sponsor.example/promo?utm_source=one#entry", title: "Original" }] } });
  const repository = new MemoryRepository(source);
  const scanner = new SourceScanner(repository);
  assert.equal((await scanner.runSource(source.id)).discovered, 1);
  source.configuration = { urls: [{ url: "https://sponsor.example/promo?utm_source=two", title: "Original" }] };
  assert.equal((await scanner.runSource(source.id)).unchanged, 1);
  source.configuration = { urls: [{ url: "https://sponsor.example/promo", title: "Updated" }] };
  assert.equal((await scanner.runSource(source.id)).changed, 1);
  assert.equal(repository.discoveries.size, 1);
});

test("invalid candidate URLs cause a partial job without discarding valid discoveries", async () => {
  const source = approvedSource({ accessMethod: "admin_url", configuration: { urls: ["https://sponsor.example/valid", "javascript:alert(1)"] } });
  const repository = new MemoryRepository(source);
  const summary = await new SourceScanner(repository).runSource(source.id);
  assert.equal(summary.status, "partial");
  assert.equal(summary.discovered, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(repository.jobs.at(-1).status, "partial");
});

test("disabled or policy-unapproved sources are rejected before a job is created", async () => {
  for (const source of [approvedSource({ scanEnabled: false }), approvedSource({ robotsPolicyStatus: "pending" }), approvedSource({ termsReviewStatus: "prohibited" })]) {
    const repository = new MemoryRepository(source);
    await assert.rejects(() => new SourceScanner(repository).runSource(source.id), /Disabled|robots policy|terms/i);
    assert.equal(repository.jobs.length, 0);
  }
});

test("malformed adapter responses fail the durable job", async () => {
  const source = approvedSource({ accessMethod: "json_api", configuration: {} });
  const repository = new MemoryRepository(source);
  const fetcher = { fetch: async () => ({ url: source.baseUrl, status: 200, contentType: "application/json", body: "{broken", etag: null, lastModified: null }) };
  await assert.rejects(() => new SourceScanner(repository, fetcher).runSource(source.id), /malformed JSON/);
  assert.equal(repository.jobs.at(-1).status, "failed");
});

test("fetcher retries transient failures, applies backoff and rate delay, then succeeds", async () => {
  const source = approvedSource({ rateLimitPerMinute: 600 });
  let calls = 0;
  const sleeps = [];
  const fetcher = new CompliantSourceFetcher(async () => {
    calls += 1;
    return calls === 1 ? new Response("temporary", { status: 503 }) : new Response(rssFixture, { status: 200, headers: { "content-type": "application/rss+xml" } });
  }, async (milliseconds) => { sleeps.push(milliseconds); }, async () => [{ address: "93.184.216.34" }]);
  const response = await fetcher.fetch(source, source.baseUrl);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.ok(sleeps.some((value) => value === 250));
  assert.ok(sleeps.some((value) => value >= 100));
});

test("exhausted transient failures transition a job to dead letter", async () => {
  const source = approvedSource({ accessMethod: "rss", rateLimitPerMinute: 600 });
  const repository = new MemoryRepository(source);
  const fetcher = new CompliantSourceFetcher(async () => new Response("unavailable", { status: 503 }), async () => {}, async () => [{ address: "93.184.216.34" }]);
  await assert.rejects(() => new SourceScanner(repository, fetcher).runSource(source.id), /HTTP 503/);
  assert.equal(repository.jobs.at(-1).status, "dead_letter");
  assert.equal(repository.jobs.at(-1).attemptCount, 3);
});

test("private, credentialed, and non-standard-port endpoints are blocked", () => {
  for (const url of ["http://127.0.0.1/feed", "http://192.168.1.2/feed", "https://user:pass@example.com/feed", "https://example.com:8443/feed", "file:///tmp/feed"]) {
    assert.throws(() => safePublicUrl(url));
  }
});

test("hostnames that resolve to private networks are blocked before transport", async () => {
  const source = approvedSource();
  let transported = false;
  const fetcher = new CompliantSourceFetcher(async () => { transported = true; return new Response(rssFixture); }, async () => {}, async () => [{ address: "10.20.30.40" }]);
  await assert.rejects(() => fetcher.fetch(source, source.baseUrl), /private or reserved/);
  assert.equal(transported, false);
});

function approvedSource(overrides = {}) {
  return {
    id: "source-1",
    name: "Approved fixture source",
    baseUrl: "https://feed.example/promotions",
    accessMethod: "rss",
    scanEnabled: true,
    scanFrequencyMinutes: 60,
    robotsPolicyStatus: "approved",
    termsReviewStatus: "approved",
    requiresAttribution: true,
    attributionText: "Fixture Promotions",
    rateLimitPerMinute: 60,
    configuration: {},
    ...overrides,
  };
}

class MemoryRepository {
  jobs = [];
  discoveries = new Map();
  schedules = [];
  constructor(source) { this.source = source; }
  async getSource(id) { return id === this.source.id ? this.source : null; }
  async listDueSources() { return [this.source]; }
  async createJob(sourceId, correlationId) { const job = { id: `job-${this.jobs.length + 1}`, sourceId, correlationId, status: "queued" }; this.jobs.push(job); return job; }
  async updateJob(id, update) { Object.assign(this.jobs.find((job) => job.id === id), update); }
  async upsertDiscoveredUrl(input) {
    const key = `${input.sourceId}:${input.canonicalUrl}`;
    const existing = this.discoveries.get(key);
    const outcome = !existing ? "new" : existing.contentHash === input.contentHash ? "unchanged" : "changed";
    this.discoveries.set(key, input);
    return outcome;
  }
  async updateSourceSchedule(sourceId, update) { this.schedules.push({ sourceId, ...update }); }
}
