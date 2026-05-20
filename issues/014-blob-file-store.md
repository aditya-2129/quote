# 014 — Large STEP blob → file-based store

**Type:** AFK
Status: ready-for-agent

## What to build

Currently `quote_cad_sources` stores base64-encoded STEP bytes inside SQLite. This bloats the DB and slows queries. Migrate large blobs (>5 MB) to file storage under the Tauri app-data dir, keyed by SHA-256. SQLite row keeps only the file path + size + hash.

Files smaller than 5 MB stay inline (avoid file-system overhead for tiny parts).

## Acceptance criteria

- [ ] Migration moves existing >5 MB blobs to disk
- [ ] New imports route automatically based on size threshold
- [ ] Orphan cleanup: on quote delete, blob file is removed
- [ ] File missing on disk falls back to re-import flow gracefully (no crash)
- [ ] DB size reduced on a test corpus of large quotes (verify in logs)

## Blocked by

- #011 (worker integration so the import path is already async)
