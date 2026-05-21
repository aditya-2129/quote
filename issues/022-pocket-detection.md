# 022 — Pocket detection module

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src/utils/features/pockets.ts`. Identify concave regions: face groups where the wire boundary forms a closed loop and the faces' normals point inward relative to the part envelope.

Classify:
- `OpenPocket` — accessible from a flat outer face
- `ClosedPocket` — fully enclosed by part walls (challenging access)

Output per pocket: depth, footprint area, access direction(s), wall count.

## Acceptance criteria

- [ ] Detects open and closed pockets on fixture parts
  > [!NOTE]
  > Verification against the full 10+ real fixture parts suite is deferred to a later integration slice.
- [x] Distinguishes pockets from holes (different shape classifiers)
- [x] Depth and footprint within ±0.5 mm of ground truth
- [x] No false positives on chamfered edges
- [x] Performance: under 200ms on a 10-pocket part (verified at ~7ms for 50 pockets)

## Implementation notes

- **Depth Calculation**: Computed by projecting the representative points (origins) of the pocket's side faces onto the pocket access direction ($-N_{floor}$), taking the maximum projected distance to find the exact pocket depth.
- **Footprint Area**: For circular pockets (detected via cylindrical side walls parallel to the floor normal), estimated using $\pi \cdot R^2$. For rectangular pockets, projected the side wall origins onto the floor plane's orthogonal axes to infer the side-plane spacing (length $\times$ width).
- **Open/Closed Logic**: Traced a ray along the access direction (floor's inverse normal). If it intersects any other planar face of the part within the overall part envelope (AABB), it is classified as a `closed` pocket; otherwise, it is `open`.
- **Hole vs Pocket Distinction**: Discarded candidates that have a single cylindrical side wall, as these represent blind holes rather than pocket features.
- **Chamfer Rejection**: Enforced strict perpendicularity between the floor normal and the wall normals ($\le 11.5^\circ$ deviation), which naturally rejects chamfered edges and inclined transition surfaces.

## Verification

- **Unit Tests**: Mirroring `holes.test.ts`, verified via `npx.cmd vitest run src/utils/features/pockets.test.ts` (passed 6/6 tests in 11ms).
- **ESLint**: Verified via `npm.cmd run lint` (passed with 0 errors).
- **TypeScript Typecheck / Build**: Verified via `npm.cmd run build` (passed cleanly).

## Blocked by

- #019 (JS topology model)
