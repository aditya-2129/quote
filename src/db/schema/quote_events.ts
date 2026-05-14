import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { quotes } from "./quotes";

export type QuoteEventType =
  | "created"
  | "status_changed"
  | "updated"
  | "sent"
  | "viewed"
  | "revision_created"
  | "note_added"
  | "dfm_resolved";

export const quoteEvents = sqliteTable("quote_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  eventType: text("event_type").$type<QuoteEventType>().notNull(),
  /** JSON payload — shape depends on event_type, e.g. { from: "draft", to: "sent" } */
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type QuoteEvent    = typeof quoteEvents.$inferSelect;
export type NewQuoteEvent = typeof quoteEvents.$inferInsert;
