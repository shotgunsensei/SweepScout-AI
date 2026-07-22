import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [admin, routes, provider] = await Promise.all([
  readFile(new URL("../src/domain/enrichment/admin.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/sweepscout.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/domain/enrichment/provider.ts", import.meta.url), "utf8"),
]);
test("enrichment requires an explicitly queued discovery and approved source policy", () => {
  assert.match(admin, /status !== "queued"/); assert.match(admin, /robots_policy_status !== "approved"/); assert.match(admin, /terms_review_status !== "approved"/);
});
test("enrichment and merge undo routes retain the admin boundary", () => {
  assert.match(routes, /\/admin\/discovered-urls\/:id\/enrich/); assert.match(routes, /\/admin\/merges\/:id\/undo/); assert.ok((routes.match(/await requireAdmin\(req\)/g) ?? []).length >= 2);
});
test("provider prompt rejects unsupported inference and records prompt version", () => {
  assert.match(provider, /Never infer legal eligibility/); assert.match(provider, /ENRICHMENT_PROMPT_VERSION/); assert.match(provider, /OPENAI_INPUT_COST_PER_MILLION_USD/);
});
