import { isTauriRuntime } from "./tauriRuntime";
import { getDb } from "../db/client";
import { quoteCadSources } from "../db/schema";
import { eq } from "drizzle-orm";
import { getQuoteCadSource, upsertQuoteCadSource } from "../db/queries/quote_cad_sources";
import Database from "@tauri-apps/plugin-sql";

const SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

export type QuoteWorkflowCadSource = {
  bytes: Uint8Array;
  fileName: string;
};

/**
 * Computes the SHA-256 hash of a Uint8Array of bytes.
 */
export async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Helper to convert Uint8Array bytes to base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

/**
 * Helper to convert base64 string to Uint8Array bytes.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Check if a file path is referenced by any other quote CAD source record.
 */
async function isFilePathReferenced(path: string, currentQuoteId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const results = await db.select()
      .from(quoteCadSources)
      .where(eq(quoteCadSources.filePath, path))
      .all();
    return results.some(r => r.quoteId !== currentQuoteId);
  } catch (error) {
    console.error("[cadSourceStore] Error checking file path reference:", error);
    return false;
  }
}

/**
 * Removes a file on disk if it is no longer referenced by any other quote.
 */
export async function removeDiskFileIfOrphan(path: string, currentQuoteId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const referenced = await isFilePathReferenced(path, currentQuoteId);
    if (!referenced) {
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(path);
      console.log(`[cadSourceStore] Removed orphan disk file: ${path}`);
    } else {
      console.log(`[cadSourceStore] File is still referenced by other quotes, keeping on disk: ${path}`);
    }
  } catch (error) {
    console.error(`[cadSourceStore] Failed to remove orphan disk file ${path}:`, error);
  }
}

/**
 * Stores a CAD source. Routes automatically to disk (if >5MB and in Tauri) or inline.
 */
export async function storeCadSource(quoteId: string, fileName: string, bytes: Uint8Array): Promise<void> {
  const hash = await computeSha256(bytes);
  const existing = await getQuoteCadSource(quoteId);

  // If there's an existing file path, check if it's different and clean up
  if (existing?.filePath) {
    await removeDiskFileIfOrphan(existing.filePath, quoteId);
  }

  const isLarge = bytes.length > SIZE_THRESHOLD;

  if (isLarge && isTauriRuntime()) {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");

    const storeDir = await join(await appDataDir(), "cad-sources");
    await mkdir(storeDir, { recursive: true });

    // Use SHA-256 hash as the filename on disk to deduplicate
    const filePath = await join(storeDir, hash);

    await writeFile(filePath, bytes);

    await upsertQuoteCadSource({
      quoteId,
      fileName,
      fileBytesBase64: null, // Clear DB blob
      filePath,
      fileSize: bytes.length,
      sha256: hash
    });
    console.log(`[cadSourceStore] Stored large file >5MB on disk at: ${filePath}`);
  } else {
    // Files smaller than 5 MB stay inline (or if not in Tauri, i.e. browser fallback)
    await upsertQuoteCadSource({
      quoteId,
      fileName,
      fileBytesBase64: bytesToBase64(bytes),
      filePath: null,
      fileSize: bytes.length,
      sha256: hash
    });
    console.log(`[cadSourceStore] Stored file <=5MB inline in DB (size: ${bytes.length})`);
  }
}

/**
 * Loads a CAD source by checking if it is stored on disk or inline.
 * Falls back gracefully to returning null if file is missing from disk.
 */
export async function loadCadSource(quoteId: string): Promise<QuoteWorkflowCadSource | null> {
  const row = await getQuoteCadSource(quoteId);
  if (!row) return null;

  // Case 1: Stored on disk
  if (row.filePath) {
    if (isTauriRuntime()) {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(row.filePath);
        return { bytes, fileName: row.fileName };
      } catch (error) {
        console.warn(`[cadSourceStore] File missing on disk at ${row.filePath} for quote ${quoteId}. Falling back gracefully.`, error);
        return null;
      }
    } else {
      console.warn(`[cadSourceStore] File path set but not running in Tauri: ${row.filePath}`);
      return null;
    }
  }

  // Case 2: Stored inline in DB
  if (row.fileBytesBase64) {
    try {
      const bytes = base64ToBytes(row.fileBytesBase64);
      return { bytes, fileName: row.fileName };
    } catch (error) {
      console.error(`[cadSourceStore] Failed to decode inline base64 bytes for quote ${quoteId}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Cleans up files associated with the CAD source of a quote when the quote is deleted.
 */
export async function deleteCadSourceFile(quoteId: string): Promise<void> {
  const existing = await getQuoteCadSource(quoteId);
  if (existing?.filePath) {
    await removeDiskFileIfOrphan(existing.filePath, quoteId);
  }
}

/**
 * Migration function to move any existing >5MB blobs from SQLite to the disk storage.
 * Shrinks database using VACUUM command afterwards.
 */
export async function migrateExistingBlobsToDisk(): Promise<{ migratedCount: number }> {
  if (!isTauriRuntime()) {
    return { migratedCount: 0 };
  }

  try {
    const db = await getDb();
    const rows = await db.select().from(quoteCadSources).all();
    let migratedCount = 0;

    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const storeDir = await join(await appDataDir(), "cad-sources");
    await mkdir(storeDir, { recursive: true });

    console.log(`[cadSourceStore] Running database migration scan on ${rows.length} quote_cad_sources records...`);

    for (const row of rows) {
      if (row.fileBytesBase64 && !row.filePath) {
        const bytes = base64ToBytes(row.fileBytesBase64);
        const size = bytes.length;
        const hash = row.sha256 || (await computeSha256(bytes));

        if (size > SIZE_THRESHOLD) {
          const filePath = await join(storeDir, hash);
          await writeFile(filePath, bytes);

          await db.update(quoteCadSources)
            .set({
              fileBytesBase64: null, // Clean up database size
              filePath,
              fileSize: size,
              sha256: hash
            })
            .where(eq(quoteCadSources.id, row.id))
            .run();

          migratedCount++;
          console.log(`[cadSourceStore] Migrated existing large blob (${(size / (1024 * 1024)).toFixed(2)} MB) to disk for quote ${row.quoteId}`);
        } else {
          // Backfill hash and size for small inline files if not present
          if (!row.fileSize || !row.sha256) {
            await db.update(quoteCadSources)
              .set({
                fileSize: size,
                sha256: hash
              })
              .where(eq(quoteCadSources.id, row.id))
              .run();
          }
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`[cadSourceStore] Migrated ${migratedCount} large blobs. Reclaiming database size via VACUUM...`);
      const sqlite = await Database.load("sqlite:quote.db");
      await sqlite.execute("VACUUM");
      console.log("[cadSourceStore] Database VACUUM completed.");
    }

    return { migratedCount };
  } catch (error) {
    console.error("[cadSourceStore] Error migrating existing CAD blobs:", error);
    return { migratedCount: 0 };
  }
}
