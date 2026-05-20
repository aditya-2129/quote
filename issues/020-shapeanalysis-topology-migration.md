# 020 — Migrate shapeAnalysis to topology with mesh fallback

**Type:** AFK
Status: ready-for-agent

## What to build

Refactor `src/utils/shapeAnalysis.ts` to prefer topology-based classification when a `TopologyGraph` is available, falling back to the existing histogram-based heuristic when it isn't (e.g., legacy quotes without BREP cache).

Topology path:
- Cylinder: find dominant cylindrical face, return exact axis + radius + length
- Hex: find 6 coplanar parallel planar faces at 60° offsets
- Box: default

Mesh path: existing logic, untouched.

Public API of `analyzeShape()` unchanged.

## Acceptance criteria

- [ ] Existing `shapeAnalysis` golden tests (#004) still pass on the mesh path
- [ ] New tests assert exact dimensions on topology path
- [ ] On fixtures where mesh path was within ±0.5 mm, topology path is within ±0.01 mm
- [ ] No regression in `cadHandoff.ts` consumers
- [ ] Telemetry/log line indicates which path was taken (helps debugging)

## Blocked by

- #019 (JS topology model)
