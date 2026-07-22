import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./identity";
import { sweepstakes } from "./sweepstakes";

export const userSweepstakesStatusEnum = pgEnum("user_sweepstakes_status_value", ["interested", "saved", "entered", "enter_again", "skipped", "hidden", "won", "expired"]);
export const savedPriorityEnum = pgEnum("saved_sweepstakes_priority", ["low", "normal", "high"]);

export const userSavedSweepstakes = pgTable("user_saved_sweepstakes", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
  savedAt: timestamp("saved_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  priority: savedPriorityEnum("priority").notNull().default("normal"),
  notes: text("notes").notNull().default(""),
}, (table) => [primaryKey({ columns: [table.userId, table.sweepstakesId], name: "user_saved_sweepstakes_pk" }), index("user_saved_sweepstakes_popular_idx").on(table.sweepstakesId, table.savedAt)]);

export const userSweepstakesStatus = pgTable("user_sweepstakes_status", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
  status: userSweepstakesStatusEnum("status").notNull(),
  lastEnteredAt: timestamp("last_entered_at", { withTimezone: true, mode: "string" }),
  nextEntryDueAt: timestamp("next_entry_due_at", { withTimezone: true, mode: "string" }),
  entryCount: integer("entry_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.sweepstakesId], name: "user_sweepstakes_status_pk" }),
  index("user_sweepstakes_status_due_idx").on(table.userId, table.status, table.nextEntryDueAt),
  check("user_sweepstakes_status_entry_count_nonnegative", sql`${table.entryCount} >= 0`),
]);

export const userSweepstakesNotes = pgTable("user_sweepstakes_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  sweepstakesId: uuid("sweepstakes_id").notNull().references(() => sweepstakes.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("user_sweepstakes_notes_owner_idx").on(table.userId, table.sweepstakesId, table.createdAt),
  check("user_sweepstakes_notes_note_length", sql`char_length(${table.note}) between 1 and 4000`),
]);

export const userSearchProfiles = pgTable("user_search_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  alertEnabled: boolean("alert_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_search_profiles_owner_name_uidx").on(table.userId, table.name),
  index("user_search_profiles_alert_idx").on(table.userId, table.alertEnabled),
  check("user_search_profiles_name_length", sql`char_length(${table.name}) between 1 and 120`),
  check("user_search_profiles_filters_object", sql`jsonb_typeof(${table.filters}) = 'object'`),
]);
