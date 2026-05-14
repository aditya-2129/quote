import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { partOperations, type NewPartOperation, type PartOperation } from "../schema";

export async function getOperationsByPart(partId: string): Promise<PartOperation[]> {
  const db = await getDb();
  return db.select().from(partOperations).where(eq(partOperations.partId, partId)).orderBy(asc(partOperations.sortOrder)).all();
}

export async function getOperationById(id: string): Promise<PartOperation | null> {
  const db = await getDb();
  return (await db.select().from(partOperations).where(eq(partOperations.id, id)).get()) ?? null;
}

export async function createOperation(
  data: Omit<NewPartOperation, "id" | "createdAt">,
): Promise<PartOperation> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(partOperations).values({ ...data, id, createdAt: new Date() }).run();
  return (await getOperationById(id))!;
}

export async function updateOperation(
  id: string,
  data: Partial<Omit<NewPartOperation, "id" | "partId" | "createdAt">>,
): Promise<PartOperation | null> {
  const db = await getDb();
  await db.update(partOperations).set(data).where(eq(partOperations.id, id)).run();
  return getOperationById(id);
}

export async function deleteOperation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(partOperations).where(eq(partOperations.id, id)).run();
}

export async function reorderOperations(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(partOperations).set({ sortOrder: i }).where(eq(partOperations.id, orderedIds[i]!)).run();
  }
}
