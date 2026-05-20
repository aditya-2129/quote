# 021 — Hole detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/holes.ts`. Walk the topology graph, find cylindrical faces, group connected cylindrical face chains into hole features. Classify each:

- `ThroughHole` — cylinder open on both ends (no planar cap)
- `BlindHole` — cylinder with one planar end cap
- `Counterbore` — coaxial cylinders, larger then smaller, planar shoulder
- `Countersink` — coaxial cylinder + cone, increasing radius
- `Threaded` — heuristic for now (helical surface or pitch-matching); proper PMI-based detection in #038

Output: `Hole[]` with diameter, depth, axis, hole type per feature.

## Acceptance criteria

- [ ] Hole count matches ground truth on 10+ fixture parts
- [ ] All four geometric hole types (through, blind, counterbore, countersink) detected
- [ ] Coaxial chain merging correct (one counterbore, not two holes)
- [ ] Performance: under 100ms on a 50-hole part
- [ ] Tests cover edge cases: tangent intersections, partial cylinders

## Blocked by

- #019 (JS topology model)
