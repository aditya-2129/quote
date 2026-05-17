import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { dfmIssues, type DfmIssue, type DfmSeverity, type NewDfmIssue } from "../schema";

export async function getDfmIssuesByPart(partId: string): Promise<DfmIssue[]> {
  if (isBrowserDbFallback()) return browserDb.getDfmIssuesByPart(partId);
  const db = await getDb();
  return db.select().from(dfmIssues).where(eq(dfmIssues.partId, partId)).all();
}

export async function getDfmIssuesBySeverity(partId: string, severity: DfmSeverity): Promise<DfmIssue[]> {
  if (isBrowserDbFallback()) return browserDb.getDfmIssuesBySeverity(partId, severity);
  const db = await getDb();
  return db.select().from(dfmIssues).where(eq(dfmIssues.partId, partId)).all()
    .then((rows) => rows.filter((r) => r.severity === severity));
}

export async function createDfmIssue(
  data: Omit<NewDfmIssue, "createdAt"> & { id?: string },
): Promise<DfmIssue> {
  if (isBrowserDbFallback()) return browserDb.createDfmIssue(data);
  const db = await getDb();
  const id = data.id ?? crypto.randomUUID();
  const now = new Date();
  await db.insert(dfmIssues).values({ ...data, id, createdAt: now }).run();
  return (await db.select().from(dfmIssues).where(eq(dfmIssues.id, id)).get())!;
}

export async function dismissDfmIssue(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.dismissDfmIssue(id);
  const db = await getDb();
  await db.update(dfmIssues).set({ isDismissed: true }).where(eq(dfmIssues.id, id)).run();
}

export async function deleteDfmIssue(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteDfmIssue(id);
  const db = await getDb();
  await db.delete(dfmIssues).where(eq(dfmIssues.id, id)).run();
}

export async function clearDfmIssuesForPart(partId: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.clearDfmIssuesForPart(partId);
  const db = await getDb();
  await db.delete(dfmIssues).where(eq(dfmIssues.partId, partId)).run();
}
