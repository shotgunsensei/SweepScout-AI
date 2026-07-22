import { createHash } from "node:crypto";
import type { DedupeDecision, DedupeRecord, SweepstakesExtraction } from "./types";

export const DEDUPE_THRESHOLDS = { automaticMerge: 0.82, humanReview: 0.55 } as const;

export function normalizeTitle(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }
export function canonicalUrl(value: string) {
  const url = new URL(value); url.hash = ""; url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, ""); return url.toString();
}
export function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function extractionToDedupeRecord(extraction: SweepstakesExtraction, id = "candidate"): DedupeRecord {
  const prizes = extraction.prizes.value ?? [];
  return {
    id, canonicalUrl: canonicalUrl(extraction.officialPromotionUrl.value ?? extraction.officialPromotionUrl.location.pageUrl),
    sponsor: normalizeTitle(extraction.sponsor.value ?? ""), normalizedTitle: normalizeTitle(extraction.title.value ?? ""),
    startDate: extraction.startDate.value, endDate: extraction.endDate.value, rulesUrl: extraction.officialRulesUrl.value ? canonicalUrl(extraction.officialRulesUrl.value) : null,
    officialPromotionId: extraction.officialPromotionId.value, prizeFingerprint: fingerprint(prizes.map((p) => [normalizeTitle(p.name), p.quantity, p.estimatedValue])),
    contentFingerprint: fingerprint([extraction.title.evidence, extraction.sponsor.evidence, extraction.prizes.evidence].join(" ").toLowerCase()),
  };
}

export function resolveDuplicate(candidate: DedupeRecord, existing: DedupeRecord[]): DedupeDecision {
  let best: DedupeDecision = { action: "separate", score: 0, matchedRecordId: null, signals: {} };
  for (const record of existing) {
    const signals: Record<string, number> = {
      canonicalUrl: exact(candidate.canonicalUrl, record.canonicalUrl), promotionId: exact(candidate.officialPromotionId, record.officialPromotionId),
      rulesUrl: exact(candidate.rulesUrl, record.rulesUrl), sponsor: exact(candidate.sponsor, record.sponsor), title: similarity(candidate.normalizedTitle, record.normalizedTitle),
      dates: dateMatch(candidate, record), prizes: exact(candidate.prizeFingerprint, record.prizeFingerprint), content: exact(candidate.contentFingerprint, record.contentFingerprint),
    };
    let score = signals.canonicalUrl * .38 + signals.promotionId * .32 + signals.rulesUrl * .15 + signals.sponsor * .06 + signals.title * .04 + signals.dates * .06 + signals.prizes * .06 + signals.content * .09;
    // A title match is discovery evidence only. Automatic merging requires a strong identity signal.
    if (!signals.canonicalUrl && !signals.promotionId && !signals.rulesUrl) score = Math.min(score, .74);
    score = Math.min(1, Number(score.toFixed(4)));
    if (score > best.score) best = { action: score >= DEDUPE_THRESHOLDS.automaticMerge ? "automatic_merge" : score >= DEDUPE_THRESHOLDS.humanReview ? "human_review" : "separate", score, matchedRecordId: record.id, signals };
  }
  return best;
}
function exact(a: string | null, b: string | null) { return a && b && a === b ? 1 : 0; }
function dateMatch(a: DedupeRecord, b: DedupeRecord) { const values = [exact(a.startDate, b.startDate), exact(a.endDate, b.endDate)]; return values.some(Boolean) ? values.reduce((x, y) => x + y, 0) / 2 : 0; }
function similarity(a: string, b: string) { if (!a || !b) return 0; const aa = new Set(a.split(" ")), bb = new Set(b.split(" ")); const shared = [...aa].filter((v) => bb.has(v)).length; return shared / Math.max(aa.size, bb.size); }
