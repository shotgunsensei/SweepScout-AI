import { createHash } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { getAppConfig, AppConfigError } from "@/lib/env";
import { getRegistrableDomain } from "@/lib/discovery/url";
import { getStore } from "@/lib/storage/store";
import { writeAuditLog } from "@/lib/audit";
import type {
  AppSettings,
  InboxAlert,
  InboxAlertKind,
  InboxAlertStatus,
  InboxConnectionSettings,
  InboxLink,
  InboxLinkKind,
  InboxProvider,
  Sweepstake,
} from "@/lib/types";
import { logger } from "../../lib/logger";

type RuntimeInboxConfig = {
  configured: boolean;
  enabled: boolean;
  provider: InboxProvider;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  maxMessagesPerPoll: number;
  warnings: string[];
};

type ParsedEmail = {
  uid: string;
  messageId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  receivedAt: string;
  recipientAliases: string[];
  text: string;
  raw: string;
  headers: Record<string, string>;
};

type RawImapMessage = {
  uid: string;
  raw: string;
  internalDate: string | null;
};

let monitorTimer: NodeJS.Timeout | null = null;

export async function getInboxStatus() {
  const store = await getStore();
  const settings = await store.getSettings();
  const runtime = resolveInboxRuntime(settings);
  return {
    configured: runtime.configured,
    enabled: runtime.enabled,
    provider: runtime.provider,
    email: runtime.email,
    host: runtime.host,
    port: runtime.port,
    mailbox: runtime.mailbox,
    secure: runtime.secure,
    warnings: runtime.warnings,
    settings: settings.inbox,
  };
}

export async function pollInboxNow() {
  const store = await getStore();
  const settings = await store.getSettings();
  const runtime = resolveInboxRuntime(settings);

  if (!runtime.enabled) {
    await store.saveSettings(markInboxPoll(settings, "disabled", "Inbox monitoring is disabled."));
    throw new AppConfigError("Inbox monitoring is disabled in Settings.");
  }

  if (!runtime.configured) {
    const message = runtime.warnings.join(" ") || "IMAP credentials are incomplete.";
    await store.saveSettings(markInboxPoll(settings, "failed", message));
    throw new AppConfigError(message);
  }

  try {
    const client = new MinimalImapClient(runtime);
    const [rawMessages, sweepstakes] = await Promise.all([
      client.fetchRecentMessages(),
      store.listSweepstakes(),
    ]);
    const parsed = rawMessages.map((message) => parseRawEmail(message));
    const alerts = parsed
      .map((message) => classifyEmail(message, runtime.provider, runtime.mailbox, sweepstakes))
      .filter((alert) => shouldPersistAlert(alert));

    const saved: InboxAlert[] = [];
    for (const alert of alerts) {
      saved.push(await store.saveInboxAlert(alert));
    }

    await store.saveSettings(markInboxPoll(settings, "ok", null));
    await writeAuditLog({
      actorId: null,
      action: "inbox.polled",
      entityType: "inbox",
      entityId: runtime.email,
      severity: saved.some((alert) => alert.severity === "danger") ? "warn" : "info",
      message: `Inbox scan parsed ${parsed.length} message(s) and stored ${saved.length} alert(s).`,
      metadata: {
        provider: runtime.provider,
        mailbox: runtime.mailbox,
        parsed: parsed.length,
        saved: saved.length,
      },
    });

    return {
      parsed: parsed.length,
      saved: saved.length,
      alerts: saved,
      status: await getInboxStatus(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox scan failed.";
    await store.saveSettings(markInboxPoll(settings, "failed", message));
    throw error;
  }
}

export async function reviewInboxAlert(input: { id: string; status: InboxAlertStatus; notes?: string }) {
  if (input.status !== "reviewed" && input.status !== "dismissed" && input.status !== "new") {
    throw new Error("Invalid inbox alert status.");
  }

  const store = await getStore();
  const alert = await store.getInboxAlert(input.id);
  if (!alert) {
    throw new Error("Inbox alert not found.");
  }

  const saved = await store.saveInboxAlert({
    ...alert,
    status: input.status,
    reviewedAt: input.status === "new" ? null : new Date().toISOString(),
    reviewNotes: input.notes?.trim() ?? alert.reviewNotes,
  });
  await writeAuditLog({
    actorId: null,
    action: "inbox_alert.reviewed",
    entityType: "inbox_alert",
    entityId: saved.id,
    severity: saved.severity === "danger" ? "warn" : "info",
    message: `Inbox alert marked ${saved.status}.`,
    metadata: {
      messageId: saved.messageId,
      categories: saved.categories,
      matchedSweepstakeId: saved.matchedSweepstakeId,
    },
  });
  return saved;
}

export async function startInboxMonitoring() {
  if (monitorTimer) {
    return;
  }

  const store = await getStore();
  const settings = await store.getSettings();
  const runtime = resolveInboxRuntime(settings);
  if (!runtime.enabled || settings.inbox.pollIntervalMinutes <= 0) {
    return;
  }

  const intervalMs = Math.max(5, settings.inbox.pollIntervalMinutes) * 60_000;
  monitorTimer = setInterval(() => {
    pollInboxNow().catch((error) => {
      logger.warn({ err: error }, "Scheduled inbox scan failed");
    });
  }, intervalMs);
  monitorTimer.unref();
}

function resolveInboxRuntime(settings: AppSettings): RuntimeInboxConfig {
  const provider = inboxProviderFrom(process.env.SWEEPSCOUT_INBOX_PROVIDER ?? settings.inbox.provider);
  const email = firstPresent(process.env.SWEEPSCOUT_INBOX_EMAIL, settings.inbox.email, process.env.SWEEPSCOUT_IMAP_USER);
  const host = firstPresent(process.env.SWEEPSCOUT_IMAP_HOST, settings.inbox.host, provider === "gmail" ? "imap.gmail.com" : "");
  const user = firstPresent(process.env.SWEEPSCOUT_IMAP_USER, email);
  const password = firstPresent(process.env.SWEEPSCOUT_IMAP_PASSWORD);
  const port = numberFrom(process.env.SWEEPSCOUT_IMAP_PORT, settings.inbox.port || 993);
  const secure = process.env.SWEEPSCOUT_IMAP_TLS !== "false";
  const warnings: string[] = [];

  if (!email) warnings.push("Set SWEEPSCOUT_INBOX_EMAIL or SWEEPSCOUT_IMAP_USER for the dedicated inbox.");
  if (!host) warnings.push("Set SWEEPSCOUT_IMAP_HOST for custom IMAP inboxes.");
  if (!user) warnings.push("Set SWEEPSCOUT_IMAP_USER for IMAP login.");
  if (!password) warnings.push("Set SWEEPSCOUT_IMAP_PASSWORD. Gmail should use an app password.");

  return {
    configured: Boolean(host && user && password),
    enabled: settings.inbox.enabled || process.env.SWEEPSCOUT_INBOX_ENABLED === "true",
    provider,
    email,
    host,
    port,
    secure,
    user,
    password,
    mailbox: firstPresent(process.env.SWEEPSCOUT_INBOX_MAILBOX, settings.inbox.mailbox, "INBOX"),
    maxMessagesPerPoll: Math.max(
      1,
      Math.min(100, numberFrom(process.env.SWEEPSCOUT_INBOX_MAX_MESSAGES, settings.inbox.maxMessagesPerPoll || 25)),
    ),
    warnings,
  };
}

function markInboxPoll(
  settings: AppSettings,
  status: InboxConnectionSettings["lastPollStatus"],
  error: string | null,
): AppSettings {
  return {
    ...settings,
    inbox: {
      ...settings.inbox,
      lastPollAt: new Date().toISOString(),
      lastPollStatus: status,
      lastPollError: error,
    },
  };
}

class MinimalImapClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private tagCounter = 0;

  constructor(private readonly config: RuntimeInboxConfig) {}

  async fetchRecentMessages(): Promise<RawImapMessage[]> {
    await this.connect();
    try {
      await this.command(`LOGIN ${quoteImap(this.config.user)} ${quoteImap(this.config.password)}`);
      await this.command(`SELECT ${quoteImap(this.config.mailbox)}`);
      const since = imapDate(daysAgo(numberFrom(process.env.SWEEPSCOUT_INBOX_LOOKBACK_DAYS, 14)));
      const search = await this.command(`UID SEARCH SINCE ${since}`);
      const uids = parseSearchUids(search).slice(-this.config.maxMessagesPerPoll).reverse();
      const messages: RawImapMessage[] = [];
      for (const uid of uids) {
        const response = await this.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`);
        const raw = extractFetchLiteral(response);
        if (raw) {
          messages.push({ uid, raw, internalDate: parseInternalDate(response) });
        }
      }
      return messages;
    } finally {
      await this.logout();
    }
  }

  private async connect() {
    const socket = this.config.secure
      ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host })
      : net.connect({ host: this.config.host, port: this.config.port });
    socket.setEncoding("utf8");
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;
      let onData: (chunk: string) => void = () => {};
      let onError: (error: Error) => void = () => {};
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        socket.off("data", onData);
        socket.off("error", onError);
      };
      onData = (chunk: string) => {
        if (chunk.includes("* OK") || chunk.includes("OK")) {
          cleanup();
          resolve();
        }
      };
      onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error("IMAP connection timed out."));
      }, 30_000);
      socket.on("data", onData);
      socket.on("error", onError);
    });
  }

  private async command(command: string) {
    const socket = this.socket;
    if (!socket) {
      throw new Error("IMAP socket is not connected.");
    }
    const tag = `A${String(++this.tagCounter).padStart(4, "0")}`;
    socket.write(`${tag} ${command}\r\n`);
    return new Promise<string>((resolve, reject) => {
      let response = "";
      let timeout: NodeJS.Timeout | null = null;
      let onData: (chunk: string) => void = () => {};
      let onError: (error: Error) => void = () => {};
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        socket.off("data", onData);
        socket.off("error", onError);
      };
      onData = (chunk: string) => {
        response += chunk;
        const taggedLine = new RegExp(`(?:^|\\r?\\n)${tag} (OK|NO|BAD)`, "i").exec(response);
        if (!taggedLine) {
          return;
        }
        cleanup();
        if (taggedLine[1].toUpperCase() === "OK") {
          resolve(response);
        } else {
          reject(new Error(trimForLog(response)));
        }
      };
      onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`IMAP command timed out: ${command.split(" ")[0]}`));
      }, 45_000);
      socket.on("data", onData);
      socket.on("error", onError);
    });
  }

  private async logout() {
    if (!this.socket) return;
    try {
      await this.command("LOGOUT");
    } catch {
      // Ignore logout failures; the socket is closed below.
    } finally {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
  }
}

function parseRawEmail(message: RawImapMessage): ParsedEmail {
  const { headers, body } = splitHeadersAndBody(message.raw);
  const subject = decodeMimeWords(headers.subject ?? "(no subject)").trim() || "(no subject)";
  const from = parseAddress(headers.from ?? "");
  const text = extractTextFromBody(body, headers["content-type"] ?? "", headers["content-transfer-encoding"] ?? "");
  const receivedAt = parseEmailDate(headers.date) ?? message.internalDate ?? new Date().toISOString();
  const messageId = cleanMessageId(headers["message-id"]) || `imap:${message.uid}:${hashText(message.raw).slice(0, 16)}`;
  const recipientAliases = extractRecipientAliases(headers);

  return {
    uid: message.uid,
    messageId,
    fromName: from.name,
    fromEmail: from.email,
    subject,
    receivedAt,
    recipientAliases,
    text,
    raw: message.raw,
    headers,
  };
}

function classifyEmail(
  message: ParsedEmail,
  provider: InboxProvider,
  mailbox: string,
  sweepstakes: Sweepstake[],
): InboxAlert {
  const match = matchSweepstake(message, sweepstakes);
  const knownDomains = match ? sweepstakeDomains(match.sweepstake) : [];
  const links = extractLinks(`${message.text}\n${message.raw}`).map((link) => applySweepstakeLinkRisk(link, knownDomains));
  const haystack = `${message.subject}\n${message.fromName ?? ""}\n${message.fromEmail ?? ""}\n${message.text}`.toLowerCase();
  const categories: InboxAlertKind[] = [];
  const riskFlags = new Set<string>();

  if (/\b(congratulations|congrats|you(?: have|'ve)? won|selected as (?:a )?(?:potential )?winner|potential winner|winner notification|claim your prize|prize claim|redeem your prize|award notification|you are a winner)\b/i.test(haystack)) {
    categories.push("winner_notification");
  }
  if (/\b(verify (?:your )?(?:email|account)|email verification|verification code|confirm (?:your )?(?:email|account)|activate your account|validate your email)\b/i.test(haystack)) {
    categories.push("verification_email");
  }
  if (/\b(confirm(?:ation)? link|confirmation required|complete your entry|entry confirmation|confirm your entry|click to confirm)\b/i.test(haystack)) {
    categories.push("confirmation_link");
  }
  if (/\b(daily entry|enter again|come back tomorrow|today'?s entry|daily reminder|do not forget to enter|new daily chance)\b/i.test(haystack)) {
    categories.push("daily_entry_reminder");
  }

  for (const link of links) {
    if (link.kind === "claim") categories.push("winner_notification");
    if (link.kind === "verification") categories.push("verification_email");
    if (link.kind === "confirmation") categories.push("confirmation_link");
    for (const flag of link.riskFlags) riskFlags.add(flag);
  }

  const listUnsubscribe = message.headers["list-unsubscribe"] ?? "";
  const unsubscribeMentions = countMatches(haystack, /\bunsubscribe\b/g) + (listUnsubscribe ? 1 : 0);
  const marketingLinkLoad = links.length >= 12 && /\b(deal|offer|coupon|sale|partner|sponsored|advertisement)\b/i.test(haystack);
  if (unsubscribeMentions >= 3 || marketingLinkLoad) {
    categories.push("unsubscribe_spam");
    riskFlags.add("Unsubscribe-heavy marketing pattern detected.");
  }

  if (/\b(urgent|act now|immediate action|account suspended|wire transfer|processing fee|shipping fee|tax payment|social security|ssn|bank account|routing number|crypto|bitcoin|gift card|password)\b/i.test(haystack)) {
    riskFlags.add("Message contains phishing-pressure or sensitive-data language.");
  }
  if (categories.includes("winner_notification") && /\b(fee|payment|wire|gift card|crypto|bitcoin|bank|ssn|social security)\b/i.test(haystack)) {
    riskFlags.add("Winner notification asks for payment or sensitive data.");
  }
  if (riskFlags.size > 0) {
    categories.push("phishing_risk");
  }
  if (categories.length === 0) {
    categories.push("general");
  }

  const uniqueCategories = [...new Set(categories)];
  const reviewRequired =
    uniqueCategories.some((category) =>
      ["winner_notification", "verification_email", "confirmation_link", "phishing_risk"].includes(category),
    ) || links.some((link) => link.requiresReview);
  const severity = uniqueCategories.includes("phishing_risk")
    ? "danger"
    : uniqueCategories.some((category) =>
        ["winner_notification", "verification_email", "confirmation_link", "daily_entry_reminder"].includes(category),
      )
      ? "warn"
      : "info";

  const now = new Date().toISOString();
  return {
    id: `inbox-${hashText(message.messageId).slice(0, 18)}`,
    messageId: message.messageId,
    provider,
    mailbox,
    fromName: message.fromName,
    fromEmail: message.fromEmail,
    subject: message.subject,
    receivedAt: message.receivedAt,
    snippet: snippetFrom(message.text || message.raw),
    recipientAliases: message.recipientAliases,
    matchedSweepstakeId: match?.sweepstake.id ?? null,
    matchedSweepstakeTitle: match?.sweepstake.title ?? null,
    matchedByAlias: match?.matchedByAlias ?? false,
    categories: uniqueCategories,
    severity,
    riskFlags: [...riskFlags],
    links,
    status: "new",
    reviewRequired,
    createdAt: now,
    reviewedAt: null,
    reviewNotes: "",
  };
}

function shouldPersistAlert(alert: InboxAlert) {
  if (alert.categories.some((category) => category !== "general")) return true;
  return Boolean(alert.matchedSweepstakeId);
}

function matchSweepstake(message: ParsedEmail, sweepstakes: Sweepstake[]) {
  const haystack = normalizeForMatch(`${message.subject} ${message.fromName ?? ""} ${message.fromEmail ?? ""} ${message.text}`);
  const linkDomains = new Set(extractLinks(`${message.text}\n${message.raw}`).map((link) => link.domain).filter(Boolean) as string[]);
  const recipientAliases = new Set(message.recipientAliases.map(normalizeEmail));
  let best: { sweepstake: Sweepstake; score: number; matchedByAlias: boolean } | null = null;

  for (const sweepstake of sweepstakes) {
    let score = 0;
    let matchedByAlias = false;
    if (sweepstake.emailAlias && recipientAliases.has(normalizeEmail(sweepstake.emailAlias))) {
      score += 100;
      matchedByAlias = true;
    }
    const title = normalizeForMatch(sweepstake.title);
    const sponsor = normalizeForMatch(sweepstake.sponsor);
    if (title.length > 8 && haystack.includes(title)) score += 55;
    if (sponsor.length > 4 && haystack.includes(sponsor)) score += 35;

    score += countTokenHits(haystack, meaningfulTokens(sweepstake.title), 7, 28);
    score += countTokenHits(haystack, meaningfulTokens(sweepstake.sponsor), 9, 27);

    const domains = sweepstakeDomains(sweepstake);
    if (message.fromEmail) {
      const fromDomain = emailDomain(message.fromEmail);
      if (fromDomain && domains.includes(fromDomain)) score += 35;
    }
    if (domains.some((domain) => linkDomains.has(domain))) score += 30;

    if (!best || score > best.score) {
      best = { sweepstake, score, matchedByAlias };
    }
  }

  return best && best.score >= 35 ? best : null;
}

function extractLinks(value: string): InboxLink[] {
  const found = new Map<string, InboxLink>();
  const matches = value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/g, "");
    const parsed = safeUrl(url);
    if (!parsed) continue;
    const domain = safeDomain(url);
    const kind = linkKind(parsed);
    const riskFlags = linkRiskFlags(parsed, domain);
    found.set(url, {
      url,
      domain,
      kind,
      requiresReview: kind === "claim" || kind === "verification" || kind === "confirmation",
      riskFlags,
    });
  }
  return [...found.values()].slice(0, 20);
}

function applySweepstakeLinkRisk(link: InboxLink, knownDomains: string[]): InboxLink {
  if (!link.domain || knownDomains.length === 0 || link.kind === "unsubscribe") {
    return link;
  }
  if (link.requiresReview && !knownDomains.includes(link.domain)) {
    return {
      ...link,
      riskFlags: [...link.riskFlags, "Review link domain differs from the matched sweepstake domain."],
    };
  }
  return link;
}

function linkKind(url: URL): InboxLinkKind {
  const haystack = `${url.hostname} ${url.pathname} ${url.search}`.toLowerCase();
  if (/\b(unsubscribe|optout|opt-out|email-preferences|manage-preferences)\b/.test(haystack)) return "unsubscribe";
  if (/\b(claim|winner|prize|redeem|award|affidavit)\b/.test(haystack)) return "claim";
  if (/\b(verify|verification|validate|activate)\b/.test(haystack)) return "verification";
  if (/\b(confirm|confirmation|complete-entry|entry-confirm)\b/.test(haystack)) return "confirmation";
  return "general";
}

function linkRiskFlags(url: URL, domain: string | null) {
  const flags: string[] = [];
  const shorteners = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly", "bitly.com", "lnkd.in"]);
  if (url.protocol !== "https:") flags.push("Link is not HTTPS.");
  if (domain && shorteners.has(domain)) flags.push("Link uses a URL shortener.");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)) flags.push("Link host is a raw IP address.");
  if (url.hostname.includes("xn--")) flags.push("Link uses an internationalized/punycode hostname.");
  if (/\b(login|password|wallet|crypto|payment|gift-card|bank|ssn)\b/i.test(`${url.pathname} ${url.search}`)) {
    flags.push("Link path contains sensitive account or payment language.");
  }
  return flags;
}

function splitHeadersAndBody(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const index = normalized.indexOf("\n\n");
  const headerText = index >= 0 ? normalized.slice(0, index) : normalized;
  const body = index >= 0 ? normalized.slice(index + 2) : "";
  const headers: Record<string, string> = {};
  for (const line of headerText.replace(/\n[ \t]+/g, " ").split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[key] = headers[key] ? `${headers[key]} ${value}` : value;
  }
  return { headers, body };
}

function extractTextFromBody(body: string, contentType: string, transferEncoding: string): string {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`).filter((part) => part.trim() && !part.trim().startsWith("--"));
    const decodedParts = parts
      .map((part) => {
        const split = splitHeadersAndBody(part.trim());
        const type = split.headers["content-type"] ?? "text/plain";
        if (!/\btext\/(plain|html)\b/i.test(type)) return "";
        const decoded = decodeTransfer(split.body, split.headers["content-transfer-encoding"] ?? "");
        return /\btext\/html\b/i.test(type) ? htmlToText(decoded) : decoded;
      })
      .filter(Boolean);
    return decodedParts.join("\n").trim();
  }

  const decoded = decodeTransfer(body, transferEncoding);
  return /\btext\/html\b/i.test(contentType) ? htmlToText(decoded) : decoded.trim();
}

function decodeTransfer(value: string, transferEncoding: string) {
  const encoding = transferEncoding.toLowerCase();
  if (encoding.includes("base64")) {
    try {
      return Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return value;
    }
  }
  if (encoding.includes("quoted-printable")) {
    return value
      .replace(/=\n/g, "")
      .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
  return value;
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAddress(value: string) {
  const decoded = decodeMimeWords(value);
  const angle = /^(.*?)<([^>]+)>/.exec(decoded);
  if (angle) {
    return {
      name: stripQuotes(angle[1].trim()) || null,
      email: angle[2].trim().toLowerCase(),
    };
  }
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(decoded)?.[0]?.toLowerCase() ?? null;
  return { name: email ? stripQuotes(decoded.replace(email, "").trim()) || null : decoded.trim() || null, email };
}

function extractRecipientAliases(headers: Record<string, string>) {
  const values = [
    headers.to,
    headers.cc,
    headers["delivered-to"],
    headers["x-original-to"],
    headers["envelope-to"],
    headers["apparently-to"],
  ].filter((value): value is string => Boolean(value));
  const aliases = new Set<string>();
  for (const value of values) {
    const decoded = decodeMimeWords(value);
    const matches = decoded.match(/[A-Z0-9._%+-]+\+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    for (const match of matches) {
      aliases.add(normalizeEmail(match));
    }
  }
  return [...aliases].sort();
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_match, _charset: string, encoding: string, encoded: string) => {
    if (encoding.toLowerCase() === "b") {
      try {
        return Buffer.from(encoded, "base64").toString("utf8");
      } catch {
        return encoded;
      }
    }
    return encoded
      .replace(/_/g, " ")
      .replace(/=([0-9a-f]{2})/gi, (_inner, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  });
}

function parseEmailDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanMessageId(value: string | undefined) {
  return value?.trim().replace(/^<|>$/g, "") ?? "";
}

function parseSearchUids(response: string) {
  const line = response
    .split(/\r?\n/)
    .find((item) => item.toUpperCase().startsWith("* SEARCH"));
  if (!line) return [];
  return line
    .replace(/^\* SEARCH/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function extractFetchLiteral(response: string) {
  const matches = [...response.matchAll(/\{(\d+)\}\r?\n/g)];
  if (!matches.length) return "";
  const match = matches[matches.length - 1];
  const length = Number(match[1]);
  const start = (match.index ?? 0) + match[0].length;
  return response.slice(start, start + length);
}

function parseInternalDate(response: string) {
  const value = /INTERNALDATE "([^"]+)"/i.exec(response)?.[1];
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function imapDate(date: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(1, days));
  return date;
}

function sweepstakeDomains(sweepstake: Sweepstake) {
  return [sweepstake.url, sweepstake.formUrl, sweepstake.rulesUrl, sweepstake.extractedRules?.formUrl, sweepstake.extractedRules?.officialRulesUrl]
    .map((value) => (value ? safeDomain(value) : null))
    .filter((value): value is string => Boolean(value));
}

function safeDomain(value: string) {
  try {
    return getRegistrableDomain(value);
  } catch {
    return null;
  }
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function emailDomain(value: string) {
  const domain = value.split("@")[1]?.toLowerCase().replace(/^www\./, "");
  if (!domain) return null;
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : domain;
}

function meaningfulTokens(value: string) {
  const stop = new Set([
    "and",
    "for",
    "the",
    "with",
    "official",
    "rules",
    "sweepstake",
    "sweepstakes",
    "giveaway",
    "contest",
    "entry",
    "enter",
    "win",
    "winner",
    "prize",
    "promotion",
  ]);
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function countTokenHits(haystack: string, tokens: string[], points: number, max: number) {
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += points;
  }
  return Math.min(score, max);
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function snippetFrom(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 260);
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function numberFrom(value: string | number | undefined, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstPresent(...values: Array<string | undefined | null>) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function inboxProviderFrom(value: string): InboxProvider {
  return value === "imap" ? "imap" : "gmail";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function trimForLog(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 500);
}

export function inboxEnvDocumentation() {
  const config = getAppConfig();
  return {
    provider: config.inboxProvider,
    email: config.inboxEmail,
    requiredEnv: [
      "SWEEPSCOUT_INBOX_ENABLED=true",
      "SWEEPSCOUT_INBOX_EMAIL=dedicated-inbox@example.com",
      "SWEEPSCOUT_IMAP_USER=dedicated-inbox@example.com",
      "SWEEPSCOUT_IMAP_PASSWORD=<gmail-app-password-or-imap-password>",
      "SWEEPSCOUT_IMAP_HOST=imap.gmail.com",
      "SWEEPSCOUT_IMAP_PORT=993",
    ],
  };
}
