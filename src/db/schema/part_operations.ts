import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { machines } from "./machines";
import { parts } from "./parts";

export const partOperations = sqliteTable("part_operations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partId: text("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  machineId: text("machine_id").references(() => machines.id, { onDelete: "set null" }),
  /** Setup time in minutes (per batch, not per part) */
  setupMin: real("setup_min").notNull().default(0),
  /** Cycle time in minutes per part */
  cycleMin: real("cycle_min").notNull().default(0),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type PartOperation    = typeof partOperations.$inferSelect;
export type NewPartOperation = typeof partOperations.$inferInsert;
