import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { bopCatalog, type BopCatalogItem, type NewBopCatalogItem } from "../schema";

export async function getAllBopCatalog(): Promise<BopCatalogItem[]> {
  if (isBrowserDbFallback()) return browserDb.getAllBopCatalog();
  const db = await getDb();
  return db.select().from(bopCatalog).orderBy(bopCatalog.name).all();
}

export async function getBopCatalogById(id: string): Promise<BopCatalogItem | null> {
  if (isBrowserDbFallback()) return browserDb.getBopCatalogById(id);
  const db = await getDb();
  return (await db.select().from(bopCatalog).where(eq(bopCatalog.id, id)).get()) ?? null;
}

export async function createBopCatalog(
  data: Omit<NewBopCatalogItem, "id" | "createdAt" | "updatedAt">,
): Promise<BopCatalogItem> {
  if (isBrowserDbFallback()) return browserDb.createBopCatalog(data);
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(bopCatalog).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getBopCatalogById(id))!;
}

export async function updateBopCatalog(
  id: string,
  data: Partial<Omit<NewBopCatalogItem, "id" | "createdAt" | "updatedAt">>,
): Promise<BopCatalogItem | null> {
  if (isBrowserDbFallback()) return browserDb.updateBopCatalog(id, data);
  const db = await getDb();
  await db.update(bopCatalog).set({ ...data, updatedAt: new Date() }).where(eq(bopCatalog.id, id)).run();
  return getBopCatalogById(id);
}

export async function deleteBopCatalog(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteBopCatalog(id);
  const db = await getDb();
  await db.delete(bopCatalog).where(eq(bopCatalog.id, id)).run();
}
