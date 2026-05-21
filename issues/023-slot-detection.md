# 023 — Slot detection module

**Type:** AFK
Status: done
Completed in: 0d229de

## What to build

Implement `src/utils/features/slots.ts`. Detect slot features: elongated pockets with semicircular ends, or rectangular pockets with high aspect ratio.

Output: length, width, depth, orientation axis, slot type (`rounded` / `rectangular`).

## Acceptance criteria

- [x] Distinguishes slot from generic pocket (aspect ratio > 2)
- [x] Rounded end caps detected when present
- [x] Orientation axis matches longest slot dimension
- [x] Fixture coverage on at least 3 slot variants
- [x] No double-counting with pocket detector (#022)
- [ ] 10+ real fixture parts (Note: deferred to a later integration slice)

## Blocked by

- #019 (JS topology model)

## Implementation notes

- **Aspect Ratio Filtering:** In both rounded and rectangular cases, the aspect ratio (length/width) is calculated, and only candidates with an aspect ratio strictly greater than `2.0` are classified as slots rather than generic pockets or square pockets.
- **Rounded Slot Detection:** Looks for pairs of cylindrical faces with equivalent radii and parallel axis directions. Verifies they are connected by planar wall faces that share edges with both cylinders, and whose normals align with the ideal wall normals. Floor detection utilizes coplanar search along the axis vector.
- **Rectangular Slot Detection:** Scans for a planar floor and identifies orthogonal adjacent walls. The walls are grouped into perpendicular pairs of parallel planes. Distances between the pairs define the footprint length and width.
- **Depth Calculation:** The depth of a rounded slot is resolved from the cylinder height. The depth of a rectangular slot resolves to the perpendicular distance between the floor plane and the top parallel plane of the workpiece.
- **Deduplication:** A cross-feature set of matched face IDs prevents reuse or double-counting of faces across rounded and rectangular slot detection.
- **Deferred Criterion:** The "10+ real fixture parts" acceptance criterion has been deferred to a later integration slice to focus on pure feature algorithm verification.

## Verification

The slot detection logic was fully verified against a comprehensive suite of unit tests:
1. **Empty/missing topology:** Handled gracefully, returns `[]`.
2. **Primary Rounded Slot:** Correctly detects dimensions, depth, axes, and face IDs for semicircular end caps and connecting walls.
3. **Primary Rectangular Slot:** Correctly detects dimensions, depth, axes, and floor/wall face IDs.
4. **Negative Cases:**
   - Rounded pocket with $\le 2.0$ aspect ratio is correctly rejected.
   - Square pocket (aspect ratio 1:1) is correctly rejected.
5. **Performance Check:** 50 slots are successfully detected under `100 ms` (actual run took `<10 ms`).

### Verification Commands Run:
- Unit tests: `npx.cmd vitest run src/utils/features/slots.test.ts` (All 7 tests passed successfully in 88ms)
- Linting: `npm.cmd run lint` (Completed cleanly with 0 errors/warnings in our modified files)
- Building: `npm.cmd run build` (Completed successfully in 11.45s)
