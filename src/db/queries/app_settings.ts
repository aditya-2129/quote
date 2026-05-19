import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { appSettings, type AppSetting, type AppSettingKey } from "../schema";

export async function getSetting(key: AppSettingKey): Promise<unknown | null> {
  if (isBrowserDbFallback()) return browserDb.getSetting(key);
  const db = await getDb();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

export async function getAllSettings(): Promise<Record<AppSettingKey, unknown>> {
  if (isBrowserDbFallback()) return browserDb.getAllSettings();
  const db = await getDb();
  const rows = await db.select().from(appSettings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<AppSettingKey, unknown>;
}

export async function setSetting(key: AppSettingKey, value: unknown): Promise<AppSetting> {
  if (isBrowserDbFallback()) return browserDb.setSetting(key, value);
  const db = await getDb();
  const now = new Date();
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now }).run();
  }
  return (await db.select().from(appSettings).where(eq(appSettings.key, key)).get())!;
}

export async function deleteSetting(key: AppSettingKey): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteSetting(key);
  const db = await getDb();
  await db.delete(appSettings).where(eq(appSettings.key, key)).run();
}
