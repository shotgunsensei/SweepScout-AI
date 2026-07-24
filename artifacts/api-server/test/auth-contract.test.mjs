import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const serverEntry = path.resolve("dist/index.mjs");

test("local development sessions protect mutations and enforce owner authorization", async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "playpackpilot-auth-"));
  const port = 55123;
  const server = await startServer(port, {
    NODE_ENV: "development",
    LOCAL_SQLITE_PATH: path.join(temporaryDirectory, "test.sqlite"),
    PLAYPACKPILOT_LOCAL_ADMIN: "false",
  });
  t.after(async () => {
    server.kill();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
  assert.equal(sessionResponse.status, 200);
  const sessionPayload = await sessionResponse.json();
  assert.equal(sessionPayload.data.mode, "local");
  assert.equal(sessionPayload.data.onboardingCompleted, false);
  assert.equal(sessionResponse.headers.get("x-frame-options"), "DENY");
  assert.equal(sessionResponse.headers.get("x-content-type-options"), "nosniff");
  assert.match(sessionResponse.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(sessionResponse.headers.get("x-powered-by"), null);
  const cookies = cookieHeader(sessionResponse);
  const csrf = cookieValue(cookies, "ppp_csrf");
  assert.ok(csrf.length >= 32);

  const rejected = await fetch(`http://127.0.0.1:${port}/api/auth/onboarding`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: cookies },
    body: JSON.stringify(validOnboarding()),
  });
  assert.equal(rejected.status, 401);

  const accepted = await fetch(`http://127.0.0.1:${port}/api/auth/onboarding`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf },
    body: JSON.stringify(validOnboarding()),
  });
  assert.equal(accepted.status, 200);

  const refreshed = await fetch(`http://127.0.0.1:${port}/api/auth/session`, { headers: { cookie: cookies } });
  assert.equal((await refreshed.json()).data.onboardingCompleted, true);

  const admin = await fetch(`http://127.0.0.1:${port}/api/admin`, { headers: { cookie: cookies } });
  assert.equal(admin.status, 403);
  const sourceRegistry = await fetch(`http://127.0.0.1:${port}/api/admin/sources`, { headers: { cookie: cookies } });
  assert.equal(sourceRegistry.status, 403);

  const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: cookies, "x-csrf-token": csrf },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie") ?? "", /ppp_access=;/);
});

test("production fails closed when Supabase authentication is not configured", async (t) => {
  const port = 55124;
  const server = await startServer(port, { NODE_ENV: "production" });
  t.after(() => server.kill());

  const health = await fetch(`http://127.0.0.1:${port}/api/healthz`);
  assert.equal(health.status, 200);

  const protectedResponse = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
  assert.equal(protectedResponse.status, 503);
  assert.match((await protectedResponse.json()).error, /not configured/i);

  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
  assert.equal(sessionResponse.status, 503);
});

test("explicit local owner mode authorizes platform administration", async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "playpackpilot-owner-"));
  const port = 55125;
  const server = await startServer(port, {
    NODE_ENV: "development",
    LOCAL_SQLITE_PATH: path.join(temporaryDirectory, "owner.sqlite"),
    PLAYPACKPILOT_LOCAL_ADMIN: "true",
  });
  t.after(async () => {
    server.kill();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
  const sessionPayload = await sessionResponse.json();
  assert.equal(sessionPayload.data.user.platformRole, "owner");
  const admin = await fetch(`http://127.0.0.1:${port}/api/admin/access`, { headers: { cookie: cookieHeader(sessionResponse) } });
  const adminBody = await admin.text();
  assert.equal(admin.status, 200, adminBody);
  assert.equal(admin.headers.get("ratelimit-limit"), "900");
});

function validOnboarding() {
  return {
    displayName: "Test Pilot",
    countryCode: "US",
    stateOrRegion: "NY",
    birthDate: "1990-01-01",
    minimumPrizeValue: 25,
    maximumEntryEffort: 60,
    preferredCategories: ["Cash", "Tech"],
    emailDigestFrequency: "weekly",
    minimumAgeConfirmed: true,
    acceptTerms: true,
    acceptPrivacy: true,
    acceptSponsorDisclaimer: true,
  };
}

async function startServer(port, overrides) {
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      LOG_LEVEL: "silent",
      SWEEPSCOUT_INBOX_ENABLED: "false",
      PLAYPACKPILOT_INBOX_ENABLED: "false",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += String(chunk); });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API server exited early (${child.exitCode}): ${errors}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (response.ok) return child;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`API server did not start: ${errors}`);
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  return values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

function cookieValue(cookies, name) {
  const match = cookies.split("; ").find((value) => value.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : "";
}
