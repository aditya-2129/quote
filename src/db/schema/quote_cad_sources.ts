import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { quotes } from "./quotes";

/**
 * Original STEP file bytes for a quote, kept so the 3D preview can re-render
 * after a reload (the CAD scene itself lives only in CadContext memory).
 * One row per quote — bytes stored base64-encoded so the Tauri SQL plugin's
 * primitives-only param path doesn't trip on Uint8Arrays.
 */
export const quoteCadSources = sqliteTable("quote_cad_sources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  quoteId: text("quote_id").notNull().unique().references(() => quotes.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileBytesBase64: text("file_bytes_base64"), // Nullable for large files saved on disk
  filePath: text("file_path"),               // Path to the file on disk (for files > 5MB)
  fileSize: integer("file_size"),             // Size of the CAD file in bytes
  sha256: text("sha256"),                     // SHA-256 hash of the CAD file bytes
  importedAt: integer("imported_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type QuoteCadSource    = typeof quoteCadSources.$inferSelect;
export type NewQuoteCadSource = typeof quoteCadSources.$inferInsert;
