import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { ApprovedSource, FetchResponse, SourceFetcher } from "@/lib/scanner/types";
import { SourcePolicyError, SourceResponseError } from "@/lib/scanner/types";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

export class CompliantSourceFetcher implements SourceFetcher {
  private readonly nextRequestAt = new Map<string, number>();

  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly resolveHost: (hostname: string) => Promise<Array<{ address: string }>> = async (hostname) => lookup(hostname, { all: true }),
  ) {}

  async fetch(source: ApprovedSource, rawUrl: string): Promise<FetchResponse> {
    const sourceOrigin = safePublicUrl(source.baseUrl).origin;
    let target = safePublicUrl(rawUrl);
    if (target.origin !== sourceOrigin) throw new SourcePolicyError("Scanner endpoints must remain on the approved source origin.");
    await this.assertPublicResolution(target.hostname);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.waitForRateLimit(source);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        let response: Response;
        try {
          response = await this.transport(target, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              accept: "application/atom+xml, application/rss+xml, application/json, text/html;q=0.9, */*;q=0.1",
              "user-agent": process.env.SCANNER_USER_AGENT ?? "PlayPackPilotBot/1.0 (+https://playpackpilot.com/source-policy)",
            },
          });
        } finally {
          clearTimeout(timeout);
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new SourceResponseError("Source returned a redirect without a destination.");
          const redirected = safePublicUrl(new URL(location, target).toString());
          if (redirected.origin !== sourceOrigin) throw new SourcePolicyError("Cross-origin source redirects are not followed.");
          await this.assertPublicResolution(redirected.hostname);
          target = redirected;
          throw new SourceResponseError("Approved source redirected; retrying the canonical endpoint.", true);
        }
        if (response.status === 401 || response.status === 403) throw new SourcePolicyError("Source requires authentication or denied scanner access.");
        if (response.status === 429 || response.status >= 500) throw new SourceResponseError(`Source returned HTTP ${response.status}.`, true);
        if (!response.ok) throw new SourceResponseError(`Source returned HTTP ${response.status}.`);

        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > MAX_RESPONSE_BYTES) throw new SourceResponseError("Source response exceeds the 2 MB safety limit.");
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (contentType && !isSupportedContentType(contentType)) throw new SourceResponseError(`Unsupported source content type: ${contentType}.`);
        const body = await readLimitedBody(response);
        return {
          url: target.toString(),
          status: response.status,
          contentType,
          body,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof SourcePolicyError) throw error;
        const retryable = error instanceof SourceResponseError ? error.retryable : true;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await this.sleep(250 * 2 ** (attempt - 1));
      }
    }
    if (lastError instanceof SourceResponseError) {
      throw new SourceResponseError(lastError.message, false, lastError.retryable ? MAX_ATTEMPTS : lastError.attempts);
    }
    if (lastError instanceof Error) throw new SourceResponseError(lastError.message, false, MAX_ATTEMPTS);
    throw new SourceResponseError("Source fetch failed after retries.", false, MAX_ATTEMPTS);
  }

  private async waitForRateLimit(source: ApprovedSource) {
    const interval = Math.ceil(60_000 / source.rateLimitPerMinute);
    const now = Date.now();
    const allowedAt = this.nextRequestAt.get(source.id) ?? now;
    if (allowedAt > now) await this.sleep(allowedAt - now);
    this.nextRequestAt.set(source.id, Math.max(now, allowedAt) + interval);
  }

  private async assertPublicResolution(hostname: string) {
    if (isIP(hostname)) {
      if (isPrivateAddress(hostname)) throw new SourcePolicyError("Source address is private or reserved.");
      return;
    }
    let addresses: Array<{ address: string }>;
    try {
      addresses = await this.resolveHost(hostname);
    } catch {
      throw new SourceResponseError("Source hostname could not be resolved.", true);
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new SourcePolicyError("Source hostname resolves to a private or reserved network address.");
    }
  }
}

export function safePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SourcePolicyError("Only HTTP(S) source URLs are allowed.");
  if (url.username || url.password) throw new SourcePolicyError("Credentials are not allowed in source URLs.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new SourcePolicyError("Non-standard source ports are not allowed.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new SourcePolicyError("Local source hosts are not allowed.");
  if (isPrivateAddress(hostname)) throw new SourcePolicyError("Private network source addresses are not allowed.");
  return url;
}

function isPrivateAddress(hostname: string) {
  if (!isIP(hostname)) return false;
  const mapped = mappedIpv4(hostname);
  if (mapped) return isPrivateAddress(mapped);
  if (hostname === "::1" || hostname === "0.0.0.0") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("127.") || hostname.startsWith("169.254.") || hostname.startsWith("192.168.")) return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts.length === 4 && (parts[0] === 0 || parts[0] >= 224)) return true;
  if (parts.length === 4 && parts[0] === 192 && parts[1] === 0) return true;
  if (parts.length === 4 && parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  const ipv6 = hostname.toLowerCase();
  return ipv6 === "::" || ipv6.startsWith("fc") || ipv6.startsWith("fd") || ipv6.startsWith("fe80:") || ipv6.startsWith("ff") || ipv6.startsWith("fec") || ipv6.startsWith("fed") || ipv6.startsWith("fee") || ipv6.startsWith("fef") || ipv6.startsWith("2001:db8:") || ipv6.startsWith("2001:2:") || ipv6.startsWith("100:");
}

function mappedIpv4(address: string) {
  const value = address.toLowerCase();
  if (!value.startsWith("::ffff:")) return null;
  const tail = value.slice(7);
  if (isIP(tail) === 4) return tail;
  const pieces = tail.split(":");
  if (pieces.length !== 2 || pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) return null;
  const high = Number.parseInt(pieces[0]!, 16);
  const low = Number.parseInt(pieces[1]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isSupportedContentType(contentType: string) {
  return new Set([
    "application/json",
    "application/ld+json",
    "application/rss+xml",
    "application/atom+xml",
    "application/xml",
    "text/xml",
    "text/html",
    "text/plain",
  ]).has(contentType);
}

async function readLimitedBody(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SourceResponseError("Source response exceeds the 2 MB safety limit.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
