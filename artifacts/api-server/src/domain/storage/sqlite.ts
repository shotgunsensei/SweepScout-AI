import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultMembership,
  defaultOrganization,
  defaultProfile,
  defaultSettings,
  defaultSubscription,
  seedAssistantTasks,
  seedBlockedDomains,
  seedDiscoveryJobs,
  seedEntryLogs,
  seedSweepstakes,
} from "@/lib/data/seed";
import { buildDashboardData } from "@/lib/storage/dashboard";
import { normalizeCategoryPreferences, normalizePrizeCategory } from "@/lib/services/category-classifier";
import { normalizeNearbyMetros } from "@/lib/services/location-eligibility";
import { DEFAULT_ORGANIZATION_ID, buildDefaultMembership, buildDefaultSubscription, getPlanLimits, normalizePlanTier } from "@/lib/services/tenancy";
import type { SweepScoutStore } from "@/lib/storage/store";
import type {
  AppSettings,
  AssistantTask,
  AuditLog,
  BillingSubscription,
  BlockedDomain,
  DiscoveryJob,
  EntryLog,
  ExtractionJob,
  InboxAlert,
  Organization,
  OrganizationMembership,
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
    create table if not exists organizations (
      id text primary key,
      slug text not null unique,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists organization_memberships (
      id text primary key,
      organization_id text not null,
      user_id text not null,
      email text not null,
      payload text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists billing_subscriptions (
      id text primary key,
      organization_id text not null unique,
      tier text not null,
      status text not null,
      payload text not null,
      updated_at text not null
    );

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
  store.saveOrganizationSync(defaultOrganization);
  store.saveMembershipSync(defaultMembership);
  store.saveBillingSubscriptionSync(defaultSubscription);

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

  private get activeOrganizationId() {
    return process.env.SWEEPSCOUT_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID;
  }

  private async getUsageSnapshotForOrg(organizationId: string, tierInput: unknown) {
    const tier = normalizePlanTier(tierInput);
    const limits = getPlanLimits(tier);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [sweepstakes, discoveryJobs] = await Promise.all([this.listSweepstakes(), this.listDiscoveryJobs()]);
    return {
      organizationId,
      tier,
      limits,
      savedSweepstakes: sweepstakes.length,
      discoveryJobsThisMonth: discoveryJobs.filter((job) => {
        const time = new Date(job.lastRunAt ?? job.createdAt).getTime();
        return Number.isFinite(time) && time >= periodStart.getTime() && time < periodEnd.getTime();
      }).length,
      usagePeriodStart: periodStart.toISOString(),
      usagePeriodEnd: periodEnd.toISOString(),
    };
  }

  async getDashboardData() {
    const organization = await this.getActiveOrganization();
    const subscription = await this.getBillingSubscription(organization.id);
    return buildDashboardData({
      sweepstakes: await this.listSweepstakes(),
      discoveryJobs: await this.listDiscoveryJobs(),
      assistantTasks: await this.listAssistantTasks(),
      entryLogs: await this.listEntryLogs(),
      inboxAlerts: await this.listInboxAlerts(),
      rulesChangeAlerts: await this.listRulesChangeAlerts(),
      settings: await this.getSettings(),
      organization,
      subscription,
      usage: await this.getUsageSnapshotForOrg(organization.id, subscription.tier),
    });
  }

  async listOrganizations() {
    return (this.db.prepare("select payload from organizations order by created_at asc").all() as Row[]).map((row) =>
      normalizeOrganizationPayload(fromPayload<Organization>(row)),
    );
  }

  async getActiveOrganization() {
    const row = this.db.prepare("select payload from organizations where id = ?").get(this.activeOrganizationId) as Row | undefined;
    return normalizeOrganizationPayload(row ? fromPayload<Organization>(row) : defaultOrganization);
  }

  async saveOrganization(organization: Organization) {
    this.saveOrganizationSync(organization);
    return normalizeOrganizationPayload(organization);
  }

  saveOrganizationSync(organization: Organization) {
    const normalized = normalizeOrganizationPayload(organization);
    this.db
      .prepare(
        `insert into organizations (id, slug, payload, created_at, updated_at)
         values (@id, @slug, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set slug = excluded.slug, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
  }

  async listMemberships(organizationId = this.activeOrganizationId) {
    return (
      this.db
        .prepare("select payload from organization_memberships where organization_id = ? order by created_at asc")
        .all(organizationId) as Row[]
    ).map((row) => normalizeMembershipPayload(fromPayload<OrganizationMembership>(row), organizationId));
  }

  async getActiveMembership() {
    const organization = await this.getActiveOrganization();
    const row = this.db
      .prepare("select payload from organization_memberships where organization_id = ? and payload like '%\"status\":\"active\"%' order by created_at asc limit 1")
      .get(organization.id) as Row | undefined;
    return normalizeMembershipPayload(row ? fromPayload<OrganizationMembership>(row) : buildDefaultMembership(organization.id), organization.id);
  }

  async saveMembership(membership: OrganizationMembership) {
    this.saveMembershipSync(membership);
    return normalizeMembershipPayload(membership);
  }

  saveMembershipSync(membership: OrganizationMembership) {
    const normalized = normalizeMembershipPayload(membership);
    this.db
      .prepare(
        `insert into organization_memberships (id, organization_id, user_id, email, payload, created_at, updated_at)
         values (@id, @organizationId, @userId, @email, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set
          organization_id = excluded.organization_id,
          user_id = excluded.user_id,
          email = excluded.email,
          payload = excluded.payload,
          updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
  }

  async getBillingSubscription(organizationId = this.activeOrganizationId) {
    const row = this.db.prepare("select payload from billing_subscriptions where organization_id = ?").get(organizationId) as Row | undefined;
    const organization = await this.getActiveOrganization();
    return normalizeBillingSubscriptionPayload(
      row ? fromPayload<BillingSubscription>(row) : buildDefaultSubscription(organizationId, organization.planTier),
      organizationId,
    );
  }

  async saveBillingSubscription(subscription: BillingSubscription) {
    this.saveBillingSubscriptionSync(subscription);
    return normalizeBillingSubscriptionPayload(subscription);
  }

  saveBillingSubscriptionSync(subscription: BillingSubscription) {
    const normalized = normalizeBillingSubscriptionPayload(subscription);
    this.db
      .prepare(
        `insert into billing_subscriptions (id, organization_id, tier, status, payload, updated_at)
         values (@id, @organizationId, @tier, @status, @payload, @updatedAt)
         on conflict(organization_id) do update set
          tier = excluded.tier,
          status = excluded.status,
          payload = excluded.payload,
          updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
  }

  async listSweepstakes() {
    return (
      this.db.prepare("select payload from sweepstakes order by end_at is null, end_at asc, updated_at desc").all() as Row[]
    )
      .map((row) => normalizeSweepstakePayload(fromPayload<Sweepstake>(row)))
      .filter(belongsToActiveOrganization);
  }

  async getSweepstake(id: string) {
    const row = this.db.prepare("select payload from sweepstakes where id = ?").get(id) as Row | undefined;
    const sweepstake = row ? normalizeSweepstakePayload(fromPayload<Sweepstake>(row)) : null;
    return sweepstake && belongsToActiveOrganization(sweepstake) ? sweepstake : null;
  }

  async saveSweepstake(sweepstake: Sweepstake) {
    const normalized = normalizeSweepstakePayload(sweepstake);
    this.saveSweepstakeSync(normalized);
    return normalized;
  }

  saveSweepstakeSync(sweepstake: Sweepstake) {
    const normalized = normalizeSweepstakePayload(sweepstake);
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
      .run({ ...normalized, payload: JSON.stringify(normalized) });
  }

  async listDiscoveryJobs() {
    return (this.db.prepare("select payload from discovery_jobs order by updated_at desc").all() as Row[])
      .map((row) => normalizeDiscoveryJobPayload(fromPayload<DiscoveryJob>(row)))
      .filter(belongsToActiveOrganization);
  }

  async getDiscoveryJob(id: string) {
    const row = this.db.prepare("select payload from discovery_jobs where id = ?").get(id) as Row | undefined;
    const job = row ? normalizeDiscoveryJobPayload(fromPayload<DiscoveryJob>(row)) : null;
    return job && belongsToActiveOrganization(job) ? job : null;
  }

  async saveDiscoveryJob(job: DiscoveryJob) {
    const normalized = normalizeDiscoveryJobPayload(job);
    this.saveDiscoveryJobSync(normalized);
    return normalized;
  }

  saveDiscoveryJobSync(job: DiscoveryJob) {
    const now = new Date().toISOString();
    const normalized = normalizeDiscoveryJobPayload(job);
    this.db
      .prepare(
        `insert into discovery_jobs (id, status, payload, created_at, updated_at)
         values (@id, @status, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({
        id: normalized.id,
        status: normalized.status,
        payload: JSON.stringify(normalized),
        createdAt: normalized.createdAt,
        updatedAt: now,
      });
  }

  async listAssistantTasks() {
    return (
      this.db.prepare("select payload from assistant_tasks order by priority desc, created_at desc").all() as Row[]
    )
      .map((row) => normalizeAssistantTaskPayload(fromPayload<AssistantTask>(row)))
      .filter(belongsToActiveOrganization);
  }

  async getAssistantTask(id: string) {
    const row = this.db.prepare("select payload from assistant_tasks where id = ?").get(id) as Row | undefined;
    const task = row ? normalizeAssistantTaskPayload(fromPayload<AssistantTask>(row)) : null;
    return task && belongsToActiveOrganization(task) ? task : null;
  }

  async saveAssistantTask(task: AssistantTask) {
    const normalized = normalizeAssistantTaskPayload(task);
    this.saveAssistantTaskSync(normalized);
    return normalized;
  }

  saveAssistantTaskSync(task: AssistantTask) {
    const now = new Date().toISOString();
    const normalized = normalizeAssistantTaskPayload(task);
    this.db
      .prepare(
        `insert into assistant_tasks (id, sweepstake_id, status, priority, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @priority, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, priority = excluded.priority, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized), updatedAt: now });
  }

  async listEntryLogs() {
    return (this.db.prepare("select payload from entry_logs order by attempted_at desc").all() as Row[])
      .map((row) => normalizeEntryPayload(fromPayload<EntryLog>(row)))
      .filter(belongsToActiveOrganization);
  }

  async saveEntryLog(entry: EntryLog) {
    const normalized = normalizeEntryPayload(entry);
    this.saveEntryLogSync(normalized);
    return normalized;
  }

  saveEntryLogSync(entry: EntryLog) {
    const now = new Date().toISOString();
    const normalized = normalizeEntryPayload(entry);
    this.db
      .prepare(
        `insert into entry_logs (id, sweepstake_id, status, attempted_at, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @attemptedAt, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized), createdAt: normalized.attemptedAt, updatedAt: now });
  }

  async listInboxAlerts(limit = 100) {
    return (
      this.db
        .prepare("select payload from inbox_alerts order by received_at desc, created_at desc limit ?")
        .all(Math.max(1, Math.min(limit, 500))) as Row[]
    )
      .map((row) => normalizeInboxAlertPayload(fromPayload<InboxAlert>(row)))
      .filter(belongsToActiveOrganization);
  }

  async getInboxAlert(id: string) {
    const row = this.db.prepare("select payload from inbox_alerts where id = ?").get(id) as Row | undefined;
    const alert = row ? normalizeInboxAlertPayload(fromPayload<InboxAlert>(row)) : null;
    return alert && belongsToActiveOrganization(alert) ? alert : null;
  }

  async saveInboxAlert(alert: InboxAlert) {
    const now = new Date().toISOString();
    const normalized = normalizeInboxAlertPayload(alert);
    const existingRow = this.db.prepare("select payload from inbox_alerts where message_id = ?").get(alert.messageId) as Row | undefined;
    const existing = existingRow ? normalizeInboxAlertPayload(fromPayload<InboxAlert>(existingRow)) : null;
    const merged =
      existing && normalized.status === "new"
        ? {
            ...normalized,
            status: existing.status,
            reviewedAt: existing.reviewedAt,
            reviewNotes: existing.reviewNotes,
          }
        : normalized;
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
    return rows.map((row) => normalizeRulesSnapshotPayload(fromPayload<RulesSnapshot>(row))).filter(belongsToActiveOrganization);
  }

  async saveRulesSnapshot(snapshot: RulesSnapshot) {
    const normalized = normalizeRulesSnapshotPayload(snapshot);
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
      .run({ ...normalized, payload: JSON.stringify(normalized), createdAt: normalized.capturedAt });
    return normalized;
  }

  async listRulesChangeAlerts(limit = 100) {
    return (
      this.db
        .prepare("select payload from rules_change_alerts order by detected_at desc, created_at desc limit ?")
        .all(Math.max(1, Math.min(limit, 500))) as Row[]
    )
      .map((row) => normalizeRulesChangeAlertPayload(fromPayload<RulesChangeAlert>(row)))
      .filter(belongsToActiveOrganization);
  }

  async getRulesChangeAlert(id: string) {
    const row = this.db.prepare("select payload from rules_change_alerts where id = ?").get(id) as Row | undefined;
    const alert = row ? normalizeRulesChangeAlertPayload(fromPayload<RulesChangeAlert>(row)) : null;
    return alert && belongsToActiveOrganization(alert) ? alert : null;
  }

  async saveRulesChangeAlert(alert: RulesChangeAlert) {
    const now = new Date().toISOString();
    const normalized = normalizeRulesChangeAlertPayload(alert);
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
      .run({ ...normalized, payload: JSON.stringify(normalized), createdAt: normalized.detectedAt, updatedAt: now });
    return normalized;
  }

  async listExtractionJobs() {
    return (this.db.prepare("select payload from extraction_jobs order by created_at desc").all() as Row[])
      .map((row) => normalizeExtractionJobPayload(fromPayload<ExtractionJob>(row)))
      .filter(belongsToActiveOrganization);
  }

  async saveExtractionJob(job: ExtractionJob) {
    const now = new Date().toISOString();
    const normalized = normalizeExtractionJobPayload(job);
    this.db
      .prepare(
        `insert into extraction_jobs (id, sweepstake_id, status, payload, created_at, updated_at)
         values (@id, @sweepstakeId, @status, @payload, @createdAt, @updatedAt)
         on conflict(id) do update set status = excluded.status, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({
        ...normalized,
        payload: JSON.stringify(normalized),
        createdAt: normalized.startedAt ?? now,
        updatedAt: normalized.finishedAt ?? now,
      });
    return normalized;
  }

  async getUserProfile() {
    const row = this.db.prepare("select payload from user_profiles limit 1").get() as Row | undefined;
    return normalizeUserProfilePayload(row ? fromPayload<UserProfile>(row) : defaultProfile);
  }

  async saveUserProfile(profile: UserProfile) {
    const normalized = normalizeUserProfilePayload(profile);
    this.saveUserProfileSync(normalized);
    return normalized;
  }

  saveUserProfileSync(profile: UserProfile) {
    const normalized = normalizeUserProfilePayload(profile);
    this.db
      .prepare(
        `insert into user_profiles (id, email, payload, updated_at)
         values (@id, @email, @payload, @updatedAt)
         on conflict(id) do update set email = excluded.email, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
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
    return (this.db.prepare("select payload from blocked_domains order by created_at desc").all() as Row[])
      .map((row) => normalizeBlockedDomainPayload(fromPayload<BlockedDomain>(row)))
      .filter(belongsToActiveOrganization);
  }

  async saveBlockedDomain(domain: BlockedDomain) {
    const normalized = normalizeBlockedDomainPayload(domain);
    this.saveBlockedDomainSync(normalized);
    return normalized;
  }

  saveBlockedDomainSync(domain: BlockedDomain) {
    const normalized = normalizeBlockedDomainPayload(domain);
    this.db
      .prepare(
        `insert into blocked_domains (id, domain, payload, created_at)
         values (@id, @domain, @payload, @createdAt)
         on conflict(domain) do update set payload = excluded.payload`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
  }

  async listAuditLogs(limit = 100) {
    return (
      this.db.prepare("select payload from audit_logs order by created_at desc limit ?").all(Math.max(1, Math.min(limit, 500))) as Row[]
    )
      .map((row) => normalizeAuditLogPayload(fromPayload<AuditLog>(row)))
      .filter(belongsToActiveOrganization);
  }

  async saveAuditLog(log: AuditLog) {
    const normalized = normalizeAuditLogPayload(log);
    this.db
      .prepare(
        `insert into audit_logs (id, action, entity_type, severity, payload, created_at)
         values (@id, @action, @entityType, @severity, @payload, @createdAt)
         on conflict(id) do update set action = excluded.action, entity_type = excluded.entity_type, severity = excluded.severity, payload = excluded.payload`,
      )
      .run({ ...normalized, payload: JSON.stringify(normalized) });
    return normalized;
  }
}

function fromPayload<T>(row: Row): T {
  return JSON.parse(row.payload) as T;
}

function belongsToActiveOrganization(record: { organizationId?: string | null }) {
  return (record.organizationId ?? DEFAULT_ORGANIZATION_ID) === (process.env.SWEEPSCOUT_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID);
}

function normalizeOrganizationPayload(organization: Organization): Organization {
  const now = new Date().toISOString();
  return {
    ...organization,
    id: organization.id || DEFAULT_ORGANIZATION_ID,
    name: organization.name || defaultOrganization.name,
    slug: organization.slug || defaultOrganization.slug,
    planTier: normalizePlanTier(organization.planTier),
    createdAt: organization.createdAt ?? now,
    updatedAt: organization.updatedAt ?? now,
  };
}

function normalizeMembershipPayload(membership: OrganizationMembership, organizationId = DEFAULT_ORGANIZATION_ID): OrganizationMembership {
  const now = new Date().toISOString();
  return {
    ...membership,
    id: membership.id || `membership-${organizationId}-owner`,
    organizationId: membership.organizationId ?? organizationId,
    userId: membership.userId || "user-local-owner",
    email: membership.email || "you@example.com",
    role: membership.role ?? "owner",
    status: membership.status ?? "active",
    createdAt: membership.createdAt ?? now,
    updatedAt: membership.updatedAt ?? now,
  };
}

function normalizeBillingSubscriptionPayload(
  subscription: BillingSubscription,
  organizationId = DEFAULT_ORGANIZATION_ID,
): BillingSubscription {
  const tier = normalizePlanTier(subscription.tier);
  return {
    ...subscription,
    id: subscription.id || `subscription-${organizationId}`,
    organizationId: subscription.organizationId ?? organizationId,
    tier,
    status: subscription.status ?? (tier === "free" ? "none" : "active"),
    stripeCustomerId: subscription.stripeCustomerId ?? null,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    updatedAt: subscription.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeSweepstakePayload(sweepstake: Sweepstake): Sweepstake {
  return {
    ...sweepstake,
    organizationId: sweepstake.organizationId ?? DEFAULT_ORGANIZATION_ID,
    category: normalizePrizeCategory(sweepstake.category),
    noPurchaseMethodFound: sweepstake.noPurchaseMethodFound ?? false,
    formUrl: sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null,
    emailAlias: sweepstake.emailAlias ?? null,
    localRegion: sweepstake.localRegion ?? null,
    locationEligibilityScore: Number.isFinite(sweepstake.locationEligibilityScore) ? sweepstake.locationEligibilityScore : 50,
    locationEligibilityNotes: sweepstake.locationEligibilityNotes ?? [],
    requiresInPersonAppearance: sweepstake.requiresInPersonAppearance ?? false,
    extractedRules: sweepstake.extractedRules ?? null,
    complianceNotes: sweepstake.complianceNotes ?? sweepstake.riskFlags.map((flag) => flag.label),
  };
}

function normalizeDiscoveryJobPayload(job: DiscoveryJob): DiscoveryJob {
  return {
    ...job,
    organizationId: job.organizationId ?? DEFAULT_ORGANIZATION_ID,
    scope: job.scope ?? "general",
  };
}

function normalizeAssistantTaskPayload(task: AssistantTask): AssistantTask {
  return {
    ...task,
    organizationId: task.organizationId ?? DEFAULT_ORGANIZATION_ID,
  };
}

function normalizeExtractionJobPayload(job: ExtractionJob): ExtractionJob {
  return {
    ...job,
    organizationId: job.organizationId ?? DEFAULT_ORGANIZATION_ID,
  };
}

function normalizeEntryPayload(entry: EntryLog): EntryLog {
  return {
    ...entry,
    organizationId: entry.organizationId ?? DEFAULT_ORGANIZATION_ID,
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
    organizationId: alert.organizationId ?? DEFAULT_ORGANIZATION_ID,
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
    organizationId: snapshot.organizationId ?? DEFAULT_ORGANIZATION_ID,
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
    organizationId: alert.organizationId ?? DEFAULT_ORGANIZATION_ID,
    status: alert.status ?? "new",
    changedFields: alert.changedFields ?? [],
    changes: alert.changes ?? [],
    previousSnapshot: normalizeRulesSnapshotPayload(alert.previousSnapshot),
    currentSnapshot: normalizeRulesSnapshotPayload(alert.currentSnapshot),
    reviewNotes: alert.reviewNotes ?? "",
    reviewedAt: alert.reviewedAt ?? null,
  };
}

function normalizeBlockedDomainPayload(domain: BlockedDomain): BlockedDomain {
  return {
    ...domain,
    organizationId: domain.organizationId ?? DEFAULT_ORGANIZATION_ID,
  };
}

function normalizeAuditLogPayload(log: AuditLog): AuditLog {
  return {
    ...log,
    organizationId: log.organizationId ?? DEFAULT_ORGANIZATION_ID,
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
      categories: normalizeCategoryPreferences(profile.preferences?.categories ?? defaultProfile.preferences.categories),
      nearbyMetros: normalizeNearbyMetros(profile.preferences?.nearbyMetros ?? defaultProfile.preferences.nearbyMetros),
      allowInPersonContests: profile.preferences?.allowInPersonContests ?? defaultProfile.preferences.allowInPersonContests,
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
