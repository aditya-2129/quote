-- Drop the fabricated edge_count column from part_geometry.
-- The value was Math.round(faceCount * 1.5) — not real topology — and no
-- consumer reads it. Rebuild the table instead of ALTER DROP COLUMN so this
-- migration works across SQLite versions.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS part_geometry_new (
  id               TEXT    PRIMARY KEY NOT NULL,
  part_id          TEXT    NOT NULL UNIQUE REFERENCES parts(id) ON DELETE CASCADE,
  file_name        TEXT    NOT NULL,
  unit_system      TEXT    NOT NULL DEFAULT 'metric',
  bbox_x_mm        REAL    NOT NULL DEFAULT 0,
  bbox_y_mm        REAL    NOT NULL DEFAULT 0,
  bbox_z_mm        REAL    NOT NULL DEFAULT 0,
  volume_mm3       REAL    NOT NULL DEFAULT 0,
  surface_area_mm2 REAL    NOT NULL DEFAULT 0,
  face_count       INTEGER NOT NULL DEFAULT 0,
  vertex_count     INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO part_geometry_new (
  id, part_id, file_name, unit_system,
  bbox_x_mm, bbox_y_mm, bbox_z_mm,
  volume_mm3, surface_area_mm2,
  face_count, vertex_count, created_at
)
SELECT
  id, part_id, file_name, unit_system,
  bbox_x_mm, bbox_y_mm, bbox_z_mm,
  volume_mm3, surface_area_mm2,
  face_count, vertex_count, created_at
FROM part_geometry;

DROP TABLE part_geometry;
ALTER TABLE part_geometry_new RENAME TO part_geometry;

PRAGMA foreign_keys = ON;
