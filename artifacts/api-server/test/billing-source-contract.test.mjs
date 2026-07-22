import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const [routes,stripe,credits]=await Promise.all(["../src/routes/sweepscout.ts","../src/domain/billing/stripe.ts","../src/domain/billing/credits.ts"].map((path)=>readFile(new URL(path,import.meta.url),"utf8")));
test("billing mutations derive the owner from authenticated request context",()=>{assert.ok((routes.match(/requireRequestAuth\(req\)\.userId|auth\.userId/g)??[]).length>=15);assert.doesNotMatch(routes,/req\.body\?\.userId/);assert.doesNotMatch(routes,/req\.body\?\.origin/);});
test("webhooks verify raw bytes and browser success never activates subscriptions",()=>{assert.match(routes,/handleStripeWebhook\(rawBody/);assert.match(stripe,/verifyStripeSignature\(rawBody/);assert.match(stripe,/Live-mode Stripe events are disabled/);const checkout=stripe.slice(stripe.indexOf('event.type==="checkout.session.completed"'),stripe.indexOf('event.type.startsWith'));assert.doesNotMatch(checkout,/saveSubscription|grantPaidPeriod|replaceEntitlements/);});
test("all metered AI routes use the central consume and refund service",()=>{assert.ok((routes.match(/withPilotCredits\(/g)??[]).length>=3);assert.match(credits,/repository\.consume/);assert.match(credits,/repository\.refund/);assert.match(credits,/repository\.subscription/);});
