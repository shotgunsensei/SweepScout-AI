import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, shell, hangar, mission, detail] = await Promise.all(["../src/App.tsx", "../src/components/app-shell.tsx", "../src/pages/hangar.tsx", "../src/pages/entries.tsx", "../src/pages/sweepstakes-detail.tsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
test("authenticated shell exposes dedicated Hangar and Mission Log routes", () => { assert.match(app, /dashboard\/hangar/); assert.match(shell, /label: "Hangar"/); assert.match(shell, /label: "Mission Log"/); });
test("Hangar exposes sort, filter, bulk, notes, profiles, and calendar controls", () => { for (const phrase of ["Sort", "Priority", "Status", "Mark high priority", "Private planning note", "Saved radar profiles", "Export mission calendar"]) assert.ok(hangar.includes(phrase)); });
test("Mission Log separates required states and communicates reporting limits", () => { for (const phrase of ["Entered today", "Daily entries due", "Entered previously", "Skipped", "Hidden", "Won", "Expired", "user-reported"]) assert.ok(mission.toLowerCase().includes(phrase.toLowerCase())); assert.match(detail, /Why this matches/); });
