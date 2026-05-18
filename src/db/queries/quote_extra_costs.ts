import { asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import {
  QUOTE_EXTRA_COST_ROSTER,
  quoteExtraCosts,
  type NewQuoteExtraCost,
  type QuoteExtraCost,
  type QuoteExtraCostCode,
} from "../schema";

export async function getQuoteExtraCostsByQuote(quoteId: string): Promise<QuoteExtraCost[]> {
  if (isBrowserDbFallback()) return browserDb.getQuoteExtraCostsByQuote(quoteId);
  const db = await getDb();
  return db
    .select()
    .from(quoteExtraCosts)
    .where(eq(quoteExtraCosts.quoteId, quoteId))
    .orderBy(asc(quoteExtraCosts.sortOrder))
    .all();
}

export async function upsertQuoteExtraCost(
  data: Omit<NewQuoteExtraCost, "createdAt" | "updatedAt"> & { id?: string },
): Promise<QuoteExtraCost> {
  if (isBrowserDbFallback()) return browserDb.upsertQuoteExtraCost(data);
  const db = await getDb();
  const existing = await db
    .select()
    .from(quoteExtraCosts)
    .where(eq(quoteExtraCosts.quoteId, data.quoteId))
    .all();
  const match = existing.find((row) => row.code === data.code);
  const now = new Date();
  if (match) {
    await db
      .update(quoteExtraCosts)
      .set({ label: data.label, amount: data.amount ?? 0, sortOrder: data.sortOrder ?? 0, updatedAt: now })
      .where(eq(quoteExtraCosts.id, match.id))
      .run();
    return (await db.select().from(quoteExtraCosts).where(eq(quoteExtraCosts.id, match.id)).get())!;
  }
  const id = data.id ?? crypto.randomUUID();
  await db
    .insert(quoteExtraCosts)
    .values({ ...data, id, createdAt: now, updatedAt: now })
    .run();
  return (await db.select().from(quoteExtraCosts).where(eq(quoteExtraCosts.id, id)).get())!;
}

export async function ensureQuoteExtraCostRoster(quoteId: string): Promise<QuoteExtraCost[]> {
  const existing = await getQuoteExtraCostsByQuote(quoteId);
  const byCode = new Map(existing.map((row) => [row.code as QuoteExtraCostCode, row]));
  for (const entry of QUOTE_EXTRA_COST_ROSTER) {
    if (!byCode.has(entry.code)) {
      await upsertQuoteExtraCost({
        quoteId,
        code: entry.code,
        label: entry.label,
        amount: 0,
        sortOrder: entry.sortOrder,
      });
    }
  }
  return getQuoteExtraCostsByQuote(quoteId);
}

export async function deleteQuoteExtraCostsForQuote(quoteId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteQuoteExtraCostsForQuote(quoteId);
  const db = await getDb();
  await db.delete(quoteExtraCosts).where(eq(quoteExtraCosts.quoteId, quoteId)).run();
}
