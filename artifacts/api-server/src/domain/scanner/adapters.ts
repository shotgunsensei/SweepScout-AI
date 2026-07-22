import type { AdapterResult, ApprovedSource, DiscoveryCandidate, ScannerAdapter, SourceFetcher } from "@/lib/scanner/types";
import { SourceResponseError } from "@/lib/scanner/types";

export const scannerAdapters: ScannerAdapter[] = [
  { accessMethod: "rss", scan: scanFeed },
  { accessMethod: "atom", scan: scanFeed },
  { accessMethod: "json_api", scan: scanJsonApi },
  { accessMethod: "structured_html", scan: scanStructuredHtml },
  { accessMethod: "admin_url", scan: scanAdminUrls },
  { accessMethod: "admin_import", scan: scanAdminUrls },
];

async function scanFeed(source: ApprovedSource, fetcher: SourceFetcher): Promise<AdapterResult> {
  const response = await fetcher.fetch(source, configuredEndpoint(source));
  const elements = [...response.body.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  if (!elements.length) throw new SourceResponseError("Feed contains no RSS items or Atom entries.");
  const candidates = elements.map(([, , body]) => ({
    url: extractFeedLink(body),
    title: decodeXml(extractTag(body, "title")),
    summary: decodeXml(extractTag(body, "description") || extractTag(body, "summary") || extractTag(body, "content")),
    publishedAt: dateOrNull(extractTag(body, "pubDate") || extractTag(body, "published") || extractTag(body, "updated")),
    evidence: { adapter: source.accessMethod, feedUrl: response.url },
  })).filter((candidate) => candidate.url);
  if (!candidates.length) throw new SourceResponseError("Feed entries do not contain usable links.");
  return success(candidates);
}

async function scanJsonApi(source: ApprovedSource, fetcher: SourceFetcher): Promise<AdapterResult> {
  const response = await fetcher.fetch(source, configuredEndpoint(source));
  let payload: unknown;
  try { payload = JSON.parse(response.body); } catch { throw new SourceResponseError("JSON source returned malformed JSON."); }
  const config = source.configuration;
  const items = valueAtPath(payload, textConfig(config, "resultsPath", "results"));
  if (!Array.isArray(items)) throw new SourceResponseError("JSON source result path is not an array.");
  const candidates = items.map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      url: stringValue(record[textConfig(config, "urlField", "url")]),
      title: stringValue(record[textConfig(config, "titleField", "title")]),
      summary: stringValue(record[textConfig(config, "summaryField", "summary")]),
      publishedAt: dateOrNull(stringValue(record[textConfig(config, "publishedAtField", "published_at")])),
      evidence: { adapter: "json_api", endpoint: response.url },
    };
  }).filter((candidate) => candidate.url);
  return success(candidates);
}

async function scanStructuredHtml(source: ApprovedSource, fetcher: SourceFetcher): Promise<AdapterResult> {
  const response = await fetcher.fetch(source, configuredEndpoint(source));
  const scripts = [...response.body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates: DiscoveryCandidate[] = [];
  const warnings: string[] = [];
  for (const [, json] of scripts) {
    try {
      collectStructuredCandidates(JSON.parse(json), candidates, response.url);
    } catch {
      warnings.push("Ignored malformed JSON-LD block.");
    }
  }
  if (!scripts.length) throw new SourceResponseError("Structured HTML source contains no JSON-LD blocks.");
  return { ...success(candidates), warnings };
}

async function scanAdminUrls(source: ApprovedSource): Promise<AdapterResult> {
  const urls = source.configuration.urls;
  if (!Array.isArray(urls)) throw new SourceResponseError("Administrator source configuration must contain a URL array.");
  const candidates = urls.map((value) => isRecord(value) ? {
    url: stringValue(value.url),
    title: stringValue(value.title),
    summary: stringValue(value.summary),
    publishedAt: dateOrNull(stringValue(value.publishedAt)),
    evidence: { adapter: source.accessMethod, submittedByAdministrator: true },
  } : { url: stringValue(value), title: "", summary: "", publishedAt: null, evidence: { adapter: source.accessMethod, submittedByAdministrator: true } }).filter((candidate) => candidate.url);
  return { candidates, pagesRequested: 0, pagesSuccessful: 0, pagesFailed: 0, warnings: [] };
}

function collectStructuredCandidates(value: unknown, output: DiscoveryCandidate[], sourceUrl: string) {
  if (Array.isArray(value)) return value.forEach((item) => collectStructuredCandidates(item, output, sourceUrl));
  if (!isRecord(value)) return;
  if (Array.isArray(value["@graph"])) collectStructuredCandidates(value["@graph"], output, sourceUrl);
  const url = stringValue(value.url) || stringValue(value["@id"]);
  if (url) output.push({
    url,
    title: stringValue(value.name) || stringValue(value.headline),
    summary: stringValue(value.description),
    publishedAt: dateOrNull(stringValue(value.datePublished) || stringValue(value.startDate)),
    evidence: { adapter: "structured_html", sourceUrl, schemaType: value["@type"] ?? null },
  });
  if (value.itemListElement) collectStructuredCandidates(value.itemListElement, output, sourceUrl);
  if (value.item) collectStructuredCandidates(value.item, output, sourceUrl);
}

function configuredEndpoint(source: ApprovedSource) {
  return textConfig(source.configuration, "endpoint", source.baseUrl);
}

function extractFeedLink(body: string) {
  const atom = body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  return decodeXml(atom ?? extractTag(body, "link"));
}

function extractTag(body: string, name: string) {
  const match = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return (match?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/<[^>]+>/g, " ").trim();
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

function valueAtPath(value: unknown, path: string) {
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}

function textConfig(config: Record<string, unknown>, key: string, fallback: string) {
  return typeof config[key] === "string" && config[key].trim() ? config[key].trim() : fallback;
}

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function dateOrNull(value: string) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function success(candidates: DiscoveryCandidate[]): AdapterResult { return { candidates, pagesRequested: 1, pagesSuccessful: 1, pagesFailed: 0, warnings: [] }; }
