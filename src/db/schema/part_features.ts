import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { parts } from "./parts";
import type { Hole } from "../../utils/features/holes";
import type { Pocket } from "../../utils/features/pockets";
import type { Slot } from "../../utils/features/slots";
import type { Fillet } from "../../utils/features/fillets";
import type { Chamfer } from "../../utils/features/chamfers";
import type { Thread } from "../../utils/features/threads";
import type { Boss } from "../../utils/features/bosses";

export const partFeatures = sqliteTable("part_features", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: text("part_id")
    .notNull()
    .references(() => parts.id, { onDelete: "cascade" }),
  featureType: text("feature_type").notNull(), // enum string: hole|pocket|slot|fillet|chamfer|thread|boss
  featureData: text("feature_data").notNull(), // JSON-stringified payload
  faceIds: text("face_ids").notNull(),         // JSON array of topology face ID strings
  createdAt: integer("created_at").notNull(),  // unix millis
});

export type PartFeature = typeof partFeatures.$inferSelect;
export type NewPartFeature = typeof partFeatures.$inferInsert;

export type PartFeatureData = Hole | Pocket | Slot | Fillet | Chamfer | Thread | Boss;

export interface PartFeatureInput {
  featureType: string;
  featureData: PartFeatureData;
  faceIds: string[];
}

export interface StoredPartFeature {
  id: number;
  partId: string;
  featureType: string;
  featureData: PartFeatureData;
  faceIds: string[];
  createdAt: number;
}
