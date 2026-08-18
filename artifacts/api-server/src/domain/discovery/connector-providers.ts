import { ReplitConnectors } from "@replit/connectors-sdk";
import type { SearchProvider, SearchProviderInput, SearchResult } from "@/lib/discovery/providers";

const connectors = new ReplitConnectors();

export function connectorsConfigured() {
  return Boolean(process.env.REPLIT_CONNECTORS_HOSTNAME);
}

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
};

/** Real web search via the Brave Search connector. Finds publicly posted brand/company sweepstakes pages. */
export class BraveSearchProvider implements SearchProvider {
  name = "brave";

  async search(input: SearchProviderInput): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: input.query,
      count: String(Math.min(Math.max(input.maxResults, 1), 20)),
      freshness: "pm",
      safesearch: "moderate",
    });
    const response = await connectors.proxy("brave", `/res/v1/web/search?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Brave search failed with HTTP ${response.status}. ${body.slice(0, 200)}`);
    }
    const payload = (await response.json()) as { web?: { results?: BraveWebResult[] } };
    return (payload.web?.results ?? [])
      .map((result) => ({
        title: result.title ?? result.url ?? "Untitled result",
        url: result.url ?? "",
        snippet: stripHtml(result.description ?? ""),
        source: this.name,
        sourceType: "brand" as const,
      }))
      .filter((result) => result.url);
  }
}

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    description?: string;
  };
};

/**
 * Batch-fetch full video descriptions via videos.list (part=snippet).
 * One API call costs 1 quota unit regardless of how many IDs are included (up to 50).
 * Returns a map of videoId → full description text.
 */
async function fetchVideoDescriptions(videoIds: string[]): Promise<Map<string, string>> {
  if (!videoIds.length) return new Map();
  const params = new URLSearchParams({
    part: "snippet",
    id: videoIds.join(","),
    maxResults: String(videoIds.length),
  });
  const response = await connectors.proxy("youtube", `/youtube/v3/videos?${params.toString()}`);
  if (!response.ok) {
    // Non-fatal: fall back to empty map so search results still land
    return new Map();
  }
  const payload = (await response.json()) as { items?: YouTubeVideoItem[] };
  const map = new Map<string, string>();
  for (const item of payload.items ?? []) {
    if (item.id && item.snippet?.description) {
      map.set(item.id, item.snippet.description);
    }
  }
  return map;
}

// Domains whose URLs in a video description are navigation/social links, not entry pages.
const EXCLUDED_ENTRY_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "linkedin.com",
  "patreon.com",
  "discord.gg",
  "discord.com",
  "twitch.tv",
  "reddit.com",
  "linktr.ee",
  "linktree.com",
]);

/** Extract the first external HTTPS URL from a video description that looks like an entry page. */
function extractEntryUrl(description: string): string | null {
  // Match raw HTTPS URLs; stop at whitespace or common URL-terminating characters
  const urlPattern = /https:\/\/[^\s"'<>)\]]+/gi;
  const matches = description.match(urlPattern) ?? [];
  for (const raw of matches) {
    // Strip trailing punctuation that is unlikely to be part of the URL
    const cleaned = raw.replace(/[.,;:!?]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    // Check exact hostname and registrable domain against exclusion list
    const parts = hostname.split(".");
    const registrable = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    if (EXCLUDED_ENTRY_DOMAINS.has(hostname) || EXCLUDED_ENTRY_DOMAINS.has(registrable)) {
      continue;
    }
    return cleaned;
  }
  return null;
}

const GIVEAWAY_TERMS = ["giveaway", "sweepstake", "win", "contest", "free entry", "no purchase"];

// The YouTube Data API allows roughly 100 search.list calls per day. Guard the
// shared quota with a process-wide daily budget covering manual and scheduled runs.
const youtubeQuota = { day: "", used: 0 };

function consumeYouTubeSearchBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (youtubeQuota.day !== today) {
    youtubeQuota.day = today;
    youtubeQuota.used = 0;
  }
  const limit = boundedYouTubeDailyLimit();
  if (youtubeQuota.used >= limit) {
    throw new Error(`Daily YouTube search budget (${limit}) is exhausted. Try again tomorrow or raise YOUTUBE_SEARCH_DAILY_LIMIT.`);
  }
  youtubeQuota.used += 1;
}

function boundedYouTubeDailyLimit() {
  const parsed = Number(process.env.YOUTUBE_SEARCH_DAILY_LIMIT);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 90 ? parsed : 30;
}

/** Creator giveaway discovery via the YouTube Data API connector. Search quota is ~100 calls/day — keep query counts low. */
export class YouTubeSearchProvider implements SearchProvider {
  name = "youtube";

  async search(input: SearchProviderInput): Promise<SearchResult[]> {
    consumeYouTubeSearchBudget();
    const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      part: "snippet",
      q: input.query,
      type: "video",
      order: "date",
      maxResults: String(Math.min(Math.max(input.maxResults, 1), 25)),
      publishedAfter,
      relevanceLanguage: "en",
      safeSearch: "moderate",
    });
    const response = await connectors.proxy("youtube", `/youtube/v3/search?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`YouTube search failed with HTTP ${response.status}. ${body.slice(0, 200)}`);
    }
    const payload = (await response.json()) as { items?: YouTubeSearchItem[] };

    // Collect matching items first so we only fetch descriptions for giveaway videos.
    const matchingItems: Array<{ videoId: string; snippet: NonNullable<YouTubeSearchItem["snippet"]> }> = [];
    for (const item of payload.items ?? []) {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet?.title) continue;
      const haystack = `${snippet.title} ${snippet.description ?? ""}`.toLowerCase();
      if (!GIVEAWAY_TERMS.some((term) => haystack.includes(term))) continue;
      matchingItems.push({ videoId, snippet });
    }

    // Batch-fetch full descriptions (1 quota unit for the whole batch, non-fatal on failure).
    const descriptions = await fetchVideoDescriptions(matchingItems.map((i) => i.videoId));

    const results: SearchResult[] = [];
    for (const { videoId, snippet } of matchingItems) {
      const channelTitle = snippet.channelTitle ?? "Unknown creator";
      const fullDescription = descriptions.get(videoId) ?? snippet.description ?? "";
      const entryUrl = extractEntryUrl(fullDescription);
      results.push({
        title: decodeEntities(snippet.title ?? ""),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        snippet: fullDescription.slice(0, 400),
        source: this.name,
        sourceType: "creator",
        creator: {
          platform: "youtube",
          channelTitle: decodeEntities(channelTitle),
          channelUrl: snippet.channelId ? `https://www.youtube.com/channel/${snippet.channelId}` : null,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        },
        entryUrl,
      });
    }
    return results;
  }
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ""));
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
