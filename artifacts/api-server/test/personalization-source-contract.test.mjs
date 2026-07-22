import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [routes, repository] = await Promise.all([readFile(new URL("../src/routes/sweepscout.ts", import.meta.url), "utf8"), readFile(new URL("../src/domain/personalization/repository.ts", import.meta.url), "utf8")]);
test("Hangar, Mission Log, notes, saved searches, and ICS routes use authenticated identity", () => { for (const route of ["/hangar", "/mission-log", "/search-profiles", "/personal/calendar.ics"]) assert.ok(routes.includes(route)); assert.ok((routes.match(/auth\.userId/g) ?? []).length >= 14); assert.doesNotMatch(routes, /req\.(?:query|body)\?\.userId/); });
test("all personal repository mutations scope owners server-side", () => { assert.ok((repository.match(/\.eq\("user_id", userId\)/g) ?? []).length >= 10); assert.match(repository, /userReported|user-reported/i); assert.match(repository, /sponsor receipt/i); assert.match(repository, /slice\(0, 100\)/); });
