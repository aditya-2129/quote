-- Migrate quote_cad_sources table to support storing large CAD STEP blobs in files on disk.
-- We use a rebuild-table pattern to make file_bytes_base64 nullable and add filePath, fileSize, sha256.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS quote_cad_sources_new (
  id                TEXT    PRIMARY KEY NOT NULL,
  quote_id          TEXT    NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
  file_name         TEXT    NOT NULL,
  file_bytes_base64 TEXT,  -- Nullable now!
  file_path         TEXT,  -- Path to file on disk (null if <= 5MB)
  file_size         INTEGER, -- Raw size in bytes
  sha256            TEXT,  -- SHA-256 hash of bytes
  imported_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Copy existing data to the new table
INSERT INTO quote_cad_sources_new (
  id,
  quote_id,
  file_name,
  file_bytes_base64,
  imported_at
)
SELECT
  id,
  quote_id,
  file_name,
  file_bytes_base64,
  imported_at
FROM quote_cad_sources;

DROP TABLE quote_cad_sources;
ALTER TABLE quote_cad_sources_new RENAME TO quote_cad_sources;

PRAGMA foreign_keys = ON;
