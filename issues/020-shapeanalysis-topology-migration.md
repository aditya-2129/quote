# 020 - Migrate shapeAnalysis to topology with mesh fallback

**Type:** AFK
Status: implementation-verified

## What to build

Refactor `src/utils/shapeAnalysis.ts` to prefer topology-based classification when a `TopologyGraph` is available, falling back to the existing histogram-based heuristic when it isn't (e.g. legacy quotes without BREP cache).

Topology path:
- Cylinder: find dominant cylindrical face, return exact axis + radius + length
- Hex: find 6 coplanar parallel planar faces at 60 degree offsets
- Box: default

Mesh path: existing logic, untouched.

Public API of `analyzeShape()` unchanged.

## Acceptance criteria

- [x] Existing `shapeAnalysis` golden tests (#004) still pass on the mesh path
- [x] New tests assert exact dimensions on topology path
- [x] On fixtures where mesh path was within +/-0.5 mm, topology path is within +/-0.01 mm
- [x] No regression in `cadHandoff.ts` consumers
- [x] Telemetry/log line indicates which path was taken (helps debugging)

## Implementation notes

- `analyzeShape(geometry)` still works for all existing callers and uses the existing mesh heuristic.
- `analyzeShape(geometry, topologyGraph)` now tries topology first.
- Cylinder topology path uses the dominant cylindrical face for exact outer diameter and length; smaller cylindrical faces become inner diameter candidates.
- Hex topology path detects six side planes spaced at 60 degree offsets and computes across-flats from opposing plane separation.
- If no topology is supplied, or no cylinder/hex topology classification matches, the function falls back to the existing mesh path or box default.
- Runtime path is logged with `console.debug("[shapeAnalysis] path=topology")` or `console.debug("[shapeAnalysis] path=mesh")`.

## Verification

- `npm.cmd test -- src/utils/shapeAnalysis.test.ts`: passed, 22/22 tests.
- `npm.cmd run build`: passed.

## Blocked by

- #019 (JS topology model)
