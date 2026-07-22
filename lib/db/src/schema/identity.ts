import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const platformRoleEnum = pgEnum("platform_role", ["user", "admin", "owner"]);
export const organizationRoleEnum = pgEnum("organization_role", ["member", "manager", "owner"]);
export const digestFrequencyEnum = pgEnum("digest_frequency", ["never", "daily", "weekly"]);
export const deletionRequestStatusEnum = pgEnum("deletion_request_status", [
  "requested",
  "reviewing",
  "completed",
  "cancelled",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    countryCode: text("country_code"),
    stateOrRegion: text("state_or_region"),
    postalCode: text("postal_code"),
    birthDate: date("birth_date", { mode: "string" }),
    platformRole: platformRoleEnum("platform_role").notNull().default("user"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }),
    sponsorDisclaimerAcceptedAt: timestamp("sponsor_disclaimer_accepted_at", { withTimezone: true }),
    accountDisabledAt: timestamp("account_disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("profiles_email_unique").on(table.email),
    index("profiles_role_idx").on(table.platformRole),
    check("profiles_email_normalized", sql`${table.email} = lower(trim(${table.email}))`),
    check("profiles_country_code_iso", sql`${table.countryCode} is null or char_length(${table.countryCode}) = 2`),
    check("profiles_display_name_length", sql`char_length(trim(${table.displayName})) between 1 and 120`),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    minimumPrizeValue: numeric("minimum_prize_value", { precision: 14, scale: 2 }).notNull().default("0"),
    maximumEntryEffort: integer("maximum_entry_effort").notNull().default(100),
    preferredCategories: jsonb("preferred_categories").$type<string[]>().notNull().default([]),
    excludedCategories: jsonb("excluded_categories").$type<string[]>().notNull().default([]),
    preferredEntryFrequency: jsonb("preferred_entry_frequency").$type<string[]>().notNull().default([]),
    allowSocialEntryMethods: boolean("allow_social_entry_methods").notNull().default(true),
    allowPurchaseRelatedPromotions: boolean("allow_purchase_related_promotions").notNull().default(false),
    emailDigestFrequency: digestFrequencyEnum("email_digest_frequency").notNull().default("weekly"),
    pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("user_preferences_prize_nonnegative", sql`${table.minimumPrizeValue} >= 0`),
    check("user_preferences_effort_valid", sql`${table.maximumEntryEffort} between 0 and 100`),
  ],
);

export const userEligibilityProfiles = pgTable(
  "user_eligibility_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    countryCode: text("country_code"),
    stateOrRegion: text("state_or_region"),
    minimumAgeConfirmed: boolean("minimum_age_confirmed").notNull().default(false),
    residencyNotes: text("residency_notes").notNull().default(""),
    excludedSponsorTypes: jsonb("excluded_sponsor_types").$type<string[]>().notNull().default([]),
    customEligibilityNotes: text("custom_eligibility_notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "user_eligibility_country_code_iso",
      sql`${table.countryCode} is null or char_length(${table.countryCode}) = 2`,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(table.slug),
    check("organizations_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: organizationRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "organization_memberships_pk", columns: [table.organizationId, table.userId] }),
    index("organization_memberships_user_idx").on(table.userId),
  ],
);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    status: deletionRequestStatusEnum("status").notNull().default("requested"),
    reason: text("reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedByUserId: uuid("processed_by_user_id").references(() => profiles.id, { onDelete: "restrict" }),
  },
  (table) => [index("account_deletion_requests_user_idx").on(table.userId, table.status)],
);

export const insertProfileSchema = createInsertSchema(profiles);
export const selectProfileSchema = createSelectSchema(profiles);
export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export const selectUserPreferencesSchema = createSelectSchema(userPreferences);
export const insertUserEligibilityProfileSchema = createInsertSchema(userEligibilityProfiles);
export const selectUserEligibilityProfileSchema = createSelectSchema(userEligibilityProfiles);
export const insertOrganizationSchema = createInsertSchema(organizations);
export const insertOrganizationMembershipSchema = createInsertSchema(organizationMemberships);
export const insertAccountDeletionRequestSchema = createInsertSchema(accountDeletionRequests);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type UserEligibilityProfile = typeof userEligibilityProfiles.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMembership = typeof organizationMemberships.$inferSelect;
export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
