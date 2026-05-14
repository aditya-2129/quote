import { asc, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../client";
import { quotes, type NewQuote, type Quote, type QuoteStatus } from "../schema";

export async function getAllQuotes(): Promise<Quote[]> {
  const db = await getDb();
  return db.select().from(quotes).orderBy(desc(quotes.createdAt)).all();
}

export async function getQuoteById(id: string): Promise<Quote | null> {
  const db = await getDb();
  return (await db.select().from(quotes).where(eq(quotes.id, id)).get()) ?? null;
}

export async function getQuotesByCustomer(customerId: string): Promise<Quote[]> {
  const db = await getDb();
  return db.select().from(quotes).where(eq(quotes.customerId, customerId)).orderBy(desc(quotes.createdAt)).all();
}

export async function getQuotesByStatus(status: QuoteStatus): Promise<Quote[]> {
  const db = await getDb();
  return db.select().from(quotes).where(eq(quotes.status, status)).orderBy(desc(quotes.createdAt)).all();
}

export async function getQuotesByRfq(rfqId: string): Promise<Quote[]> {
  const db = await getDb();
  return db.select().from(quotes).where(eq(quotes.rfqId, rfqId)).orderBy(desc(quotes.createdAt)).all();
}

/** All revisions in a chain, oldest first. Pass any quote id from the chain. */
export async function getRevisionChain(quoteId: string): Promise<Quote[]> {
  const db = await getDb();
  const quote = await getQuoteById(quoteId);
  if (!quote) return [];
  const rootId = quote.parentQuoteId ?? quote.id;
  return db
    .select()
    .from(quotes)
    .where(or(eq(quotes.id, rootId), eq(quotes.parentQuoteId, rootId)))
    .orderBy(asc(quotes.createdAt))
    .all();
}

/** Root revisions only (parent_quote_id IS NULL) — for list views that should not show every revision. */
export async function getRootQuotes(): Promise<Quote[]> {
  const db = await getDb();
  return db.select().from(quotes).where(isNull(quotes.parentQuoteId)).orderBy(desc(quotes.createdAt)).all();
}

export async function createQuote(
  data: Omit<NewQuote, "id" | "createdAt" | "updatedAt">,
): Promise<Quote> {
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(quotes).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getQuoteById(id))!;
}

export async function updateQuote(
  id: string,
  data: Partial<Omit<NewQuote, "id" | "createdAt" | "updatedAt">>,
): Promise<Quote | null> {
  const db = await getDb();
  await db.update(quotes).set({ ...data, updatedAt: new Date() }).where(eq(quotes.id, id)).run();
  return getQuoteById(id);
}

export async function updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote | null> {
  return updateQuote(id, { status });
}

export async function deleteQuote(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(quotes).where(eq(quotes.id, id)).run();
}
