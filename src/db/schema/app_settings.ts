import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Well-known setting keys used across the app.
 * Value is always JSON-encoded in the `value` column.
 */
export type AppSettingKey =
  | "unit_system"         // "metric" | "imperial"
  | "currency"            // "EUR" | "USD" | "GBP" | ...
  | "default_margin_pct"  // number
  | "default_tax_pct"     // number
  | "company_name"        // string
  | "company_address"     // string
  | "company_phone"       // string
  | "company_email"       // string
  | "company_gstn"        // string
  | "company_state"       // string
  | "company_state_code"  // string
  | "company_tagline"     // string
  | "company_contact_person" // string
  | "company_contact_phone"  // string
  | "company_contact_email"  // string
  | "company_logo_path"   // string (file path)
  | "quote_notes_default" // string
  | "quote_terms"         // string, one term per line
  | "recent_files_limit"  // number
  | "feature_recognition_enabled"; // boolean — show CAD viewer FEATURES panel

export const appSettings = sqliteTable("app_settings", {
  key: text("key").$type<AppSettingKey>().primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull().default(null),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type AppSetting    = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
