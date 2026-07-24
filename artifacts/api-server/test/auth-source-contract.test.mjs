import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const routes = await readFile(path.resolve("src/routes/auth.ts"), "utf8");
const sessions = await readFile(path.resolve("src/domain/auth/session.ts"), "utf8");
const router = await readFile(path.resolve("src/routes/index.ts"), "utf8");
const clientAuth = await readFile(path.resolve("../sweepscout/src/lib/auth.tsx"), "utf8");

test("authentication routes cover the required Supabase lifecycle", () => {
  for (const route of ["/config", "/signup", "/login", "/exchange", "/refresh", "/forgot-password", "/reset-password", "/oauth/google", "/logout", "/session", "/data-export", "/account-deletion"]) {
    assert.match(routes, new RegExp(`\\"${route}\\"`));
  }
  assert.match(routes, /verification email will arrive shortly/);
  assert.match(routes, /If an account exists for that address/);
  assert.match(routes, /Invalid email or password/);
});

test("session cookies and cookie mutations use hardened controls", () => {
  assert.match(sessions, /httpOnly: true/g);
  assert.match(sessions, /sameSite: "lax"/);
  assert.match(sessions, /process\.env\.NODE_ENV === "production"/);
  assert.match(sessions, /timingSafeEqual/);
  assert.match(sessions, /x-csrf-token/);
  assert.match(sessions, /refreshSession/);
});

test("application routes authenticate before the product router", () => {
  const authIndex = router.indexOf("router.use(authenticateRequest)");
  const rateIndex = router.indexOf('checkRateLimit(`api:');
  const csrfIndex = router.indexOf("router.use(requireCsrf)");
  const productIndex = router.indexOf("router.use(sweepscoutRouter)");
  assert.ok(authIndex > -1 && authIndex < productIndex);
  assert.ok(rateIndex > authIndex && rateIndex < csrfIndex);
  assert.ok(csrfIndex > authIndex && csrfIndex < productIndex);
});

test("post-login destinations are constrained to local application paths", () => {
  assert.match(clientAuth, /value\.startsWith\("\/"\)/);
  assert.match(clientAuth, /value\.startsWith\("\/\/"\)/);
  assert.match(clientAuth, /value\.includes\("\\\\"\)/);
});
