import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type DbClient = ReturnType<typeof drizzle>;

let _sqlite: Database | null = null;
let _db: DbClient | null = null;

function cleanParam(p: unknown): unknown {
  if (p === undefined) return null;
  if (p instanceof Date) return p.getTime();
  if (p !== null && typeof p === "object") return JSON.stringify(p);
  return p;
}

function cleanCell(value: unknown): unknown {
  return value === undefined || value === "undefined" ? null : value;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in row) out[key] = cleanCell(row[key]);
  return out;
}

function splitSelectList(selectList: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;

  for (const ch of selectList) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function selectedColumnNames(sql: string): string[] {
  const match = /^\s*select\s+([\s\S]+?)\s+from\s/i.exec(sql);
  if (!match) return [];
  return splitSelectList(match[1]!).map((part) => {
    const alias = /\s+as\s+"?([^"]+)"?\s*$/i.exec(part);
    if (alias) return alias[1]!;
    const quoted = [...part.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    return quoted.at(-1) ?? part.split(".").at(-1)?.replaceAll("\"", "").trim() ?? part;
  });
}

function rowValues(row: Record<string, unknown>, sql: string): unknown[] {
  const columns = selectedColumnNames(sql);
  if (columns.length === 0) return Object.values(row).map(cleanCell);
  return columns.map((column) => cleanCell(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null));
}

async function getSqlite(): Promise<Database> {
  if (!_sqlite) _sqlite = await Database.load("sqlite:quote.db");
  return _sqlite;
}

export async function getDb(): Promise<DbClient> {
  if (_db) return _db;

  const sqlite = await getSqlite();

  _db = drizzle(
    async (sql, params, method) => {
      try {
        // Tauri SQL only accepts primitives: serialize Dates/JSON and never pass undefined.
        const cleanParams = params.map(cleanParam);

        if (method === "run") {
          await sqlite.execute(sql, cleanParams as unknown[]);
          return { rows: [] };
        }

        const rawRows = await sqlite.select<Record<string, unknown>>(sql, cleanParams as unknown[]);
        // Belt-and-braces: scrub every cell so "undefined" never reaches Drizzle's JSON deserializer,
        // even when the SELECT-list regex below fails to extract column names cleanly.
        const rows: Record<string, unknown>[] = Array.isArray(rawRows) ? rawRows.map(sanitizeRow) : [];

        if (method === "get") {
          // Drizzle's mapGetResult treats a truthy `rows` value as a found row, so an empty
          // array would be mapped as a row of undefined cells (and crash JSON-column parsing).
          // Return `undefined` to signal "no row found".
          return { rows: rows.length > 0 ? rowValues(rows[0]!, sql) : undefined as unknown as unknown[] };
        }
        return { rows: rows.map(row => rowValues(row, sql)) };
      } catch (err) {
        throw new Error(
          `DB error [${method}]: ${err instanceof Error ? err.message : String(err)}\nSQL: ${sql}`,
        );
      }
    },
    { schema, logger: import.meta.env.DEV },
  );

  return _db;
}

export function resetDb(): void {
  _sqlite = null;
  _db = null;
}
