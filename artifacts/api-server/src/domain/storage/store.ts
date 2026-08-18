import { getAppConfig } from "@/lib/env";
import type {
  AppSettings,
  AssistantTask,
  AuditLog,
  BillingSubscription,
  BlockedDomain,
  DashboardData,
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

export type SweepScoutStore = {
  mode: "supabase" | "sqlite";
  getDashboardData(): Promise<DashboardData>;
  listSweepstakes(): Promise<Sweepstake[]>;
  getSweepstake(id: string): Promise<Sweepstake | null>;
  saveSweepstake(sweepstake: Sweepstake): Promise<Sweepstake>;
  listDiscoveryJobs(): Promise<DiscoveryJob[]>;
  getDiscoveryJob(id: string): Promise<DiscoveryJob | null>;
  saveDiscoveryJob(job: DiscoveryJob): Promise<DiscoveryJob>;
  listAssistantTasks(): Promise<AssistantTask[]>;
  getAssistantTask(id: string): Promise<AssistantTask | null>;
  saveAssistantTask(task: AssistantTask): Promise<AssistantTask>;
  listEntryLogs(): Promise<EntryLog[]>;
  saveEntryLog(entry: EntryLog): Promise<EntryLog>;
  listInboxAlerts(limit?: number): Promise<InboxAlert[]>;
  getInboxAlert(id: string): Promise<InboxAlert | null>;
  saveInboxAlert(alert: InboxAlert): Promise<InboxAlert>;
  listRulesSnapshots(sweepstakeId?: string): Promise<RulesSnapshot[]>;
  saveRulesSnapshot(snapshot: RulesSnapshot): Promise<RulesSnapshot>;
  listRulesChangeAlerts(limit?: number): Promise<RulesChangeAlert[]>;
  getRulesChangeAlert(id: string): Promise<RulesChangeAlert | null>;
  saveRulesChangeAlert(alert: RulesChangeAlert): Promise<RulesChangeAlert>;
  listExtractionJobs(): Promise<ExtractionJob[]>;
  saveExtractionJob(job: ExtractionJob): Promise<ExtractionJob>;
  listOrganizations(): Promise<Organization[]>;
  getActiveOrganization(): Promise<Organization>;
  saveOrganization(organization: Organization): Promise<Organization>;
  listMemberships(organizationId?: string): Promise<OrganizationMembership[]>;
  getActiveMembership(): Promise<OrganizationMembership>;
  saveMembership(membership: OrganizationMembership): Promise<OrganizationMembership>;
  getBillingSubscription(organizationId?: string): Promise<BillingSubscription>;
  saveBillingSubscription(subscription: BillingSubscription): Promise<BillingSubscription>;
  getUserProfile(): Promise<UserProfile>;
  saveUserProfile(profile: UserProfile): Promise<UserProfile>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  /**
   * Atomically reserve one YouTube search.list call against the daily budget.
   * Returns `{ reserved: true }` when a slot was successfully claimed, or
   * `{ reserved: false }` when the daily limit has been reached.
   * Throws if the underlying store cannot be read or written.
   */
  reserveYouTubeQuota(today: string, limit: number): Promise<{ reserved: boolean; newCount: number }>;
  listBlockedDomains(): Promise<BlockedDomain[]>;
  saveBlockedDomain(domain: BlockedDomain): Promise<BlockedDomain>;
  listAuditLogs(limit?: number): Promise<AuditLog[]>;
  saveAuditLog(log: AuditLog): Promise<AuditLog>;
};

let storePromise: Promise<SweepScoutStore> | null = null;

export function getStore() {
  storePromise ??= createStore();
  return storePromise;
}

async function createStore(): Promise<SweepScoutStore> {
  const config = getAppConfig();
  if (config.mode === "supabase") {
    const { createSupabaseStore } = await import("@/lib/storage/supabase");
    return createSupabaseStore();
  }

  const { createSqliteStore } = await import("@/lib/storage/sqlite");
  return createSqliteStore(config.sqlitePath);
}
