export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export type SearchProviderInput = {
  query: string;
  maxResults: number;
};

export type SearchProvider = {
  name: string;
  search(input: SearchProviderInput): Promise<SearchResult[]>;
};

type RawJsonSearchResult = {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
};

export class MockSearchProvider implements SearchProvider {
  name = "mock";

  async search(input: SearchProviderInput): Promise<SearchResult[]> {
    const seed = mockResults.filter((result) => matchesQuery(result, input.query));
    const fallback = seed.length ? seed : mockResults;
    return fallback.slice(0, input.maxResults).map((result) => ({
      ...result,
      source: `${this.name}:${input.query}`,
    }));
  }
}

export class JsonSearchProvider implements SearchProvider {
  name = "json-http";

  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}

  async search(input: SearchProviderInput): Promise<SearchResult[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", input.query);
    url.searchParams.set("num", String(input.maxResults));

    const response = await fetch(url, {
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`Search provider failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as {
      results?: RawJsonSearchResult[];
      organic_results?: RawJsonSearchResult[];
    };
    const rawResults = payload.results ?? payload.organic_results ?? [];
    return rawResults
      .map((result) => ({
        title: result.title ?? result.url ?? result.link ?? "Untitled result",
        url: result.url ?? result.link ?? "",
        snippet: result.snippet ?? "",
        source: this.name,
      }))
      .filter((result) => result.url);
  }
}

export function getSearchProvider(name = process.env.SEARCH_PROVIDER ?? "mock"): SearchProvider {
  if (name === "json-http") {
    const endpoint = process.env.SEARCH_PROVIDER_ENDPOINT;
    if (!endpoint) {
      throw new Error("SEARCH_PROVIDER_ENDPOINT is required when SEARCH_PROVIDER=json-http.");
    }
    return new JsonSearchProvider(endpoint, process.env.SEARCH_PROVIDER_API_KEY);
  }

  return new MockSearchProvider();
}

const mockResults: SearchResult[] = [
  {
    title: "2026 Backyard Gear Sweepstakes Official Rules",
    url: "https://promos.example.com/backyard-gear-sweepstakes?utm_source=mock#enter",
    snippet: "No purchase necessary. Open to legal residents. Enter online through the official form.",
    source: "mock",
  },
  {
    title: "Instant Win Game No Purchase Necessary",
    url: "https://instant.example.org/win-game/rules",
    snippet: "Official rules, free alternate method of entry, and instant win prize details.",
    source: "mock",
  },
  {
    title: "Travel Escape Sweepstakes",
    url: "http://travel.example.net/sweepstakes/escape/",
    snippet: "Enter the 2026 travel sweepstakes online. No purchase necessary.",
    source: "mock",
  },
  {
    title: "Daily Coffee Giveaway Official Rules",
    url: "https://www.coffee.example.com/promotions/daily-giveaway?ref=search",
    snippet: "Daily entry limit applies. See official rules for eligibility.",
    source: "mock",
  },
  {
    title: "New York Morning FM Summer Cash Contest",
    url: "https://promos.localradio.example.com/new-york-summer-cash/rules",
    snippet: "Radio station contest. Open to New York, New Jersey, and Connecticut residents. No purchase necessary.",
    source: "mock",
  },
  {
    title: "Long Island Auto Group Weekend Giveaway",
    url: "https://dealer.example.com/long-island-weekend-giveaway",
    snippet: "Local dealership giveaway official rules. Open to NY residents 18+. Online entry available.",
    source: "mock",
  },
  {
    title: "Hudson Valley Grocery Rewards Sweepstakes",
    url: "https://grocery.example.org/hudson-valley-rewards-sweepstakes",
    snippet: "Grocery store sweepstakes with one online entry per day and no purchase necessary.",
    source: "mock",
  },
  {
    title: "Queens Chamber Local Business Prize Drawing",
    url: "https://chamber.example.net/queens-local-business-prize",
    snippet: "Chamber of commerce promotion for local business gift cards. See official rules for eligibility.",
    source: "mock",
  },
  {
    title: "County Fair Truck Giveaway",
    url: "https://fair.example.org/county-fair-truck-giveaway",
    snippet: "County fair giveaway. Winner must be present to win and claim prize at the fairgrounds.",
    source: "mock",
  },
  {
    title: "Suspicious Prize Hub",
    url: "https://blocked.example.com/too-good-to-be-true",
    snippet: "Partner offer wall with unclear rules.",
    source: "mock",
  },
];

function matchesQuery(result: SearchResult, query: string) {
  const haystack = `${result.title} ${result.snippet}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .some((word) => haystack.includes(word));
}
