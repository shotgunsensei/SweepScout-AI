const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
];

export function normalizeDiscoveryUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs can be discovered.");
  }
  parsed.hash = "";
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }

  const sortedParams = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  parsed.search = "";
  for (const [key, paramValue] of sortedParams) {
    parsed.searchParams.append(key, paramValue);
  }

  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
  }

  return parsed.toString();
}

export function getRegistrableDomain(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const parts = hostname.split(".");
  if (parts.length <= 2) {
    return hostname;
  }

  const secondLevelSuffixes = new Set(["co.uk", "com.au", "co.nz", "com.br"]);
  const suffix = parts.slice(-2).join(".");
  if (secondLevelSuffixes.has(suffix) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

export function isBlockedDomain(url: string, blockedDomains: Iterable<string>) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const domain = getRegistrableDomain(url);
  for (const blocked of blockedDomains) {
    const normalized = blocked.trim().toLowerCase().replace(/^www\./, "");
    if (!normalized) continue;
    if (hostname === normalized || domain === normalized || hostname.endsWith(`.${normalized}`)) {
      return true;
    }
  }
  return false;
}
