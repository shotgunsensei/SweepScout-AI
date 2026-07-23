import assert from "node:assert/strict";
import { chromium } from "../../api-server/node_modules/playwright/index.mjs";

const baseUrl = process.env.ALERTS_SMOKE_BASE_URL ?? "http://127.0.0.1:4175";
const session = { user: { id: "pilot-1", email: "pilot@example.com", displayName: "Pilot", platformRole: "user" }, mode: "supabase", onboardingCompleted: true, googleOAuthEnabled: false };
const config = { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] };
const summary = {
  notifications: [{ id: "alert-1", type: "ending_soon", title: "Final approach", body: "Sponsor entry closes tomorrow. Verify the official rules.", sweepstakes_id: "sweep-1", source_reference: "sweep-1", priority: 85, read_at: null, metadata: {}, created_at: "2026-07-23T12:00:00Z" }],
  unreadCount: 1,
  preferences: { inAppEnabled: true, emailEnabled: false, dailyDigestEnabled: true, weeklyDigestEnabled: true, endingSoonEnabled: true, highValueEnabled: true, recommendationsEnabled: true, entryRemindersEnabled: true, emailUnsubscribedAt: null },
  customScanners: [{ id: "scanner-1", name: "High-value travel", filters: { keywords: "travel" }, source_ids: ["source-1"], cadence_minutes: 1440, enabled: true, next_run_at: "2026-07-24T12:00:00Z", last_run_at: null }],
  customScanRuns: [{ id: "run-1", custom_scanner_id: "scanner-1", status: "completed", match_count: 3, result_summary: { sourceIds: ["source-1"] }, error_message: null, created_at: "2026-07-23T11:00:00Z", completed_at: "2026-07-23T11:01:00Z" }],
  approvedSources: [{ id: "source-1", name: "Sponsor promotion feed", base_url: "https://sponsor.example", attribution_text: "Sponsor official feed" }],
  emailProvider: "disabled",
  planKey: "ace_pilot",
  customScanPolicy: { enabled: true, maxProfiles: 5, monthlyRuns: 25, minimumCadenceMinutes: 1440 },
  customScanCost: 10,
  creditBalance: 225
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/session") ? session : path.endsWith("/config") ? config : path.endsWith("/alerts") ? summary : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto(`${baseUrl}/dashboard/alerts`, { waitUntil: "networkidle" });
  const safety = page.getByRole("button", { name: "I Understand" });
  if (await safety.isVisible()) await safety.click();
  await page.getByRole("heading", { name: "Alerts & Custom Scans" }).waitFor();
  await page.getByText("Final approach").waitFor();
  await page.getByText("High-value travel").waitFor();
  await page.getByText("Sponsor official feed").waitFor();
  await page.getByText(/Verify sponsor rules/).waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await context.close();

  const gated = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await gated.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/session") ? session : path.endsWith("/config") ? config : path.endsWith("/alerts") ? { ...summary, planKey: "free_flight", customScanPolicy: { enabled: false, maxProfiles: 0, monthlyRuns: 0, minimumCadenceMinutes: 0 }, customScanners: [], customScanRuns: [] } : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
  await gated.goto(`${baseUrl}/dashboard/alerts`, { waitUntil: "networkidle" });
  await gated.getByText("Ace Pilot or Squadron required").waitFor();
  await gated.getByRole("link", { name: "Review upgrade options" }).waitFor();
  await gated.close();
  console.log("Alerts browser smoke passed: mobile console, in-app alert, approved-source scan audit, sponsor boundary, and paid-plan gate.");
} finally {
  await browser.close();
}
