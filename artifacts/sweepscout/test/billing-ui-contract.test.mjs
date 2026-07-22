import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const [app,billing,pricing]=await Promise.all(["../src/App.tsx","../src/pages/billing.tsx","../src/pages/pricing.tsx"].map((path)=>readFile(new URL(path,import.meta.url),"utf8")));
test("public pricing and protected customer billing have dedicated routes",()=>{assert.match(app,/path="\/pricing"/);assert.match(app,/path="\/dashboard\/billing"/);assert.match(app,/BillingPage/);});
test("billing UI covers plan, renewal, portal, credits, failure, cancellation, and cost disclosure",()=>{for(const phrase of ["Current plan","Pilot Credits","Renewal / access through","Stripe Customer Portal","Cancel at period end","Resume subscription","AI cost disclosure","Pilot Credit history","Payment failed","Insufficient Pilot Credits"])assert.ok(billing.includes(phrase),phrase);});
test("pricing states the financial and sweepstakes boundary",()=>{for(const phrase of ["never entries or odds","no cash or prize value","cannot purchase entries","Start Scanning"])assert.ok(pricing.includes(phrase),phrase);});
