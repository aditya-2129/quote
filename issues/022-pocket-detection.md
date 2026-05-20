# 022 — Pocket detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/pockets.ts`. Identify concave regions: face groups where the wire boundary forms a closed loop and the faces' normals point inward relative to the part envelope.

Classify:
- `OpenPocket` — accessible from a flat outer face
- `ClosedPocket` — fully enclosed by part walls (challenging access)

Output per pocket: depth, footprint area, access direction(s), wall count.

## Acceptance criteria

- [ ] Detects open and closed pockets on fixture parts
- [ ] Distinguishes pockets from holes (different shape classifiers)
- [ ] Depth and footprint within ±0.5 mm of ground truth
- [ ] No false positives on chamfered edges
- [ ] Performance: under 200ms on a 10-pocket part

## Blocked by

- #019 (JS topology model)
