export type SweepstakeStatus =
  | "discovered"
  | "reviewed"
  | "watching"
  | "needs_review"
  | "eligible"
  | "ineligible"
  | "suspicious"
  | "entered"
  | "expired"
  | "rejected";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "needs_review";
export type AssistantStatus = "queued" | "ready_for_review" | "approved" | "blocked" | "completed";
export type EntryStatus =
  | "queued"
  | "drafted"
  | "prefilled"
  | "approved"
  | "submitted"
  | "skipped"
  | "suspicious"
  | "winner_notification"
  | "expired"
  | "failed"
  | "rejected"
  | "blocked";
export type PlanTier = "free" | "pro" | "power";
export type MembershipRole = "owner" | "admin" | "member";
export type MembershipStatus = "active" | "invited" | "disabled";
export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export type RiskFlag = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type PlanLimits = {
  tier: PlanTier;
  name: string;
  monthlyPriceUsd: number;
  manualTracker: boolean;
  discovery: boolean;
  scoring: boolean;
  prefill: boolean;
  inboxMonitoring: boolean;
  browserExtension: boolean;
  advancedReporting: boolean;
  savedSweepstakes: number;
  discoveryJobsPerMonth: number;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export type BillingSubscription = {
  id: string;
  organizationId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
};

export type UsageSnapshot = {
  organizationId: string;
  tier: PlanTier;
  limits: PlanLimits;
  savedSweepstakes: number;
  discoveryJobsThisMonth: number;
  usagePeriodStart: string;
  usagePeriodEnd: string;
};

export type RulesExtractionData = {
  title: string | null;
  sponsor: string | null;
  prizeSummary: string | null;
  approximateRetailValue: number | null;
  deadline: string | null;
  eligibility: string | null;
  allowedStates: string[];
  allowedCountries: string[];
  minimumAge: number | null;
  entryFrequency: string | null;
  noPurchaseMethod: string | null;
  formUrl: string | null;
  redFlags: string[];
  captchaPresent: boolean;
  purchaseOrPaymentRequested: boolean;
  ssnRequested: boolean;
  bankingInfoRequested: boolean;
  officialRulesUrl: string | null;
  sourceConfidence: number;
};

export type Sweepstake = {
  id: string;
  organizationId: string;
  title: string;
  sponsor: string;
  url: string;
  source: string;
  status: SweepstakeStatus;
  category: string;
  prizeRetailValue: number | null;
  country: string;
  stateEligibility: string[];
  ageRequirement: number | null;
  startAt: string | null;
  endAt: string | null;
  entryFrequency: string;
  purchaseRequired: boolean;
  noPurchaseMethodFound: boolean;
  hasCaptcha: boolean;
  requiresAccount: boolean;
  eligibilitySummary: string;
  rulesUrl: string | null;
  rulesText: string | null;
  rulesExtractedAt: string | null;
  formUrl: string | null;
  localRegion: string | null;
  locationEligibilityScore: number;
  locationEligibilityNotes: string[];
  requiresInPersonAppearance: boolean;
  extractedRules?: RulesExtractionData | null;
  scamScore: number;
  eligibilityScore: number;
  riskFlags: RiskFlag[];
  complianceNotes: string[];
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryJob = {
  id: string;
  organizationId: string;
  label: string;
  query: string;
  seeds: string[];
  status: JobStatus;
  discoveredCount: number;
  lastRunAt: string | null;
  createdAt: string;
  notes: string;
};

export type ExtractionJob = {
  id: string;
  organizationId: string;
  sweepstakeId: string;
  status: JobStatus;
  summary: string | null;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type AssistantTask = {
  id: string;
  organizationId: string;
  sweepstakeId: string;
  sweepstakeTitle: string;
  status: AssistantStatus;
  priority: number;
  formUrl: string;
  fields: Record<string, string>;
  blockers: string[];
  requiresApproval: boolean;
  approvedAt: string | null;
  createdAt: string;
};

export type PrefillProfileField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "dateOfBirth"
  | "birthMonth"
  | "birthDay"
  | "birthYear";

export type PrefillFieldResult = {
  fieldId: string;
  label: string;
  profileField: PrefillProfileField | null;
  status: "filled" | "skipped" | "manual_only" | "blocked";
  source: "heuristic" | "ai" | "safety";
  reason: string;
};

export type EntryLog = {
  id: string;
  organizationId: string;
  sweepstakeId: string;
  sweepstakeTitle: string;
  status: EntryStatus;
  attemptedAt: string;
  submittedAt: string | null;
  confirmationCode: string | null;
  notes: string;
  formUrl?: string | null;
  screenshotPath?: string | null;
  prefillFields?: PrefillFieldResult[];
  blockers?: string[];
  userApproved: boolean;
  purchaseRequiredAcknowledged: boolean;
};

export type UserProfile = {
  id: string;
  email: string;
  alternateEmail: string;
  firstName: string;
  lastName: string;
  dob: string;
  state: string;
  country: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  postalCode: string;
  consentToPrefill: boolean;
  preferences: {
    categories: string[];
    nearbyMetros: string[];
    maxDailyEntries: number;
    avoidPurchaseRequired: boolean;
    allowSocialActions: boolean;
    allowInPersonContests: boolean;
  };
  updatedAt: string;
};

export type AppSettings = {
  automatedDiscoveryEnabled: boolean;
  formPrefillEnabled: boolean;
  discoveryCadence: string;
  minEligibilityScore: number;
  maxScamScore: number;
  requireApprovalForEveryEntry: boolean;
  dailyEntryLimit: number;
  notificationsEmail: string;
};

export type BlockedDomain = {
  id: string;
  organizationId: string;
  domain: string;
  reason: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  severity: "info" | "warn" | "block";
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SponsorReputationRiskLevel = "low" | "medium" | "high" | "critical";
export type SponsorReputationRecommendation = "allow" | "downrank" | "block";

export type SponsorReputationMetrics = {
  sweepstakesCount: number;
  inboxAlertCount: number;
  spamComplaints: number;
  suspiciousFields: number;
  phishingFlags: number;
  excessiveEmailVolume: number;
  misleadingPrizeLanguage: number;
  duplicateSweepstakes: number;
  missingOfficialRules: number;
  userBlockedSponsor: number;
};

export type SponsorDomainReputation = {
  domain: string;
  sponsor: string | null;
  riskScore: number;
  riskLevel: SponsorReputationRiskLevel;
  recommendation: SponsorReputationRecommendation;
  reasons: string[];
  metrics: SponsorReputationMetrics;
  lastSeenAt: string | null;
  updatedAt: string;
};

export type SponsorReputationReport = {
  generatedAt: string;
  records: SponsorDomainReputation[];
  totals: {
    domainsTracked: number;
    downrankedDomains: number;
    blockedDomains: number;
    criticalDomains: number;
  };
};

export type DashboardData = {
  stats: {
    activeSweepstakes: number;
    endingSoon: number;
    queuedAssistantTasks: number;
    entriesThisWeek: number;
    averageEligibilityScore: number;
    highRiskCount: number;
  };
  sweepstakes: Sweepstake[];
  discoveryJobs: DiscoveryJob[];
  assistantTasks: AssistantTask[];
  entryLogs: EntryLog[];
  settings: AppSettings;
  organization: Organization;
  subscription: BillingSubscription;
  usage: UsageSnapshot;
};

export type EntryFrequency = "daily" | "weekly" | "monthly" | "one_time" | "unknown";

export type EntryQueueItem = {
  sweepstake: Sweepstake;
  frequency: EntryFrequency;
  frequencyLabel: string;
  canEnter: boolean;
  nextEntryAt: string | null;
  lastSubmittedAt: string | null;
  blockedReason: string | null;
  categoryPriority?: number;
  categoryPreferred?: boolean;
};

export type ReminderDay = {
  date: string;
  label: string;
  reminders: EntryQueueItem[];
};

export type EntryTrackingData = {
  eligibleQueue: EntryQueueItem[];
  submittedEntries: EntryLog[];
  expiringSoon: EntryQueueItem[];
  suspiciousRejected: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }>;
  wonNotifications: EntryLog[];
  reminders: ReminderDay[];
};

export type AppConfig = {
  mode: "sqlite" | "supabase";
  openaiConfigured: boolean;
  openaiModel: string;
  supabaseConfigured: boolean;
  browserHeadless: boolean;
  warnings: string[];
};

export type AdminSession = {
  role: string;
  label: string;
};

export type SaaSAdminSummary = {
  organization: Organization;
  membership: OrganizationMembership;
  subscription: BillingSubscription;
  usage: UsageSnapshot;
  plans: PlanLimits[];
  stripe: {
    configured: boolean;
    publishableKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    priceIds: Record<PlanTier, string | null>;
  };
  manualApprovalRequired: boolean;
};
