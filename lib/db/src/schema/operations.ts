import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./identity";

export const supportRequestStatusEnum = pgEnum("support_request_status", ["open", "reviewing", "resolved", "closed"]);
export const supportRequestPriorityEnum = pgEnum("support_request_priority", ["low", "normal", "high", "urgent"]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
  afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
  reason: text("reason").notNull(),
  correlationId: text("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("admin_audit_logs_created_idx").on(table.createdAt),
  index("admin_audit_logs_target_idx").on(table.targetType, table.targetId, table.createdAt),
  check("admin_audit_logs_reason_required", sql`char_length(trim(${table.reason})) between 3 and 1000`),
]);

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const supportRequests = pgTable("support_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: supportRequestStatusEnum("status").notNull().default("open"),
  priority: supportRequestPriorityEnum("priority").notNull().default("normal"),
  assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("support_requests_status_idx").on(table.status, table.priority, table.createdAt)]);

export const applicationErrors = pgTable("application_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  correlationId: text("correlation_id").notNull(),
  route: text("route").notNull(),
  method: text("method").notNull(),
  errorName: text("error_name").notNull(),
  safeMessage: text("safe_message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("application_errors_occurred_idx").on(table.occurredAt)]);
