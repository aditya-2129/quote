import { integer, real, sqliteTable, text, unique, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { customers } from "./customers";
import { rfqs } from "./rfqs";

export type QuoteStatus = "draft" | "review" | "sent" | "won" | "lost" | "expired";
export type ProjectNameSource = "auto" | "user";

export interface QuoteCostSnapshot {
  partsCost: number;
  tooling: number;
  inspection: number;
  subtotal: number;
  margin: number;
  tax: number;
  total: number;
  unitPrice: number;
  currency: string;
  computedAt: string;
}

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    rfqId: text("rfq_id").references(() => rfqs.id, { onDelete: "set null" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** Self-reference for revision chains: rev B/C/... points at the original (rev A). Null = root revision. */
    parentQuoteId: text("parent_quote_id").references((): AnySQLiteColumn => quotes.id, { onDelete: "set null" }),
    revision: text("revision").notNull().default("A"),
    title: text("title").notNull(),
    /** Tracks whether `title` was set by the user or auto-generated (file name / Untitled N). 'auto' values are safe to overwrite on subsequent file attaches; 'user' values are preserved. */
    projectNameSource: text("project_name_source").$type<ProjectNameSource>(),
    /** Shared across revisions of the same quote (e.g. Q-026-014). (quote_number, revision) is unique. */
    quoteNumber: text("quote_number"),
    status: text("status").$type<QuoteStatus>().notNull().default("draft"),
    assemblyQuantity: integer("assembly_quantity").notNull().default(1),
    /** Quantity break points used by the pricing table, e.g. [1,10,25,100,250]. */
    quantityBreaks: text("quantity_breaks", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default([1, 10, 25, 100, 250]),
    currency: text("currency").notNull().default("INR"),
    toolingCost: real("tooling_cost").notNull().default(0),
    inspectionCost: real("inspection_cost").notNull().default(0),
    marginPercent: real("margin_percent").notNull().default(0),
    taxPercent: real("tax_percent").notNull().default(0),
    discountPercent: real("discount_percent").notNull().default(0),
    /** Populated when quote is sent or finalised — JSON snapshot of computed costs */
    costSnapshot: text("cost_snapshot", { mode: "json" }).$type<QuoteCostSnapshot | null>(),
    notes: text("notes"),
    validUntil: integer("valid_until", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    quoteNumberRevisionUnique: unique("quotes_quote_number_revision_unq").on(t.quoteNumber, t.revision),
  }),
);

export type Quote    = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
