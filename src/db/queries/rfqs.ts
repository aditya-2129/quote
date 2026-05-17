import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { rfqs, type NewRfq, type Rfq, type RfqStatus } from "../schema";

export async function getAllRfqs(): Promise<Rfq[]> {
  if (isBrowserDbFallback()) return browserDb.getAllRfqs();
  const db = await getDb();
  return db.select().from(rfqs).orderBy(desc(rfqs.receivedAt)).all();
}

export async function getRfqById(id: string): Promise<Rfq | null> {
  if (isBrowserDbFallback()) return browserDb.getRfqById(id);
  const db = await getDb();
  return (await db.select().from(rfqs).where(eq(rfqs.id, id)).get()) ?? null;
}

export async function getRfqsByCustomer(customerId: string): Promise<Rfq[]> {
  if (isBrowserDbFallback()) return browserDb.getRfqsByCustomer(customerId);
  const db = await getDb();
  return db.select().from(rfqs).where(eq(rfqs.customerId, customerId)).orderBy(desc(rfqs.receivedAt)).all();
}

export async function getRfqsByStatus(status: RfqStatus): Promise<Rfq[]> {
  if (isBrowserDbFallback()) return browserDb.getRfqsByStatus(status);
  const db = await getDb();
  return db.select().from(rfqs).where(eq(rfqs.status, status)).orderBy(desc(rfqs.receivedAt)).all();
}

export async function createRfq(
  data: Omit<NewRfq, "id" | "createdAt" | "updatedAt">,
): Promise<Rfq> {
  if (isBrowserDbFallback()) return browserDb.createRfq(data);
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(rfqs).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getRfqById(id))!;
}

export async function updateRfq(
  id: string,
  data: Partial<Omit<NewRfq, "id" | "createdAt" | "updatedAt">>,
): Promise<Rfq | null> {
  if (isBrowserDbFallback()) return browserDb.updateRfq(id, data);
  const db = await getDb();
  await db.update(rfqs).set({ ...data, updatedAt: new Date() }).where(eq(rfqs.id, id)).run();
  return getRfqById(id);
}

export async function updateRfqStatus(id: string, status: RfqStatus): Promise<Rfq | null> {
  return updateRfq(id, { status });
}

export async function deleteRfq(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteRfq(id);
  const db = await getDb();
  await db.delete(rfqs).where(eq(rfqs.id, id)).run();
}
