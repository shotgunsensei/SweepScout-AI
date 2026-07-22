import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [radar, detail, card] = await Promise.all([readFile(new URL("../src/pages/sweepstakes.tsx", import.meta.url), "utf8"), readFile(new URL("../src/pages/sweepstakes-detail.tsx", import.meta.url), "utf8"), readFile(new URL("../src/components/opportunity-card.tsx", import.meta.url), "utf8")]);
test("radar renders loading, error, empty, pagination, and responsive filter states", () => { for (const term of ["LoadingState", "ErrorNotice", "EmptyState", "Previous", "Next page", "sm:grid-cols-2", "xl:grid-cols-4"]) assert.match(radar, new RegExp(term)); });
test("radar exposes all customer discovery views and query-string persistence", () => { for (const term of ["Best matches", "New", "Ending soon", "Highest value", "Lowest effort", "Daily entries", "One-time", "Recently verified", "Popular saves", "history.replaceState"]) assert.match(radar, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); });
test("cards include required intelligence and personal actions", () => { for (const term of ["primaryPrize", "timeRemaining", "entryEffortScore", "eligibilityStatus", "matchScore", "legitimacyScore", "onSave", "onHide", "View details"]) assert.match(card, new RegExp(term)); });
test("official outbound links open safely and the detail page carries sponsor disclaimers", () => { assert.match(detail, /target="_blank"/); assert.match(detail, /rel="noopener noreferrer external"/); assert.match(detail, /referrerPolicy="no-referrer"/); assert.match(detail, /Visit Official Sweepstakes/); assert.match(detail, /item\.safety\.map/); });
