import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { quoteCadSources, type NewQuoteCadSource, type QuoteCadSource } from "../schema";

export async function getQuoteCadSource(quoteId: string): Promise<QuoteCadSource | null> {
  if (isBrowserDbFallback()) return browserDb.getQuoteCadSource(quoteId);
  const db = await getDb();
  return (await db.select().from(quoteCadSources).where(eq(quoteCadSources.quoteId, quoteId)).get()) ?? null;
}

export async function upsertQuoteCadSource(
  data: Omit<NewQuoteCadSource, "id" | "importedAt">,
): Promise<QuoteCadSource> {
  if (isBrowserDbFallback()) return browserDb.upsertQuoteCadSource(data);
  const db = await getDb();
  const existing = await getQuoteCadSource(data.quoteId);
  if (existing) {
    await db.update(quoteCadSources).set(data).where(eq(quoteCadSources.quoteId, data.quoteId)).run();
    return (await getQuoteCadSource(data.quoteId))!;
  }
  const id = crypto.randomUUID();
  await db.insert(quoteCadSources).values({ ...data, id, importedAt: new Date() }).run();
  return (await getQuoteCadSource(data.quoteId))!;
}

export async function deleteQuoteCadSource(quoteId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteQuoteCadSource(quoteId);
  const db = await getDb();
  await db.delete(quoteCadSources).where(eq(quoteCadSources.quoteId, quoteId)).run();
}
