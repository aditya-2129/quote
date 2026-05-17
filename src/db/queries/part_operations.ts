import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { partOperations, type NewPartOperation, type PartOperation } from "../schema";

export async function getOperationsByPart(partId: string): Promise<PartOperation[]> {
  if (isBrowserDbFallback()) return browserDb.getOperationsByPart(partId);
  const db = await getDb();
  return db.select().from(partOperations).where(eq(partOperations.partId, partId)).orderBy(asc(partOperations.sortOrder)).all();
}

export async function getOperationById(id: string): Promise<PartOperation | null> {
  if (isBrowserDbFallback()) return browserDb.getOperationById(id);
  const db = await getDb();
  return (await db.select().from(partOperations).where(eq(partOperations.id, id)).get()) ?? null;
}

export async function createOperation(
  data: Omit<NewPartOperation, "createdAt"> & { id?: string },
): Promise<PartOperation> {
  if (isBrowserDbFallback()) return browserDb.createOperation(data);
  const db = await getDb();
  const id = data.id ?? crypto.randomUUID();
  await db.insert(partOperations).values({ ...data, id, createdAt: new Date() }).run();
  return (await getOperationById(id))!;
}

export async function updateOperation(
  id: string,
  data: Partial<Omit<NewPartOperation, "id" | "partId" | "createdAt">>,
): Promise<PartOperation | null> {
  if (isBrowserDbFallback()) return browserDb.updateOperation(id, data);
  const db = await getDb();
  await db.update(partOperations).set(data).where(eq(partOperations.id, id)).run();
  return getOperationById(id);
}

export async function deleteOperation(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteOperation(id);
  const db = await getDb();
  await db.delete(partOperations).where(eq(partOperations.id, id)).run();
}

export async function deleteOperationsForPart(partId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteOperationsForPart(partId);
  const db = await getDb();
  await db.delete(partOperations).where(eq(partOperations.partId, partId)).run();
}

export async function reorderOperations(orderedIds: string[]): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.reorderOperations(orderedIds);
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(partOperations).set({ sortOrder: i }).where(eq(partOperations.id, orderedIds[i]!)).run();
  }
}
