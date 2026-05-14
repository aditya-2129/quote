import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { parts, type NewPart, type Part } from "../schema";

export async function getPartsByQuote(quoteId: string): Promise<Part[]> {
  const db = await getDb();
  return db.select().from(parts).where(eq(parts.quoteId, quoteId)).orderBy(asc(parts.sortOrder)).all();
}

export async function getPartById(id: string): Promise<Part | null> {
  const db = await getDb();
  return (await db.select().from(parts).where(eq(parts.id, id)).get()) ?? null;
}

export async function createPart(
  data: Omit<NewPart, "id" | "createdAt" | "updatedAt">,
): Promise<Part> {
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(parts).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getPartById(id))!;
}

export async function updatePart(
  id: string,
  data: Partial<Omit<NewPart, "id" | "createdAt" | "updatedAt">>,
): Promise<Part | null> {
  const db = await getDb();
  await db.update(parts).set({ ...data, updatedAt: new Date() }).where(eq(parts.id, id)).run();
  return getPartById(id);
}

export async function deletePart(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(parts).where(eq(parts.id, id)).run();
}

export async function reorderParts(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(parts).set({ sortOrder: i }).where(eq(parts.id, orderedIds[i]!)).run();
  }
}
