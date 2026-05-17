import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { partGeometry, type NewPartGeometry, type PartGeometry } from "../schema";

export async function getPartGeometry(partId: string): Promise<PartGeometry | null> {
  if (isBrowserDbFallback()) return browserDb.getPartGeometry(partId);
  const db = await getDb();
  return (await db.select().from(partGeometry).where(eq(partGeometry.partId, partId)).get()) ?? null;
}

export async function upsertPartGeometry(
  data: Omit<NewPartGeometry, "id" | "createdAt">,
): Promise<PartGeometry> {
  if (isBrowserDbFallback()) return browserDb.upsertPartGeometry(data);
  const db = await getDb();
  const existing = await getPartGeometry(data.partId);
  if (existing) {
    await db.update(partGeometry).set(data).where(eq(partGeometry.partId, data.partId)).run();
    return (await getPartGeometry(data.partId))!;
  }
  const id = crypto.randomUUID();
  await db.insert(partGeometry).values({ ...data, id, createdAt: new Date() }).run();
  return (await getPartGeometry(data.partId))!;
}

export async function deletePartGeometry(partId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deletePartGeometry(partId);
  const db = await getDb();
  await db.delete(partGeometry).where(eq(partGeometry.partId, partId)).run();
}
