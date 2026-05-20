# 012 — Extend part_geometry schema with fingerprint and classification cache

**Type:** AFK
Status: ready-for-agent

## What to build

`src/db/schema/part_geometry.ts` currently caches bbox + volume + face/edge/vertex counts only. Extend to cache the expensive derived data:

- `fingerprint_hash` (radial signature digest, TEXT)
- `triangle_count`, `vertex_count` (INT)
- `shape_kind` (TEXT: cylinder/hex/box)
- `shape_params` (JSON: dimensions per kind)
- `face_colors` (JSON: per-face color array)
- `mesh_blob_path` (TEXT, nullable — for issue #014 file-based store)

Drizzle migration generated and committed. Existing rows backfilled with NULLs.

## Acceptance criteria

- [ ] Schema migrated cleanly on a fresh DB
- [ ] Existing app data migrates without loss
- [ ] `npm run db:generate` produces a clean migration
- [ ] Drizzle types regenerated and consumers updated
- [ ] No runtime errors on existing quotes after migration

## Blocked by

None — can start immediately.
