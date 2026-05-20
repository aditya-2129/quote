# 028 — part_features DB schema + persistence

**Type:** AFK
Status: ready-for-agent

## What to build

Add `src/db/schema/part_features.ts` storing the feature graph per part:

- `part_id` (FK)
- `feature_type` (TEXT: hole/pocket/slot/fillet/chamfer/thread/boss)
- `feature_data` (JSON: type-specific payload)
- `face_ids` (JSON array of topology face IDs this feature references)
- `created_at`

Drizzle migration generated. Query helpers in `src/db/queries/partFeatures.ts`: `getFeaturesForPart`, `replaceFeaturesForPart`, `countFeatures`.

Wire feature recognition (#021–#027) output into persistence: on import or re-classify, write features to DB.

## Acceptance criteria

- [ ] Schema migrated cleanly
- [ ] Feature read/write round-trips without data loss
- [ ] Bulk insert efficient on 100+ feature parts
- [ ] Existing parts have features computed lazily on next view
- [ ] Indexes on `(part_id, feature_type)` for fast lookups

## Blocked by

- #021 (holes — at minimum, schema needs to support real feature data)
- #022 (pockets)
