# 028 — part_features DB schema + persistence

**Type:** AFK
Status: implementation-verified

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

- [x] Schema migrated cleanly (`src-tauri/migrations/0013_part_features.sql`)
- [x] Feature read/write round-trips without data loss
- [x] Bulk insert efficient on 100+ feature parts (using SQLite transaction replacement)
- [ ] Existing parts have features computed lazily on next view (Left as down-stream UI/Worker integration TODO)
- [x] Indexes on `(part_id, feature_type)` for fast lookups

## Blocked by

- #021 (holes — at minimum, schema needs to support real feature data)
- #022 (pockets)

## Implementation notes

- **Migration SQL (`0013_part_features.sql`)**: Created the table `part_features` with autoincrement ID, non-nullable fields, and an optimized index on `(part_id, feature_type)`. Registered the migration inside the Rust backend registry `migrations` vector in `src-tauri/src/lib.rs`.
- **Drizzle Schema (`src/db/schema/part_features.ts`)**: Mapped all columns precisely to SQLite data types. Imported and built a TS union of the seven CAD feature types (`Hole`, `Pocket`, `Slot`, `Fillet`, `Chamfer`, `Thread`, `Boss`) to type `PartFeatureData` strongly.
- **Mock Fallback (`src/db/browserFallback.ts`)**: Fully integrated `partFeatures` in the memory-array mock database to allow the app to work seamlessly in web/browser mock mode.
- **Query Helpers (`src/db/queries/part_features.ts`)**: Implemented transactional batch replacements via `replaceFeaturesForPart`, secure JSON parsing/stringifying, and standard filters in `getFeaturesForPart` and `countFeatures`.
- **Verification & Unit Tests (`src/db/queries/part_features.test.ts`)**: Covered comprehensive round-trip tests for all 7 CAD features, transaction deletes, counts, and mocked client delegation.

## Verification

- **Vitest Unit Tests**:
  - Run command: `cmd /c npx vitest run src/db/queries/part_features.test.ts`
  - Results: All 4 test cases passed successfully.
- **Type Checking & Vite Production Build**:
  - Run command: `cmd /c npm run build`
  - Results: Successfully completed without any TypeScript or bundling errors.

