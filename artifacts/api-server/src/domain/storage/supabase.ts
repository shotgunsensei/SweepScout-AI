import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultProfile, defaultSettings } from "@/lib/data/seed";
import type { Database, Json } from "@/lib/database.types";
import { buildDashboardData } from "@/lib/storage/dashboard";
import type { SweepScoutStore } from "@/lib/storage/store";
import type {
  AppSettings,
  AssistantTask,
  AuditLog,
  BlockedDomain,
  DiscoveryJob,
  EntryLog,
  EntryStatus,
  ExtractionJob,
  Sweepstake,
  SweepstakeStatus,
  UserProfile,
} from "@/lib/types";

type Supabase = SupabaseClient<Database>;
type SweepstakesRow = Database["public"]["Tables"]["sweepstakes"]["Row"];
type DiscoveryJobRow = Database["public"]["Tables"]["discovery_jobs"]["Row"];
type ExtractionJobRow = Database["public"]["Tables"]["extraction_jobs"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type EntryAttemptRow = Database["public"]["Tables"]["entry_attempts"]["Row"] & {
  sweepstakes?: Pick<SweepstakesRow, "canonical_url" | "form_url" | "source_url" | "title"> | null;
};
type UserProfileRow = Database["public"]["Tables"]["users_profile"]["Row"];
type SweepstakesStatus = Database["public"]["Enums"]["sweepstakes_status"];
type EntryAttemptStatus = Database["public"]["Enums"]["entry_attempt_status"];

export function createSupabaseStore(): SweepScoutStore {
  return new SupabaseStore(getServiceClient());
}

let serviceClient: Supabase | null = null;

function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serviceClient;
}

class SupabaseStore implements SweepScoutStore {
  mode = "supabase" as const;

  constructor(private readonly supabase: Supabase) {}

  async getDashboardData() {
    return buildDashboardData({
      sweepstakes: await this.listSweepstakes(),
      discoveryJobs: await this.listDiscoveryJobs(),
      assistantTasks: await this.listAssistantTasks(),
      entryLogs: await this.listEntryLogs(),
      settings: await this.getSettings(),
    });
  }

  async listSweepstakes() {
    const { data, error } = await this.supabase
      .from("sweepstakes")
      .select("*")
      .order("deadline", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(mapSweepstakesRow);
  }

  async getSweepstake(id: string) {
    const { data, error } = await this.supabase.from("sweepstakes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapSweepstakesRow(data) : null;
  }

  async saveSweepstake(sweepstake: Sweepstake) {
    const { data, error } = await this.supabase
      .from("sweepstakes")
      .upsert({
        ...(isUuid(sweepstake.id) ? { id: sweepstake.id } : {}),
        source_url: sweepstake.url,
        canonical_url: sweepstake.url,
        title: sweepstake.title,
        sponsor: sweepstake.sponsor,
        prize_summary: sweepstake.extractedRules?.prizeSummary ?? sweepstake.eligibilitySummary,
        estimated_value: sweepstake.prizeRetailValue,
        deadline: sweepstake.endAt,
        eligibility_text: sweepstake.eligibilitySummary,
        eligible_states: sweepstake.stateEligibility,
        minimum_age: sweepstake.ageRequirement,
        entry_frequency: sweepstake.entryFrequency,
        purchase_required: sweepstake.purchaseRequired,
        no_purchase_method_found: sweepstake.noPurchaseMethodFound,
        form_url: sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null,
        official_rules_url: sweepstake.extractedRules?.officialRulesUrl ?? sweepstake.rulesUrl,
        status: toDatabaseSweepstakesStatus(sweepstake.status),
        scam_score: sweepstake.scamScore,
        compliance_notes: sweepstake.complianceNotes,
        extracted_json: {
          category: sweepstake.category,
          country: sweepstake.country,
          extractedRules: sweepstake.extractedRules ?? null,
          hasCaptcha: sweepstake.hasCaptcha,
          eligibilityScore: sweepstake.eligibilityScore,
          requiresAccount: sweepstake.requiresAccount,
          rulesText: sweepstake.rulesText,
          rulesExtractedAt: sweepstake.rulesExtractedAt,
          source: sweepstake.source,
          riskFlags: sweepstake.riskFlags,
        } satisfies Json,
        created_at: sweepstake.createdAt,
        updated_at: sweepstake.updatedAt,
      }, { onConflict: "canonical_url" })
      .select("*")
      .single();
    if (error) throw error;
    return mapSweepstakesRow(data);
  }

  async listDiscoveryJobs() {
    const { data, error } = await this.supabase
      .from("discovery_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDiscoveryJobRow);
  }

  async getDiscoveryJob(id: string) {
    if (!isUuid(id)) {
      return null;
    }
    const { data, error } = await this.supabase.from("discovery_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapDiscoveryJobRow(data) : null;
  }

  async saveDiscoveryJob(job: DiscoveryJob) {
    const { data, error } = await this.supabase
      .from("discovery_jobs")
      .upsert({
        ...(isUuid(job.id) ? { id: job.id } : {}),
        query: job.query,
        status: job.status,
        results_found: job.discoveredCount,
        errors: job.notes ? [{ note: job.notes }] : [],
        created_at: job.createdAt,
        completed_at: job.status === "completed" || job.status === "failed" ? (job.lastRunAt ?? new Date().toISOString()) : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapDiscoveryJobRow(data);
  }

  async listAssistantTasks(): Promise<AssistantTask[]> {
    return [];
  }

  async getAssistantTask(): Promise<AssistantTask | null> {
    return null;
  }

  async saveAssistantTask(task: AssistantTask) {
    return task;
  }

  async listEntryLogs() {
    const userId = getConfiguredUserId();
    let query = this.supabase
      .from("entry_attempts")
      .select("*, sweepstakes(title, form_url, canonical_url, source_url)")
      .order("created_at", { ascending: false });
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as EntryAttemptRow[]).map(mapEntryAttemptRow);
  }

  async saveEntryLog(entry: EntryLog) {
    const userId = getConfiguredUserId();
    if (!userId) {
      throw new Error("Set SWEEPSCOUT_USER_ID before writing Supabase entry attempts from the server store.");
    }

    const { data, error } = await this.supabase
      .from("entry_attempts")
      .upsert({
        ...(isUuid(entry.id) ? { id: entry.id } : {}),
        sweepstakes_id: entry.sweepstakeId,
        user_id: userId,
        status: toDatabaseEntryAttemptStatus(entry.status),
        submitted_at: entry.submittedAt,
        notes: entry.notes,
        screenshot_path: entry.screenshotPath ?? null,
        created_at: entry.attemptedAt,
      })
      .select("*, sweepstakes(title, form_url, canonical_url, source_url)")
      .single();
    if (error) throw error;
    return mapEntryAttemptRow(data as EntryAttemptRow);
  }

  async listExtractionJobs(): Promise<ExtractionJob[]> {
    const { data, error } = await this.supabase
      .from("extraction_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExtractionJobRow);
  }

  async saveExtractionJob(job: ExtractionJob) {
    const { data, error } = await this.supabase
      .from("extraction_jobs")
      .upsert({
        id: job.id,
        sweepstakes_id: job.sweepstakeId,
        status: job.status,
        summary: job.summary,
        model: job.model,
        started_at: job.startedAt,
        finished_at: job.finishedAt,
        error: job.error,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapExtractionJobRow(data);
  }

  async getUserProfile() {
    const userId = getConfiguredUserId();
    let query = this.supabase.from("users_profile").select("*").limit(1);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapUserProfileRow(data) : defaultProfile;
  }

  async saveUserProfile(profile: UserProfile) {
    const userId = getConfiguredUserId();
    if (!userId) {
      throw new Error("Set SWEEPSCOUT_USER_ID before writing Supabase profile data from the server store.");
    }

    const { data, error } = await this.supabase
      .from("users_profile")
      .upsert({
        ...(isUuid(profile.id) ? { id: profile.id } : {}),
        user_id: userId,
        first_name: profile.firstName,
        last_name: profile.lastName,
        email: profile.email,
        alternate_email: profile.alternateEmail || null,
        phone: profile.phone || null,
        address_line1: profile.address1 || null,
        address_line2: profile.address2 || null,
        city: profile.city || null,
        state: profile.state || null,
        postal_code: profile.postalCode || null,
        country: profile.country,
        date_of_birth: profile.dob || null,
        consent_to_prefill: profile.consentToPrefill,
        updated_at: profile.updatedAt,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapUserProfileRow(data);
  }

  async getSettings(): Promise<AppSettings> {
    return defaultSettings;
  }

  async saveSettings(settings: AppSettings) {
    return settings;
  }

  async listBlockedDomains(): Promise<BlockedDomain[]> {
    const { data, error } = await this.supabase
      .from("blocked_domains")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      domain: row.domain,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  async saveBlockedDomain(domain: BlockedDomain): Promise<BlockedDomain> {
    const { data, error } = await this.supabase
      .from("blocked_domains")
      .upsert(
        {
          ...(isUuid(domain.id) ? { id: domain.id } : {}),
          domain: domain.domain,
          reason: domain.reason,
          created_at: domain.createdAt,
        },
        { onConflict: "domain" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      domain: data.domain,
      reason: data.reason,
      createdAt: data.created_at,
    };
  }

  async listAuditLogs(limit = 100): Promise<AuditLog[]> {
    const { data, error } = await this.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 500)));
    if (error) throw error;
    return (data ?? []).map(mapAuditLogRow);
  }

  async saveAuditLog(log: AuditLog): Promise<AuditLog> {
    const { data, error } = await this.supabase
      .from("audit_logs")
      .insert({
        ...(isUuid(log.id) ? { id: log.id } : {}),
        actor_id: isUuid(log.actorId ?? undefined) ? log.actorId : null,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        severity: log.severity,
        message: log.message,
        metadata: log.metadata as Json,
        created_at: log.createdAt,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAuditLogRow(data);
  }
}

function mapSweepstakesRow(row: SweepstakesRow): Sweepstake {
  const extracted = asRecord(row.extracted_json);
  const extractedRules = rulesExtractionFrom(extracted.extractedRules);
  return {
    id: row.id,
    title: row.title,
    sponsor: row.sponsor ?? "Unknown sponsor",
    url: row.canonical_url ?? row.source_url,
    source: stringFrom(extracted.source, "supabase"),
    status: fromDatabaseSweepstakesStatus(row.status),
    category: stringFrom(extracted.category, "unclassified"),
    prizeRetailValue: row.estimated_value,
    country: extractedRules?.allowedCountries[0] ?? stringFrom(extracted.country, "US"),
    stateEligibility: row.eligible_states,
    ageRequirement: row.minimum_age,
    startAt: null,
    endAt: row.deadline,
    entryFrequency: row.entry_frequency ?? "Unknown",
    purchaseRequired: row.purchase_required,
    noPurchaseMethodFound: row.no_purchase_method_found,
    hasCaptcha: extractedRules?.captchaPresent ?? booleanFrom(extracted.hasCaptcha),
    requiresAccount: booleanFrom(extracted.requiresAccount),
    eligibilitySummary: row.eligibility_text ?? row.prize_summary ?? "",
    rulesUrl: row.official_rules_url,
    rulesText: nullableStringFrom(extracted.rulesText),
    rulesExtractedAt: nullableStringFrom(extracted.rulesExtractedAt),
    formUrl: row.form_url,
    extractedRules,
    scamScore: row.scam_score,
    eligibilityScore: numberFrom(extracted.eligibilityScore) ?? (row.status === "eligible" ? 90 : row.status === "ineligible" ? 20 : 50),
    riskFlags: riskFlagsFrom(extracted.riskFlags),
    complianceNotes: row.compliance_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDiscoveryJobRow(row: DiscoveryJobRow): DiscoveryJob {
  return {
    id: row.id,
    label: row.query,
    query: row.query,
    seeds: [],
    status: row.status as DiscoveryJob["status"],
    discoveredCount: row.results_found,
    lastRunAt: row.completed_at,
    createdAt: row.created_at,
    notes: JSON.stringify(row.errors),
  };
}

function mapExtractionJobRow(row: ExtractionJobRow): ExtractionJob {
  return {
    id: row.id,
    sweepstakeId: row.sweepstakes_id,
    status: row.status as ExtractionJob["status"],
    summary: row.summary,
    model: row.model,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  };
}

function mapEntryAttemptRow(row: EntryAttemptRow): EntryLog {
  return {
    id: row.id,
    sweepstakeId: row.sweepstakes_id,
    sweepstakeTitle: row.sweepstakes?.title ?? "Sweepstake",
    status: fromDatabaseEntryAttemptStatus(row.status),
    attemptedAt: row.created_at,
    submittedAt: row.submitted_at,
    confirmationCode: null,
    notes: row.notes ?? "",
    formUrl: row.sweepstakes?.form_url ?? row.sweepstakes?.canonical_url ?? row.sweepstakes?.source_url ?? null,
    screenshotPath: row.screenshot_path,
    prefillFields: [],
    blockers: [],
    userApproved: row.status === "submitted_by_user",
    purchaseRequiredAcknowledged: false,
  };
}

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    alternateEmail: row.alternate_email ?? "",
    firstName: row.first_name,
    lastName: row.last_name,
    dob: row.date_of_birth ?? "",
    state: row.state ?? "",
    country: row.country,
    phone: row.phone ?? "",
    address1: row.address_line1 ?? "",
    address2: row.address_line2 ?? "",
    city: row.city ?? "",
    postalCode: row.postal_code ?? "",
    consentToPrefill: row.consent_to_prefill ?? false,
    preferences: defaultProfile.preferences,
    updatedAt: row.updated_at,
  };
}

function mapAuditLogRow(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    severity: row.severity,
    message: row.message,
    metadata: asRecord(row.metadata),
    createdAt: row.created_at,
  };
}

function toDatabaseSweepstakesStatus(status: SweepstakeStatus): SweepstakesStatus {
  if (status === "discovered") return "discovered";
  if (
    status === "reviewed" ||
    status === "eligible" ||
    status === "ineligible" ||
    status === "suspicious" ||
    status === "expired"
  ) {
    return status;
  }
  if (status === "needs_review" || status === "rejected") return "suspicious";
  if (status === "entered") return "reviewed";
  return "discovered";
}

function fromDatabaseSweepstakesStatus(status: SweepstakesStatus): SweepstakeStatus {
  if (status === "discovered") return "discovered";
  if (status === "reviewed" || status === "eligible" || status === "ineligible" || status === "suspicious" || status === "expired") {
    return status;
  }
  return "discovered";
}

function toDatabaseEntryAttemptStatus(status: EntryStatus): EntryAttemptStatus {
  if (status === "submitted") return "submitted_by_user";
  if (status === "prefilled" || status === "approved") return "prefilled";
  if (status === "skipped" || status === "rejected") return "skipped";
  if (status === "suspicious") return "suspicious";
  if (status === "winner_notification") return "winner_notification";
  if (status === "expired") return "expired";
  if (status === "failed" || status === "blocked") return "failed";
  return "queued";
}

function fromDatabaseEntryAttemptStatus(status: EntryAttemptStatus): EntryStatus {
  if (status === "submitted_by_user") return "submitted";
  if (status === "prefilled") return "prefilled";
  if (status === "skipped") return "skipped";
  if (status === "suspicious") return "suspicious";
  if (status === "winner_notification") return "winner_notification";
  if (status === "expired") return "expired";
  if (status === "failed") return "failed";
  return "queued";
}

function getConfiguredUserId() {
  return process.env.SWEEPSCOUT_USER_ID && isUuid(process.env.SWEEPSCOUT_USER_ID) ? process.env.SWEEPSCOUT_USER_ID : null;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function asRecord(value: Json): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function nullableStringFrom(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanFrom(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function riskFlagsFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Sweepstake["riskFlags"][number] =>
      item &&
      typeof item === "object" &&
      typeof (item as { code?: unknown }).code === "string" &&
      typeof (item as { label?: unknown }).label === "string" &&
      ((item as { severity?: unknown }).severity === "low" ||
        (item as { severity?: unknown }).severity === "medium" ||
        (item as { severity?: unknown }).severity === "high"),
  );
}

function rulesExtractionFrom(value: unknown): Sweepstake["extractedRules"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    title: nullableStringFrom(record.title),
    sponsor: nullableStringFrom(record.sponsor),
    prizeSummary: nullableStringFrom(record.prizeSummary),
    approximateRetailValue: numberFrom(record.approximateRetailValue),
    deadline: nullableStringFrom(record.deadline),
    eligibility: nullableStringFrom(record.eligibility),
    allowedStates: stringArrayFrom(record.allowedStates),
    allowedCountries: stringArrayFrom(record.allowedCountries),
    minimumAge: numberFrom(record.minimumAge),
    entryFrequency: nullableStringFrom(record.entryFrequency),
    noPurchaseMethod: nullableStringFrom(record.noPurchaseMethod),
    formUrl: nullableStringFrom(record.formUrl),
    redFlags: stringArrayFrom(record.redFlags),
    captchaPresent: booleanFrom(record.captchaPresent),
    purchaseOrPaymentRequested: booleanFrom(record.purchaseOrPaymentRequested),
    ssnRequested: booleanFrom(record.ssnRequested),
    bankingInfoRequested: booleanFrom(record.bankingInfoRequested),
    officialRulesUrl: nullableStringFrom(record.officialRulesUrl),
    sourceConfidence: numberFrom(record.sourceConfidence) ?? 0,
  };
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayFrom(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}
