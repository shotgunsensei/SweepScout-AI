import { writeAuditLog } from "@/lib/audit";
import { getStore } from "@/lib/storage/store";
import type {
  AppSettings,
  InboxAlert,
  SpamSourceReport,
  SpamSourceSweepstakeReport,
  Sweepstake,
  UserProfile,
} from "@/lib/types";

export async function ensureSweepstakeEmailAlias(sweepstake: Sweepstake) {
  const store = await getStore();
  const [settings, profile, sweepstakes] = await Promise.all([
    store.getSettings(),
    store.getUserProfile(),
    store.listSweepstakes(),
  ]);
  const baseEmail = resolveAliasBaseEmail(settings, profile);
  if (!settings.emailAliases.enabled || !baseEmail) {
    return { sweepstake, alias: sweepstake.emailAlias ?? null, assigned: false };
  }

  if (sweepstake.emailAlias) {
    return { sweepstake, alias: sweepstake.emailAlias, assigned: false };
  }

  const assignment = nextAliasAssignment(baseEmail, settings, sweepstakes);
  const updated = await store.saveSweepstake({
    ...sweepstake,
    emailAlias: assignment.alias,
    updatedAt: new Date().toISOString(),
  });
  await store.saveSettings({
    ...settings,
    emailAliases: {
      ...settings.emailAliases,
      baseEmail: settings.emailAliases.baseEmail || baseEmail,
      nextSequence: assignment.nextSequence,
    },
  });
  await writeAuditLog({
    actorId: null,
    action: "email_alias.assigned",
    entityType: "sweepstake",
    entityId: updated.id,
    severity: "info",
    message: `Email alias ${assignment.alias} assigned to ${updated.title}.`,
    metadata: { sweepstakeId: updated.id, alias: assignment.alias },
  });
  return { sweepstake: updated, alias: assignment.alias, assigned: true };
}

export async function generateMissingSweepstakeAliases() {
  const store = await getStore();
  const [settings, profile, sweepstakes] = await Promise.all([
    store.getSettings(),
    store.getUserProfile(),
    store.listSweepstakes(),
  ]);
  const baseEmail = resolveAliasBaseEmail(settings, profile);
  if (!settings.emailAliases.enabled) {
    throw new Error("Email alias generation is disabled in Settings.");
  }
  if (!baseEmail) {
    throw new Error("Set an alias base email before generating sweepstakes aliases.");
  }

  const updated: Sweepstake[] = [];
  let workingSettings = settings;
  let workingSweepstakes = sweepstakes;
  for (const sweepstake of sweepstakes) {
    if (sweepstake.emailAlias) continue;
    const assignment = nextAliasAssignment(baseEmail, workingSettings, workingSweepstakes);
    const saved = await store.saveSweepstake({
      ...sweepstake,
      emailAlias: assignment.alias,
      updatedAt: new Date().toISOString(),
    });
    updated.push(saved);
    workingSettings = {
      ...workingSettings,
      emailAliases: {
        ...workingSettings.emailAliases,
        baseEmail: workingSettings.emailAliases.baseEmail || baseEmail,
        nextSequence: assignment.nextSequence,
      },
    };
    workingSweepstakes = workingSweepstakes.map((item) => (item.id === saved.id ? saved : item));
  }

  await store.saveSettings(workingSettings);
  await writeAuditLog({
    actorId: null,
    action: "email_alias.generated_batch",
    entityType: "email_alias",
    entityId: null,
    severity: "info",
    message: `${updated.length} sweepstakes email alias(es) generated.`,
    metadata: { count: updated.length, baseEmail },
  });

  return {
    generated: updated.length,
    sweepstakes: updated,
    settings: workingSettings.emailAliases,
  };
}

export async function getSpamSourceReport(): Promise<SpamSourceReport> {
  const store = await getStore();
  const [settings, sweepstakes, entries, alerts] = await Promise.all([
    store.getSettings(),
    store.listSweepstakes(),
    store.listEntryLogs(),
    store.listInboxAlerts(500),
  ]);
  return buildSpamSourceReport({ settings, sweepstakes, entries, alerts });
}

export function buildSpamSourceReport(input: {
  settings: AppSettings;
  sweepstakes: Sweepstake[];
  entries: Array<{ sweepstakeId: string; emailAlias?: string | null }>;
  alerts: InboxAlert[];
}): SpamSourceReport {
  const generatedAt = new Date().toISOString();
  const windowDays = Math.max(1, input.settings.emailAliases.spamWindowDays);
  const threshold = Math.max(1, input.settings.emailAliases.excessiveEmailThreshold);
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const sweepstakesById = new Map(input.sweepstakes.map((sweepstake) => [sweepstake.id, sweepstake]));
  const sweepstakesByAlias = new Map(
    input.sweepstakes
      .filter((sweepstake) => sweepstake.emailAlias)
      .map((sweepstake) => [normalizeEmail(sweepstake.emailAlias!), sweepstake]),
  );
  const scopedAlerts = input.alerts.filter((alert) => new Date(alert.receivedAt).getTime() >= windowStart);
  const domainRows = new Map<
    string,
    {
      domain: string;
      sponsor: string | null;
      emailCount: number;
      spamCount: number;
      phishingCount: number;
      winnerCount: number;
      unsubscribeCount: number;
      matchedSweepstakes: Set<string>;
      aliases: Set<string>;
      latestReceivedAt: string | null;
    }
  >();
  const sweepstakeRows = new Map<
    string,
    Omit<SpamSourceSweepstakeReport, "riskLevel" | "excessiveVolume" | "sourceDomains"> & { sourceDomains: Set<string> }
  >();

  for (const alert of scopedAlerts) {
    const matchedSweepstake = resolveAlertSweepstake(alert, sweepstakesById, sweepstakesByAlias);
    const domain = senderDomain(alert.fromEmail) ?? alert.links.find((link) => link.domain)?.domain ?? "unknown";
    const spam = isSpamAlert(alert);
    const domainRow =
      domainRows.get(domain) ??
      {
        domain,
        sponsor: matchedSweepstake?.sponsor ?? null,
        emailCount: 0,
        spamCount: 0,
        phishingCount: 0,
        winnerCount: 0,
        unsubscribeCount: 0,
        matchedSweepstakes: new Set<string>(),
        aliases: new Set<string>(),
        latestReceivedAt: null,
      };

    domainRow.emailCount += 1;
    if (spam) domainRow.spamCount += 1;
    if (alert.categories.includes("phishing_risk")) domainRow.phishingCount += 1;
    if (alert.categories.includes("winner_notification")) domainRow.winnerCount += 1;
    if (alert.categories.includes("unsubscribe_spam")) domainRow.unsubscribeCount += 1;
    if (matchedSweepstake) {
      domainRow.matchedSweepstakes.add(matchedSweepstake.id);
      domainRow.sponsor ??= matchedSweepstake.sponsor;
    }
    for (const alias of alert.recipientAliases) {
      domainRow.aliases.add(alias);
    }
    if (!domainRow.latestReceivedAt || new Date(alert.receivedAt).getTime() > new Date(domainRow.latestReceivedAt).getTime()) {
      domainRow.latestReceivedAt = alert.receivedAt;
    }
    domainRows.set(domain, domainRow);

    if (matchedSweepstake) {
      const sweepstakeRow =
        sweepstakeRows.get(matchedSweepstake.id) ??
        {
          sweepstakeId: matchedSweepstake.id,
          sweepstakeTitle: matchedSweepstake.title,
          sponsor: matchedSweepstake.sponsor,
          emailAlias: matchedSweepstake.emailAlias,
          emailCount: 0,
          spamCount: 0,
          phishingCount: 0,
          unsubscribeCount: 0,
          latestReceivedAt: null,
          sourceDomains: new Set<string>(),
        };
      sweepstakeRow.emailCount += 1;
      if (spam) sweepstakeRow.spamCount += 1;
      if (alert.categories.includes("phishing_risk")) sweepstakeRow.phishingCount += 1;
      if (alert.categories.includes("unsubscribe_spam")) sweepstakeRow.unsubscribeCount += 1;
      if (domain !== "unknown") sweepstakeRow.sourceDomains.add(domain);
      if (!sweepstakeRow.latestReceivedAt || new Date(alert.receivedAt).getTime() > new Date(sweepstakeRow.latestReceivedAt).getTime()) {
        sweepstakeRow.latestReceivedAt = alert.receivedAt;
      }
      sweepstakeRows.set(matchedSweepstake.id, sweepstakeRow);
    }
  }

  const domains = [...domainRows.values()]
    .map((row) => {
      const excessiveVolume = row.emailCount >= threshold;
      const riskLevel = riskLevelFor({
        emailCount: row.emailCount,
        spamCount: row.spamCount,
        phishingCount: row.phishingCount,
        threshold,
      });
      return {
        domain: row.domain,
        sponsor: row.sponsor,
        emailCount: row.emailCount,
        spamCount: row.spamCount,
        phishingCount: row.phishingCount,
        winnerCount: row.winnerCount,
        unsubscribeCount: row.unsubscribeCount,
        matchedSweepstakeCount: row.matchedSweepstakes.size,
        aliases: [...row.aliases].sort(),
        latestReceivedAt: row.latestReceivedAt,
        excessiveVolume,
        riskLevel,
      };
    })
    .sort(sortRiskRows);

  const sweepstakes = [...sweepstakeRows.values()]
    .map((row) => {
      const excessiveVolume = row.emailCount >= threshold;
      return {
        ...row,
        sourceDomains: [...row.sourceDomains].sort(),
        excessiveVolume,
        riskLevel: riskLevelFor({
          emailCount: row.emailCount,
          spamCount: row.spamCount,
          phishingCount: row.phishingCount,
          threshold,
        }),
      };
    })
    .sort(sortRiskRows);

  const aliases = input.sweepstakes
    .map((sweepstake) => {
      const entryCount = input.entries.filter((entry) => entry.sweepstakeId === sweepstake.id).length;
      const alertCount = scopedAlerts.filter((alert) => resolveAlertSweepstake(alert, sweepstakesById, sweepstakesByAlias)?.id === sweepstake.id).length;
      const spamCount = scopedAlerts.filter((alert) => {
        const matched = resolveAlertSweepstake(alert, sweepstakesById, sweepstakesByAlias);
        return matched?.id === sweepstake.id && isSpamAlert(alert);
      }).length;
      return {
        sweepstakeId: sweepstake.id,
        sweepstakeTitle: sweepstake.title,
        sponsor: sweepstake.sponsor,
        emailAlias: sweepstake.emailAlias,
        entryCount,
        inboxAlertCount: alertCount,
        spamCount,
      };
    })
    .sort((a, b) => Number(!a.emailAlias) - Number(!b.emailAlias) || b.spamCount - a.spamCount || b.inboxAlertCount - a.inboxAlertCount);

  return {
    generatedAt,
    windowDays,
    threshold,
    totals: {
      aliasesAssigned: aliases.filter((item) => item.emailAlias).length,
      aliasesMissing: aliases.filter((item) => !item.emailAlias).length,
      inboxAlerts: scopedAlerts.length,
      spamAlerts: scopedAlerts.filter(isSpamAlert).length,
      excessiveDomains: domains.filter((item) => item.excessiveVolume).length,
      excessiveSweepstakes: sweepstakes.filter((item) => item.excessiveVolume).length,
    },
    domains,
    sweepstakes,
    aliases,
  };
}

function resolveAliasBaseEmail(settings: AppSettings, profile: UserProfile) {
  return (
    settings.emailAliases.baseEmail ||
    settings.inbox.email ||
    settings.notificationsEmail ||
    profile.alternateEmail ||
    profile.email ||
    ""
  ).trim();
}

function nextAliasAssignment(baseEmail: string, settings: AppSettings, sweepstakes: Sweepstake[]) {
  const existingAliases = new Set(
    sweepstakes.map((sweepstake) => sweepstake.emailAlias).filter((value): value is string => Boolean(value)).map(normalizeEmail),
  );
  const prefix = sanitizeAliasToken(settings.emailAliases.prefix || "sweep");
  let sequence = Math.max(1, settings.emailAliases.nextSequence);
  let alias = buildPlusAlias(baseEmail, prefix, sequence);
  while (existingAliases.has(normalizeEmail(alias))) {
    sequence += 1;
    alias = buildPlusAlias(baseEmail, prefix, sequence);
  }
  return { alias, nextSequence: sequence + 1 };
}

function buildPlusAlias(baseEmail: string, prefix: string, sequence: number) {
  const [rawLocal, domain] = baseEmail.toLowerCase().split("@");
  if (!rawLocal || !domain) {
    throw new Error("Alias base email must be a valid email address.");
  }
  const local = rawLocal.split("+")[0];
  return `${local}+${prefix}-${String(sequence).padStart(3, "0")}@${domain}`;
}

function sanitizeAliasToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "sweep";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function resolveAlertSweepstake(
  alert: InboxAlert,
  sweepstakesById: Map<string, Sweepstake>,
  sweepstakesByAlias: Map<string, Sweepstake>,
) {
  if (alert.matchedSweepstakeId) {
    const sweepstake = sweepstakesById.get(alert.matchedSweepstakeId);
    if (sweepstake) return sweepstake;
  }
  for (const alias of alert.recipientAliases) {
    const sweepstake = sweepstakesByAlias.get(normalizeEmail(alias));
    if (sweepstake) return sweepstake;
  }
  return null;
}

function isSpamAlert(alert: InboxAlert) {
  return alert.categories.includes("phishing_risk") || alert.categories.includes("unsubscribe_spam");
}

function senderDomain(email: string | null) {
  const host = email?.split("@")[1]?.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function riskLevelFor(input: { emailCount: number; spamCount: number; phishingCount: number; threshold: number }) {
  if (input.phishingCount > 0 || input.emailCount >= input.threshold || input.spamCount >= Math.ceil(input.threshold / 2)) {
    return "high" as const;
  }
  if (input.spamCount > 0 || input.emailCount >= Math.ceil(input.threshold * 0.7)) {
    return "medium" as const;
  }
  return "low" as const;
}

function sortRiskRows<T extends { riskLevel: "low" | "medium" | "high"; emailCount: number; spamCount: number }>(a: T, b: T) {
  const rank = { high: 3, medium: 2, low: 1 };
  return rank[b.riskLevel] - rank[a.riskLevel] || b.spamCount - a.spamCount || b.emailCount - a.emailCount;
}
