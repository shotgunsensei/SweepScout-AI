import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [policies, app, settings, home, html] = await Promise.all([
  readFile(new URL("../src/pages/policies.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/settings.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/home.tsx", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

test("all Phase 11 attorney-review policy drafts are public routes", () => {
  for (const slug of ["terms", "privacy", "acceptable-use", "subscriptions", "credits", "attribution", "copyright", "disclaimer", "affiliate"]) assert.match(policies, new RegExp(`(?:\\"|')${slug}(?:\\"|')`));
  assert.match(app, /\/policies\/:slug/);
  assert.match(home, /\/policies\/privacy/);
  assert.match(home, /\/policies\/terms/);
  assert.match(policies, /attorney approval/i);
});

test("required sponsor, AI, eligibility, odds, and subscription disclaimers are explicit", () => {
  for (const phrase of ["discovery and research service", "does not sponsor or administer", "official rules", "Eligibility is determined by the sponsor", "AI analysis may be incomplete", "Winning is never guaranteed", "does not purchase entries or improve odds"]) assert.match(policies, new RegExp(phrase, "i"));
});

test("privacy controls expose authenticated export, reviewed deletion, essential-cookie notice, and public policy links", () => {
  assert.match(settings, /\/api\/auth\/data-export/);
  assert.match(settings, /Request deletion/);
  assert.match(settings, /essential authentication, refresh, and CSRF-protection cookies/);
  assert.match(settings, /\/policies\/privacy/);
});

test("the public document installs a restrictive content security policy", () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /connect-src 'self'/);
});
