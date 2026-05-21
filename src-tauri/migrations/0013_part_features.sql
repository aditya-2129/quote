-- Create the part_features table to persist BREP-detected features per part.
CREATE TABLE IF NOT EXISTS part_features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id       TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  feature_type  TEXT NOT NULL,  -- enum string: hole|pocket|slot|fillet|chamfer|thread|boss
  feature_data  TEXT NOT NULL,  -- JSON-stringified type-specific payload
  face_ids      TEXT NOT NULL,  -- JSON array of topology face ID strings
  created_at    INTEGER NOT NULL -- unix millis
);

CREATE INDEX IF NOT EXISTS idx_part_features_part_type ON part_features(part_id, feature_type);
