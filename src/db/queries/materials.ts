import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { materials, type Material, type NewMaterial } from "../schema";

export async function getAllMaterials(activeOnly = true): Promise<Material[]> {
  const db = await getDb();
  const q = db.select().from(materials).orderBy(materials.name);
  return activeOnly ? q.where(eq(materials.isActive, true)).all() : q.all();
}

export async function getMaterialById(id: string): Promise<Material | null> {
  const db = await getDb();
  return (await db.select().from(materials).where(eq(materials.id, id)).get()) ?? null;
}

export async function getMaterialsByCategory(category: string): Promise<Material[]> {
  const db = await getDb();
  return db.select().from(materials).where(eq(materials.category, category)).orderBy(materials.name).all();
}

export async function createMaterial(
  data: Omit<NewMaterial, "id" | "createdAt" | "updatedAt">,
): Promise<Material> {
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(materials).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getMaterialById(id))!;
}

export async function updateMaterial(
  id: string,
  data: Partial<Omit<NewMaterial, "id" | "createdAt" | "updatedAt">>,
): Promise<Material | null> {
  const db = await getDb();
  await db.update(materials).set({ ...data, updatedAt: new Date() }).where(eq(materials.id, id)).run();
  return getMaterialById(id);
}

export async function deleteMaterial(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(materials).where(eq(materials.id, id)).run();
}
