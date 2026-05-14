import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { materials } from "./materials";
import { quotes } from "./quotes";

export const parts = sqliteTable("parts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
  colorHex: text("color_hex").notNull().default("#888888"),
  /** How many of this part per assembly */
  perAssembly: integer("per_assembly").notNull().default(1),
  /** Finished part mass in kg */
  massKg: real("mass_kg").notNull().default(0),
  /** Per-part finishing / coating / painting cost */
  finishingCost: real("finishing_cost").notNull().default(0),
  /** Include this part in cost rollup? */
  isIncluded: integer("is_included", { mode: "boolean" }).notNull().default(true),
  /** Purchased part — no machining costed */
  isStocked: integer("is_stocked", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Part    = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;
