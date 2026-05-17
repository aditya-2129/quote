-- Persist the original STEP file per quote so the 3D preview can re-render
-- after a reload (the in-memory CAD scene is lost on refresh otherwise).
CREATE TABLE IF NOT EXISTS quote_cad_sources (
  id                TEXT    PRIMARY KEY NOT NULL,
  quote_id          TEXT    NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
  file_name         TEXT    NOT NULL,
  file_bytes_base64 TEXT    NOT NULL,
  imported_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
