import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./identity";

export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free_flight", "co_pilot", "ace_pilot", "squadron"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["none", "incomplete", "trialing", "active", "past_due", "unpaid", "paused", "canceled"]);
export const billingEventStatusEnum = pgEnum("billing_event_status", ["processing", "processed", "failed", "ignored"]);
export const creditEntryTypeEnum = pgEnum("credit_entry_type", ["grant", "consume", "refund", "adjustment"]);

export const billingCustomers = pgTable("billing_customers", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  provider: text("provider").notNull().default("stripe"),
  providerCustomerId: text("provider_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.provider], name: "billing_customers_pk" }), uniqueIndex("billing_customers_provider_id_uidx").on(table.provider, table.providerCustomerId)]);

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "restrict" }),
  providerSubscriptionId: text("provider_subscription_id").unique(), providerPriceId: text("provider_price_id"),
  planKey: subscriptionPlanEnum("plan_key").notNull().default("free_flight"), status: subscriptionStatusEnum("status").notNull().default("none"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: "string" }), currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "string" }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false), trialEnd: timestamp("trial_end", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [index("subscriptions_status_idx").on(table.status, table.currentPeriodEnd)]);

export const entitlements = pgTable("entitlements", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }), featureKey: text("feature_key").notNull(),
  limitValue: integer("limit_value"), activeFrom: timestamp("active_from", { withTimezone: true, mode: "string" }).notNull().defaultNow(), activeUntil: timestamp("active_until", { withTimezone: true, mode: "string" }),
  source: text("source").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.featureKey, table.source], name: "entitlements_pk" }), index("entitlements_active_idx").on(table.userId, table.activeUntil)]);

export const billingEvents = pgTable("billing_events", {
  providerEventId: text("provider_event_id").primaryKey(), userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), status: billingEventStatusEnum("status").notNull().default("processing"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(), processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }), errorMessage: text("error_message"), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index("billing_events_user_idx").on(table.userId, table.receivedAt), index("billing_events_status_idx").on(table.status, table.receivedAt)]);

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "restrict" }), amount: integer("amount").notNull(),
  entryType: creditEntryTypeEnum("entry_type").notNull(), reasonCode: text("reason_code").notNull(), sourceReference: text("source_reference").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("credit_ledger_idempotency_uidx").on(table.idempotencyKey), index("credit_ledger_balance_idx").on(table.userId, table.expiresAt, table.createdAt), check("credit_ledger_amount_nonzero", sql`${table.amount} <> 0`), check("credit_ledger_type_sign", sql`(${table.entryType} = 'consume' and ${table.amount} < 0) or (${table.entryType} <> 'consume' and ${table.amount} > 0)`)]);
