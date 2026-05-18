-- ─────────────────────────────────────────────
-- Quote Extra Costs
-- Fixed-roster extra cost rows added after tax (no margin / no tax).
-- Each quote gets exactly four rows keyed by code.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote_extra_costs (
  id          TEXT    PRIMARY KEY NOT NULL,
  quote_id    TEXT    NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  code        TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  amount      REAL    NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (quote_id, code)
);

CREATE INDEX IF NOT EXISTS idx_quote_extra_costs_quote_id ON quote_extra_costs(quote_id);

-- Backfill: every existing quote gets the four fixed rows at amount 0.
INSERT OR IGNORE INTO quote_extra_costs (id, quote_id, code, label, amount, sort_order)
SELECT lower(hex(randomblob(16))), q.id, 'stuffing_packing',     'Stuffing & Packing',          0, 0 FROM quotes q;
INSERT OR IGNORE INTO quote_extra_costs (id, quote_id, code, label, amount, sort_order)
SELECT lower(hex(randomblob(16))), q.id, 'shipping_delivery',    'Shipping/Delivery',           0, 1 FROM quotes q;
INSERT OR IGNORE INTO quote_extra_costs (id, quote_id, code, label, amount, sort_order)
SELECT lower(hex(randomblob(16))), q.id, 'design_engineering',   'Design & Engineering fee',    0, 2 FROM quotes q;
INSERT OR IGNORE INTO quote_extra_costs (id, quote_id, code, label, amount, sort_order)
SELECT lower(hex(randomblob(16))), q.id, 'assembly_testing',     'Final Assembly & Testing',    0, 3 FROM quotes q;
