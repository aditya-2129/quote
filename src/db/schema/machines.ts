import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type MachineCategory = "mill" | "lathe" | "grind" | "edm" | "hand" | "inspect" | "other";

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  ratePerHour: real("rate_per_hour").notNull().default(0),
  category: text("category").$type<MachineCategory>().notNull().default("mill"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Machine    = typeof machines.$inferSelect;
export type NewMachine = typeof machines.$inferInsert;
