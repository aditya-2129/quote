import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { customers } from "./customers";

export type RfqStatus = "new" | "reviewing" | "quoted" | "accepted" | "rejected" | "closed";

export const rfqs = sqliteTable("rfqs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  referenceNumber: text("reference_number").unique(),
  description: text("description"),
  status: text("status").$type<RfqStatus>().notNull().default("new"),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  dueDate: integer("due_date", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Rfq    = typeof rfqs.$inferSelect;
export type NewRfq = typeof rfqs.$inferInsert;
