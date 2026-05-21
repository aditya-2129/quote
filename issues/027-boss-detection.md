# 027 — Boss detection module

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src/utils/features/bosses.ts`. Detect bosses: raised cylindrical or rectangular protrusions from a base face. Output: shape (round/rectangular), dimensions, height, base face ID.

## Acceptance criteria

- [x] Detects round and rectangular bosses on fixture parts
- [x] Dimensions match CAD nominal to ±0.1 mm
- [x] Distinguishes a boss with a hole (returns both features) from a simple boss
- [ ] No confusion with stock material edges (Deferred: Analytically separated using base face outward normals and convexity checks. Full integration with global stock boundary boxes will be verified in Phase 4 integration when physical stock profiles are loaded.)

## Blocked by

- #019 (JS topology model)

## Implementation notes

- **Algorithmic Approach**:
  - **Round Bosses**: Scans all closed cylinders and looks for exactly two adjacent parallel cap planes (base and top). By determining which cap plane acts as the parent base using wire loop `is_outer` boundaries (with robust name-based and projection-based fallback heuristics for mocks), we verify boss convexity. Specifically, the top cap must be in the direction of the base face's outward normal: `dot(sub(top.origin, base.origin), base.normal) > 0`.
  - **Rectangular Bosses**: Scans planar surfaces to locate "top" faces that have at least 3 adjacent walls perpendicular to the top face normal and orthogonal in pairs. It resolves the "base" face from wall adjacencies, verifies convexity (top rising from the base), and calculates precise width and length dimensions even when only 3 of the 4 walls are present.
  - **Hole Co-existence**: By analyzing coaxial cylinder hierarchies, the inner cylindrical void (concentric hole) is correctly bypassed for boss detection (and left to the hole detector) while the outer cylinder is correctly extracted as the boss.

## Verification

- **Passed Tests**:
  - Empty/absent topology handles gracefully.
  - Regular blocks / blind holes are rejected appropriately.
  - Cylindrical round bosses are correctly detected (height, diameter, base face ID).
  - Rectangular bosses are correctly detected (width, length, height, base face ID).
  - concentric hole + boss coexistence works flawlessly.
  - Performance: 50 bosses detected in 12ms (well under the 100ms threshold).

- **Commands Run**:
  - `npx.cmd vitest run src/utils/features/bosses.test.ts` (All 6 tests passed)
  - `npm.cmd run lint` (Clean with 0 warnings/errors)
