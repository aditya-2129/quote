import { and, eq } from "drizzle-orm";
import { getDb, type DbClient } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { partFeatures, type PartFeatureInput, type StoredPartFeature } from "../schema";

// Either the top-level client or a transaction handle passed in by the caller.
// Tests substitute mocks via the same parameter.
type DbOrTx = DbClient | Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export async function getFeaturesForPart(
  partId: string,
  db?: DbOrTx,
): Promise<StoredPartFeature[]> {
  if (isBrowserDbFallback()) {
    return browserDb.getFeaturesForPart(partId);
  }

  const clientDb = db || (await getDb());
  const rows = await clientDb
    .select()
    .from(partFeatures)
    .where(eq(partFeatures.partId, partId))
    .all();

  return rows.map((row) => ({
    id: row.id,
    partId: row.partId,
    featureType: row.featureType,
    featureData: JSON.parse(row.featureData),
    faceIds: JSON.parse(row.faceIds),
    createdAt: row.createdAt,
  }));
}

export async function replaceFeaturesForPart(
  partId: string,
  features: PartFeatureInput[],
  db?: DbOrTx,
): Promise<void> {
  if (isBrowserDbFallback()) {
    return browserDb.replaceFeaturesForPart(partId, features);
  }

  const clientDb = db || (await getDb());

  const runReplacement = async (tx: DbOrTx) => {
    // Delete all existing features for this part
    await tx.delete(partFeatures).where(eq(partFeatures.partId, partId)).run();

    // Insert new features if there are any
    if (features.length > 0) {
      const now = Date.now();
      const values = features.map((f) => ({
        partId,
        featureType: f.featureType,
        featureData: JSON.stringify(f.featureData),
        faceIds: JSON.stringify(f.faceIds),
        createdAt: now,
      }));
      // Note: SQLite batch inserts are supported inside Drizzle.
      await tx.insert(partFeatures).values(values).run();
    }
  };

  if (db) {
    // If a transaction/db object was explicitly passed in, use it directly
    await runReplacement(db);
  } else {
    // Otherwise, execute in a transaction on the client db
    await (clientDb as DbClient).transaction(async (tx) => {
      await runReplacement(tx);
    });
  }
}

export async function countFeatures(
  partId: string,
  featureType?: string,
  db?: DbOrTx,
): Promise<number> {
  if (isBrowserDbFallback()) {
    return browserDb.countFeatures(partId, featureType);
  }

  const clientDb = db || (await getDb());
  let query = clientDb
    .select()
    .from(partFeatures)
    .where(eq(partFeatures.partId, partId));

  if (featureType) {
    query = clientDb
      .select()
      .from(partFeatures)
      .where(and(eq(partFeatures.partId, partId), eq(partFeatures.featureType, featureType)));
  }

  const rows = await query.all();
  return rows.length;
}
