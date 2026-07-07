import { writeAuditLog } from "@/lib/audit";
import { normalizeDiscoveryUrl } from "@/lib/discovery/url";
import { saveExtensionPage } from "@/lib/services/browser-extension";
import { runRulesExtraction } from "@/lib/services/openai-extraction";
import { assertFeatureAllowed } from "@/lib/services/tenancy";
import { getStore } from "@/lib/storage/store";
import type { Sweepstake, SweepstakeStatus } from "@/lib/types";

export type ImportSource = "csv" | "url_list" | "bookmarks" | "manual" | "text";
export type ImportExtractionStatus = "completed" | "needs_review" | "needs_upgrade" | "failed" | "skipped";
export type ImportResultStatus = "created" | "updated" | "failed";

export type ImportCandidate = {
  url: string;
  title?: string | null;
  sponsor?: string | null;
  rulesUrl?: string | null;
  formUrl?: string | null;
  text?: string | null;
  sourceLabel?: string | null;
};

export type ImportItemResult = {
  inputUrl: string;
  normalizedUrl: string | null;
  title: string | null;
  status: ImportResultStatus;
  created: boolean;
  sweepstakeId: string | null;
  sweepstakeStatus: SweepstakeStatus | null;
  scamScore: number | null;
  eligibilityScore: number | null;
  queuePlacement: "entry_queue" | "review_queue" | "blocked" | "failed";
  extractionStatus: ImportExtractionStatus;
  message: string;
};

export type ImportRunReport = {
  source: ImportSource;
  generatedAt: string;
  totals: {
    parsed: number;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    extracted: number;
    queuedForEntry: number;
    queuedForReview: number;
  };
  items: ImportItemResult[];
};

export type ImportRunInput = {
  source: ImportSource;
  csvText?: string;
  urlsText?: string;
  bookmarkHtml?: string;
  manual?: ImportCandidate;
  text?: ImportCandidate;
  extractRules?: boolean;
};

const MAX_IMPORT_TEXT_CHARS = 1_500_000;
const MAX_RULE_TEXT_CHARS = 35_000;
const MAX_IMPORT_ITEMS = 50;

export async function runImport(input: ImportRunInput): Promise<ImportRunReport> {
  const candidates = candidatesForInput(input).slice(0, MAX_IMPORT_ITEMS);
  const items: ImportItemResult[] = [];

  for (const candidate of candidates) {
    items.push(await importCandidate(candidate, input.source, input.extractRules !== false));
  }

  const totals = {
    parsed: candidates.length,
    processed: items.length,
    created: items.filter((item) => item.created).length,
    updated: items.filter((item) => item.status === "updated").length,
    failed: items.filter((item) => item.status === "failed").length,
    extracted: items.filter((item) => item.extractionStatus === "completed").length,
    queuedForEntry: items.filter((item) => item.queuePlacement === "entry_queue").length,
    queuedForReview: items.filter((item) => item.queuePlacement === "review_queue").length,
  };

  await writeAuditLog({
    actorId: null,
    action: "imports.completed",
    entityType: "import_run",
    entityId: input.source,
    severity: totals.failed ? "warn" : "info",
    message: `Import completed from ${input.source} with ${totals.created} created and ${totals.updated} updated.`,
    metadata: totals,
  });

  return {
    source: input.source,
    generatedAt: new Date().toISOString(),
    totals,
    items,
  };
}

function candidatesForInput(input: ImportRunInput): ImportCandidate[] {
  if (input.source === "csv") return parseCsvImport(input.csvText ?? "");
  if (input.source === "url_list") return parseUrlList(input.urlsText ?? "");
  if (input.source === "bookmarks") return parseBookmarkImport(input.bookmarkHtml ?? "");
  if (input.source === "manual") return input.manual ? [input.manual] : [];
  if (input.source === "text") return input.text ? [input.text] : [];
  return [];
}

async function importCandidate(candidate: ImportCandidate, source: ImportSource, extractRules: boolean): Promise<ImportItemResult> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeImportUrl(candidate.url);
  } catch (error) {
    return failedResult(candidate, error instanceof Error ? error.message : "Invalid URL.");
  }

  const baseText = buildCandidateText(candidate);
  const payload = {
    url: normalizedUrl,
    title: clean(candidate.title) ?? undefined,
    sponsor: clean(candidate.sponsor) ?? undefined,
    text: baseText,
    rulesUrl: normalizeOptionalUrl(candidate.rulesUrl),
    formUrl: normalizeOptionalUrl(candidate.formUrl) ?? normalizedUrl,
    source: sourceName(source),
    detected: true,
    signals: [`Imported from ${sourceLabel(source)}.`],
  };

  try {
    const saved = await saveExtensionPage(payload);
    let sweepstake = saved.sweepstake;
    let extractionStatus: ImportExtractionStatus = baseText ? "completed" : "skipped";
    let message = saved.message;

    if (extractRules && !baseText) {
      const extraction = await extractImportedRules(sweepstake);
      extractionStatus = extraction.status;
      message = extraction.message;
      if (extraction.sweepstake) {
        sweepstake = extraction.sweepstake;
      }
    }

    return {
      inputUrl: candidate.url,
      normalizedUrl,
      title: sweepstake.title,
      status: saved.created ? "created" : "updated",
      created: saved.created,
      sweepstakeId: sweepstake.id,
      sweepstakeStatus: sweepstake.status,
      scamScore: sweepstake.scamScore,
      eligibilityScore: sweepstake.eligibilityScore,
      queuePlacement: queuePlacementFor(sweepstake),
      extractionStatus,
      message,
    };
  } catch (error) {
    return {
      inputUrl: candidate.url,
      normalizedUrl,
      title: clean(candidate.title),
      status: "failed",
      created: false,
      sweepstakeId: null,
      sweepstakeStatus: null,
      scamScore: null,
      eligibilityScore: null,
      queuePlacement: "failed",
      extractionStatus: "failed",
      message: error instanceof Error ? error.message : "Import failed.",
    };
  }
}

async function extractImportedRules(sweepstake: Sweepstake) {
  try {
    await assertFeatureAllowed("scoring");
    const result = await runRulesExtraction(sweepstake.id);
    return {
      status: "completed" as const,
      sweepstake: result.sweepstake,
      message: "Imported, extracted rules, scored risk, and placed in queue.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rules extraction requires review.";
    const store = await getStore();
    const current = (await store.getSweepstake(sweepstake.id)) ?? sweepstake;
    return {
      status: message.includes("Upgrade is required") ? ("needs_upgrade" as const) : ("needs_review" as const),
      sweepstake: current,
      message: `Imported and queued for review. Rules extraction: ${message}`,
    };
  }
}

function parseCsvImport(csvText: string): ImportCandidate[] {
  const rows = parseCsv(csvText.slice(0, MAX_IMPORT_TEXT_CHARS));
  if (!rows.length) return [];
  const header = rows[0].map((cell) => normalizeHeader(cell));
  const hasHeader = header.some((cell) => ["url", "link", "source_url", "title", "sponsor", "rules_url"].includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = hasHeader ? header : [];

  return dataRows
    .map((row): ImportCandidate | null => csvRowToCandidate(row, headers))
    .filter((candidate): candidate is ImportCandidate => candidate !== null && Boolean(candidate.url));
}

function csvRowToCandidate(row: string[], headers: string[]): ImportCandidate | null {
  const byHeader = (names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(name);
      if (index >= 0 && clean(row[index])) return clean(row[index]);
    }
    return null;
  };
  const url = byHeader(["url", "link", "source_url", "sweepstakes_url"]) ?? clean(row[0]);
  if (!url) return null;

  const title = byHeader(["title", "name", "sweepstake", "sweepstakes"]);
  const sponsor = byHeader(["sponsor", "brand", "company"]);
  const rulesUrl = byHeader(["rules_url", "official_rules_url", "rules"]);
  const formUrl = byHeader(["form_url", "entry_url", "entry_link"]);
  const textFields = [
    byHeader(["text", "rules_text", "notes", "description", "summary"]),
    byHeader(["prize", "prize_summary"]),
    byHeader(["deadline", "end_at"]),
    byHeader(["eligibility"]),
    byHeader(["frequency", "entry_frequency"]),
  ];

  return {
    url,
    title,
    sponsor,
    rulesUrl,
    formUrl,
    text: textFields.filter(Boolean).join("\n"),
  };
}

function parseUrlList(text: string): ImportCandidate[] {
  return text
    .slice(0, MAX_IMPORT_TEXT_CHARS)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const url = extractFirstUrl(line) ?? line;
      const title = clean(line.replace(url, ""));
      return { url, title };
    });
}

function parseBookmarkImport(html: string): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  const source = html.slice(0, MAX_IMPORT_TEXT_CHARS);
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const url = decodeHtml(match[1] ?? "");
    const title = clean(stripTags(decodeHtml(match[2] ?? "")));
    if (url) candidates.push({ url, title });
  }
  return candidates;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function buildCandidateText(candidate: ImportCandidate) {
  const parts = [
    clean(candidate.title) ? `Title: ${clean(candidate.title)}` : null,
    clean(candidate.sponsor) ? `Sponsor: ${clean(candidate.sponsor)}` : null,
    clean(candidate.rulesUrl) ? `Official rules URL: ${clean(candidate.rulesUrl)}` : null,
    clean(candidate.formUrl) ? `Entry form URL: ${clean(candidate.formUrl)}` : null,
    clean(candidate.text),
  ];
  return parts.filter(Boolean).join("\n").slice(0, MAX_RULE_TEXT_CHARS);
}

function normalizeImportUrl(value: string) {
  const cleaned = clean(value)?.replace(/[<>"']/g, "");
  if (!cleaned) throw new Error("Import row is missing a URL.");
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  return normalizeDiscoveryUrl(withProtocol);
}

function normalizeOptionalUrl(value: string | null | undefined) {
  if (!clean(value)) return null;
  try {
    return normalizeImportUrl(String(value));
  } catch {
    return null;
  }
}

function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? value.match(/\b(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?/i)?.[0] ?? null;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function sourceName(source: ImportSource) {
  return `import-${source.replace(/_/g, "-")}`;
}

function sourceLabel(source: ImportSource) {
  if (source === "url_list") return "pasted URL list";
  if (source === "bookmarks") return "browser bookmarks";
  if (source === "text") return "screenshot/manual text";
  return source;
}

function queuePlacementFor(sweepstake: Sweepstake): ImportItemResult["queuePlacement"] {
  if (["eligible", "watching", "entered"].includes(sweepstake.status)) return "entry_queue";
  if (["rejected", "expired", "ineligible"].includes(sweepstake.status)) return "blocked";
  return "review_queue";
}

function failedResult(candidate: ImportCandidate, message: string): ImportItemResult {
  return {
    inputUrl: candidate.url,
    normalizedUrl: null,
    title: clean(candidate.title),
    status: "failed",
    created: false,
    sweepstakeId: null,
    sweepstakeStatus: null,
    scamScore: null,
    eligibilityScore: null,
    queuePlacement: "failed",
    extractionStatus: "failed",
    message,
  };
}

function clean(value: unknown) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
