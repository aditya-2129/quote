import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { quotes } from "./quotes";

export type QuoteExtraCostCode =
  | "stuffing_packing"
  | "shipping_delivery"
  | "design_engineering"
  | "assembly_testing";

export const QUOTE_EXTRA_COST_ROSTER: ReadonlyArray<{
  code: QuoteExtraCostCode;
  label: string;
  sortOrder: number;
}> = [
  { code: "stuffing_packing",   label: "Stuffing & Packing",       sortOrder: 0 },
  { code: "shipping_delivery",  label: "Shipping/Delivery",        sortOrder: 1 },
  { code: "design_engineering", label: "Design & Engineering fee", sortOrder: 2 },
  { code: "assembly_testing",   label: "Final Assembly & Testing", sortOrder: 3 },
];

export const quoteExtraCosts = sqliteTable(
  "quote_extra_costs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    code: text("code").$type<QuoteExtraCostCode>().notNull(),
    label: text("label").notNull(),
    amount: real("amount").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    quoteCodeUnique: unique("quote_extra_costs_quote_code_unq").on(t.quoteId, t.code),
  }),
);

export type QuoteExtraCost = typeof quoteExtraCosts.$inferSelect;
export type NewQuoteExtraCost = typeof quoteExtraCosts.$inferInsert;
