import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
