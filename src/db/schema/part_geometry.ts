import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { parts } from "./parts";

export type UnitSystem = "metric" | "imperial";

export const partGeometry = sqliteTable("part_geometry", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partId: text("part_id").notNull().unique().references(() => parts.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  unitSystem: text("unit_system").$type<UnitSystem>().notNull().default("metric"),
  bboxXMm: real("bbox_x_mm").notNull().default(0),
  bboxYMm: real("bbox_y_mm").notNull().default(0),
  bboxZMm: real("bbox_z_mm").notNull().default(0),
  volumeMm3: real("volume_mm3").notNull().default(0),
  surfaceAreaMm2: real("surface_area_mm2").notNull().default(0),
  faceCount: integer("face_count").notNull().default(0),
  vertexCount: integer("vertex_count").notNull().default(0),
  fingerprintHash: text("fingerprint_hash"),
  triangleCount: integer("triangle_count"),
  shapeKind: text("shape_kind"),
  shapeParams: text("shape_params"),
  faceColors: text("face_colors"),
  meshBlobPath: text("mesh_blob_path"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type PartGeometry    = typeof partGeometry.$inferSelect;
export type NewPartGeometry = typeof partGeometry.$inferInsert;
