import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultProfile,
  defaultSettings,
  seedAssistantTasks,
  seedBlockedDomains,
  seedDiscoveryJobs,
  seedEntryLogs,
  seedSweepstakes,
} from "@/lib/data/seed";
import { buildDashboardData } from "@/lib/storage/dashboard";
import type { SweepScoutStore } from "@/lib/storage/store";
import type {
  AppSettings,
  AssistantTask,
  AuditLog,
  BlockedDomain,
  DiscoveryJob,
  EntryLog,
  ExtractionJob,
  InboxAlert,
  RulesChangeAlert,
  RulesSnapshot,
  Sweepstake,
  UserProfile,
} from "@/lib/types";

type Database = import("better-sqlite3").Database;
type Row = { payload: string };

export async function createSqliteStore(sqlitePath: string): Promise<SweepScoutStore> {
  const db = await openDatabase(sqlitePath);
  migrate(db);
  seed(db);
  return new SqliteStore(db);
}

async function openDatabase(sqlitePath: string) {
  await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
  const sqlite = await import("better-sqlite3");
  const db = new sqlite.default(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function migrate(db: Database) {
  db.exec(`
    create table if not exists sweepstakes (
      id text primary key,
      title text not null,
      status text not null,
      category text not null,
      url text not null,
      end_at text,
      scam_score integer not null,
      eligibility_score integer not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists discovery_jobs (
      id text primary key,
      status text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists assistant_tasks (
      id text primary key,
      sweepstake_id text not null,
      status text not null,
      priority integer not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists entry_logs (
      id text primary key,
      sweepstake_id text not null,
      status text not null,
      attempted_at text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists extraction_jobs (
      id text primary key,
      sweepstake_id text not null,
      status text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists user_profiles (
      id text primary key,
      email text not null,
      payload text not null,
      updated_at text not null
    );

    create table if not exists app_settings (
      key text primary key,
      payload text not null,
      updated_at text not null
    );

    create table if not exists blocked_domains (
      id text primary key,
      domain text not null unique,
      payload text not null,
      created_at text not null
    );

    create table if not exists audit_logs (
      id text primary key,
      action text not null,
      entity_type text not null,
      severity text not null,
      payload text not null,
      created_at text not null
    );

    create table if not exists inbox_alerts (
      id text primary key,
      message_id text not null unique,
      status text not null,
      severity text not null,
      received_at text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rules_snapshots (
      id text primary key,
      sweepstake_id text not null,
      rules_url text not null,
      captured_at text not null,
      text_hash text not null,
      normalized_text_hash text not null,
      payload text not null,
      created_at text not null
    );

    create table if not exists rules_change_alerts (
      id text primary key,
      sweepstake_id text not null,
      status text not null,
      severity text not null,
      detected_at text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );
  `);
}

function seed(db: Database) {
  const store = new SqliteStore(db);
  for (const domain of seedBlockedDomains) {
    store.saveBlockedDomainSync(domain);
  }

  const sweepstakeCount = db.prepare("select count(*) as count from sweepstakes").get() as { count: number };
  if (sweepstakeCount.count > 0) {
    return;
  }

  const transaction = db.transaction(() => {
    for (const sweepstake of seedSweepstakes) {
      store.saveSweepstakeSync(sweepstake);
    }
    for (const job of seedDiscoveryJobs) {
      store.saveDiscoveryJobSync(job);
    }
    for (const task of seedAssistantTasks) {
      store.saveAssistantTaskSync(task);
    }
    for (const entry of seedEntryLogs) {
      store.saveEntryLogSync(entry);
    }
    store.saveUserProfileSync(defaultProfile);
    store.saveSettingsSync(defaultSettings);
  });
  transaction();
}

class SqliteStore implements SweepScoutStore {
  mode = "sqlite" as const;

  constructor(private readonly db: Database) {}

  async getDashboardData() {
    return buildDashboardData({
      sweepstakes: await this.listSweepstakes(),
      discoveryJobs: await this.listDiscoveryJobs(),
      assistantTasks: await this.listAssistantTasks(),
      entryLogs: await this.listEntryLogs(),
      inboxAlerts: await this.listInboxAlerts(),
      rulesChangeAlerts: await this.listRulesChangeAlerts(),
      settings: await this.getSettings(),
    });
  }

  async listSweepstakes() {
    return (
      this.db.prepare("select payload from sweepstakes order by end_at is null, end_at asc, updated_at desc").all() as Row[]
    ).map((row) => normalizeSweepstakePayload(fromPayload<Sweepstake>(row)));
  }

  async getSweepstake(id: string) {
    const row = this.db.prepare("select payload from sweepstakes where id = ?").get(id) as Row | undefined;
    return row ? normalizeSweepstakePayload(fromPayload<Sweepstake>(row)) : null;
  }

  async saveSweepstake(sweepstake: Sweepstake) {
    this.saveSweepstakeSync(sweepstake);
    return sweepstake;
  }

  saveSweepstakeSync(sweepstake: Sweepstake) {
    this.db
      .prepare(
        `insert into sweepstakes
          (id, title, status, category, url, end_at, scam_score, eligibility_score, payload, created_at, updated_at)
         values (@id, @title, @status, @category, @url, @endAt, @scamScore, @eligibilityScore, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set
          title = excluded.title,
          status = excluded.status,
          category = excluded.category,
          url = excluded.url,
          end_at = excluded.end_at,
          scam_score = excluded.scam_score,
          eligibility_score = excluded.eligibility_score,
          payload = excluded.payload,
          updated_at = excluded.updated_at`,
      )
      .run({ ...sweepstake, payload: JSON.stringify(sweepstake) });
  }

  async listDiscoveryJobs() {
    return (this.db.prepare("select payload from discovery_jobs order by updated_at desc").all() as Row[]).map(
      fromPayload<DiscoveryJob>,
    );
  }

  async getDiscoveryJob(id: string) {
    const row = this.db.prepare("select payload from discovery_jobs where id = ?").get(id) as Row | undefined;
    return row ? fromPayload<DiscoveryJob>(row) : null;
  }

  async saveDiscoveryJob(job: DiscoveryJob) {
    this.saveDiscoveryJobSync(job);
    return job;
  }

  saveDiscoveryJobSync(job: DiscoveryJob) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into discovery_jobs (id, status, payload, created_at, updated_at)
         values (@id, @status, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ id: job.id, status: job.status, payload: JSON.stringify(job), createdAt: job.createdAt, updatedAt: now });
  }

  async listAssistantTasks() {
    return (
      this.db.prepare("select payload from assistant_tasks order by priority desc, created_at desc").all() as Row[]
    ).map(fromPayload<AssistantTask>);
  }

  async getAssistantTask(id: string) {
    const row = this.db.prepare("select payload from assistant_tasks where id = ?").get(id) as Row | undefined;
    return row ? fromPayload<AssistantTask>(row) : null;
  }

  async saveAssistantTask(task: AssistantTask) {
    this.saveAssistantTaskSync(task);
    return task;
  }

  saveAssistantTaskSync(task: AssistantTask) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into assistant_tasks (id, sweepstake_id, status, priority, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @priority, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, priority = excluded.priority, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...task, payload: JSON.stringify(task), updatedAt: now });
  }

  async listEntryLogs() {
    return (this.db.prepare("select payload from entry_logs order by attempted_at desc").all() as Row[]).map(
      (row) => normalizeEntryPayload(fromPayload<EntryLog>(row)),
    );
  }

  async saveEntryLog(entry: EntryLog) {
    this.saveEntryLogSync(entry);
    return entry;
  }

  saveEntryLogSync(entry: EntryLog) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into entry_logs (id, sweepstake_id, status, attempted_at, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @attemptedAt, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...entry, payload: JSON.stringify(entry), createdAt: entry.attemptedAt, updatedAt: now });
  }

  async listInboxAlerts(limit = 100) {
    return (
      this.db
        .prepare("select payload from inbox_alerts order by received_at desc, created_at desc limit ?")
        .all(Math.max(1, Math.min(limit, 500))) as Row[]
    ).map((row) => normalizeInboxAlertPayload(fromPayload<InboxAlert>(row)));
  }

  async getInboxAlert(id: string) {
    const row = this.db.prepare("select payload from inbox_alerts where id = ?").get(id) as Row | undefined;
    return row ? normalizeInboxAlertPayload(fromPayload<InboxAlert>(row)) : null;
  }

  async saveInboxAlert(alert: InboxAlert) {
    const now = new Date().toISOString();
    const existingRow = this.db.prepare("select payload from inbox_alerts where message_id = ?").get(alert.messageId) as Row | undefined;
    const existing = existingRow ? normalizeInboxAlertPayload(fromPayload<InboxAlert>(existingRow)) : null;
    const merged =
      existing && alert.status === "new"
        ? {
            ...alert,
            status: existing.status,
            reviewedAt: existing.reviewedAt,
            reviewNotes: existing.reviewNotes,
          }
        : alert;
    this.db
      .prepare(
        `insert into inbox_alerts (id, message_id, status, severity, received_at, payload, created_at, updated_at)
         values (@id, @messageId, @status, @severity, @receivedAt, @payload, @createdAt, @updatedAt)
         on conflict(message_id) do update set
          status = excluded.status,
          severity = excluded.severity,
          received_at = excluded.received_at,
          payload = excluded.payload,
          updated_at = excluded.updated_at`,
      )
      .run({ ...merged, payload: JSON.stringify(merged), updatedAt: now });
    return merged;
  }

  async listRulesSnapshots(sweepstakeId?: string) {
    const rows = sweepstakeId
      ? (this.db
          .prepare("select payload from rules_snapshots where sweepstake_id = ? order by captured_at desc")
          .all(sweepstakeId) as Row[])
      : (this.db.prepare("select payload from rules_snapshots order by captured_at desc").all() as Row[]);
    return rows.map((row) => normalizeRulesSnapshotPayload(fromPayload<RulesSnapshot>(row)));
  }

  async saveRulesSnapshot(snapshot: RulesSnapshot) {
    this.db
      .prepare(
        `insert into rules_snapshots
          (id, sweepstake_id, rules_url, captured_at, text_hash, normalized_text_hash, payload, created_at)
         values (@id, @sweepstakeId, @rulesUrl, @capturedAt, @textHash, @normalizedTextHash, @payload, @createdAt)
         on conflict(id) do update set
          rules_url = excluded.rules_url,
          captured_at = excluded.captured_at,
          text_hash = excluded.text_hash,
          normalized_text_hash = excluded.normalized_text_hash,
          payload = excluded.payload`,
      )
      .run({ ...snapshot, payload: JSON.stringify(snapshot), createdAt: snapshot.capturedAt });
    return snapshot;
  }

  async listRulesChangeAlerts(limit = 100) {
    return (
      this.db
        .prepare("select payload from rules_change_alerts order by detected_at desc, created_at desc limit ?")
        .all(Math.max(1, Math.min(limit, 500))) as Row[]
    ).map((row) => normalizeRulesChangeAlertPayload(fromPayload<RulesChangeAlert>(row)));
  }

  async getRulesChangeAlert(id: string) {
    const row = this.db.prepare("select payload from rules_change_alerts where id = ?").get(id) as Row | undefined;
    return row ? normalizeRulesChangeAlertPayload(fromPayload<RulesChangeAlert>(row)) : null;
  }

  async saveRulesChangeAlert(alert: RulesChangeAlert) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into rules_change_alerts
          (id, sweepstake_id, status, severity, detected_at, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @severity, @detectedAt, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set
          status = excluded.status,
          severity = excluded.severity,
          detected_at = excluded.detected_at,
          payload = excluded.payload,
          updated_at = excluded.updated_at`,
      )
      .run({ ...alert, payload: JSON.stringify(alert), createdAt: alert.detectedAt, updatedAt: now });
    return alert;
  }

  async listExtractionJobs() {
    return (this.db.prepare("select payload from extraction_jobs order by created_at desc").all() as Row[]).map(
      fromPayload<ExtractionJob>,
    );
  }

  async saveExtractionJob(job: ExtractionJob) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into extraction_jobs (id, sweepstake_id, status, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({
        ...job,
        payload: JSON.stringify(job),
        createdAt: job.startedAt ?? now,
        updatedAt: job.finishedAt ?? now,
      });
    return job;
  }

  async getUserProfile() {
    const row = this.db.prepare("select payload from user_profiles limit 1").get() as Row | undefined;
    return normalizeUserProfilePayload(row ? fromPayload<UserProfile>(row) : defaultProfile);
  }

  async saveUserProfile(profile: UserProfile) {
    this.saveUserProfileSync(profile);
    return profile;
  }

  saveUserProfileSync(profile: UserProfile) {
    this.db
      .prepare(
        `insert into user_profiles (id, email, payload, updated_at)
         values (@id, @email, @payload, @updatedAt)
         on conflict(id) do update set email = excluded.email, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...profile, payload: JSON.stringify(profile) });
  }

  async getSettings() {
    const row = this.db.prepare("select payload from app_settings where key = 'default'").get() as Row | undefined;
    return normalizeSettingsPayload(row ? fromPayload<AppSettings>(row) : defaultSettings);
  }

  async saveSettings(settings: AppSettings) {
    this.saveSettingsSync(settings);
    return settings;
  }

  saveSettingsSync(settings: AppSettings) {
    this.db
      .prepare(
        `insert into app_settings (key, payload, updated_at)
         values ('default', @payload, @updatedAt)
         on conflict(key) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ payload: JSON.stringify(settings), updatedAt: new Date().toISOString() });
  }

  async listBlockedDomains() {
    return (this.db.prepare("select payload from blocked_domains order by created_at desc").all() as Row[]).map(
      fromPayload<BlockedDomain>,
    );
  }

  async saveBlockedDomain(domain: BlockedDomain) {
    this.saveBlockedDomainSync(domain);
    return domain;
  }

  saveBlockedDomainSync(domain: BlockedDomain) {
    this.db
      .prepare(
        `insert into blocked_domains (id, domain, payload, created_at)
         values (@id, @domain, @payload, @createdAt)
         on conflict(domain) do update set payload = excluded.payload`,
      )
      .run({ ...domain, payload: JSON.stringify(domain) });
  }

  async listAuditLogs(limit = 100) {
    return (
      this.db.prepare("select payload from audit_logs order by created_at desc limit ?").all(Math.max(1, Math.min(limit, 500))) as Row[]
    ).map(fromPayload<AuditLog>);
  }

  async saveAuditLog(log: AuditLog) {
    this.db
      .prepare(
        `insert into audit_logs (id, action, entity_type, severity, payload, created_at)
         values (@id, @action, @entityType, @severity, @payload, @createdAt)
         on conflict(id) do update set action = excluded.action, entity_type = excluded.entity_type, severity = excluded.severity, payload = excluded.payload`,
      )
      .run({ ...log, payload: JSON.stringify(log) });
    return log;
  }
}

function fromPayload<T>(row: Row): T {
  return JSON.parse(row.payload) as T;
}

function normalizeSweepstakePayload(sweepstake: Sweepstake): Sweepstake {
  return {
    ...sweepstake,
    noPurchaseMethodFound: sweepstake.noPurchaseMethodFound ?? false,
    formUrl: sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null,
    emailAlias: sweepstake.emailAlias ?? null,
    extractedRules: sweepstake.extractedRules ?? null,
    complianceNotes: sweepstake.complianceNotes ?? sweepstake.riskFlags.map((flag) => flag.label),
  };
}

function normalizeEntryPayload(entry: EntryLog): EntryLog {
  return {
    ...entry,
    formUrl: entry.formUrl ?? null,
    emailAlias: entry.emailAlias ?? null,
    timeSpentMinutes: entry.timeSpentMinutes ?? estimatedTimeSpentMinutes(entry),
    prefillSavedMinutes: entry.prefillSavedMinutes ?? (entry.status === "prefilled" ? defaultSettings.roi.prefillSavedMinutes : 0),
    screenshotPath: entry.screenshotPath ?? null,
    prefillFields: entry.prefillFields ?? [],
    blockers: entry.blockers ?? [],
  };
}

function normalizeInboxAlertPayload(alert: InboxAlert): InboxAlert {
  return {
    ...alert,
    fromName: alert.fromName ?? null,
    fromEmail: alert.fromEmail ?? null,
    matchedSweepstakeId: alert.matchedSweepstakeId ?? null,
    matchedSweepstakeTitle: alert.matchedSweepstakeTitle ?? null,
    matchedByAlias: alert.matchedByAlias ?? false,
    recipientAliases: alert.recipientAliases ?? [],
    categories: alert.categories?.length ? alert.categories : ["general"],
    riskFlags: alert.riskFlags ?? [],
    links: alert.links ?? [],
    status: alert.status ?? "new",
    reviewRequired: alert.reviewRequired ?? false,
    reviewedAt: alert.reviewedAt ?? null,
    reviewNotes: alert.reviewNotes ?? "",
  };
}

function normalizeRulesSnapshotPayload(snapshot: RulesSnapshot): RulesSnapshot {
  return {
    ...snapshot,
    textExcerpt: snapshot.textExcerpt ?? "",
    extracted: {
      deadline: snapshot.extracted?.deadline ?? null,
      eligibility: snapshot.extracted?.eligibility ?? null,
      prize: snapshot.extracted?.prize ?? null,
      prizeValue: snapshot.extracted?.prizeValue ?? null,
      entryFrequency: snapshot.extracted?.entryFrequency ?? null,
    },
  };
}

function normalizeRulesChangeAlertPayload(alert: RulesChangeAlert): RulesChangeAlert {
  return {
    ...alert,
    status: alert.status ?? "new",
    changedFields: alert.changedFields ?? [],
    changes: alert.changes ?? [],
    previousSnapshot: normalizeRulesSnapshotPayload(alert.previousSnapshot),
    currentSnapshot: normalizeRulesSnapshotPayload(alert.currentSnapshot),
    reviewNotes: alert.reviewNotes ?? "",
    reviewedAt: alert.reviewedAt ?? null,
  };
}

function normalizeUserProfilePayload(profile: UserProfile): UserProfile {
  return {
    ...defaultProfile,
    ...profile,
    alternateEmail: profile.alternateEmail ?? "",
    consentToPrefill: profile.consentToPrefill ?? false,
    preferences: {
      ...defaultProfile.preferences,
      ...(profile.preferences ?? {}),
      categories: profile.preferences?.categories ?? defaultProfile.preferences.categories,
    },
  };
}

function normalizeSettingsPayload(settings: AppSettings): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    emailAliases: {
      ...defaultSettings.emailAliases,
      ...(settings.emailAliases ?? {}),
      prefix: (settings.emailAliases?.prefix ?? defaultSettings.emailAliases.prefix).trim() || defaultSettings.emailAliases.prefix,
      nextSequence: Number(settings.emailAliases?.nextSequence ?? defaultSettings.emailAliases.nextSequence),
      excessiveEmailThreshold: Number(
        settings.emailAliases?.excessiveEmailThreshold ?? defaultSettings.emailAliases.excessiveEmailThreshold,
      ),
      spamWindowDays: Number(settings.emailAliases?.spamWindowDays ?? defaultSettings.emailAliases.spamWindowDays),
    },
    roi: {
      ...defaultSettings.roi,
      ...(settings.roi ?? {}),
      manualEntryMinutes: Number(settings.roi?.manualEntryMinutes ?? defaultSettings.roi.manualEntryMinutes),
      prefillReviewMinutes: Number(settings.roi?.prefillReviewMinutes ?? defaultSettings.roi.prefillReviewMinutes),
      prefillSavedMinutes: Number(settings.roi?.prefillSavedMinutes ?? defaultSettings.roi.prefillSavedMinutes),
      defaultWinProbabilityBasisPoints: Number(
        settings.roi?.defaultWinProbabilityBasisPoints ?? defaultSettings.roi.defaultWinProbabilityBasisPoints,
      ),
    },
    rulesMonitor: {
      ...defaultSettings.rulesMonitor,
      ...(settings.rulesMonitor ?? {}),
      pollIntervalMinutes: Number(settings.rulesMonitor?.pollIntervalMinutes ?? defaultSettings.rulesMonitor.pollIntervalMinutes),
      maxChecksPerRun: Number(settings.rulesMonitor?.maxChecksPerRun ?? defaultSettings.rulesMonitor.maxChecksPerRun),
    },
    inbox: {
      ...defaultSettings.inbox,
      ...(settings.inbox ?? {}),
      port: Number(settings.inbox?.port ?? defaultSettings.inbox.port),
      pollIntervalMinutes: Number(settings.inbox?.pollIntervalMinutes ?? defaultSettings.inbox.pollIntervalMinutes),
      maxMessagesPerPoll: Number(settings.inbox?.maxMessagesPerPoll ?? defaultSettings.inbox.maxMessagesPerPoll),
    },
    automatedDiscoveryEnabled: settings.automatedDiscoveryEnabled ?? defaultSettings.automatedDiscoveryEnabled,
    formPrefillEnabled: settings.formPrefillEnabled ?? defaultSettings.formPrefillEnabled,
    requireApprovalForEveryEntry: true,
  };
}

function estimatedTimeSpentMinutes(entry: EntryLog) {
  if (entry.status === "prefilled") return defaultSettings.roi.prefillReviewMinutes;
  if (entry.status === "submitted") return defaultSettings.roi.manualEntryMinutes;
  if (entry.status === "winner_notification") return 3;
  if (entry.status === "suspicious" || entry.status === "skipped" || entry.status === "rejected") return 2;
  return 1;
}
