-- Remove BOP part numbers from both catalog and per-quote snapshots.
-- Rebuild tables instead of ALTER DROP COLUMN so this migration works across
-- SQLite versions and against both old and freshly-created 0007 schemas.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS bop_catalog_new (
  id          TEXT    PRIMARY KEY NOT NULL,
  name        TEXT    NOT NULL,
  supplier    TEXT,
  unit_cost   REAL    NOT NULL DEFAULT 0,
  currency    TEXT    NOT NULL DEFAULT 'INR',
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO bop_catalog_new (
  id, name, supplier, unit_cost, currency, notes, created_at, updated_at
)
SELECT
  id, name, supplier, unit_cost, currency, notes, created_at, updated_at
FROM bop_catalog;

DROP TABLE bop_catalog;
ALTER TABLE bop_catalog_new RENAME TO bop_catalog;

CREATE TABLE IF NOT EXISTS quote_bops_new (
  id                TEXT    PRIMARY KEY NOT NULL,
  quote_id          TEXT    NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  catalog_id        TEXT    REFERENCES bop_catalog(id) ON DELETE SET NULL,
  name              TEXT    NOT NULL,
  supplier          TEXT,
  qty_per_assembly  INTEGER NOT NULL DEFAULT 1,
  unit_cost         REAL    NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO quote_bops_new (
  id, quote_id, catalog_id, name, supplier, qty_per_assembly,
  unit_cost, notes, sort_order, created_at, updated_at
)
SELECT
  id, quote_id, catalog_id, name, supplier, qty_per_assembly,
  unit_cost, notes, sort_order, created_at, updated_at
FROM quote_bops;

DROP TABLE quote_bops;
ALTER TABLE quote_bops_new RENAME TO quote_bops;

CREATE INDEX IF NOT EXISTS idx_quote_bops_quote_id ON quote_bops(quote_id);

PRAGMA foreign_keys = ON;
