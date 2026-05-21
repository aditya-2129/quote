# 021 — Hole detection module

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src/utils/features/holes.ts`. Walk the topology graph, find cylindrical faces, group connected cylindrical face chains into hole features. Classify each:

- `ThroughHole` — cylinder open on both ends (no planar cap)
- `BlindHole` — cylinder with one planar end cap
- `Counterbore` — coaxial cylinders, larger then smaller, planar shoulder
- `Countersink` — coaxial cylinder + cone, increasing radius
- `Threaded` — heuristic for now (helical surface or pitch-matching); proper PMI-based detection in #038

Output: `Hole[]` with diameter, depth, axis, hole type per feature.

## Acceptance criteria

- [ ] Hole count matches ground truth on 10+ fixture parts — deferred (requires Tauri-native `extract_topology` round-trip; covered by hand-crafted topology fixtures for now)
- [x] All four geometric hole types (through, blind, counterbore, countersink) detected
- [x] Coaxial chain merging correct (one counterbore, not two holes)
- [x] Performance: under 100ms on a 50-hole part
- [x] Tests cover edge cases: tangent intersections, partial cylinders

## Implementation notes

- New module: `src/utils/features/holes.ts`. Public API: `detectHoles(graph)` returns `Hole[]` with `{kind, diameter, depth, axisOrigin, axisDirection, faceIds, shoulderDiameter?}`.
- Coaxial grouping: cylinders + cones are bucketed by axis line (parallel direction within 0.001, point-to-line offset under 0.01 mm).
- Partial-span cylinders (`angular_span < ~1.9π`) are excluded — they're typically fillets, not holes.
- Classification order: cone present → countersink; ≥2 cylinders + shoulder plane → counterbore; otherwise through (no axial cap) / blind (one axial cap).
- Threaded detection deliberately deferred (issue mentions PMI-based detection in #038).
- Tests live in `src/utils/features/holes.test.ts` using hand-crafted `TopologyPayload` fixtures, same pattern as `shapeAnalysis.test.ts` topology cases. 10/10 tests green.
- 10+ real STEP fixture validation needs Tauri-runtime `extract_topology` and is parked until a later integration-test slice.

## Verification

- `npx vitest run src/utils/features/holes.test.ts`: 10/10 passed.
- `npm run lint`: clean.
- `npm run build`: passed.
- 50-cylinder performance test runs in single-digit ms (well under the 100 ms target).

## Blocked by

- #019 (JS topology model)
