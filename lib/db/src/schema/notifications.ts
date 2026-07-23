import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./identity";
import { sweepstakes } from "./sweepstakes";

export const notificationTypeEnum = pgEnum("notification_type", ["high_match","ending_soon","entry_due","rules_changed","deadline_changed","opportunity_canceled","source_confidence_reduced","custom_scan_completed","credits_low","payment_failed"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["in_app","email","browser_push","sms","mobile_push"]);
export const deliveryStatusEnum = pgEnum("notification_delivery_status", ["pending","processing","delivered","failed","skipped"]);
export const digestKindEnum = pgEnum("digest_kind", ["daily","weekly","ending_soon","high_value","recommendations","entry_reminders"]);
export const customScanStatusEnum = pgEnum("custom_scan_status", ["queued","running","completed","partial","failed","canceled"]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  dailyDigestEnabled: boolean("daily_digest_enabled").notNull().default(false),
  weeklyDigestEnabled: boolean("weekly_digest_enabled").notNull().default(true),
  endingSoonEnabled: boolean("ending_soon_enabled").notNull().default(true),
  highValueEnabled: boolean("high_value_enabled").notNull().default(true),
  recommendationsEnabled: boolean("recommendations_enabled").notNull().default(true),
  entryRemindersEnabled: boolean("entry_reminders_enabled").notNull().default(true),
  emailUnsubscribedAt: timestamp("email_unsubscribed_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sweepstakesId: uuid("sweepstakes_id").references(() => sweepstakes.id, { onDelete: "set null" }),
  sourceReference: text("source_reference").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  priority: integer("priority").notNull().default(0),
  readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("notifications_user_dedupe_uidx").on(table.userId, table.dedupeKey),
  index("notifications_user_unread_idx").on(table.userId, table.readAt, table.createdAt),
  check("notifications_priority_valid", sql`${table.priority} between 0 and 100`),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  channel: notificationChannelEnum("channel").notNull(),
  status: deliveryStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: "string" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "string" }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("notification_deliveries_notification_channel_uidx").on(table.notificationId, table.channel),
  index("notification_deliveries_due_idx").on(table.status, table.nextRetryAt, table.scheduledAt),
  check("notification_deliveries_attempts_nonnegative", sql`${table.attemptCount} >= 0`),
]);

export const digestRuns = pgTable("digest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  kind: digestKindEnum("kind").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true, mode: "string" }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true, mode: "string" }).notNull(),
  status: deliveryStatusEnum("status").notNull().default("pending"),
  itemCount: integer("item_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, (table) => [
  uniqueIndex("digest_runs_user_kind_window_uidx").on(table.userId, table.kind, table.windowStart),
  check("digest_runs_item_count_nonnegative", sql`${table.itemCount} >= 0`),
]);

export const customScanners = pgTable("custom_scanners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  sourceIds: uuid("source_ids").array().notNull().default(sql`'{}'::uuid[]`),
  cadenceMinutes: integer("cadence_minutes").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "string" }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("custom_scanners_user_name_uidx").on(table.userId, table.name),
  index("custom_scanners_due_idx").on(table.enabled, table.nextRunAt),
  check("custom_scanners_name_length", sql`char_length(${table.name}) between 1 and 120`),
  check("custom_scanners_cadence_valid", sql`${table.cadenceMinutes} between 60 and 43200`),
  check("custom_scanners_sources_present", sql`cardinality(${table.sourceIds}) between 1 and 25`),
]);

export const customScanRuns = pgTable("custom_scan_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  customScannerId: uuid("custom_scanner_id").notNull().references(() => customScanners.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  status: customScanStatusEnum("status").notNull().default("queued"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "string" }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  sourceIds: uuid("source_ids").array().notNull(),
  resultSummary: jsonb("result_summary").$type<Record<string, unknown>>().notNull().default({}),
  matchCount: integer("match_count").notNull().default(0),
  creditIdempotencyKey: text("credit_idempotency_key").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("custom_scan_runs_credit_key_uidx").on(table.creditIdempotencyKey),
  index("custom_scan_runs_user_created_idx").on(table.userId, table.createdAt),
  check("custom_scan_runs_match_count_nonnegative", sql`${table.matchCount} >= 0`),
]);
