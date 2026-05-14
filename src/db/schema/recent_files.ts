import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecentFileType = "step" | "iges" | "stl" | "pdf" | "other";

export const recentFiles = sqliteTable("recent_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  fileType: text("file_type").$type<RecentFileType>().notNull(),
  size: integer("size"),
  thumbnail: text("thumbnail"),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type RecentFile    = typeof recentFiles.$inferSelect;
export type NewRecentFile = typeof recentFiles.$inferInsert;
