import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { partStock, type NewPartStock, type PartStock } from "../schema";

export async function getPartStock(partId: string): Promise<PartStock | null> {
  const db = await getDb();
  return (await db.select().from(partStock).where(eq(partStock.partId, partId)).get()) ?? null;
}

export async function upsertPartStock(
  data: Omit<NewPartStock, "id" | "createdAt">,
): Promise<PartStock> {
  const db = await getDb();
  const existing = await getPartStock(data.partId);
  if (existing) {
    await db.update(partStock).set({ shape: data.shape, dims: data.dims }).where(eq(partStock.partId, data.partId)).run();
    return (await getPartStock(data.partId))!;
  }
  const id = crypto.randomUUID();
  await db.insert(partStock).values({ ...data, id, createdAt: new Date() }).run();
  return (await getPartStock(data.partId))!;
}

export async function deletePartStock(partId: string): Promise<void> {
  const db = await getDb();
  await db.delete(partStock).where(eq(partStock.partId, partId)).run();
}
