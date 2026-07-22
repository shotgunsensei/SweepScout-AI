import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [routes, repository] = await Promise.all([readFile(new URL("../src/routes/sweepscout.ts", import.meta.url), "utf8"), readFile(new URL("../src/domain/radar/repository.ts", import.meta.url), "utf8")]);
test("radar routes derive every personal operation from authenticated identity", () => { assert.match(routes, /new SupabaseRadarRepository\(\)\.search\(auth\.userId/); assert.match(routes, /setSaved\(auth\.userId/); assert.match(routes, /setStatus\(auth\.userId/); assert.doesNotMatch(routes, /req\.(?:query|body)\?\.userId/); });
test("repository scopes saved and status reads and writes by authenticated user", () => { assert.ok((repository.match(/\.eq\("user_id", userId\)/g) ?? []).length >= 4); assert.match(repository, /filtersToRpc\(filters, userId\)/); });
