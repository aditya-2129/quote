import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { recentFiles, type NewRecentFile, type RecentFile } from "../schema";

const MAX_RECENT = 50;

export async function getRecentFiles(limit = 20): Promise<RecentFile[]> {
  const db = await getDb();
  return db.select().from(recentFiles).orderBy(desc(recentFiles.lastOpenedAt)).limit(limit).all();
}

export async function getRecentFileByPath(path: string): Promise<RecentFile | null> {
  const db = await getDb();
  return (await db.select().from(recentFiles).where(eq(recentFiles.path, path)).get()) ?? null;
}

export async function upsertRecentFile(
  data: Omit<NewRecentFile, "id" | "createdAt" | "lastOpenedAt">,
): Promise<RecentFile> {
  const db = await getDb();
  const now = new Date();
  const existing = await getRecentFileByPath(data.path);
  if (existing) {
    await db.update(recentFiles)
      .set({ lastOpenedAt: now, thumbnail: data.thumbnail ?? existing.thumbnail })
      .where(eq(recentFiles.id, existing.id)).run();
  } else {
    await db.insert(recentFiles).values({ ...data, id: crypto.randomUUID(), lastOpenedAt: now, createdAt: now }).run();
    await pruneRecentFiles();
  }
  return (await getRecentFileByPath(data.path))!;
}

export async function deleteRecentFile(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(recentFiles).where(eq(recentFiles.id, id)).run();
}

export async function clearRecentFiles(): Promise<void> {
  const db = await getDb();
  await db.delete(recentFiles).run();
}

async function pruneRecentFiles(): Promise<void> {
  const db = await getDb();
  const all = await db.select({ id: recentFiles.id }).from(recentFiles).orderBy(desc(recentFiles.lastOpenedAt)).all();
  if (all.length > MAX_RECENT) {
    for (const { id } of all.slice(MAX_RECENT)) {
      await db.delete(recentFiles).where(eq(recentFiles.id, id)).run();
    }
  }
}
