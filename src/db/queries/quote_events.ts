import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { quoteEvents, type NewQuoteEvent, type QuoteEvent } from "../schema";

export async function getEventsByQuote(quoteId: string, limit = 100): Promise<QuoteEvent[]> {
  if (isBrowserDbFallback()) return browserDb.getEventsByQuote(quoteId, limit);
  const db = await getDb();
  return db
    .select()
    .from(quoteEvents)
    .where(eq(quoteEvents.quoteId, quoteId))
    .orderBy(desc(quoteEvents.createdAt))
    .limit(limit)
    .all();
}

export async function logQuoteEvent(
  data: Omit<NewQuoteEvent, "id" | "createdAt">,
): Promise<QuoteEvent> {
  if (isBrowserDbFallback()) return browserDb.logQuoteEvent(data);
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(quoteEvents).values({ ...data, id, createdAt: new Date() }).run();
  return (await db.select().from(quoteEvents).where(eq(quoteEvents.id, id)).get())!;
}

export async function deleteEventsForQuote(quoteId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteEventsForQuote(quoteId);
  const db = await getDb();
  await db.delete(quoteEvents).where(eq(quoteEvents.quoteId, quoteId)).run();
}
