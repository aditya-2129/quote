import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const materials = sqliteTable("materials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  densityKgPerM3: real("density_kg_per_m3").notNull().default(0),
  costPerKg: real("cost_per_kg").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  markupPercent: real("markup_percent").notNull().default(0),
  category: text("category"),
  availableForms: text("available_forms", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  formRates: text("form_rates", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Material    = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
