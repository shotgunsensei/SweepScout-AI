import assert from "node:assert/strict";
import { chromium } from "../../api-server/node_modules/playwright/index.mjs";

const baseUrl = process.env.POLICY_SMOKE_BASE_URL ?? "http://127.0.0.1:4176";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.route("**/api/**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "No public session fixture." }) }));
  await page.goto(`${baseUrl}/policies/disclaimer`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Platform Disclaimer" }).waitFor();
  await page.getByText("Winning is never guaranteed.").waitFor();
  await page.getByText("Subscription payment does not purchase entries or improve odds.").waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

  await page.goto(`${baseUrl}/policies/privacy`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Privacy Policy" }).waitFor();
  await page.getByText("Download a machine-readable account export from Settings.").waitFor();
  await page.getByText(/essential authentication, refresh, and CSRF-protection cookies/).waitFor();
  await context.close();
  console.log("Security policy browser smoke passed: public disclaimer/privacy routes, required claims, privacy controls, and 375px layout.");
} finally {
  await browser.close();
}
