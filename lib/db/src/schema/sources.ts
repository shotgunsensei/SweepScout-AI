import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const sourceAccessMethodEnum = pgEnum("source_access_method", [
  "rss",
  "atom",
  "json_api",
  "structured_html",
  "admin_url",
  "admin_import",
]);

export const policyReviewStatusEnum = pgEnum("policy_review_status", [
  "pending",
  "approved",
  "restricted",
  "prohibited",
]);

export const sourceHealthStatusEnum = pgEnum("source_health_status", [
  "unknown",
  "healthy",
  "degraded",
  "paused",
  "failed",
]);

export const scanJobStatusEnum = pgEnum("scan_job_status", [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "canceled",
  "dead_letter",
]);

export const discoveredUrlStatusEnum = pgEnum("discovered_url_status", [
  "new",
  "queued",
  "fetched",
  "changed",
  "unchanged",
  "rejected",
  "failed",
]);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    sourceType: text("source_type").notNull(),
    accessMethod: sourceAccessMethodEnum("access_method").notNull(),
    scanEnabled: boolean("scan_enabled").notNull().default(false),
    scanFrequencyMinutes: integer("scan_frequency_minutes").notNull().default(1440),
    robotsPolicyStatus: policyReviewStatusEnum("robots_policy_status").notNull().default("pending"),
    termsReviewStatus: policyReviewStatusEnum("terms_review_status").notNull().default("pending"),
    requiresAttribution: boolean("requires_attribution").notNull().default(true),
    attributionText: text("attribution_text"),
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(6),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true, mode: "string" }),
    nextScanAt: timestamp("next_scan_at", { withTimezone: true, mode: "string" }),
    healthStatus: sourceHealthStatusEnum("health_status").notNull().default("unknown"),
    configuration: jsonb("configuration").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sources_base_url_access_method_uidx").on(table.baseUrl, table.accessMethod),
    index("sources_schedule_idx").on(table.scanEnabled, table.nextScanAt),
    index("sources_health_idx").on(table.healthStatus),
    check("sources_scan_frequency_positive", sql`${table.scanFrequencyMinutes} >= 5`),
    check("sources_rate_limit_positive", sql`${table.rateLimitPerMinute} between 1 and 600`),
    check("sources_approved_before_enable", sql`not ${table.scanEnabled} or (${table.robotsPolicyStatus} = 'approved' and ${table.termsReviewStatus} = 'approved')`),
  ],
);

export const sourceScanJobs = pgTable(
  "source_scan_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
    status: scanJobStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    pagesRequested: integer("pages_requested").notNull().default(0),
    pagesSuccessful: integer("pages_successful").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    itemsDiscovered: integer("items_discovered").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorSummary: text("error_summary"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("source_scan_jobs_source_created_idx").on(table.sourceId, table.createdAt),
    index("source_scan_jobs_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("source_scan_jobs_correlation_uidx").on(table.correlationId),
    check("source_scan_jobs_counts_nonnegative", sql`${table.pagesRequested} >= 0 and ${table.pagesSuccessful} >= 0 and ${table.pagesFailed} >= 0 and ${table.itemsDiscovered} >= 0 and ${table.attemptCount} >= 0`),
  ],
);

export const discoveredUrls = pgTable(
  "discovered_urls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
    scanJobId: uuid("scan_job_id").references(() => sourceScanJobs.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    contentHash: text("content_hash"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true, mode: "string" }),
    status: discoveredUrlStatusEnum("status").notNull().default("new"),
    httpStatus: integer("http_status"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("discovered_urls_source_canonical_uidx").on(table.sourceId, table.canonicalUrl),
    index("discovered_urls_status_seen_idx").on(table.status, table.lastSeenAt),
    index("discovered_urls_content_hash_idx").on(table.contentHash),
    check("discovered_urls_http_status_valid", sql`${table.httpStatus} is null or ${table.httpStatus} between 100 and 599`),
  ],
);

export const insertSourceSchema = createInsertSchema(sources);
export const selectSourceSchema = createSelectSchema(sources);
export const insertSourceScanJobSchema = createInsertSchema(sourceScanJobs);
export const selectSourceScanJobSchema = createSelectSchema(sourceScanJobs);
export const insertDiscoveredUrlSchema = createInsertSchema(discoveredUrls);
export const selectDiscoveredUrlSchema = createSelectSchema(discoveredUrls);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type SourceScanJob = typeof sourceScanJobs.$inferSelect;
export type DiscoveredUrl = typeof discoveredUrls.$inferSelect;
