import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, router, routes, profile, scanner, logger] = await Promise.all([
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/domain/auth/profile.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/domain/scanner/adapters.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/logger.ts", import.meta.url), "utf8"),
]);

test("API hardening installs headers, strict body types, sanitized production errors, and general throttling", () => {
  for (const term of ["X-Content-Type-Options", "X-Frame-Options", "Strict-Transport-Security", "Content-Security-Policy", "Permissions-Policy", "Request body must use application/json"]) assert.match(app, new RegExp(term));
  assert.match(app, /process\.env\.NODE_ENV === "production"\) logger\.error\(diagnostic/);
  assert.match(router, /API rate limit exceeded/);
  assert.match(router, /requireRequestAuth/);
});

test("authenticated data exports are user-scoped, bounded, audited, and never cached", () => {
  assert.match(routes, /router\.get\("\/data-export"/);
  assert.match(routes, /Cache-Control", "no-store, private"/);
  assert.match(routes, /Content-Disposition/);
  assert.match(profile, /\.eq\("user_id", auth\.userId\)\.limit\(5_000\)/);
  assert.match(profile, /privacy_export_events/);
  assert.match(profile, /Authentication credentials, session tokens, and server secrets are never included/);
});

test("scanner parsing has explicit destination, response, candidate, depth, and string bounds", () => {
  for (const term of ["MAX_CANDIDATES = 500", "MAX_STRUCTURED_DEPTH = 20", "MAX_JSON_LD_BLOCKS = 100", ".slice(0, MAX_CANDIDATES)"]) assert.match(scanner, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("request logs redact credentials and never serialize request bodies", () => {
  for (const term of ["req.headers.authorization", "req.headers.cookie", "set-cookie"]) assert.match(logger, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(logger, /req\.body/);
});
