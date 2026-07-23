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

export type InboxProvider = "gmail" | "imap";
export type InboxAlertKind =
  | "winner_notification"
  | "verification_email"
  | "confirmation_link"
  | "daily_entry_reminder"
  | "phishing_risk"
  | "unsubscribe_spam"
  | "general";
export type InboxAlertStatus = "new" | "reviewed" | "dismissed";
export type InboxAlertSeverity = "info" | "warn" | "danger";
export type InboxLinkKind = "claim" | "verification" | "confirmation" | "unsubscribe" | "general";
export type RulesChangeAlertStatus = "new" | "reviewed" | "dismissed";
export type RulesChangeSeverity = "info" | "warn" | "danger";
export type RulesChangeField = "deadline" | "eligibility" | "prize" | "entry_frequency";
export type DiscoveryScope = "general" | "local";
export type PlanTier = "free" | "pro" | "power";
export type MembershipRole = "owner" | "admin" | "member";
export type MembershipStatus = "active" | "invited" | "disabled";
export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type PrizeCategory =
  | "cash"
  | "vehicle"
  | "electronics"
  | "travel"
  | "home goods"
  | "gift card"
  | "tools"
  | "gaming"
  | "food/restaurant"
  | "local business"
  | "high-risk/unclear";

export type RiskFlag = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type RadarOpportunity = {
  id: string;
  title: string;
  sponsor: string;
  summary: string;
  officialUrl: string;
  rulesUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  estimatedPrizeValue: number | null;
  currency: string;
  entryFrequency: string;
  entryEffortScore: number;
  legitimacyScore: number;
  sourceConfidenceScore: number;
  status: string;
  lastVerifiedAt: string | null;
  firstDiscoveredAt: string;
  primaryPrize: string | null;
  prizes: Array<{ name: string; description: string | null; quantity: number; estimatedValue: number | null; currency: string }>;
  eligibility: { minimumAge: number | null; maximumAge: number | null; countries: string[]; regions: string[]; excludedRegions: string[]; employeeExclusions: string | null; otherRestrictions: string | null } | null;
  entryMethods: Array<{ methodType: string; description: string; entryUrl: string; frequency: string; purchaseRequired: boolean; socialPlatform: string | null; estimatedMinutes: number | null }>;
  categories: string[];
  qualityWarnings: Array<{ type: string; severity: string; details: unknown }>;
  sources: Array<{ name: string; attribution: string | null; lastSeenAt: string }>;
  saved: boolean;
  userStatus: string | null;
  popularity: number;
  matchScore: number;
  matchFactors: Array<{ key: string; label: string; impact: "positive" | "negative" | "neutral"; points: number; explanation: string }>;
  eligibilityStatus: "eligible" | "ineligible" | "review";
};

export type RadarPage = { items: RadarOpportunity[]; total: number; page: number; pageSize: number; hasMore: boolean; sort: string };
export type PersonalSweepstake = { sweepstakesId: string; title: string; sponsor: string; officialUrl: string; savedAt: string | null; priority: "low" | "normal" | "high"; notes: string; deadline: string | null; timezone: string; frequency: string; prizeValue: number | null; currency: string; status: string; lastEnteredAt: string | null; nextEntryDueAt: string | null; entryCount: number; updatedAt: string | null };
export type HangarData = { items: PersonalSweepstake[]; total: number };
export type MissionLogData = { enteredToday: PersonalSweepstake[]; dailyDue: PersonalSweepstake[]; enteredPreviously: PersonalSweepstake[]; skipped: PersonalSweepstake[]; hidden: PersonalSweepstake[]; won: PersonalSweepstake[]; expired: PersonalSweepstake[]; disclaimer: string };
export type SearchProfile = { id: string; name: string; filters: Record<string, string | number>; alert_enabled: boolean; created_at: string; updated_at: string; matchCount?: number };
export type BillingPlanKey = "free_flight" | "co_pilot" | "ace_pilot" | "squadron";
export type BillingCatalogPlan = { key: BillingPlanKey; name: string; monthlyPriceCents: number; annualPriceCents: number | null; monthlyCredits: number; description: string; features: Record<string, number | boolean>; priceConfigured: { month: boolean; year: boolean } };
export type BillingSummary = { catalog: BillingCatalogPlan[]; creditCosts: Record<string, number>; subscription: { userId: string; providerSubscriptionId: string | null; providerPriceId: string | null; planKey: BillingPlanKey; status: string; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; trialEnd: string | null; createdAt: string; updatedAt: string }; plan: Omit<BillingCatalogPlan,"priceConfigured">; entitlements: Array<{ feature_key: string; limit_value: number | null; active_from: string; active_until: string | null; source: string }>; credits: { balance: number; entries: Array<{ id: string; amount: number; entry_type: string; reason_code: string; source_reference: string; expires_at: string | null; metadata: Record<string,unknown>; created_at: string }> }; billingHistory: Array<{ provider_event_id: string; event_type: string; status: string; received_at: string; processed_at: string | null; error_message: string | null; metadata: Record<string,unknown> }>; stripe: { testMode: boolean; configured: boolean; portalAvailable: boolean }; paymentFailed: boolean; gracePeriodDays: number };
export type AlertNotification = { id:string;type:string;title:string;body:string;sweepstakes_id:string|null;source_reference:string;priority:number;read_at:string|null;metadata:Record<string,unknown>;created_at:string };
export type AlertPreferences = { inAppEnabled:boolean;emailEnabled:boolean;dailyDigestEnabled:boolean;weeklyDigestEnabled:boolean;endingSoonEnabled:boolean;highValueEnabled:boolean;recommendationsEnabled:boolean;entryRemindersEnabled:boolean;emailUnsubscribedAt:string|null };
export type CustomScanner = { id:string;name:string;filters:Record<string,unknown>;source_ids:string[];cadence_minutes:number;enabled:boolean;next_run_at:string;last_run_at:string|null };
export type CustomScanRun = { id:string;custom_scanner_id:string;status:string;match_count:number;result_summary:Record<string,unknown>;error_message:string|null;created_at:string;completed_at:string|null };
export type AlertsSummary = { notifications:AlertNotification[];unreadCount:number;preferences:AlertPreferences;customScanners:CustomScanner[];customScanRuns:CustomScanRun[];approvedSources:Array<{id:string;name:string;base_url:string;attribution_text:string|null}>;emailProvider:"resend"|"disabled";planKey:BillingPlanKey;customScanPolicy:{enabled:boolean;maxProfiles:number;monthlyRuns:number;minimumCadenceMinutes:number};customScanCost:number;creditBalance:number };
export type OpportunityDetail = RadarOpportunity & {
  evidence: Array<{ field_name: string; field_value: unknown; confidence: number | string; source_reference: string; evidence_text: string; evidence_location: unknown; authoritative: boolean; extracted_at: string }>;
  safety: string[];
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

export type SweepstakesRules = {
  prizeDescription: string;
  prizeRetailValue: number | null;
  startAt: string | null;
  endAt: string | null;
  eligibleCountries: string[];
  eligibleStates: string[];
  minAge: number | null;
  entryFrequency: string;
  purchaseRequired: boolean;
  accountRequired: boolean;
  captchaLikely: boolean;
  socialFollowRequired: boolean;
  judgingCriteria: string | null;
  disqualifiers: string[];
  plainEnglishSummary: string;
  sourceConfidence: number;
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
  category: PrizeCategory;
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
  emailAlias: string | null;
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
  scope?: DiscoveryScope;
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
  emailAlias?: string | null;
  timeSpentMinutes?: number | null;
  prefillSavedMinutes?: number | null;
  formUrl?: string | null;
  screenshotPath?: string | null;
  prefillFields?: PrefillFieldResult[];
  blockers?: string[];
  userApproved: boolean;
  purchaseRequiredAcknowledged: boolean;
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
    categories: PrizeCategory[];
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
  inbox: InboxConnectionSettings;
  emailAliases: EmailAliasSettings;
  roi: RoiSettings;
  rulesMonitor: RulesMonitorSettings;
};

export type EmailAliasSettings = {
  enabled: boolean;
  baseEmail: string;
  prefix: string;
  nextSequence: number;
  excessiveEmailThreshold: number;
  spamWindowDays: number;
};

export type RoiSettings = {
  manualEntryMinutes: number;
  prefillReviewMinutes: number;
  prefillSavedMinutes: number;
  defaultWinProbabilityBasisPoints: number;
};

export type RulesMonitorSettings = {
  enabled: boolean;
  pollIntervalMinutes: number;
  maxChecksPerRun: number;
  lastCheckAt: string | null;
  lastCheckStatus: "never" | "ok" | "failed" | "disabled";
  lastCheckError: string | null;
};

export type InboxConnectionSettings = {
  enabled: boolean;
  provider: InboxProvider;
  email: string;
  host: string;
  port: number;
  mailbox: string;
  pollIntervalMinutes: number;
  maxMessagesPerPoll: number;
  lastPollAt: string | null;
  lastPollStatus: "never" | "ok" | "failed" | "disabled";
  lastPollError: string | null;
};

export type InboxLink = {
  url: string;
  domain: string | null;
  kind: InboxLinkKind;
  requiresReview: boolean;
  riskFlags: string[];
};

export type InboxAlert = {
  id: string;
  organizationId: string;
  messageId: string;
  provider: InboxProvider;
  mailbox: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  receivedAt: string;
  snippet: string;
  recipientAliases: string[];
  matchedSweepstakeId: string | null;
  matchedSweepstakeTitle: string | null;
  matchedByAlias: boolean;
  categories: InboxAlertKind[];
  severity: InboxAlertSeverity;
  riskFlags: string[];
  links: InboxLink[];
  status: InboxAlertStatus;
  reviewRequired: boolean;
  createdAt: string;
  reviewedAt: string | null;
  reviewNotes: string;
};

export type SpamSourceDomainReport = {
  domain: string;
  sponsor: string | null;
  emailCount: number;
  spamCount: number;
  phishingCount: number;
  winnerCount: number;
  unsubscribeCount: number;
  matchedSweepstakeCount: number;
  aliases: string[];
  latestReceivedAt: string | null;
  excessiveVolume: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type SpamSourceSweepstakeReport = {
  sweepstakeId: string;
  sweepstakeTitle: string;
  sponsor: string;
  emailAlias: string | null;
  emailCount: number;
  spamCount: number;
  phishingCount: number;
  unsubscribeCount: number;
  latestReceivedAt: string | null;
  sourceDomains: string[];
  excessiveVolume: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type AliasInventoryItem = {
  sweepstakeId: string;
  sweepstakeTitle: string;
  sponsor: string;
  emailAlias: string | null;
  entryCount: number;
  inboxAlertCount: number;
  spamCount: number;
};

export type SpamSourceReport = {
  generatedAt: string;
  windowDays: number;
  threshold: number;
  totals: {
    aliasesAssigned: number;
    aliasesMissing: number;
    inboxAlerts: number;
    spamAlerts: number;
    excessiveDomains: number;
    excessiveSweepstakes: number;
  };
  domains: SpamSourceDomainReport[];
  sweepstakes: SpamSourceSweepstakeReport[];
  aliases: AliasInventoryItem[];
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

export type RoiVolumePoint = {
  label: string;
  count: number;
};

export type RoiSweepstakeSummary = {
  sweepstakeId: string;
  title: string;
  sponsor: string;
  category: string;
  prizeRetailValue: number | null;
  deadline: string | null;
  eligibilityScore: number;
  scamScore: number;
  entryCount: number;
};

export type RoiCategorySummary = {
  category: string;
  entriesSubmitted: number;
  estimatedPrizeValue: number;
  expectedValue: number;
  winRate: number;
  spamAlerts: number;
  averageEligibilityScore: number;
};

export type RoiSpamSourceSummary = {
  domain: string;
  sponsor: string | null;
  emailCount: number;
  spamCount: number;
  phishingCount: number;
  excessiveVolume: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type RoiReport = {
  generatedAt: string;
  settings: RoiSettings;
  stats: {
    entriesSubmitted: number;
    estimatedPrizeValue: number;
    timeSpentMinutes: number;
    hoursSpent: number;
    hoursSavedByPrefill: number;
    winRate: number;
    winsTracked: number;
    suspiciousRejectedCount: number;
    expectedValueEstimate: number;
    expectedValuePerHour: number;
    activeSweepstakes: number;
  };
  volume: {
    daily: RoiVolumePoint[];
    weekly: RoiVolumePoint[];
    monthly: RoiVolumePoint[];
  };
  highestValueSweepstakes: RoiSweepstakeSummary[];
  soonestDeadlines: RoiSweepstakeSummary[];
  bestCategories: RoiCategorySummary[];
  worstSpamSources: RoiSpamSourceSummary[];
};

export type ComplianceDecisionHistoryItem = {
  entryId: string;
  status: EntryStatus;
  attemptedAt: string;
  submittedAt: string | null;
  userApproved: boolean;
  purchaseRequiredAcknowledged: boolean;
  notes: string;
  confirmationCode: string | null;
};

export type ComplianceSweepstakeReport = {
  sweepstakeId: string;
  title: string;
  status: SweepstakeStatus;
  officialRulesUrl: string | null;
  sourceUrl: string;
  sponsor: string;
  entryFrequency: string;
  noPurchaseMethod: string;
  eligibility: string;
  deadline: string | null;
  extractedRiskNotes: string[];
  userDecisionHistory: ComplianceDecisionHistoryItem[];
  submissionTimestamps: string[];
  generatedAt: string;
};

export type ComplianceReport = {
  generatedAt: string;
  reports: ComplianceSweepstakeReport[];
};

export type RulesSnapshotExtraction = {
  deadline: string | null;
  eligibility: string | null;
  prize: string | null;
  prizeValue: number | null;
  entryFrequency: string | null;
};

export type RulesSnapshot = {
  id: string;
  organizationId: string;
  sweepstakeId: string;
  sweepstakeTitle: string;
  rulesUrl: string;
  capturedAt: string;
  textHash: string;
  normalizedTextHash: string;
  textLength: number;
  textExcerpt: string;
  extracted: RulesSnapshotExtraction;
};

export type RulesFieldChange = {
  field: RulesChangeField;
  previousValue: string | number | null;
  currentValue: string | number | null;
};

export type RulesChangeAlert = {
  id: string;
  organizationId: string;
  sweepstakeId: string;
  sweepstakeTitle: string;
  sponsor: string;
  rulesUrl: string;
  detectedAt: string;
  severity: RulesChangeSeverity;
  status: RulesChangeAlertStatus;
  summary: string;
  changedFields: RulesChangeField[];
  changes: RulesFieldChange[];
  previousSnapshotId: string;
  currentSnapshotId: string;
  previousSnapshot: RulesSnapshot;
  currentSnapshot: RulesSnapshot;
  reviewNotes: string;
  reviewedAt: string | null;
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

export type DashboardData = {
  stats: {
    activeSweepstakes: number;
    endingSoon: number;
    queuedAssistantTasks: number;
    entriesThisWeek: number;
    averageEligibilityScore: number;
    highRiskCount: number;
    inboxNewAlerts: number;
    inboxWinnerAlerts: number;
    inboxPhishingAlerts: number;
    rulesNewAlerts: number;
    rulesDeadlineAlerts: number;
    rulesEligibilityAlerts: number;
  };
  sweepstakes: Sweepstake[];
  discoveryJobs: DiscoveryJob[];
  assistantTasks: AssistantTask[];
  entryLogs: EntryLog[];
  inboxAlerts: InboxAlert[];
  rulesChangeAlerts: RulesChangeAlert[];
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
  categoryPriority: number;
  categoryPreferred: boolean;
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

export type DailyWorkflowData = {
  generatedAt: string;
  todaysRepeatableEntries: EntryQueueItem[];
  newEligibleSweepstakes: Sweepstake[];
  expiringSoon: EntryQueueItem[];
  winnerVerificationEmails: InboxAlert[];
  suspiciousItems: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }>;
  suspiciousInboxAlerts: InboxAlert[];
  prefillNext: { sweepstake: Sweepstake; formUrl: string } | null;
  stats: {
    todaysRepeatableCount: number;
    newEligibleCount: number;
    expiringSoonCount: number;
    winnerVerificationCount: number;
    suspiciousDecisionCount: number;
  };
};

export type AppConfig = {
  mode: "sqlite" | "supabase";
  openaiConfigured: boolean;
  openaiModel: string;
  supabaseConfigured: boolean;
  inboxConfigured: boolean;
  inboxProvider: InboxProvider;
  inboxEmail: string;
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

export type ImportSource = "csv" | "url_list" | "bookmarks" | "manual" | "text";
export type ImportExtractionStatus = "completed" | "needs_review" | "needs_upgrade" | "failed" | "skipped";
export type ImportResultStatus = "created" | "updated" | "failed";

export type ImportItemResult = {
  inputUrl: string;
  normalizedUrl: string | null;
  title: string | null;
  status: ImportResultStatus;
  created: boolean;
  sweepstakeId: string | null;
  sweepstakeStatus: SweepstakeStatus | null;
  scamScore: number | null;
  eligibilityScore: number | null;
  queuePlacement: "entry_queue" | "review_queue" | "blocked" | "failed";
  extractionStatus: ImportExtractionStatus;
  message: string;
};

export type ImportRunReport = {
  source: ImportSource;
  generatedAt: string;
  totals: {
    parsed: number;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    extracted: number;
    queuedForEntry: number;
    queuedForReview: number;
  };
  items: ImportItemResult[];
};

export type AssistantIntent =
  | "risk_explanation"
  | "rules_summary"
  | "compare"
  | "can_i_enter"
  | "manual_checklist"
  | "missing_information"
  | "recommend_today"
  | "general";

export type AssistantSourceRef = {
  id: string;
  sweepstakeId: string | null;
  title: string;
  field: string;
  snippet: string;
};

export type AssistantAnswer = {
  intent: AssistantIntent;
  answer: string;
  bullets: string[];
  warnings: string[];
  missingInformation: string[];
  recommendedSweepstakeIds: string[];
  sources: AssistantSourceRef[];
  grounded: true;
  usedOpenAI: boolean;
  model: string;
};
