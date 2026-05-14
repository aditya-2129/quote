import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { partGeometry, type NewPartGeometry, type PartGeometry } from "../schema";

export async function getPartGeometry(partId: string): Promise<PartGeometry | null> {
  const db = await getDb();
  return (await db.select().from(partGeometry).where(eq(partGeometry.partId, partId)).get()) ?? null;
}

export async function upsertPartGeometry(
  data: Omit<NewPartGeometry, "id" | "createdAt">,
): Promise<PartGeometry> {
  const db = await getDb();
  const existing = await getPartGeometry(data.partId);
  const { partId: _, ...rest } = data;
  if (existing) {
    await db.update(partGeometry).set(rest).where(eq(partGeometry.partId, data.partId)).run();
    return (await getPartGeometry(data.partId))!;
  }
  const id = crypto.randomUUID();
  await db.insert(partGeometry).values({ ...data, id, createdAt: new Date() }).run();
  return (await getPartGeometry(data.partId))!;
}

export async function deletePartGeometry(partId: string): Promise<void> {
  const db = await getDb();
  await db.delete(partGeometry).where(eq(partGeometry.partId, partId)).run();
}
