import { getAppConfig } from "@/lib/env";
import type {
  AppSettings,
  AssistantTask,
  AuditLog,
  BlockedDomain,
  DashboardData,
  DiscoveryJob,
  EntryLog,
  ExtractionJob,
  InboxAlert,
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
  getUserProfile(): Promise<UserProfile>;
  saveUserProfile(profile: UserProfile): Promise<UserProfile>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
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
