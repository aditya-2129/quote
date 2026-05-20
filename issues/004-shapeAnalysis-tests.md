# 004 — Golden tests for shapeAnalysis classification

**Type:** AFK
Status: done
Completed in: 8a2db7e

## What to build

Cover `src/utils/shapeAnalysis.ts` against the fixture suite. For each fixture, assert the returned `ShapeAnalysis` kind (`cylinder` / `hex` / `box`) and dimensions match expected within tolerance. This is the most heuristic part of the CAD layer and the most likely place for silent regressions.

Tolerance budget: ±0.5 mm on dimensions, exact match on `kind`.

## Acceptance criteria

- [x] At least 3 cylinder fixtures, 2 hex fixtures, 5 box fixtures asserted
- [x] Filleted cylinder fixture still classified as cylinder (not box)
- [x] Failure messages include actual vs expected dimensions for debugging
- [x] No false positives: box-shaped fixtures must NOT be classified as cylinder/hex

## Blocked by

- #001 (test framework)
- #002 (fixtures)
