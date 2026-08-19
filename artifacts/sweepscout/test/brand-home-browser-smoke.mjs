import assert from "node:assert/strict";
import { chromium } from "../../api-server/node_modules/playwright/index.mjs";

// Brand regression suite for the public launch experience.
// Guards against: blank/invisible primary CTA (CSS cascade regressions), broken hero artwork,
// horizontal overflow at target widths, and retired brand copy returning to customer-facing pages.

const baseUrl = process.env.BRAND_SMOKE_BASE_URL ?? "http://127.0.0.1:4173";
const widths = [375, 768, 1024, 1440];
const retiredCopy = [/SweepScout/i, /Trust Dashboard/i];
const customerPaths = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/forgot-password",
  "/reset-password",
  "/policies",
  "/policies/terms",
  "/policies/privacy",
  "/policies/acceptable-use",
  "/policies/subscriptions",
  "/policies/credits",
  "/policies/attribution",
  "/policies/copyright",
  "/policies/disclaimer",
  "/policies/affiliate",
];

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
function parseColor(value) {
  const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  assert.ok(match, `unparseable computed color: ${value}`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/auth/session")
        ? null
        : path.endsWith("/config")
          ? { mode: "supabase", openaiConfigured: true, openaiModel: "fixture", supabaseConfigured: true, inboxConfigured: false, inboxProvider: "gmail", inboxEmail: "", browserHeadless: true, warnings: [] }
          : {};
      await route.fulfill({ status: path.endsWith("/auth/session") ? 401 : 200, contentType: "application/json", body: JSON.stringify(path.endsWith("/auth/session") ? { ok: false, error: "Unauthorized" } : { ok: true, data }) });
    });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    // 1. "Start Scanning" CTA is visibly rendered: visible, non-zero size, and its text paints
    //    with a foreground that actually contrasts with the pill background (blank-white-pill guard).
    const cta = page.getByRole("link", { name: /Start Scanning/ }).first();
    await cta.waitFor({ state: "visible" });
    const box = await cta.boundingBox();
    assert.ok(box && box.width > 80 && box.height >= 40, `Start Scanning CTA has degenerate box at ${width}px: ${JSON.stringify(box)}`);
    const styles = await cta.evaluate((element) => {
      const computed = getComputedStyle(element);
      // Walk up until we find an opaque-ish background so gradient/transparent parents don't hide the real pill color.
      return { color: computed.color, backgroundColor: computed.backgroundColor, opacity: Number(computed.opacity), visibility: computed.visibility, fontSize: parseFloat(computed.fontSize), textIndent: computed.textIndent };
    });
    assert.equal(styles.visibility, "visible");
    assert.ok(styles.opacity > 0.9, `CTA opacity ${styles.opacity} at ${width}px`);
    assert.ok(styles.fontSize >= 12, `CTA font-size ${styles.fontSize}px at ${width}px`);
    const fg = parseColor(styles.color);
    const bg = parseColor(styles.backgroundColor);
    assert.ok(fg.alpha > 0.9, `CTA text is transparent (alpha ${fg.alpha}) at ${width}px`);
    assert.ok(bg.alpha > 0.9, `CTA pill background is transparent (alpha ${bg.alpha}) at ${width}px — cascade regression`);
    const ratio = contrastRatio(fg.rgb, bg.rgb);
    // Deterministic contrast assertion: brand tokens (foreground pill + inverse text) must stay >= WCAG AA 4.5:1.
    assert.ok(ratio >= 4.5, `Start Scanning CTA contrast ${ratio.toFixed(2)}:1 < 4.5:1 at ${width}px (color ${styles.color} on ${styles.backgroundColor})`);

    // 2. Hero artwork loads (decoded, natural dimensions present).
    const hero = page.locator('img[src*="play-pack-pilot-hero"]');
    await hero.waitFor({ state: "attached" });
    const heroLoaded = await hero.evaluate((img) => img.complete && img.naturalWidth > 0);
    assert.ok(heroLoaded, `hero artwork failed to load at ${width}px`);

    // 3. No horizontal overflow.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const offenders = overflow > 1
      ? await page.evaluate(() => [...document.querySelectorAll("body *")]
          .map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 60), right: Math.round(element.getBoundingClientRect().right), className: element.getAttribute("class") }))
          .filter((item) => item.right > document.documentElement.clientWidth + 1)
          .slice(0, 8))
      : [];
    assert.ok(overflow <= 1, `home page overflows by ${overflow}px at ${width}px: ${JSON.stringify(offenders)}`);

    // 4. Retired brand copy must not return to customer-facing pages (body text + document title).
    // Copy is width-independent, so sweep every route once (at the narrowest width) and re-verify the home page at each width.
    const pathsToSweep = width === widths[0] ? customerPaths : ["/"];
    for (const path of pathsToSweep) {
      if (path !== "/") await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      const surface = `${await page.title()}\n${await page.evaluate(() => document.body.innerText)}`;
      for (const pattern of retiredCopy) {
        assert.ok(!pattern.test(surface), `retired copy ${pattern} found on ${path} at ${width}px`);
      }
    }
    await context.close();
    console.log(`Brand checks passed at ${width}px (CTA contrast, hero artwork, overflow, retired copy).`);
  }
  console.log("Brand home browser smoke passed at 375/768/1024/1440px.");
} finally {
  await browser.close();
}
