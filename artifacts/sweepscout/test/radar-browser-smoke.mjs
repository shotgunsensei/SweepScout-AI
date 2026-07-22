import assert from "node:assert/strict";
import { chromium } from "../../api-server/node_modules/playwright/index.mjs";

const baseUrl = process.env.RADAR_SMOKE_BASE_URL ?? "http://127.0.0.1:4173";
const opportunity = {
  id: "10000000-0000-4000-8000-000000000001", title: "Summer Flight Giveaway", sponsor: "Example Air", summary: "Win a sponsor-verified flight credit through one online entry.", officialUrl: "https://example.com/summer", rulesUrl: "https://example.com/rules", startAt: "2026-07-01T00:00:00Z", endAt: "2026-08-20T00:00:00Z", timezone: "America/New_York", estimatedPrizeValue: 2500, currency: "USD", entryFrequency: "one_time", entryEffortScore: 20, legitimacyScore: 88, sourceConfidenceScore: 91, status: "active", lastVerifiedAt: "2026-07-22T16:00:00Z", firstDiscoveredAt: "2026-07-20T16:00:00Z", primaryPrize: "Flight credit",
  prizes: [{ name: "Flight credit", description: "Travel credit", quantity: 1, estimatedValue: 2500, currency: "USD" }], eligibility: { minimumAge: 18, maximumAge: null, countries: ["US"], regions: ["NY"], excludedRegions: [], employeeExclusions: "Employees excluded", otherRestrictions: "Void where prohibited." }, entryMethods: [{ methodType: "web_form", description: "Submit the sponsor form", entryUrl: "https://example.com/enter", frequency: "one_time", purchaseRequired: false, socialPlatform: null, estimatedMinutes: 3 }], categories: ["travel"], qualityWarnings: [], sources: [{ name: "Example Air", attribution: "Example Air promotions", lastSeenAt: "2026-07-22T16:00:00Z" }], saved: false, userStatus: null, popularity: 14, matchScore: 92, eligibilityStatus: "eligible",
};
const detail = { ...opportunity, evidence: [{ field_name: "title", field_value: opportunity.title, confidence: .95, source_reference: "official-rules", evidence_text: "Summer Flight Giveaway", evidence_location: {}, authoritative: true, extracted_at: "2026-07-22T16:00:00Z" }], safety: ["Play Pack Pilot is not the promotion sponsor.", "Promotion terms are controlled by the sponsor and can change.", "Verify the current official rules before entering.", "AI analysis may contain errors.", "Play Pack Pilot does not guarantee eligibility or winnings."] };

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/session") ? { user: { id: "pilot-1", email: "pilot@example.com", displayName: "Pilot", platformRole: "user" }, mode: "supabase", onboardingCompleted: true, googleOAuthEnabled: false }
      : path.endsWith("/config") ? { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] }
      : path.includes("/opportunities/") ? detail : { items: [opportunity], total: 1, page: 1, pageSize: 24, hasMore: false, sort: "highest_prize" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto(`${baseUrl}/dashboard/sweepstakes?q=flight&sort=highest_prize`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Opportunity Radar" }).waitFor();
  const safetyAcknowledgement = page.getByRole("button", { name: "I Understand" });
  if (await safetyAcknowledgement.isVisible()) await safetyAcknowledgement.click();
  assert.equal(await page.getByText("Summer Flight Giveaway", { exact: true }).count(), 1);
  assert.ok(page.url().includes("q=flight") && page.url().includes("sort=highest_prize"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const offenders = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll("body *")].map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 60), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width), className: element.getAttribute("class") })).filter((item) => item.right > document.documentElement.clientWidth + 1).slice(0, 8)) : [];
  assert.ok(overflow <= 1, `mobile radar overflows by ${overflow}px: ${JSON.stringify(offenders)}`);
  await page.getByRole("link", { name: "View details" }).click();
  await page.getByRole("link", { name: /Visit Official Sweepstakes/ }).waitFor();
  const outbound = page.getByRole("link", { name: /Visit Official Sweepstakes/ });
  assert.equal(await outbound.getAttribute("target"), "_blank"); assert.match(await outbound.getAttribute("rel"), /noopener/); assert.match(await outbound.getAttribute("rel"), /external/);
  await page.getByText("Play Pack Pilot is not the promotion sponsor.").waitFor();
  await context.close();

  const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const emptyPage = await emptyContext.newPage();
  await emptyPage.route("**/api/**", async (route) => { const path = new URL(route.request().url()).pathname; const data = path.endsWith("/auth/session") ? { user: { id: "pilot-1", email: "pilot@example.com", displayName: "Pilot", platformRole: "user" }, mode: "supabase", onboardingCompleted: true, googleOAuthEnabled: false } : path.endsWith("/config") ? { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] } : { items: [], total: 0, page: 1, pageSize: 24, hasMore: false, sort: "recommended" }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) }); });
  await emptyPage.goto(`${baseUrl}/dashboard/sweepstakes`, { waitUntil: "networkidle" });
  await emptyPage.getByText("No opportunities match this flight plan").waitFor();
  await emptyContext.close();

  const errorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errorPage = await errorContext.newPage();
  await errorPage.route("**/api/**", async (route) => { const path = new URL(route.request().url()).pathname; if (path.endsWith("/auth/session")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { user: { id: "pilot-1", email: "pilot@example.com", displayName: "Pilot", platformRole: "user" }, mode: "supabase", onboardingCompleted: true, googleOAuthEnabled: false } }) }); if (path.endsWith("/config")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] } }) }); await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Radar unavailable" }) }); });
  await errorPage.goto(`${baseUrl}/dashboard/sweepstakes`, { waitUntil: "networkidle" });
  await errorPage.getByText("Radar connection unavailable").waitFor();
  await errorContext.close();
  console.log("Radar browser smoke passed: mobile layout, query state, normalized card/detail, safe outbound link, safety notice, empty state, and error state.");
} finally { await browser.close(); }
