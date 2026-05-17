import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { materials, type Material, type NewMaterial } from "../schema";

export async function getAllMaterials(activeOnly = true): Promise<Material[]> {
  if (isBrowserDbFallback()) return browserDb.getAllMaterials(activeOnly);
  const db = await getDb();
  const q = db.select().from(materials).orderBy(materials.name);
  return activeOnly ? q.where(eq(materials.isActive, true)).all() : q.all();
}

export async function getMaterialById(id: string): Promise<Material | null> {
  if (isBrowserDbFallback()) return browserDb.getMaterialById(id);
  const db = await getDb();
  return (await db.select().from(materials).where(eq(materials.id, id)).get()) ?? null;
}

export async function getMaterialsByCategory(category: string): Promise<Material[]> {
  if (isBrowserDbFallback()) return browserDb.getAllMaterials(false).filter(material => material.category === category);
  const db = await getDb();
  return db.select().from(materials).where(eq(materials.category, category)).orderBy(materials.name).all();
}

export async function createMaterial(
  data: Omit<NewMaterial, "id" | "createdAt" | "updatedAt">,
): Promise<Material> {
  if (isBrowserDbFallback()) return browserDb.createMaterial(data);
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(materials).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  const result = await getMaterialById(id);
  if (!result) throw new Error("Failed to retrieve material after insertion");
  return result;
}

export async function updateMaterial(
  id: string,
  data: Partial<Omit<NewMaterial, "id" | "createdAt" | "updatedAt">>,
): Promise<Material | null> {
  if (isBrowserDbFallback()) return browserDb.updateMaterial(id, data);
  const db = await getDb();
  await db.update(materials).set({ ...data, updatedAt: new Date() }).where(eq(materials.id, id)).run();
  return getMaterialById(id);
}

export async function deleteMaterial(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteMaterial(id);
  const db = await getDb();
  await db.delete(materials).where(eq(materials.id, id)).run();
}
