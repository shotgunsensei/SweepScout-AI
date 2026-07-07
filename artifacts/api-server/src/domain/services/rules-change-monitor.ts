import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { writeAuditLog } from "@/lib/audit";
import { getStore } from "@/lib/storage/store";
import type {
  AppSettings,
  RulesChangeAlert,
  RulesChangeAlertStatus,
  RulesChangeField,
  RulesFieldChange,
  RulesMonitorSettings,
  RulesSnapshot,
  RulesSnapshotExtraction,
  Sweepstake,
} from "@/lib/types";
import { logger } from "../../lib/logger";

const USER_AGENT = "SweepScoutAI/0.1 read-only rules monitor (+https://localhost)";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 900_000;
const MAX_REDIRECTS = 5;
const MAX_TEXT_EXCERPT_CHARS = 1_600;

let monitorTimer: NodeJS.Timeout | null = null;

type RulesCheckResult = {
  sweepstakeId: string;
  title: string;
  status: "baseline" | "unchanged" | "minor_text_change" | "meaningful_change" | "skipped" | "failed";
  message: string;
  alertId: string | null;
  snapshotId: string | null;
};

export async function getRulesMonitorStatus() {
  const store = await getStore();
  const settings = await store.getSettings();
  const [alerts, sweepstakes] = await Promise.all([store.listRulesChangeAlerts(50), store.listSweepstakes()]);
  return {
    enabled: settings.rulesMonitor.enabled,
    settings: settings.rulesMonitor,
    savedSweepstakesWithRulesUrl: sweepstakes.filter((item) => Boolean(item.rulesUrl)).length,
    openAlerts: alerts.filter((alert) => alert.status === "new").length,
  };
}

export async function checkRulesNow(input: { sweepstakeId?: string; force?: boolean } = {}) {
  const store = await getStore();
  const settings = await store.getSettings();
  const force = input.force ?? true;

  if (!force && !settings.rulesMonitor.enabled) {
    await store.saveSettings(markRulesCheck(settings, "disabled", "Rules-change monitoring is disabled."));
    return { checked: 0, changed: 0, alerts: [], results: [] as RulesCheckResult[], status: await getRulesMonitorStatus() };
  }

  const allSweepstakes = await store.listSweepstakes();
  const candidates = allSweepstakes
    .filter((item) => !input.sweepstakeId || item.id === input.sweepstakeId)
    .filter((item) => item.status !== "expired" && item.status !== "rejected")
    .filter((item) => Boolean(item.rulesUrl))
    .slice(0, Math.max(1, Math.min(100, settings.rulesMonitor.maxChecksPerRun)));

  if (input.sweepstakeId && candidates.length === 0) {
    throw new Error("Sweepstake not found or it does not have an official rules URL.");
  }

  const results: RulesCheckResult[] = [];
  const alerts: RulesChangeAlert[] = [];

  for (const sweepstake of candidates) {
    try {
      const result = await checkSingleSweepstakeRules(sweepstake);
      results.push(result);
      if (result.alertId) {
        const saved = await store.getRulesChangeAlert(result.alertId);
        if (saved) alerts.push(saved);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rules check failed.";
      results.push({
        sweepstakeId: sweepstake.id,
        title: sweepstake.title,
        status: "failed",
        message,
        alertId: null,
        snapshotId: null,
      });
      await writeAuditLog({
        actorId: null,
        action: "rules_monitor.check_failed",
        entityType: "sweepstake",
        entityId: sweepstake.id,
        severity: "warn",
        message,
        metadata: { rulesUrl: sweepstake.rulesUrl },
      });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const checked = results.filter((result) => result.status !== "skipped" && result.status !== "failed").length;
  const changed = results.filter((result) => result.status === "meaningful_change").length;
  const error = failed && checked === 0 ? `${failed} rules check(s) failed.` : null;
  await store.saveSettings(markRulesCheck(settings, error ? "failed" : "ok", error));

  await writeAuditLog({
    actorId: null,
    action: "rules_monitor.checked",
    entityType: "rules_monitor",
    entityId: input.sweepstakeId ?? "all",
    severity: alerts.length ? "warn" : "info",
    message: `Rules monitor checked ${checked} sweepstake(s) and created ${alerts.length} alert(s).`,
    metadata: { checked, failed, changed, alertIds: alerts.map((alert) => alert.id) },
  });

  return {
    checked,
    failed,
    changed,
    alerts,
    results,
    status: await getRulesMonitorStatus(),
  };
}

export async function reviewRulesChangeAlert(input: { id: string; status: RulesChangeAlertStatus; notes?: string }) {
  if (input.status !== "reviewed" && input.status !== "dismissed" && input.status !== "new") {
    throw new Error("Invalid rules alert status.");
  }

  const store = await getStore();
  const alert = await store.getRulesChangeAlert(input.id);
  if (!alert) {
    throw new Error("Rules change alert not found.");
  }

  const saved = await store.saveRulesChangeAlert({
    ...alert,
    status: input.status,
    reviewedAt: input.status === "new" ? null : new Date().toISOString(),
    reviewNotes: input.notes?.trim() ?? alert.reviewNotes,
  });
  await writeAuditLog({
    actorId: null,
    action: "rules_change_alert.reviewed",
    entityType: "rules_change_alert",
    entityId: saved.id,
    severity: saved.severity === "danger" ? "warn" : "info",
    message: `Rules change alert marked ${saved.status}.`,
    metadata: { sweepstakeId: saved.sweepstakeId, changedFields: saved.changedFields },
  });
  return saved;
}

export async function startRulesChangeMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  const store = await getStore();
  const settings = await store.getSettings();
  if (!settings.rulesMonitor.enabled || settings.rulesMonitor.pollIntervalMinutes <= 0) {
    return;
  }

  const intervalMs = Math.max(30, settings.rulesMonitor.pollIntervalMinutes) * 60_000;
  monitorTimer = setInterval(() => {
    checkRulesNow({ force: false }).catch((error) => {
      logger.warn({ err: error }, "Scheduled rules-change scan failed");
    });
  }, intervalMs);
  monitorTimer.unref();
}

async function checkSingleSweepstakeRules(sweepstake: Sweepstake): Promise<RulesCheckResult> {
  const store = await getStore();
  const rulesUrl = sweepstake.rulesUrl;
  if (!rulesUrl) {
    return {
      sweepstakeId: sweepstake.id,
      title: sweepstake.title,
      status: "skipped",
      message: "Official rules URL is not set.",
      alertId: null,
      snapshotId: null,
    };
  }

  const page = await fetchRulesPageText(rulesUrl);
  const snapshot = buildRulesSnapshot(sweepstake, page.finalUrl, page.visibleText);
  const previousSnapshots = await store.listRulesSnapshots(sweepstake.id);
  const previous = previousSnapshots[0] ?? null;

  if (!previous) {
    await store.saveRulesSnapshot(snapshot);
    return {
      sweepstakeId: sweepstake.id,
      title: sweepstake.title,
      status: "baseline",
      message: "Stored initial official rules snapshot.",
      alertId: null,
      snapshotId: snapshot.id,
    };
  }

  if (previous.normalizedTextHash === snapshot.normalizedTextHash) {
    return {
      sweepstakeId: sweepstake.id,
      title: sweepstake.title,
      status: "unchanged",
      message: "Official rules text hash is unchanged.",
      alertId: null,
      snapshotId: previous.id,
    };
  }

  await store.saveRulesSnapshot(snapshot);
  const changes = detectMeaningfulChanges(previous.extracted, snapshot.extracted);
  if (!changes.length) {
    return {
      sweepstakeId: sweepstake.id,
      title: sweepstake.title,
      status: "minor_text_change",
      message: "Rules page text changed, but tracked rule fields did not materially change.",
      alertId: null,
      snapshotId: snapshot.id,
    };
  }

  const existing = (await store.listRulesChangeAlerts(500)).find(
    (alert) => alert.sweepstakeId === sweepstake.id && alert.currentSnapshot.normalizedTextHash === snapshot.normalizedTextHash,
  );
  if (existing) {
    return {
      sweepstakeId: sweepstake.id,
      title: sweepstake.title,
      status: "meaningful_change",
      message: "Meaningful rules change already has an alert.",
      alertId: existing.id,
      snapshotId: snapshot.id,
    };
  }

  const alert = buildRulesChangeAlert(sweepstake, previous, snapshot, changes);
  const saved = await store.saveRulesChangeAlert(alert);
  await writeAuditLog({
    actorId: null,
    action: "rules_monitor.meaningful_change",
    entityType: "sweepstake",
    entityId: sweepstake.id,
    severity: "warn",
    message: alert.summary,
    metadata: {
      rulesUrl,
      changedFields: alert.changedFields,
      previousSnapshotId: previous.id,
      currentSnapshotId: snapshot.id,
    },
  });

  return {
    sweepstakeId: sweepstake.id,
    title: sweepstake.title,
    status: "meaningful_change",
    message: alert.summary,
    alertId: saved.id,
    snapshotId: snapshot.id,
  };
}

function buildRulesSnapshot(sweepstake: Sweepstake, rulesUrl: string, visibleText: string): RulesSnapshot {
  const normalizedText = normalizeRulesText(visibleText);
  const capturedAt = new Date().toISOString();
  return {
    id: `rules-snap-${sweepstake.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    sweepstakeId: sweepstake.id,
    sweepstakeTitle: sweepstake.title,
    rulesUrl,
    capturedAt,
    textHash: hashText(collapseWhitespace(visibleText)),
    normalizedTextHash: hashText(normalizedText),
    textLength: visibleText.length,
    textExcerpt: collapseWhitespace(visibleText).slice(0, MAX_TEXT_EXCERPT_CHARS),
    extracted: extractRulesSnapshot(visibleText),
  };
}

function buildRulesChangeAlert(
  sweepstake: Sweepstake,
  previousSnapshot: RulesSnapshot,
  currentSnapshot: RulesSnapshot,
  changes: RulesFieldChange[],
): RulesChangeAlert {
  const changedFields = changes.map((change) => change.field);
  const severity = changedFields.includes("deadline") || changedFields.includes("eligibility") ? "danger" : "warn";
  const fieldLabels = changedFields.map(labelRulesChangeField).join(", ");
  return {
    id: `rules-alert-${sweepstake.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    sweepstakeId: sweepstake.id,
    sweepstakeTitle: sweepstake.title,
    sponsor: sweepstake.sponsor,
    rulesUrl: currentSnapshot.rulesUrl,
    detectedAt: currentSnapshot.capturedAt,
    severity,
    status: "new",
    summary: `${sweepstake.title} official rules changed: ${fieldLabels}. Review before entering again.`,
    changedFields,
    changes,
    previousSnapshotId: previousSnapshot.id,
    currentSnapshotId: currentSnapshot.id,
    previousSnapshot,
    currentSnapshot,
    reviewNotes: "",
    reviewedAt: null,
  };
}

function detectMeaningfulChanges(previous: RulesSnapshotExtraction, current: RulesSnapshotExtraction): RulesFieldChange[] {
  const changes: RulesFieldChange[] = [];
  addChange(changes, "deadline", comparableDeadline(previous.deadline), comparableDeadline(current.deadline));
  addChange(changes, "eligibility", comparableText(previous.eligibility), comparableText(current.eligibility));
  addChange(changes, "entry_frequency", comparableFrequency(previous.entryFrequency), comparableFrequency(current.entryFrequency));

  const previousPrize = comparablePrize(previous);
  const currentPrize = comparablePrize(current);
  addChange(changes, "prize", previousPrize, currentPrize);
  return changes;
}

function addChange(
  changes: RulesFieldChange[],
  field: RulesChangeField,
  previousValue: string | number | null,
  currentValue: string | number | null,
) {
  if (previousValue === currentValue) {
    return;
  }
  changes.push({ field, previousValue, currentValue });
}

function extractRulesSnapshot(text: string): RulesSnapshotExtraction {
  const sentences = splitRuleSentences(text);
  const deadlineSentence = firstMatchingSentence(sentences, /\b(deadline|ends?|closes?|entry period|by\s+11:59|through)\b/i);
  const eligibilitySentence = firstMatchingSentence(
    sentences,
    /\b(open to|eligible|legal residents?|void where prohibited|residents of|years of age|older at time|age of majority)\b/i,
  );
  const prizeSentence = firstMatchingSentence(
    sentences,
    /\b(prize|grand prize|arv|approximate retail value|retail value|winner will receive)\b/i,
  );
  const frequencySentence = firstMatchingSentence(
    sentences,
    /\b(one entry|limit.*entr|daily|weekly|monthly|per day|per week|per month|per person|per household)\b/i,
  );

  return {
    deadline: extractDateValue(deadlineSentence ?? text),
    eligibility: limitField(eligibilitySentence),
    prize: limitField(prizeSentence),
    prizeValue: extractPrizeValue(prizeSentence ?? text),
    entryFrequency: limitField(frequencySentence),
  };
}

async function fetchRulesPageText(inputUrl: string) {
  let currentUrl = inputUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpUrl(currentUrl);
    const response = await fetchWithTimeout(currentUrl, FETCH_TIMEOUT_MS, {
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.2",
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Rules URL redirected without a Location header: HTTP ${response.status}.`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Could not load official rules URL: HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`Unsupported official rules content type: ${contentType}.`);
    }

    const raw = await readLimitedText(response, MAX_PAGE_BYTES);
    return {
      finalUrl: currentUrl,
      visibleText: extractVisibleText(raw),
    };
  }

  throw new Error("Official rules URL redirected too many times.");
}

async function assertPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Official rules URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Official rules monitor only supports HTTP(S) URLs.");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Official rules URL points to a local or private host.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Official rules URL points to a private IP address.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: false });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("Official rules URL resolved to a private or unavailable address.");
  }
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));
  if (!address.includes(".")) return false;

  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out while loading official rules URL: ${url}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`Official rules response is too large to inspect safely (${contentLength} bytes).`);
  }

  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Official rules response exceeded safe inspection limit (${maxBytes} bytes).`);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(concatChunks(chunks, received));
}

function concatChunks(chunks: Uint8Array[], length: number) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function extractVisibleText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|section|article|li|tr|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    const named: Record<string, string> = {
      amp: "&",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
      apos: "'",
    };
    const lower = token.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return entity;
  });
}

function normalizeRulesText(value: string) {
  return collapseWhitespace(value)
    .toLowerCase()
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\butm_[a-z0-9_=-]+/gi, "")
    .replace(/\b(fbclid|gclid|mc_cid|mc_eid)=[a-z0-9_-]+/gi, "")
    .replace(/[^\p{L}\p{N}$%:./,\s-]/gu, "")
    .trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function splitRuleSentences(text: string) {
  return collapseWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 650);
}

function firstMatchingSentence(sentences: string[], pattern: RegExp) {
  return sentences.find((sentence) => pattern.test(sentence)) ?? null;
}

function limitField(value: string | null) {
  if (!value) return null;
  return collapseWhitespace(value).slice(0, 360);
}

function extractDateValue(text: string) {
  const patterns = [
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}\b/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return normalizeDateText(match[0]);
  }
  return null;
}

function normalizeDateText(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\b(st|nd|rd|th)\b/gi, "").replace(/\s+/g, " ").trim();
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return cleaned.toLowerCase();
  }
  return parsed.toISOString().slice(0, 10);
}

function extractPrizeValue(text: string) {
  const matches = [...text.matchAll(/\$\s?([0-9][0-9,]*(?:\.\d{2})?)/g)];
  const values = matches
    .map((match) => Number((match[1] ?? "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.max(...values) : null;
}

function comparableDeadline(value: string | null) {
  return normalizeDateText(value);
}

function comparableText(value: string | null) {
  if (!value) return null;
  return collapseWhitespace(value).toLowerCase();
}

function comparableFrequency(value: string | null) {
  const text = comparableText(value);
  if (!text) return null;
  if (/\bdaily|per day|once a day|one entry per day\b/.test(text)) return "daily";
  if (/\bweekly|per week|once a week|one entry per week\b/.test(text)) return "weekly";
  if (/\bmonthly|per month|once a month|one entry per month\b/.test(text)) return "monthly";
  if (/\bone entry|one-time|single entry|one time|per person\b/.test(text)) return "one-time";
  return text;
}

function comparablePrize(value: RulesSnapshotExtraction) {
  if (typeof value.prizeValue === "number" && Number.isFinite(value.prizeValue)) {
    return Math.round(value.prizeValue);
  }
  return comparableText(value.prize);
}

function labelRulesChangeField(field: RulesChangeField) {
  const labels: Record<RulesChangeField, string> = {
    deadline: "deadline",
    eligibility: "eligibility",
    prize: "prize",
    entry_frequency: "entry frequency",
  };
  return labels[field];
}

function markRulesCheck(
  settings: AppSettings,
  status: RulesMonitorSettings["lastCheckStatus"],
  error: string | null,
): AppSettings {
  return {
    ...settings,
    rulesMonitor: {
      ...settings.rulesMonitor,
      lastCheckAt: new Date().toISOString(),
      lastCheckStatus: status,
      lastCheckError: error,
    },
  };
}
