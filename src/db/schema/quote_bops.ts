import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { quotes } from "./quotes";
import { bopCatalog } from "./bop_catalog";

export const quoteBops = sqliteTable("quote_bops", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  /** Optional link back to the reusable catalog row. Snapshot values still live on this row so catalog edits don't silently rewrite historical quotes. */
  catalogId: text("catalog_id").references(() => bopCatalog.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  supplier: text("supplier"),
  qtyPerAssembly: integer("qty_per_assembly").notNull().default(1),
  unitCost: real("unit_cost").notNull().default(0),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type QuoteBop = typeof quoteBops.$inferSelect;
export type NewQuoteBop = typeof quoteBops.$inferInsert;
