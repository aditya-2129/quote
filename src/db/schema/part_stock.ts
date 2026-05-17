import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { parts } from "./parts";

export type StockShape =
  | "rect"
  | "round"
  | "hex"
  | "plate"
  | "block"
  | "round-bar"
  | "square-bar"
  | "tube";

/** Dims keyed by shape:
 *  plate / block  → { L, W, H }
 *  round-bar      → { D, L }
 *  square-bar     → { side, L }
 *  tube           → { OD, ID, L }
 */
export type StockDims = Record<string, number>;

export const partStock = sqliteTable("part_stock", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partId: text("part_id").notNull().unique().references(() => parts.id, { onDelete: "cascade" }),
  shape: text("shape").$type<StockShape>().notNull().default("plate"),
  dims: text("dims", { mode: "json" }).$type<StockDims>().notNull().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type PartStock    = typeof partStock.$inferSelect;
export type NewPartStock = typeof partStock.$inferInsert;
