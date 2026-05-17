import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bopCatalog = sqliteTable("bop_catalog", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  supplier: text("supplier"),
  unitCost: real("unit_cost").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type BopCatalogItem = typeof bopCatalog.$inferSelect;
export type NewBopCatalogItem = typeof bopCatalog.$inferInsert;
