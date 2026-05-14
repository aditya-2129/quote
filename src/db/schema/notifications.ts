import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type NotificationType = "rfq_new" | "quote_status" | "dfm_alert" | "system";

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").$type<NotificationType>().notNull(),
  title: text("title").notNull(),
  body: text("body"),
  /** Optional deep link e.g. "quote://<id>" or "rfq://<id>" */
  link: text("link"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Notification    = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
