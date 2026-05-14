import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { parts } from "./parts";

export type DfmSeverity = "error" | "warn" | "info";

export const dfmIssues = sqliteTable("dfm_issues", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partId: text("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
  severity: text("severity").$type<DfmSeverity>().notNull().default("info"),
  title: text("title").notNull(),
  description: text("description"),
  /** Estimated cost impact in quote currency */
  impactCost: real("impact_cost").notNull().default(0),
  suggestion: text("suggestion"),
  isActionable: integer("is_actionable", { mode: "boolean" }).notNull().default(false),
  isDismissed: integer("is_dismissed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type DfmIssue    = typeof dfmIssues.$inferSelect;
export type NewDfmIssue = typeof dfmIssues.$inferInsert;
