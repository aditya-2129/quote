import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type DbClient = ReturnType<typeof drizzle>;

let _sqlite: Database | null = null;
let _db: DbClient | null = null;

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
        // Tauri SQL plugin only accepts primitives — serialize Dates and JSON values
        const cleanParams = params.map(p => {
          if (p instanceof Date) return p.getTime();
          if (p !== null && typeof p === "object") return JSON.stringify(p);
          return p;
        });

        if (method === "run") {
          await sqlite.execute(sql, cleanParams as unknown[]);
          return { rows: [] };
        }

        const rawRows = await sqlite.select<Record<string, unknown>>(sql, cleanParams as unknown[]);
        const rows: Record<string, unknown>[] = Array.isArray(rawRows) ? rawRows : [];

        if (method === "get") {
          return { rows: rows.length > 0 ? Object.values(rows[0]) : [] };
        }
        return { rows: rows.map(row => Object.values(row)) };
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
