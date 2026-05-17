-- ─────────────────────────────────────────────
-- Brought-Out Parts (BOPs)
-- Catalog of reusable purchased items + per-quote BOP rows.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bop_catalog (
  id          TEXT    PRIMARY KEY NOT NULL,
  name        TEXT    NOT NULL,
  supplier    TEXT,
  unit_cost   REAL    NOT NULL DEFAULT 0,
  currency    TEXT    NOT NULL DEFAULT 'INR',
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS quote_bops (
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

CREATE INDEX IF NOT EXISTS idx_quote_bops_quote_id ON quote_bops(quote_id);
