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

export type RiskFlag = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
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
  emailAlias: string | null;
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
    categories: string[];
    maxDailyEntries: number;
    avoidPurchaseRequired: boolean;
    allowSocialActions: boolean;
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

export type RulesSnapshotExtraction = {
  deadline: string | null;
  eligibility: string | null;
  prize: string | null;
  prizeValue: number | null;
  entryFrequency: string | null;
};

export type RulesSnapshot = {
  id: string;
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
  domain: string;
  reason: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
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
};
