-- ─────────────────────────────────────────────
-- Lookup tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT    PRIMARY KEY NOT NULL,
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  company     TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Material library (aluminum, steel, brass, purchased stock…)
CREATE TABLE IF NOT EXISTS materials (
  id                  TEXT    PRIMARY KEY NOT NULL,
  name                TEXT    NOT NULL,
  density_kg_per_m3   REAL    NOT NULL DEFAULT 0,
  cost_per_kg         REAL    NOT NULL DEFAULT 0,
  currency            TEXT    NOT NULL DEFAULT 'USD',
  markup_percent      REAL    NOT NULL DEFAULT 0,
  machinability       INTEGER NOT NULL DEFAULT 3,   -- 1 (hard) – 5 (easy)
  color_hex           TEXT    NOT NULL DEFAULT '#888888',
  category            TEXT,                          -- "Metal", "Plastic", "Purchased"
  available_forms     TEXT    NOT NULL DEFAULT '[]', -- JSON: ["plate","bar","tube"]
  notes               TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  is_system           INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Machine / process library
CREATE TABLE IF NOT EXISTS machines (
  id            TEXT    PRIMARY KEY NOT NULL,
  name          TEXT    NOT NULL,
  short_name    TEXT    NOT NULL,
  rate_per_hour REAL    NOT NULL DEFAULT 0,
  category      TEXT    NOT NULL DEFAULT 'mill',  -- mill | lathe | grind | edm | hand | inspect
  notes         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_system     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- RFQ workflow
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfqs (
  id                TEXT    PRIMARY KEY NOT NULL,
  customer_id       TEXT    REFERENCES customers(id) ON DELETE SET NULL,
  title             TEXT    NOT NULL,
  reference_number  TEXT    UNIQUE,
  description       TEXT,
  -- new | reviewing | quoted | accepted | rejected | closed
  status            TEXT    NOT NULL DEFAULT 'new',
  received_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  due_date          INTEGER,
  notes             TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- Quotes + BOM
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotes (
  id                TEXT    PRIMARY KEY NOT NULL,
  rfq_id            TEXT    REFERENCES rfqs(id) ON DELETE SET NULL,
  customer_id       TEXT    REFERENCES customers(id) ON DELETE SET NULL,
  -- For revision chains: e.g. rev "C" of parent_quote_id <root>
  parent_quote_id   TEXT    REFERENCES quotes(id) ON DELETE SET NULL,
  revision          TEXT    NOT NULL DEFAULT 'A',
  title             TEXT    NOT NULL,
  quote_number      TEXT,                              -- shared across revisions; (number, revision) is unique below
  -- draft | review | sent | won | lost | expired
  status            TEXT    NOT NULL DEFAULT 'draft',
  assembly_quantity INTEGER NOT NULL DEFAULT 1,
  -- JSON array of qty breakpoints, e.g. [1,10,25,100,250]
  quantity_breaks   TEXT    NOT NULL DEFAULT '[1,10,25,100,250]',
  currency          TEXT    NOT NULL DEFAULT 'EUR',
  tooling_cost      REAL    NOT NULL DEFAULT 0,
  inspection_cost   REAL    NOT NULL DEFAULT 0,
  margin_percent    REAL    NOT NULL DEFAULT 0,
  tax_percent       REAL    NOT NULL DEFAULT 0,
  discount_percent  REAL    NOT NULL DEFAULT 0,
  cost_snapshot     TEXT,                              -- JSON, populated when quote is sent/finalised
  notes             TEXT,
  valid_until       INTEGER,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (quote_number, revision)
);

-- Individual parts / BOM lines within a quote
CREATE TABLE IF NOT EXISTS parts (
  id             TEXT    PRIMARY KEY NOT NULL,
  quote_id       TEXT    NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  material_id    TEXT    REFERENCES materials(id) ON DELETE SET NULL,
  color_hex      TEXT    NOT NULL DEFAULT '#888888',
  per_assembly   INTEGER NOT NULL DEFAULT 1,
  mass_kg        REAL    NOT NULL DEFAULT 0,
  finishing_cost REAL    NOT NULL DEFAULT 0,
  is_included    INTEGER NOT NULL DEFAULT 1,
  is_stocked     INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS part_stock (
  id         TEXT    PRIMARY KEY NOT NULL,
  part_id    TEXT    NOT NULL UNIQUE REFERENCES parts(id) ON DELETE CASCADE,
  shape      TEXT    NOT NULL DEFAULT 'plate',  -- plate | block | round-bar | square-bar | tube
  dims       TEXT    NOT NULL DEFAULT '{}',     -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS part_operations (
  id         TEXT    PRIMARY KEY NOT NULL,
  part_id    TEXT    NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  machine_id TEXT    REFERENCES machines(id) ON DELETE SET NULL,
  setup_min  REAL    NOT NULL DEFAULT 0,
  cycle_min  REAL    NOT NULL DEFAULT 0,
  notes      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- DFM / design review
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dfm_issues (
  id            TEXT    PRIMARY KEY NOT NULL,
  part_id       TEXT    NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  severity      TEXT    NOT NULL DEFAULT 'info',  -- error | warn | info
  title         TEXT    NOT NULL,
  description   TEXT,
  impact_cost   REAL    NOT NULL DEFAULT 0,
  suggestion    TEXT,
  is_actionable INTEGER NOT NULL DEFAULT 0,
  is_dismissed  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- CAD geometry cache
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS part_geometry (
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
  edge_count       INTEGER NOT NULL DEFAULT 0,
  vertex_count     INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- Activity log + notifications
-- ─────────────────────────────────────────────

-- Append-only audit trail for quote lifecycle events
CREATE TABLE IF NOT EXISTS quote_events (
  id         TEXT    PRIMARY KEY NOT NULL,
  quote_id   TEXT    NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  -- created | status_changed | updated | sent | viewed | revision_created | note_added | dfm_resolved
  event_type TEXT    NOT NULL,
  payload    TEXT,   -- JSON: e.g. {"from":"draft","to":"sent"}
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT    PRIMARY KEY NOT NULL,
  -- rfq_new | quote_status | dfm_alert | system
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  body       TEXT,
  -- Optional deep link, e.g. "quote://<id>" or "rfq://<id>"
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─────────────────────────────────────────────
-- Files & app config
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recent_files (
  id             TEXT    PRIMARY KEY NOT NULL,
  name           TEXT    NOT NULL,
  path           TEXT    NOT NULL UNIQUE,
  file_type      TEXT    NOT NULL,
  size           INTEGER,
  thumbnail      TEXT,
  last_opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT    PRIMARY KEY NOT NULL,
  value      TEXT    NOT NULL DEFAULT 'null',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
