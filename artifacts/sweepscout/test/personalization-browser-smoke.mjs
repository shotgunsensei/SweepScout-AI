import assert from "node:assert/strict";
import { chromium } from "../../api-server/node_modules/playwright/index.mjs";

const baseUrl = process.env.PERSONALIZATION_SMOKE_BASE_URL ?? "http://127.0.0.1:4174";
const item = { sweepstakesId: "10000000-0000-4000-8000-000000000001", title: "Daily Flight Giveaway", sponsor: "Example Air", officialUrl: "https://example.com", savedAt: "2026-07-22T12:00:00Z", priority: "high", notes: "Enter before work", deadline: "2026-08-20T03:59:00Z", timezone: "America/New_York", frequency: "daily", prizeValue: 2500, currency: "USD", status: "entered", lastEnteredAt: "2026-07-22T13:00:00Z", nextEntryDueAt: "2026-07-23T13:00:00Z", entryCount: 4, updatedAt: "2026-07-22T13:00:00Z" };
const session = { user: { id: "pilot-1", email: "pilot@example.com", displayName: "Pilot", platformRole: "user" }, mode: "supabase", onboardingCompleted: true, googleOAuthEnabled: false };
const config = { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] };

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await page.route("**/api/**", async (route) => { const path = new URL(route.request().url()).pathname; const data = path.endsWith("/auth/session") ? session : path.endsWith("/config") ? config : path.endsWith("/search-profile-alerts") ? [{ id: "profile-1", name: "Daily travel", filters: { frequency: "daily" }, alert_enabled: true, created_at: "2026-07-22T12:00:00Z", updated_at: "2026-07-22T12:00:00Z", matchCount: 3 }] : path.endsWith("/hangar") ? { items: [item], total: 1 } : path.endsWith("/mission-log") ? { enteredToday: [item], dailyDue: [item], enteredPreviously: [], skipped: [], hidden: [{ ...item, status: "hidden" }], won: [], expired: [], disclaimer: "Entry activity is user-reported. Play Pack Pilot does not claim sponsor receipt or confirmation without an authorized integration." } : {}; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) }); });
  await page.goto(`${baseUrl}/dashboard/hangar`, { waitUntil: "networkidle" }); const safety = page.getByRole("button", { name: "I Understand" }); if (await safety.isVisible()) await safety.click();
  await page.getByRole("heading", { name: "The Hangar" }).waitFor(); await page.getByText("Daily Flight Giveaway", { exact: true }).waitFor(); await page.getByText("Daily travel", { exact: true }).waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await page.goto(`${baseUrl}/dashboard/entries`, { waitUntil: "networkidle" }); await page.getByRole("heading", { name: "Mission Log" }).waitFor(); await page.getByText(/does not claim sponsor receipt/).waitFor(); await page.getByRole("button", { name: "Restore" }).waitFor();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  console.log("Personalization browser smoke passed: mobile Hangar, saved profile alerts, Mission Log groups, restore action, and reporting boundary.");
} finally { await browser.close(); }
