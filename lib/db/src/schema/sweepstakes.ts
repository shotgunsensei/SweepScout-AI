import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { discoveredUrls, sources } from "./sources";

export const sweepstakesStatusEnum = pgEnum("sweepstakes_lifecycle_status", [
  "upcoming",
  "active",
  "expired",
  "canceled",
  "unverifiable",
]);

export const entryFrequencyEnum = pgEnum("entry_frequency", [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "unlimited",
  "unknown",
]);

export const qualityFlagSeverityEnum = pgEnum("quality_flag_severity", ["info", "low", "medium", "high", "critical"]);
export const qualityFlagStatusEnum = pgEnum("quality_flag_status", ["open", "reviewing", "resolved", "dismissed"]);
export const enrichmentRunStatusEnum = pgEnum("enrichment_run_status", ["running", "completed", "needs_review", "failed"]);
export const mergeEventStatusEnum = pgEnum("merge_event_status", ["applied", "undone"]);

export const sweepstakes = pgTable(
  "sweepstakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    sponsorName: text("sponsor_name").notNull(),
    summary: text("summary").notNull().default(""),
    officialUrl: text("official_url").notNull(),
    rulesUrl: text("rules_url"),
    officialPromotionId: text("official_promotion_id"),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }),
    timezone: text("timezone").notNull().default("UTC"),
    estimatedTotalPrizeValue: numeric("estimated_total_prize_value", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    entryFrequency: entryFrequencyEnum("entry_frequency").notNull().default("unknown"),
    entryEffortScore: integer("entry_effort_score").notNull().default(0),
    legitimacyScore: integer("legitimacy_score").notNull().default(0),
    sourceConfidenceScore: integer("source_confidence_score").notNull().default(0),
    status: sweepstakesStatusEnum("status").notNull().default("unverifiable"),
    firstDiscoveredAt: timestamp("first_discovered_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("sweepstakes_status_end_idx").on(table.status, table.endAt),
    index("sweepstakes_sponsor_title_idx").on(table.sponsorName, table.normalizedTitle),
    index("sweepstakes_verified_idx").on(table.lastVerifiedAt),
    index("sweepstakes_prize_value_idx").on(table.estimatedTotalPrizeValue),
    uniqueIndex("sweepstakes_official_url_uidx").on(table.officialUrl),
    check("sweepstakes_dates_ordered", sql`${table.startAt} is null or ${table.endAt} is null or ${table.startAt} <= ${table.endAt}`),
    check("sweepstakes_prize_value_nonnegative", sql`${table.estimatedTotalPrizeValue} is null or ${table.estimatedTotalPrizeValue} >= 0`),
    check("sweepstakes_scores_valid", sql`${table.entryEffortScore} between 0 and 100 and ${table.legitimacyScore} between 0 and 100 and ${table.sourceConfidenceScore} between 0 and 100`),
    check("sweepstakes_currency_iso", sql`char_length(${table.currency}) = 3`),
  ],
);

export const sweepstakesSources = pgTable(
  "sweepstakes_sources",
  {
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
    discoveredUrlId: uuid("discovered_url_id").notNull().references(() => discoveredUrls.id, { onDelete: "restrict" }),
    sourceListingTitle: text("source_listing_title"),
    sourceListingText: text("source_listing_text"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sweepstakesId, table.sourceId, table.discoveredUrlId], name: "sweepstakes_sources_pk" }),
    index("sweepstakes_sources_source_idx").on(table.sourceId, table.lastSeenAt),
  ],
);

export const sweepstakesPrizes = pgTable(
  "sweepstakes_prizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    estimatedValue: numeric("estimated_value", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("sweepstakes_prizes_sweepstakes_idx").on(table.sweepstakesId),
    check("sweepstakes_prizes_quantity_positive", sql`${table.quantity} > 0`),
    check("sweepstakes_prizes_value_nonnegative", sql`${table.estimatedValue} is null or ${table.estimatedValue} >= 0`),
  ],
);

export const sweepstakesEligibility = pgTable(
  "sweepstakes_eligibility",
  {
    sweepstakesId: uuid("sweepstakes_id").primaryKey().references(() => sweepstakes.id, { onDelete: "cascade" }),
    minimumAge: integer("minimum_age"),
    maximumAge: integer("maximum_age"),
    eligibleCountries: text("eligible_countries").array().notNull().default(sql`'{}'::text[]`),
    eligibleRegions: text("eligible_regions").array().notNull().default(sql`'{}'::text[]`),
    excludedRegions: text("excluded_regions").array().notNull().default(sql`'{}'::text[]`),
    residencyRequired: boolean("residency_required").notNull().default(false),
    employeeExclusions: text("employee_exclusions"),
    otherRestrictions: text("other_restrictions"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("sweepstakes_eligibility_ages_valid", sql`(${table.minimumAge} is null or ${table.minimumAge} >= 0) and (${table.maximumAge} is null or ${table.maximumAge} >= 0) and (${table.minimumAge} is null or ${table.maximumAge} is null or ${table.minimumAge} <= ${table.maximumAge})`),
  ],
);

export const sweepstakesEntryMethods = pgTable(
  "sweepstakes_entry_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    methodType: text("method_type").notNull(),
    description: text("description").notNull().default(""),
    entryUrl: text("entry_url").notNull(),
    frequency: entryFrequencyEnum("frequency").notNull().default("unknown"),
    purchaseRequired: boolean("purchase_required").notNull().default(false),
    socialPlatform: text("social_platform"),
    estimatedMinutes: integer("estimated_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("sweepstakes_entry_methods_sweepstakes_idx").on(table.sweepstakesId),
    check("sweepstakes_entry_methods_minutes_valid", sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} between 0 and 1440`),
  ],
);

export const sweepstakesRulesVersions = pgTable(
  "sweepstakes_rules_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "restrict" }),
    rulesUrl: text("rules_url").notNull(),
    rawText: text("raw_text").notNull(),
    contentHash: text("content_hash").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sweepstakes_rules_versions_hash_uidx").on(table.sweepstakesId, table.contentHash),
    index("sweepstakes_rules_versions_extracted_idx").on(table.sweepstakesId, table.extractedAt),
  ],
);

export const sweepstakesCategories = pgTable(
  "sweepstakes_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (table) => [uniqueIndex("sweepstakes_categories_slug_uidx").on(table.slug)],
);

export const sweepstakesCategoryLinks = pgTable(
  "sweepstakes_category_links",
  {
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => sweepstakesCategories.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.sweepstakesId, table.categoryId], name: "sweepstakes_category_links_pk" })],
);

export const listingQualityFlags = pgTable(
  "listing_quality_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    flagType: text("flag_type").notNull(),
    severity: qualityFlagSeverityEnum("severity").notNull(),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    status: qualityFlagStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [index("listing_quality_flags_review_idx").on(table.status, table.severity, table.createdAt)],
);

export const sweepstakesChangeEvents = pgTable(
  "sweepstakes_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "restrict" }),
    fieldName: text("field_name").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    detectedAt: timestamp("detected_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  },
  (table) => [index("sweepstakes_change_events_sweepstakes_idx").on(table.sweepstakesId, table.detectedAt)],
);

export const aiEnrichmentRuns = pgTable(
  "ai_enrichment_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discoveredUrlId: uuid("discovered_url_id").notNull().references(() => discoveredUrls.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: enrichmentRunStatusEnum("status").notNull().default("running"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("ai_enrichment_runs_status_started_idx").on(table.status, table.startedAt),
    check("ai_enrichment_runs_usage_nonnegative", sql`${table.inputTokens} >= 0 and ${table.outputTokens} >= 0 and ${table.estimatedCostUsd} >= 0`),
  ],
);

export const sweepstakesFieldEvidence = pgTable(
  "sweepstakes_field_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
    enrichmentRunId: uuid("enrichment_run_id").notNull().references(() => aiEnrichmentRuns.id, { onDelete: "restrict" }),
    fieldName: text("field_name").notNull(),
    fieldValue: jsonb("field_value"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    sourceReference: text("source_reference").notNull(),
    evidenceText: text("evidence_text").notNull().default(""),
    evidenceLocation: jsonb("evidence_location").notNull().default(sql`'{}'::jsonb`),
    authoritative: boolean("authoritative").notNull().default(false),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("sweepstakes_field_evidence_run_field_uidx").on(table.enrichmentRunId, table.fieldName),
    index("sweepstakes_field_evidence_sweepstakes_idx").on(table.sweepstakesId, table.fieldName, table.extractedAt),
    check("sweepstakes_field_evidence_confidence_valid", sql`${table.confidence} between 0 and 1`),
  ],
);

export const sweepstakesMergeEvents = pgTable(
  "sweepstakes_merge_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetSweepstakesId: uuid("target_sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "restrict" }),
    sourceSweepstakesId: uuid("source_sweepstakes_id").references(() => sweepstakes.id, { onDelete: "restrict" }),
    enrichmentRunId: uuid("enrichment_run_id").references(() => aiEnrichmentRuns.id, { onDelete: "restrict" }),
    matchScore: numeric("match_score", { precision: 5, scale: 4 }).notNull(),
    matchedSignals: jsonb("matched_signals").notNull().default(sql`'{}'::jsonb`),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    status: mergeEventStatusEnum("status").notNull().default("applied"),
    mergedBy: uuid("merged_by"),
    mergedAt: timestamp("merged_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    undoneBy: uuid("undone_by"),
    undoneAt: timestamp("undone_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("sweepstakes_merge_events_target_idx").on(table.targetSweepstakesId, table.status, table.mergedAt),
    check("sweepstakes_merge_events_score_valid", sql`${table.matchScore} between 0 and 1`),
    check("sweepstakes_merge_events_undo_valid", sql`(${table.status} = 'applied' and ${table.undoneAt} is null and ${table.undoneBy} is null) or (${table.status} = 'undone' and ${table.undoneAt} is not null and ${table.undoneBy} is not null)`),
  ],
);

export const insertSweepstakesSchema = createInsertSchema(sweepstakes);
export const selectSweepstakesSchema = createSelectSchema(sweepstakes);
export const insertSweepstakesPrizeSchema = createInsertSchema(sweepstakesPrizes);
export const selectSweepstakesPrizeSchema = createSelectSchema(sweepstakesPrizes);
export const insertSweepstakesEligibilitySchema = createInsertSchema(sweepstakesEligibility);
export const selectSweepstakesEligibilitySchema = createSelectSchema(sweepstakesEligibility);
export const insertSweepstakesEntryMethodSchema = createInsertSchema(sweepstakesEntryMethods);
export const selectSweepstakesEntryMethodSchema = createSelectSchema(sweepstakesEntryMethods);

export type Sweepstakes = typeof sweepstakes.$inferSelect;
export type NewSweepstakes = typeof sweepstakes.$inferInsert;
export type SweepstakesPrize = typeof sweepstakesPrizes.$inferSelect;
export type NewSweepstakesPrize = typeof sweepstakesPrizes.$inferInsert;
export type SweepstakesEligibility = typeof sweepstakesEligibility.$inferSelect;
export type NewSweepstakesEligibility = typeof sweepstakesEligibility.$inferInsert;
export type SweepstakesEntryMethod = typeof sweepstakesEntryMethods.$inferSelect;
export type NewSweepstakesEntryMethod = typeof sweepstakesEntryMethods.$inferInsert;
