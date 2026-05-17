import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { quoteBops, type NewQuoteBop, type QuoteBop } from "../schema";

export async function getQuoteBopsByQuote(quoteId: string): Promise<QuoteBop[]> {
  if (isBrowserDbFallback()) return browserDb.getQuoteBopsByQuote(quoteId);
  const db = await getDb();
  return db.select().from(quoteBops).where(eq(quoteBops.quoteId, quoteId)).orderBy(asc(quoteBops.sortOrder)).all();
}

export async function getQuoteBopById(id: string): Promise<QuoteBop | null> {
  if (isBrowserDbFallback()) return browserDb.getQuoteBopById(id);
  const db = await getDb();
  return (await db.select().from(quoteBops).where(eq(quoteBops.id, id)).get()) ?? null;
}

export async function createQuoteBop(
  data: Omit<NewQuoteBop, "createdAt" | "updatedAt"> & { id?: string },
): Promise<QuoteBop> {
  if (isBrowserDbFallback()) return browserDb.createQuoteBop(data);
  const db = await getDb();
  const now = new Date();
  const id = data.id ?? crypto.randomUUID();
  await db.insert(quoteBops).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getQuoteBopById(id))!;
}

export async function updateQuoteBop(
  id: string,
  data: Partial<Omit<NewQuoteBop, "id" | "createdAt" | "updatedAt">>,
): Promise<QuoteBop | null> {
  if (isBrowserDbFallback()) return browserDb.updateQuoteBop(id, data);
  const db = await getDb();
  await db.update(quoteBops).set({ ...data, updatedAt: new Date() }).where(eq(quoteBops.id, id)).run();
  return getQuoteBopById(id);
}

export async function deleteQuoteBop(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteQuoteBop(id);
  const db = await getDb();
  await db.delete(quoteBops).where(eq(quoteBops.id, id)).run();
}

export async function deleteQuoteBopsForQuote(quoteId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteQuoteBopsForQuote(quoteId);
  const db = await getDb();
  await db.delete(quoteBops).where(eq(quoteBops.quoteId, quoteId)).run();
}
