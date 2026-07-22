import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const apiPort = 55201;
const webPort = 55202;
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "playpackpilot-auth-ui-"));
const api = spawn(process.execPath, [path.resolve("dist/index.mjs")], {
  cwd: path.resolve("."),
  env: {
    ...process.env,
    PORT: String(apiPort),
    APP_BASE_URL: `http://127.0.0.1:${webPort}`,
    NODE_ENV: "development",
    LOG_LEVEL: "silent",
    LOCAL_SQLITE_PATH: path.join(temporaryDirectory, "test.sqlite"),
    PLAYPACKPILOT_LOCAL_ADMIN: "false",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  },
  stdio: "ignore",
});
const webDirectory = path.resolve("../sweepscout");
const web = spawn(process.execPath, [path.join(webDirectory, "node_modules/vite/bin/vite.js"), "--config", "vite.config.ts"], {
  cwd: webDirectory,
  env: {
    ...process.env,
    PORT: String(webPort),
    BASE_PATH: "/",
    API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    NODE_ENV: "development",
  },
  stdio: "ignore",
});

let browser;
try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${apiPort}/api/healthz`, api),
    waitFor(`http://127.0.0.1:${webPort}/`, web),
  ]);
  browser = await chromium.launch({ headless: true });

  const anonymousContext = await browser.newContext();
  await anonymousContext.route("**/api/auth/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "Authentication required." }),
  }));
  const loginPage = await anonymousContext.newPage();
  await loginPage.goto(`http://127.0.0.1:${webPort}/login`);
  await loginPage.getByRole("heading", { name: "Welcome back, pilot" }).waitFor();
  assert.equal(await loginPage.getByRole("button", { name: "Sign in" }).isVisible(), true);
  await anonymousContext.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${webPort}/dashboard`);
  await page.getByRole("heading", { name: "Tune your opportunity radar" }).waitFor();
  await page.locator('input[type="date"]').fill("1990-01-01");
  await page.getByLabel("State or region").fill("NY");
  const checkboxes = page.locator('input[type="checkbox"]');
  for (let index = 0; index < await checkboxes.count(); index += 1) await checkboxes.nth(index).check();
  await page.getByRole("button", { name: "Launch my flight deck" }).click();
  await Promise.race([
    page.waitForURL("**/dashboard", { timeout: 10_000 }).catch(() => undefined),
    page.locator('[role="alert"]').waitFor({ timeout: 10_000 }).catch(() => undefined),
  ]);
  if (!page.url().endsWith("/dashboard")) {
    const renderedError = await page.locator('[role="alert"]').textContent().catch(() => null);
    throw new Error(`Onboarding did not complete at ${page.url()}: ${renderedError ?? "no rendered error"}`);
  }
  await page.getByText("Flight Deck", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("Platform Admin", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "I Understand" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login?next=%2Fdashboard");
  await context.close();
  process.stdout.write("Authentication UI smoke passed: login, protected redirect, onboarding, role-aware navigation, logout.\n");
} finally {
  if (browser) await browser.close();
  api.kill();
  web.kill();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function waitFor(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Process exited early while waiting for ${url}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}
