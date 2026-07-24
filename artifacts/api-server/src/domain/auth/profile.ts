import type { AuthContext } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/auth/session";

export type PersonalProfileInput = {
  displayName?: string;
  avatarUrl?: string | null;
  timezone?: string;
  countryCode?: string | null;
  stateOrRegion?: string | null;
  postalCode?: string | null;
  birthDate?: string | null;
  minimumPrizeValue?: number;
  maximumEntryEffort?: number;
  preferredCategories?: string[];
  excludedCategories?: string[];
  preferredEntryFrequency?: string[];
  allowSocialEntryMethods?: boolean;
  allowPurchaseRelatedPromotions?: boolean;
  emailDigestFrequency?: "never" | "daily" | "weekly";
  pushNotificationsEnabled?: boolean;
  minimumAgeConfirmed?: boolean;
  residencyNotes?: string;
  excludedSponsorTypes?: string[];
  customEligibilityNotes?: string;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
  acceptSponsorDisclaimer?: boolean;
  completeOnboarding?: boolean;
};

type PersonalProfile = ReturnType<typeof localProfile>;
const localProfiles = new Map<string, PersonalProfile>();

export async function ensurePersonalProfile(auth: AuthContext, displayName?: string) {
  if (auth.mode === "local") {
    if (!localProfiles.has(auth.userId)) localProfiles.set(auth.userId, localProfile(auth));
    return localProfiles.get(auth.userId)!;
  }

  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const name = cleanText(displayName ?? auth.displayName, 120) || auth.email.split("@")[0];
  const profileResult = await client.from("profiles").upsert(
    {
      id: auth.userId,
      email: auth.email,
      display_name: name,
      updated_at: now,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileResult.error) throw new Error("Unable to create the personal profile.");

  const [preferences, eligibility] = await Promise.all([
    client.from("user_preferences").upsert({ user_id: auth.userId, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
    client.from("user_eligibility_profiles").upsert({ user_id: auth.userId, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
  ]);
  if (preferences.error || eligibility.error) throw new Error("Unable to initialize profile preferences.");
  return getPersonalProfile(auth);
}

export async function getPersonalProfile(auth: AuthContext) {
  if (auth.mode === "local") {
    if (!localProfiles.has(auth.userId)) localProfiles.set(auth.userId, localProfile(auth));
    return localProfiles.get(auth.userId)!;
  }

  const client = getSupabaseServiceClient();
  const [profile, preferences, eligibility] = await Promise.all([
    client.from("profiles").select("*").eq("id", auth.userId).single(),
    client.from("user_preferences").select("*").eq("user_id", auth.userId).single(),
    client.from("user_eligibility_profiles").select("*").eq("user_id", auth.userId).single(),
  ]);
  if (profile.error || preferences.error || eligibility.error) throw new Error("Unable to load the personal profile.");
  return sanitizeProfile(profile.data, preferences.data, eligibility.data);
}

export async function updatePersonalProfile(auth: AuthContext, input: PersonalProfileInput) {
  const normalized = normalizeInput(input);
  if (auth.mode === "local") {
    const current = await getPersonalProfile(auth);
    const updated = mergeLocalProfile(current, normalized);
    localProfiles.set(auth.userId, updated);
    return updated;
  }

  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const current = await getPersonalProfile(auth);
  const profileUpdate: Record<string, unknown> = {
    display_name: normalized.displayName ?? current.displayName,
    avatar_url: normalized.avatarUrl === undefined ? current.avatarUrl : normalized.avatarUrl,
    timezone: normalized.timezone ?? current.timezone,
    country_code: normalized.countryCode === undefined ? current.countryCode : normalized.countryCode,
    state_or_region: normalized.stateOrRegion === undefined ? current.stateOrRegion : normalized.stateOrRegion,
    postal_code: normalized.postalCode === undefined ? current.postalCode : normalized.postalCode,
    birth_date: normalized.birthDate === undefined ? current.birthDate : normalized.birthDate,
    updated_at: now,
  };
  if (normalized.acceptTerms) profileUpdate.terms_accepted_at = current.termsAcceptedAt ?? now;
  if (normalized.acceptPrivacy) profileUpdate.privacy_accepted_at = current.privacyAcceptedAt ?? now;
  if (normalized.acceptSponsorDisclaimer) profileUpdate.sponsor_disclaimer_accepted_at = current.sponsorDisclaimerAcceptedAt ?? now;
  if (normalized.completeOnboarding) {
    if (!(profileUpdate.terms_accepted_at || current.termsAcceptedAt) || !(profileUpdate.privacy_accepted_at || current.privacyAcceptedAt) || !(profileUpdate.sponsor_disclaimer_accepted_at || current.sponsorDisclaimerAcceptedAt)) {
      throw new Error("Terms, Privacy Policy, and sponsor disclaimer acceptance are required.");
    }
    profileUpdate.onboarding_completed_at = current.onboardingCompletedAt ?? now;
  }

  const [profileResult, preferenceResult, eligibilityResult] = await Promise.all([
    client.from("profiles").update(profileUpdate).eq("id", auth.userId),
    client.from("user_preferences").update(preferenceUpdate(normalized, now)).eq("user_id", auth.userId),
    client.from("user_eligibility_profiles").update(eligibilityUpdate(normalized, now)).eq("user_id", auth.userId),
  ]);
  if (profileResult.error || preferenceResult.error || eligibilityResult.error) throw new Error("Unable to update the personal profile.");
  return getPersonalProfile(auth);
}

export async function requestAccountDeletion(auth: AuthContext, reason?: string) {
  if (auth.mode === "local") return { status: "requested" as const, requestedAt: new Date().toISOString(), scheduledFor: null, retentionUntil: null };
  const result = await getSupabaseServiceClient().rpc("request_account_deletion", {
    p_user_id: auth.userId,
    p_reason: cleanText(reason, 500) || null,
  });
  if (result.error) throw new Error("Unable to submit the account deletion request.");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return { status: row.status, requestedAt: row.requested_at, scheduledFor: row.scheduled_for, retentionUntil: row.retention_until };
}

export async function exportPersonalData(auth: AuthContext) {
  const profile = await getPersonalProfile(auth);
  if (auth.mode === "local") return {
    generatedAt: new Date().toISOString(),
    formatVersion: "2026-07-23",
    account: profile,
    activity: {},
    communications: {},
    billing: {},
    privacy: { mode: "local-development", note: "Local compatibility data is not a production account record." },
  };

  const client = getSupabaseServiceClient();
  const datasets = [
    ["savedOpportunities", "user_saved_sweepstakes", "*"],
    ["opportunityStatuses", "user_sweepstakes_status", "*"],
    ["privateNotes", "user_sweepstakes_notes", "*"],
    ["savedSearches", "user_search_profiles", "*"],
    ["notifications", "notifications", "*"],
    ["notificationPreferences", "notification_preferences", "*"],
    ["customScanners", "custom_scanners", "*"],
    ["customScanRuns", "custom_scan_runs", "*"],
    ["digestRuns", "digest_runs", "id,kind,window_start,window_end,status,item_count,error_message,created_at,completed_at"],
    ["billingCustomers", "billing_customers", "provider,provider_customer_id,created_at,updated_at"],
    ["subscriptions", "subscriptions", "*"],
    ["entitlements", "entitlements", "*"],
    ["pilotCreditLedger", "credit_ledger", "*"],
    ["billingEvents", "billing_events", "provider_event_id,event_type,status,received_at,processed_at"],
    ["deletionRequests", "account_deletion_requests", "*"],
    ["supportRequests", "support_requests", "*"],
    ["organizationMemberships", "organization_memberships", "*"],
  ] as const;
  const results = await Promise.all(datasets.map(async ([key, table, columns]) => {
    const result = await client.from(table).select(columns).eq("user_id", auth.userId).limit(5_000);
    if (result.error) throw new Error(`Unable to export ${key}.`);
    return [key, result.data ?? []] as const;
  }));
  const data = Object.fromEntries(results) as Record<string, unknown[]>;
  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));
  const audit = await client.from("privacy_export_events").insert({
    user_id: auth.userId,
    format_version: "2026-07-23",
    record_counts: counts,
    completed_at: new Date().toISOString(),
  });
  if (audit.error) throw new Error("Unable to record the privacy export.");
  return {
    generatedAt: new Date().toISOString(),
    formatVersion: "2026-07-23",
    account: profile,
    activity: {
      savedOpportunities: data.savedOpportunities,
      opportunityStatuses: data.opportunityStatuses,
      privateNotes: data.privateNotes,
      savedSearches: data.savedSearches,
      customScanners: data.customScanners,
      customScanRuns: data.customScanRuns,
    },
    communications: {
      notifications: data.notifications,
      notificationPreferences: data.notificationPreferences,
      digestRuns: data.digestRuns,
      supportRequests: data.supportRequests,
    },
    billing: {
      subscriptions: data.subscriptions,
      entitlements: data.entitlements,
      billingCustomers: data.billingCustomers,
      pilotCreditLedger: data.pilotCreditLedger,
      billingEvents: data.billingEvents,
    },
    privacy: {
      deletionRequests: data.deletionRequests,
      organizationMemberships: data.organizationMemberships,
      note: "Authentication credentials, session tokens, and server secrets are never included.",
    },
  };
}

function normalizeInput(input: PersonalProfileInput): PersonalProfileInput {
  const category = (values: string[] | undefined) => values?.map((value) => cleanText(value, 60)).filter(Boolean).slice(0, 50);
  const countryCode = input.countryCode === null ? null : input.countryCode?.trim().toUpperCase();
  const displayName = input.displayName === undefined ? undefined : cleanText(input.displayName, 120);
  const timezone = input.timezone === undefined ? undefined : cleanText(input.timezone, 80);
  if (input.displayName !== undefined && !displayName) throw new Error("Display name is required.");
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new Error("Timezone must be a valid IANA timezone.");
    }
  }
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new Error("Country code must use two ISO letters.");
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new Error("Birth date must use YYYY-MM-DD.");
  if (input.minimumPrizeValue !== undefined && (!Number.isFinite(input.minimumPrizeValue) || input.minimumPrizeValue < 0)) throw new Error("Minimum prize value must be zero or greater.");
  if (input.maximumEntryEffort !== undefined && (!Number.isInteger(input.maximumEntryEffort) || input.maximumEntryEffort < 0 || input.maximumEntryEffort > 100)) throw new Error("Entry effort must be between 0 and 100.");
  return {
    ...input,
    displayName,
    avatarUrl: input.avatarUrl === undefined ? undefined : input.avatarUrl === null ? null : safeHttpUrl(input.avatarUrl),
    timezone,
    countryCode,
    stateOrRegion: input.stateOrRegion === undefined ? undefined : nullableText(input.stateOrRegion, 120),
    postalCode: input.postalCode === undefined ? undefined : nullableText(input.postalCode, 24),
    preferredCategories: category(input.preferredCategories),
    excludedCategories: category(input.excludedCategories),
    preferredEntryFrequency: category(input.preferredEntryFrequency),
    residencyNotes: input.residencyNotes === undefined ? undefined : cleanText(input.residencyNotes, 1000),
    excludedSponsorTypes: category(input.excludedSponsorTypes),
    customEligibilityNotes: input.customEligibilityNotes === undefined ? undefined : cleanText(input.customEligibilityNotes, 1000),
  };
}

function preferenceUpdate(input: PersonalProfileInput, updatedAt: string) {
  const update: Record<string, unknown> = { updated_at: updatedAt };
  const fields: Array<[keyof PersonalProfileInput, string]> = [
    ["minimumPrizeValue", "minimum_prize_value"],
    ["maximumEntryEffort", "maximum_entry_effort"],
    ["preferredCategories", "preferred_categories"],
    ["excludedCategories", "excluded_categories"],
    ["preferredEntryFrequency", "preferred_entry_frequency"],
    ["allowSocialEntryMethods", "allow_social_entry_methods"],
    ["allowPurchaseRelatedPromotions", "allow_purchase_related_promotions"],
    ["emailDigestFrequency", "email_digest_frequency"],
    ["pushNotificationsEnabled", "push_notifications_enabled"],
  ];
  for (const [inputKey, column] of fields) if (input[inputKey] !== undefined) update[column] = input[inputKey];
  return update;
}

function eligibilityUpdate(input: PersonalProfileInput, updatedAt: string) {
  const update: Record<string, unknown> = { updated_at: updatedAt };
  const fields: Array<[keyof PersonalProfileInput, string]> = [
    ["countryCode", "country_code"],
    ["stateOrRegion", "state_or_region"],
    ["minimumAgeConfirmed", "minimum_age_confirmed"],
    ["residencyNotes", "residency_notes"],
    ["excludedSponsorTypes", "excluded_sponsor_types"],
    ["customEligibilityNotes", "custom_eligibility_notes"],
  ];
  for (const [inputKey, column] of fields) if (input[inputKey] !== undefined) update[column] = input[inputKey];
  return update;
}

function sanitizeProfile(profile: Record<string, any>, preferences: Record<string, any>, eligibility: Record<string, any>) {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    timezone: profile.timezone,
    countryCode: profile.country_code,
    stateOrRegion: profile.state_or_region,
    postalCode: profile.postal_code,
    birthDate: profile.birth_date,
    platformRole: profile.platform_role,
    onboardingCompletedAt: profile.onboarding_completed_at,
    termsAcceptedAt: profile.terms_accepted_at,
    privacyAcceptedAt: profile.privacy_accepted_at,
    sponsorDisclaimerAcceptedAt: profile.sponsor_disclaimer_accepted_at,
    preferences: {
      minimumPrizeValue: Number(preferences.minimum_prize_value),
      maximumEntryEffort: preferences.maximum_entry_effort,
      preferredCategories: preferences.preferred_categories,
      excludedCategories: preferences.excluded_categories,
      preferredEntryFrequency: preferences.preferred_entry_frequency,
      allowSocialEntryMethods: preferences.allow_social_entry_methods,
      allowPurchaseRelatedPromotions: preferences.allow_purchase_related_promotions,
      emailDigestFrequency: preferences.email_digest_frequency,
      pushNotificationsEnabled: preferences.push_notifications_enabled,
    },
    eligibility: {
      countryCode: eligibility.country_code,
      stateOrRegion: eligibility.state_or_region,
      minimumAgeConfirmed: eligibility.minimum_age_confirmed,
      residencyNotes: eligibility.residency_notes,
      excludedSponsorTypes: eligibility.excluded_sponsor_types,
      customEligibilityNotes: eligibility.custom_eligibility_notes,
    },
  };
}

function localProfile(auth: AuthContext) {
  return {
    id: auth.userId,
    email: auth.email,
    displayName: auth.displayName,
    avatarUrl: null as string | null,
    timezone: "UTC",
    countryCode: null as string | null,
    stateOrRegion: null as string | null,
    postalCode: null as string | null,
    birthDate: null as string | null,
    platformRole: auth.platformRole,
    onboardingCompletedAt: null as string | null,
    termsAcceptedAt: null as string | null,
    privacyAcceptedAt: null as string | null,
    sponsorDisclaimerAcceptedAt: null as string | null,
    preferences: {
      minimumPrizeValue: 0,
      maximumEntryEffort: 100,
      preferredCategories: [] as string[],
      excludedCategories: [] as string[],
      preferredEntryFrequency: [] as string[],
      allowSocialEntryMethods: true,
      allowPurchaseRelatedPromotions: false,
      emailDigestFrequency: "weekly" as "never" | "daily" | "weekly",
      pushNotificationsEnabled: false,
    },
    eligibility: {
      countryCode: null as string | null,
      stateOrRegion: null as string | null,
      minimumAgeConfirmed: false,
      residencyNotes: "",
      excludedSponsorTypes: [] as string[],
      customEligibilityNotes: "",
    },
  };
}

function mergeLocalProfile(current: PersonalProfile, input: PersonalProfileInput): PersonalProfile {
  const now = new Date().toISOString();
  const updated: PersonalProfile = {
    ...current,
    displayName: input.displayName ?? current.displayName,
    avatarUrl: input.avatarUrl === undefined ? current.avatarUrl : input.avatarUrl,
    timezone: input.timezone ?? current.timezone,
    countryCode: input.countryCode === undefined ? current.countryCode : input.countryCode,
    stateOrRegion: input.stateOrRegion === undefined ? current.stateOrRegion : input.stateOrRegion,
    postalCode: input.postalCode === undefined ? current.postalCode : input.postalCode,
    birthDate: input.birthDate === undefined ? current.birthDate : input.birthDate,
    termsAcceptedAt: input.acceptTerms ? current.termsAcceptedAt ?? now : current.termsAcceptedAt,
    privacyAcceptedAt: input.acceptPrivacy ? current.privacyAcceptedAt ?? now : current.privacyAcceptedAt,
    sponsorDisclaimerAcceptedAt: input.acceptSponsorDisclaimer ? current.sponsorDisclaimerAcceptedAt ?? now : current.sponsorDisclaimerAcceptedAt,
    preferences: { ...current.preferences, ...definedPreferences(input) },
    eligibility: { ...current.eligibility, ...definedEligibility(input) },
  };
  if (input.completeOnboarding) {
    if (!updated.termsAcceptedAt || !updated.privacyAcceptedAt || !updated.sponsorDisclaimerAcceptedAt) throw new Error("Terms, Privacy Policy, and sponsor disclaimer acceptance are required.");
    updated.onboardingCompletedAt = current.onboardingCompletedAt ?? now;
  }
  return updated;
}

function definedPreferences(input: PersonalProfileInput) {
  return Object.fromEntries(Object.entries({
    minimumPrizeValue: input.minimumPrizeValue,
    maximumEntryEffort: input.maximumEntryEffort,
    preferredCategories: input.preferredCategories,
    excludedCategories: input.excludedCategories,
    preferredEntryFrequency: input.preferredEntryFrequency,
    allowSocialEntryMethods: input.allowSocialEntryMethods,
    allowPurchaseRelatedPromotions: input.allowPurchaseRelatedPromotions,
    emailDigestFrequency: input.emailDigestFrequency,
    pushNotificationsEnabled: input.pushNotificationsEnabled,
  }).filter(([, value]) => value !== undefined));
}

function definedEligibility(input: PersonalProfileInput) {
  return Object.fromEntries(Object.entries({
    countryCode: input.countryCode,
    stateOrRegion: input.stateOrRegion,
    minimumAgeConfirmed: input.minimumAgeConfirmed,
    residencyNotes: input.residencyNotes,
    excludedSponsorTypes: input.excludedSponsorTypes,
    customEligibilityNotes: input.customEligibilityNotes,
  }).filter(([, value]) => value !== undefined));
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function safeHttpUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Avatar URL must use HTTPS or HTTP.");
  return parsed.toString();
}
